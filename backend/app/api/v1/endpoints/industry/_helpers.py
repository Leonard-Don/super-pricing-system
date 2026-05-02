"""industry 包内共享 helpers + 模块级状态（缓存、锁、ETF 映射、热力图历史）。

所有路由层（``industry.routes``）通过 ``from ._helpers import ...`` 复用这些工具。
模块级单例（``_endpoint_cache``、``_parity_cache``、``_heatmap_history`` 等）必须在
本文件定义且只被实例化一次——测试直接用 ``industry_endpoint._endpoint_cache.clear()``
之类的方式访问，依赖这些对象在拆分后仍是同一个 Python 对象。
"""

from copy import deepcopy
from typing import Any, Dict, List, Optional
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path
import json
import logging
import math
import re
import threading
import time

from fastapi import HTTPException, Request

from backend.app.core.bounded_cache import BoundedTTLCache
from backend.app.schemas.industry import (
    HeatmapResponse,
    LeaderStockResponse,
    StockResponse,
)
from backend.app.services.industry_preferences import (
    DEFAULT_ALERT_THRESHOLDS,  # noqa: F401  re-exported for callers
    industry_preferences_store,
)
from src.analytics.industry_stock_details import (
    backfill_stock_details_with_valuation,
    build_enriched_industry_stocks,
    extract_stock_detail_fields,
    has_meaningful_numeric,
    normalize_symbol,
)
from src.data.providers.sina_ths_adapter import map_ths_to_sina  # noqa: F401  legacy re-export
from src.utils.config import PROJECT_ROOT


logger = logging.getLogger(__name__)


# =============================================================================
# 模块级单例：缓存、锁、热力图历史、ETF 映射
# =============================================================================

# 端点级别结果缓存（第二层防护，避免短时间内重复计算）
_ENDPOINT_CACHE_TTL = 180  # 3 分钟
_ENDPOINT_CACHE_HARD_TTL = 12 * _ENDPOINT_CACHE_TTL
_ENDPOINT_CACHE_MAX_ITEMS = 192
_endpoint_cache: BoundedTTLCache[str, dict] = BoundedTTLCache(
    maxsize=_ENDPOINT_CACHE_MAX_ITEMS,
    max_age_seconds=_ENDPOINT_CACHE_HARD_TTL,
    timestamp_getter=lambda entry: float((entry or {}).get("ts") or 0),
)
_stocks_full_build_executor = ThreadPoolExecutor(max_workers=2)
_stocks_full_build_lock = threading.Lock()
_stocks_full_build_inflight: set[str] = set()
_stocks_full_build_status: dict[str, dict] = {}
_heatmap_history_lock = threading.Lock()
_heatmap_history: list[dict] = []
_heatmap_history_loaded = False
_HEATMAP_HISTORY_MAX_ITEMS = 48
_HEATMAP_HISTORY_MAX_FILE_BYTES = 2 * 1024 * 1024
_HEATMAP_HISTORY_FILE = PROJECT_ROOT / "data" / "industry" / "heatmap_history.json"

# 独立的 Parity 缓存（评分一致性保障，TTL 更长）
_PARITY_CACHE_TTL = 1800  # 30 分钟（评分在交易日内变化缓慢）
_PARITY_CACHE_HARD_TTL = 4 * _PARITY_CACHE_TTL
_PARITY_CACHE_MAX_ITEMS = 512
_parity_cache: BoundedTTLCache[str, dict] = BoundedTTLCache(
    maxsize=_PARITY_CACHE_MAX_ITEMS,
    max_age_seconds=_PARITY_CACHE_HARD_TTL,
    timestamp_getter=lambda entry: float((entry or {}).get("ts") or 0),
)

# 延迟初始化的分析器/数据源单例
_industry_analyzer = None
_leader_scorer = None
_akshare_provider = None


INDUSTRY_ETF_MAP: Dict[str, List[Dict[str, str]]] = {
    "半导体": [{"symbol": "SOXX", "market": "US"}, {"symbol": "512760.SS", "market": "CN"}],
    "芯片": [{"symbol": "SOXX", "market": "US"}, {"symbol": "159995.SZ", "market": "CN"}],
    "人工智能": [{"symbol": "AIQ", "market": "US"}, {"symbol": "CHAT", "market": "US"}],
    "软件": [{"symbol": "IGV", "market": "US"}, {"symbol": "515230.SS", "market": "CN"}],
    "新能源": [{"symbol": "ICLN", "market": "US"}, {"symbol": "516160.SS", "market": "CN"}],
    "光伏": [{"symbol": "TAN", "market": "US"}, {"symbol": "515790.SS", "market": "CN"}],
    "电池": [{"symbol": "LIT", "market": "US"}, {"symbol": "159755.SZ", "market": "CN"}],
    "医药": [{"symbol": "XLV", "market": "US"}, {"symbol": "512010.SS", "market": "CN"}],
    "医疗": [{"symbol": "XLV", "market": "US"}, {"symbol": "159883.SZ", "market": "CN"}],
    "消费": [{"symbol": "XLY", "market": "US"}, {"symbol": "159928.SZ", "market": "CN"}],
    "白酒": [{"symbol": "512690.SS", "market": "CN"}],
    "金融": [{"symbol": "XLF", "market": "US"}, {"symbol": "510230.SS", "market": "CN"}],
    "银行": [{"symbol": "KBE", "market": "US"}, {"symbol": "512800.SS", "market": "CN"}],
    "证券": [{"symbol": "KCE", "market": "US"}, {"symbol": "512880.SS", "market": "CN"}],
    "地产": [{"symbol": "VNQ", "market": "US"}, {"symbol": "512200.SS", "market": "CN"}],
    "军工": [{"symbol": "ITA", "market": "US"}, {"symbol": "512660.SS", "market": "CN"}],
    "能源": [{"symbol": "XLE", "market": "US"}, {"symbol": "159930.SZ", "market": "CN"}],
    "煤炭": [{"symbol": "KOL", "market": "US"}, {"symbol": "515220.SS", "market": "CN"}],
    "有色": [{"symbol": "XME", "market": "US"}, {"symbol": "512400.SS", "market": "CN"}],
    "汽车": [{"symbol": "CARZ", "market": "US"}, {"symbol": "516110.SS", "market": "CN"}],
}


# =============================================================================
# 缓存 helpers
# =============================================================================

def _get_endpoint_cache(key: str):
    """Get cached endpoint result if not expired"""
    entry = _endpoint_cache.get(key)
    if entry and (time.time() - entry["ts"]) < _ENDPOINT_CACHE_TTL:
        return entry["data"]
    return None


def _set_endpoint_cache(key: str, data):
    """Set endpoint result cache (skip empty results)"""
    if data is None:
        return
    if isinstance(data, (list, tuple)) and len(data) == 0:
        return
    if isinstance(data, dict):
        industries = data.get("industries")
        if isinstance(industries, list) and len(industries) == 0:
            return
    _endpoint_cache[key] = {"data": data, "ts": time.time()}


def _get_stale_endpoint_cache(key: str):
    """获取过期缓存作为兜底。"""
    entry = _endpoint_cache.get(key)
    return entry["data"] if entry else None


def _set_parity_cache(symbol: str, score_type: str, data):
    if data is None:
        return
    key = f"{symbol}:{score_type}"
    _parity_cache[key] = {"data": data, "ts": time.time()}


def _get_parity_cache(symbol: str, score_type: str):
    key = f"{symbol}:{score_type}"
    entry = _parity_cache.get(key)
    if entry and (time.time() - entry["ts"]) < _PARITY_CACHE_TTL:
        return entry["data"]
    return None


def _get_stale_parity_cache(symbol: str, score_type: str):
    key = f"{symbol}:{score_type}"
    entry = _parity_cache.get(key)
    return entry["data"] if entry else None


def _get_stock_cache_keys(industry_name: str, top_n: int) -> tuple[str, str]:
    return (
        f"stocks:quick:{industry_name}:{top_n}",
        f"stocks:full:{industry_name}:{top_n}",
    )


# =============================================================================
# Execution metadata
# =============================================================================

def _attach_execution_metadata(payload: Any, execution: Dict[str, Any]) -> Any:
    if not isinstance(payload, dict):
        return payload
    cloned = deepcopy(payload)
    target = cloned.get("data") if isinstance(cloned.get("data"), dict) else cloned
    if isinstance(target, dict):
        target["execution"] = {
            **(target.get("execution") or {}),
            **execution,
        }
    return cloned


def _build_execution_metadata(
    *,
    source: str,
    degraded: bool = False,
    cache_status: str = "miss",
    fallback_reason: Optional[str] = None,
    snapshot_days: Optional[int] = None,
    snapshot_timestamp: Optional[str] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "source": source,
        "degraded": degraded,
        "cache_status": cache_status,
        "generated_at": datetime.now().isoformat(),
    }
    if fallback_reason:
        payload["fallback_reason"] = fallback_reason
    if snapshot_days is not None:
        payload["snapshot_days"] = snapshot_days
    if snapshot_timestamp:
        payload["snapshot_timestamp"] = snapshot_timestamp
    return payload


# =============================================================================
# Sparkline / mini trend
# =============================================================================

def _normalize_sparkline_points(points: list[float], max_points: int = 20) -> list[float]:
    normalized = []
    for point in points or []:
        try:
            value = float(point)
        except (TypeError, ValueError):
            continue
        if value > 0:
            normalized.append(round(value, 3))
    if len(normalized) <= max_points:
        return normalized
    step = max(1, len(normalized) // max_points)
    sampled = normalized[::step][:max_points]
    if sampled[-1] != normalized[-1]:
        sampled[-1] = normalized[-1]
    return sampled


def _load_symbol_mini_trend(symbol: str) -> list[float]:
    scorer = get_leader_scorer()
    provider = getattr(scorer, "provider", None)
    if provider is None or not hasattr(provider, "get_historical_data"):
        return []

    try:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=45)
        hist_data = provider.get_historical_data(symbol, start_date, end_date)
        if hist_data is None or hist_data.empty or "close" not in hist_data.columns:
            return []
        return _normalize_sparkline_points(hist_data["close"].tail(20).tolist(), max_points=20)
    except Exception as exc:
        logger.warning("Failed to load mini trend for leader %s: %s", symbol, exc)
        return []


def _attach_leader_mini_trends(leaders: list[LeaderStockResponse]) -> list[LeaderStockResponse]:
    if not leaders:
        return leaders

    symbols = [leader.symbol for leader in leaders if re.fullmatch(r"\d{6}", leader.symbol or "")]
    if not symbols:
        return leaders

    with ThreadPoolExecutor(max_workers=min(6, len(symbols))) as executor:
        trend_values = list(executor.map(_load_symbol_mini_trend, symbols))

    trend_map = {symbol: trend for symbol, trend in zip(symbols, trend_values)}
    for leader in leaders:
        leader.mini_trend = trend_map.get(leader.symbol, [])
    return leaders


# =============================================================================
# 模型转换 / 存储格式化
# =============================================================================

def _model_to_dict(model):
    if hasattr(model, "model_dump"):
        return model.model_dump()
    if hasattr(model, "dict"):
        return model.dict()
    return model


def _format_storage_size(num_bytes: int) -> str:
    if num_bytes < 1024:
        return f"{num_bytes} B"
    if num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.1f} KB"
    return f"{num_bytes / (1024 * 1024):.2f} MB"


def _resolve_industry_profile(request: Request | None) -> str:
    if request is None:
        return "default"
    return request.headers.get("X-Industry-Profile", "default")


# =============================================================================
# 股票构建状态
# =============================================================================

def _get_stock_status_key(industry_name: str, top_n: int) -> str:
    return f"{industry_name}:{top_n}"


def _set_stock_build_status(industry_name: str, top_n: int, status: str, rows: int = 0, message: Optional[str] = None) -> None:
    _stocks_full_build_status[_get_stock_status_key(industry_name, top_n)] = {
        "industry_name": industry_name,
        "top_n": top_n,
        "status": status,
        "rows": int(rows or 0),
        "message": message,
        "updated_at": datetime.now().isoformat(),
    }


def _get_stock_build_status(industry_name: str, top_n: int) -> dict:
    _, full_cache_key = _get_stock_cache_keys(industry_name, top_n)
    cached = _get_endpoint_cache(full_cache_key)
    if cached is not None:
        return {
            "industry_name": industry_name,
            "top_n": top_n,
            "status": "ready",
            "rows": len(cached),
            "message": "完整版成分股缓存已就绪",
            "updated_at": datetime.now().isoformat(),
        }
    return _stocks_full_build_status.get(
        _get_stock_status_key(industry_name, top_n),
        {
            "industry_name": industry_name,
            "top_n": top_n,
            "status": "idle",
            "rows": 0,
            "message": "当前尚未开始构建完整版成分股缓存",
            "updated_at": datetime.now().isoformat(),
        },
    )


# =============================================================================
# Symbol 解析 / 股票响应构建
# =============================================================================

def _resolve_symbol_with_provider(symbol_or_name: str) -> str:
    """允许详情接口和龙头列表同时接受代码或股票名。"""
    normalized = normalize_symbol(symbol_or_name)
    if re.fullmatch(r"\d{6}", normalized):
        return normalized

    provider = _get_or_create_provider()
    if hasattr(provider, "get_symbol_by_name"):
        try:
            resolved = normalize_symbol(provider.get_symbol_by_name(symbol_or_name))
            if re.fullmatch(r"\d{6}", resolved):
                return resolved
        except Exception as e:
            logger.warning(f"Failed to resolve symbol '{symbol_or_name}': {e}")

    return normalized


def _build_stock_responses(
    stocks: List[dict],
    industry_name: str,
    top_n: int,
    score_stage: Optional[str] = None,
) -> List[StockResponse]:
    """将 provider 返回的原始成分股标准化为接口响应。"""
    normalized_stocks = []
    for idx, stock in enumerate(stocks[:top_n], 1):
        symbol = normalize_symbol(stock.get("symbol") or stock.get("code") or "")
        if not symbol:
            continue
        detail_fields = extract_stock_detail_fields(stock)

        normalized_stocks.append(
            StockResponse(
                symbol=symbol,
                name=stock.get("name", ""),
                rank=int(stock.get("rank") or idx),
                total_score=float(stock.get("total_score") or 0),
                scoreStage=score_stage,
                market_cap=detail_fields.get("market_cap"),
                pe_ratio=detail_fields.get("pe_ratio"),
                change_pct=detail_fields.get("change_pct"),
                money_flow=detail_fields.get("money_flow"),
                turnover_rate=detail_fields.get("turnover_rate") or detail_fields.get("turnover"),
                industry=industry_name,
            )
        )

    return normalized_stocks


def _count_quick_stock_detail_fields(stock: Dict[str, Any]) -> int:
    detail_fields = extract_stock_detail_fields(stock)
    return sum([
        1 if has_meaningful_numeric(detail_fields.get("market_cap")) else 0,
        1 if has_meaningful_numeric(detail_fields.get("pe_ratio")) else 0,
        1 if detail_fields.get("money_flow") is not None else 0,
        1 if has_meaningful_numeric(detail_fields.get("turnover_rate")) else 0,
    ])


def _promote_detail_ready_quick_rows(
    stocks: List[Dict[str, Any]],
    visible_top_n: int = 5,
    detail_target: int = 2,
) -> List[Dict[str, Any]]:
    """在 quick 阶段尽量让首屏先出现有真实明细的成分股。"""
    if not stocks:
        return stocks

    front_size = min(len(stocks), visible_top_n)
    target_count = min(detail_target, front_size)
    front_rows = list(stocks[:front_size])
    back_rows = list(stocks[front_size:])

    front_detail_indexes = [
        index for index, stock in enumerate(front_rows)
        if _count_quick_stock_detail_fields(stock) > 0
    ]
    if len(front_detail_indexes) >= target_count:
        return stocks

    promoted_rows: List[Dict[str, Any]] = []
    remaining_back_rows: List[Dict[str, Any]] = []
    needed_promotions = target_count - len(front_detail_indexes)

    for stock in back_rows:
        if len(promoted_rows) < needed_promotions and _count_quick_stock_detail_fields(stock) > 0:
            promoted_rows.append(stock)
            continue
        remaining_back_rows.append(stock)

    if not promoted_rows:
        return stocks

    replacement_positions = [
        index for index, stock in reversed(list(enumerate(front_rows)))
        if _count_quick_stock_detail_fields(stock) == 0
    ][:len(promoted_rows)]
    if not replacement_positions:
        return stocks

    replacement_positions_set = set(replacement_positions)
    kept_front_rows = [
        stock for index, stock in enumerate(front_rows)
        if index not in replacement_positions_set
    ]
    displaced_front_rows = [
        stock for index, stock in enumerate(front_rows)
        if index in replacement_positions_set
    ]
    return kept_front_rows + promoted_rows + displaced_front_rows + remaining_back_rows


def _build_full_industry_stock_response(
    industry_name: str,
    top_n: int,
    provider=None,
) -> List[StockResponse]:
    """构造完整版行业成分股结果（评分排序 + 明细补齐 + 估值回填）。"""
    scorer = get_leader_scorer()
    provider = provider or _get_or_create_provider()

    ranked_stocks = scorer.rank_stocks_in_industry(industry_name, top_n=top_n)
    provider_stocks = provider.get_stock_list_by_industry(industry_name)

    if ranked_stocks:
        enriched_stocks = build_enriched_industry_stocks(
            provider,
            industry_name,
            ranked_stocks=ranked_stocks,
            provider_stocks=provider_stocks,
        )
        return _build_stock_responses(enriched_stocks, industry_name, top_n, score_stage="full")

    if provider_stocks:
        fallback_stocks = build_enriched_industry_stocks(
            provider,
            industry_name,
            provider_stocks=provider_stocks,
        )
        return _build_stock_responses(fallback_stocks, industry_name, top_n, score_stage="full")

    return []


def _build_quick_industry_stock_response(
    industry_name: str,
    top_n: int,
    provider_stocks: List[dict],
    provider=None,
    enable_valuation_backfill: bool = True,
) -> List[StockResponse]:
    """构造快速版行业成分股结果（仅用现有行情做轻量评分，不做估值回填）。"""
    if not provider_stocks:
        return []

    try:
        scorer = get_leader_scorer()
        provider = provider or getattr(scorer, "provider", None) or _get_or_create_provider()
        industry_stats = scorer.calculate_industry_stats(provider_stocks)
        quick_scored_stocks = []
        for stock in provider_stocks:
            quick_score = scorer.score_stock_from_industry_snapshot(
                stock,
                industry_stats,
                score_type="core",
            )
            quick_scored_stocks.append({
                **stock,
                "symbol": quick_score.get("symbol") or stock.get("symbol"),
                "name": quick_score.get("name") or stock.get("name"),
                "total_score": quick_score.get("total_score"),
            })
        quick_scored_stocks.sort(
            key=lambda item: float(item.get("total_score") or 0),
            reverse=True,
        )

        quick_display_stocks = quick_scored_stocks[:top_n]
        if provider is not None:
            if enable_valuation_backfill:
                quick_display_stocks = backfill_stock_details_with_valuation(quick_display_stocks, provider)
            quick_display_stocks = _promote_detail_ready_quick_rows(quick_display_stocks)

        for idx, stock in enumerate(quick_display_stocks, 1):
            stock["rank"] = idx
        return _build_stock_responses(quick_display_stocks, industry_name, top_n, score_stage="quick")
    except Exception as e:
        logger.warning(f"Failed to build quick stock scores for {industry_name}: {e}")
        return _build_stock_responses(provider_stocks, industry_name, top_n, score_stage="quick")


# =============================================================================
# Trend alignment helpers
# =============================================================================

def _coerce_trend_alignment_stock_rows(stocks: List[Any]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for stock in stocks or []:
        payload = _model_to_dict(stock)
        symbol = normalize_symbol(payload.get("symbol") or payload.get("code") or "")
        if not symbol:
            continue
        rows.append(
            {
                "symbol": symbol,
                "code": symbol,
                "name": payload.get("name", ""),
                "market_cap": payload.get("market_cap"),
                "pe_ratio": payload.get("pe_ratio"),
                "change_pct": payload.get("change_pct"),
                "money_flow": payload.get("money_flow"),
                "turnover_rate": payload.get("turnover_rate"),
                "turnover": payload.get("turnover_rate"),
                "total_score": payload.get("total_score"),
            }
        )
    return rows


def _load_trend_alignment_stock_rows(
    industry_name: str,
    expected_count: int,
    provider=None,
) -> List[Dict[str, Any]]:
    provider = provider or _get_or_create_provider()
    target_top_n = min(max(int(expected_count or 0), 12), 30) if expected_count else 20
    quick_cache_key, full_cache_key = _get_stock_cache_keys(industry_name, target_top_n)

    cached_rows = _get_endpoint_cache(full_cache_key)
    if cached_rows is None:
        cached_rows = _get_endpoint_cache(quick_cache_key)
    if cached_rows is not None:
        return _coerce_trend_alignment_stock_rows(cached_rows)

    provider_rows: List[Dict[str, Any]] = []
    cached_stock_loader = getattr(provider, "get_cached_stock_list_by_industry", None)
    if callable(cached_stock_loader):
        try:
            provider_rows = cached_stock_loader(industry_name) or []
        except Exception as exc:
            logger.warning("Failed to load cached trend-alignment stocks for %s: %s", industry_name, exc)

    if not provider_rows:
        try:
            provider_rows = provider.get_stock_list_by_industry(industry_name) or []
        except Exception as exc:
            logger.warning("Failed to load provider trend-alignment stocks for %s: %s", industry_name, exc)
            provider_rows = []

    if provider_rows:
        quick_rows = _build_quick_industry_stock_response(
            industry_name,
            target_top_n,
            provider_rows,
            provider=provider,
            enable_valuation_backfill=False,
        )
        if quick_rows:
            return _coerce_trend_alignment_stock_rows(quick_rows)

    full_rows = _build_full_industry_stock_response(
        industry_name,
        target_top_n,
        provider=provider,
    )
    return _coerce_trend_alignment_stock_rows(full_rows)


def _build_trend_summary_from_stock_rows(
    stocks: List[Dict[str, Any]],
    expected_count: int,
    fallback_total_market_cap: float = 0.0,
    fallback_avg_pe: float = 0.0,
) -> Dict[str, Any]:
    expected_count = max(int(expected_count or 0), 0)
    expected_count_base = max(expected_count, 1)

    detailed_stocks = []
    valid_change_stocks = []
    for stock in stocks or []:
        detail = extract_stock_detail_fields(stock)
        enriched_stock = {**stock, **detail}
        detailed_stocks.append(enriched_stock)
        if detail.get("change_pct") is not None:
            valid_change_stocks.append(enriched_stock)

    valid_market_caps = [
        stock["market_cap"]
        for stock in detailed_stocks
        if has_meaningful_numeric(stock.get("market_cap"))
    ]
    valid_pe_ratios = [
        stock["pe_ratio"]
        for stock in detailed_stocks
        if stock.get("pe_ratio") is not None and 0 < stock["pe_ratio"] < 500
    ]
    valid_pe_weighted_pairs = [
        (stock["market_cap"], stock["pe_ratio"])
        for stock in detailed_stocks
        if has_meaningful_numeric(stock.get("market_cap"))
        and stock.get("pe_ratio") is not None
        and 0 < stock["pe_ratio"] < 500
    ]

    total_market_cap = sum(float(value) for value in valid_market_caps)
    total_market_cap_fallback = False
    if not total_market_cap and fallback_total_market_cap > 0:
        total_market_cap = float(fallback_total_market_cap)
        total_market_cap_fallback = True

    if valid_pe_weighted_pairs:
        total_pe_market_cap = sum(float(market_cap) for market_cap, _ in valid_pe_weighted_pairs)
        total_earnings_proxy = sum(
            float(market_cap) / float(pe_ratio)
            for market_cap, pe_ratio in valid_pe_weighted_pairs
            if float(pe_ratio) > 0
        )
        avg_pe = (total_pe_market_cap / total_earnings_proxy) if total_pe_market_cap > 0 and total_earnings_proxy > 0 else None
    elif valid_pe_ratios:
        avg_pe = sum(float(value) for value in valid_pe_ratios) / len(valid_pe_ratios)
    else:
        avg_pe = None

    avg_pe_fallback = False
    if avg_pe is None and fallback_avg_pe > 0:
        avg_pe = float(fallback_avg_pe)
        avg_pe_fallback = True

    stock_coverage_ratio = min(len(stocks) / expected_count_base, 1.0) if expected_count > 0 else (1.0 if stocks else 0.0)
    change_coverage_ratio = min(len(valid_change_stocks) / expected_count_base, 1.0) if expected_count > 0 else (1.0 if valid_change_stocks else 0.0)
    market_cap_coverage_ratio = min(len(valid_market_caps) / expected_count_base, 1.0) if expected_count > 0 else (1.0 if valid_market_caps else 0.0)
    pe_coverage_base = len(valid_pe_weighted_pairs) if valid_pe_weighted_pairs else len(valid_pe_ratios)
    pe_coverage_ratio = min(pe_coverage_base / expected_count_base, 1.0) if expected_count > 0 else (1.0 if pe_coverage_base > 0 else 0.0)

    top_gainers = sorted(valid_change_stocks, key=lambda item: item.get("change_pct", 0), reverse=True)[:5]
    top_losers = sorted(valid_change_stocks, key=lambda item: item.get("change_pct", 0))[:5]
    rise_count = sum(1 for item in valid_change_stocks if item.get("change_pct", 0) > 0)
    fall_count = sum(1 for item in valid_change_stocks if item.get("change_pct", 0) < 0)
    flat_count = sum(1 for item in valid_change_stocks if item.get("change_pct", 0) == 0)

    note = None
    degraded = False
    if len(stocks) <= 3 and expected_count > 10:
        degraded = True
        note = f"成分股列表可能不完整（获取到 {len(stocks)} 只，预期约 {expected_count} 只）。当前展示可能存在偏差。"
    elif len(stocks) == 1:
        note = "该行业目前仅获取到单只成分股明细，分布数据仅供参考。"

    return {
        "stock_count": len(stocks),
        "expected_stock_count": expected_count,
        "total_market_cap": total_market_cap,
        "avg_pe": round(avg_pe, 2) if avg_pe is not None and not (isinstance(avg_pe, float) and math.isnan(avg_pe)) else 0,
        "top_gainers": top_gainers,
        "top_losers": top_losers,
        "rise_count": rise_count,
        "fall_count": fall_count,
        "flat_count": flat_count,
        "stock_coverage_ratio": round(stock_coverage_ratio, 4),
        "change_coverage_ratio": round(change_coverage_ratio, 4),
        "market_cap_coverage_ratio": round(market_cap_coverage_ratio, 4),
        "pe_coverage_ratio": round(pe_coverage_ratio, 4),
        "total_market_cap_fallback": total_market_cap_fallback,
        "avg_pe_fallback": avg_pe_fallback,
        "degraded": degraded,
        "note": note,
    }


def _should_align_trend_with_stock_rows(
    trend_data: Dict[str, Any],
    stock_rows: List[Dict[str, Any]],
) -> bool:
    if not stock_rows:
        return False

    trend_count = int(trend_data.get("stock_count", 0) or 0)
    expected_count = int(trend_data.get("expected_stock_count", 0) or 0)
    aligned_count = len(stock_rows)

    if trend_data.get("degraded") and aligned_count > trend_count:
        return True
    if trend_count <= 3 and aligned_count >= 5:
        return True
    if expected_count > 0 and trend_count > max(expected_count * 2, expected_count + 15):
        return aligned_count >= min(max(expected_count // 3, 4), 30)
    return False


def _schedule_full_stock_cache_build(
    industry_name: str,
    top_n: int,
) -> None:
    """异步构建完整版行业成分股缓存。"""
    _, full_cache_key = _get_stock_cache_keys(industry_name, top_n)
    if _get_endpoint_cache(full_cache_key) is not None:
        return

    with _stocks_full_build_lock:
        if full_cache_key in _stocks_full_build_inflight:
            return
        _stocks_full_build_inflight.add(full_cache_key)
        _set_stock_build_status(industry_name, top_n, "building", rows=0, message="完整版成分股缓存构建中")

    def _task():
        started_at = time.time()
        try:
            logger.info(
                "Building full stock cache for %s (top_n=%s)",
                industry_name,
                top_n,
            )
            result = _build_full_industry_stock_response(industry_name, top_n)
            if result:
                _set_endpoint_cache(full_cache_key, result)
                _set_stock_build_status(
                    industry_name,
                    top_n,
                    "ready",
                    rows=len(result),
                    message="完整版成分股缓存构建完成",
                )
                logger.info(
                    "Built full stock cache for %s (top_n=%s, rows=%s, elapsed=%.2fs)",
                    industry_name,
                    top_n,
                    len(result),
                    time.time() - started_at,
                )
            else:
                _set_stock_build_status(
                    industry_name,
                    top_n,
                    "failed",
                    rows=0,
                    message="完整版成分股缓存构建返回空结果",
                )
                logger.warning(
                    "Full stock cache build returned empty for %s (top_n=%s, elapsed=%.2fs)",
                    industry_name,
                    top_n,
                    time.time() - started_at,
                )
        except Exception as e:
            _set_stock_build_status(
                industry_name,
                top_n,
                "failed",
                rows=0,
                message=f"构建失败: {e}",
            )
            logger.warning(f"Failed to build full stock cache for {industry_name}: {e}")
        finally:
            with _stocks_full_build_lock:
                _stocks_full_build_inflight.discard(full_cache_key)

    _stocks_full_build_executor.submit(_task)


def _dedupe_leader_responses(leaders: List[LeaderStockResponse]) -> List[LeaderStockResponse]:
    """按 symbol 去重，保留总分更高、信息更完整的记录。"""
    best_by_symbol: dict[str, LeaderStockResponse] = {}

    for leader in leaders:
        symbol = normalize_symbol(getattr(leader, "symbol", ""))
        if not re.fullmatch(r"\d{6}", symbol):
            continue

        leader.symbol = symbol
        current = best_by_symbol.get(symbol)
        if current is None:
            best_by_symbol[symbol] = leader
            continue

        current_score = float(getattr(current, "total_score", 0) or 0)
        next_score = float(getattr(leader, "total_score", 0) or 0)
        current_cap = float(getattr(current, "market_cap", 0) or 0)
        next_cap = float(getattr(leader, "market_cap", 0) or 0)

        if (next_score, next_cap) > (current_score, current_cap):
            best_by_symbol[symbol] = leader

    deduped = list(best_by_symbol.values())
    deduped.sort(key=lambda item: float(getattr(item, "total_score", 0) or 0), reverse=True)
    for idx, leader in enumerate(deduped, 1):
        leader.global_rank = idx
    return deduped


# =============================================================================
# Provider / analyzer / scorer 单例
# =============================================================================

def _get_or_create_provider():
    """获取或创建数据提供器实例（共用逻辑）"""
    global _akshare_provider
    if _akshare_provider is None:
        try:
            from src.data.providers.sina_ths_adapter import create_industry_provider
            _akshare_provider = create_industry_provider()
        except Exception as e:
            logger.warning(f"Failed to create provider via factory: {e}")
            from src.data.providers.sina_ths_adapter import SinaIndustryAdapter
            _akshare_provider = SinaIndustryAdapter()
    return _akshare_provider


def get_industry_analyzer():
    """获取行业分析器实例（延迟初始化，自动选择数据源）"""
    global _industry_analyzer

    if _industry_analyzer is None:
        try:
            from src.analytics.industry_analyzer import IndustryAnalyzer
            provider = _get_or_create_provider()
            _industry_analyzer = IndustryAnalyzer(provider)
            logger.info(f"Industry analyzer initialized with {type(provider).__name__}")
        except Exception as e:
            logger.error(f"Failed to initialize industry analyzer: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Industry analyzer initialization failed: {str(e)}",
            )

    return _industry_analyzer


def get_leader_scorer():
    """获取龙头股评分器实例（延迟初始化）"""
    global _leader_scorer

    if _leader_scorer is None:
        try:
            from src.analytics.leader_stock_scorer import LeaderStockScorer
            provider = _get_or_create_provider()
            _leader_scorer = LeaderStockScorer(provider)
            logger.info(f"Leader stock scorer initialized with {type(provider).__name__}")
        except Exception as e:
            logger.error(f"Failed to initialize leader scorer: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Leader scorer initialization failed: {str(e)}",
            )

    return _leader_scorer

"""industry 包内共享 helpers + 模块级状态（缓存、锁、ETF 映射、热力图历史）。

所有路由层（``industry.routes``）通过 ``from ._helpers import ...`` 复用这些工具。
模块级单例（``_endpoint_cache``、``_parity_cache``、``_heatmap_history`` 等）必须在
本文件定义且只被实例化一次——测试直接用 ``industry_endpoint._endpoint_cache.clear()``
之类的方式访问，依赖这些对象在拆分后仍是同一个 Python 对象。
"""

from copy import deepcopy
from typing import Any, Dict, List, Optional
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import logging
import threading
import time

from fastapi import HTTPException, Request

from backend.app.core.bounded_cache import BoundedTTLCache
from backend.app.services.industry_preferences import (
    DEFAULT_ALERT_THRESHOLDS,  # noqa: F401  re-exported for callers
    industry_preferences_store,
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


# =============================================================================
# 兼容性 re-export：让 ``industry_endpoint._helpers.X`` 仍然能拿到拆分到
# service 模块里的函数（routes / 测试都依赖通过 ``_helpers`` 命名空间访问，
# monkeypatch 也是 ``setattr(_helpers, name, ...)``）。这些 import 必须放在
# 文件末尾，避免循环导入：service 模块 ``from . import _helpers`` 时，
# _helpers 模块体已经完成所有定义。
# =============================================================================

from .ranking_service import (  # noqa: E402, F401
    _build_full_industry_stock_response,
    _build_quick_industry_stock_response,
    _build_stock_responses,
    _count_quick_stock_detail_fields,
    _get_stock_build_status,
    _get_stock_cache_keys,
    _get_stock_status_key,
    _promote_detail_ready_quick_rows,
    _resolve_symbol_with_provider,
    _schedule_full_stock_cache_build,
    _set_stock_build_status,
)
from .trend_service import (  # noqa: E402, F401
    _build_trend_summary_from_stock_rows,
    _coerce_trend_alignment_stock_rows,
    _load_trend_alignment_stock_rows,
    _should_align_trend_with_stock_rows,
)

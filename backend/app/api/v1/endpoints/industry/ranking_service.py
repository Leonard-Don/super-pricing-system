"""Ranking / stock-list service.

Owns business logic for:
- ``/industries/hot``
- ``/industries/{industry_name}/stocks`` (+ ``/status``, ``/stream``)

This service also provides the stock-list builders (``_build_full_*``,
``_build_quick_*``, etc.) that the trend service consumes when aligning
trend summaries against the constituent table. Module-level state for the
async full-build queue lives in ``_helpers``; we access it via attribute
lookup so any monkey-patches done by tests remain authoritative.
"""

import asyncio
import json
import logging
import re
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from fastapi.responses import StreamingResponse

from backend.app.schemas.industry import (
    IndustryStockBuildStatusResponse,
    StockResponse,
)
from src.analytics.industry_stock_details import (
    backfill_stock_details_with_valuation,
    build_enriched_industry_stocks,
    extract_stock_detail_fields,
    has_meaningful_numeric,
    normalize_symbol,
)

from . import _helpers


logger = logging.getLogger(__name__)


# =============================================================================
# Symbol 解析
# =============================================================================

def _resolve_symbol_with_provider(symbol_or_name: str) -> str:
    """允许详情接口和龙头列表同时接受代码或股票名。"""
    normalized = normalize_symbol(symbol_or_name)
    if re.fullmatch(r"\d{6}", normalized):
        return normalized

    provider = _helpers._get_or_create_provider()
    if hasattr(provider, "get_symbol_by_name"):
        try:
            resolved = normalize_symbol(provider.get_symbol_by_name(symbol_or_name))
            if re.fullmatch(r"\d{6}", resolved):
                return resolved
        except Exception as e:
            logger.warning(f"Failed to resolve symbol '{symbol_or_name}': {e}")

    return normalized


# =============================================================================
# 股票缓存键 / 构建状态
# =============================================================================

def _get_stock_cache_keys(industry_name: str, top_n: int) -> tuple[str, str]:
    return (
        f"stocks:quick:{industry_name}:{top_n}",
        f"stocks:full:{industry_name}:{top_n}",
    )


def _get_stock_status_key(industry_name: str, top_n: int) -> str:
    return f"{industry_name}:{top_n}"


def _set_stock_build_status(industry_name: str, top_n: int, status: str, rows: int = 0, message: Optional[str] = None) -> None:
    _helpers._stocks_full_build_status[_get_stock_status_key(industry_name, top_n)] = {
        "industry_name": industry_name,
        "top_n": top_n,
        "status": status,
        "rows": int(rows or 0),
        "message": message,
        "updated_at": datetime.now().isoformat(),
    }


def _get_stock_build_status(industry_name: str, top_n: int) -> dict:
    _, full_cache_key = _get_stock_cache_keys(industry_name, top_n)
    cached = _helpers._get_endpoint_cache(full_cache_key)
    if cached is not None:
        return {
            "industry_name": industry_name,
            "top_n": top_n,
            "status": "ready",
            "rows": len(cached),
            "message": "完整版成分股缓存已就绪",
            "updated_at": datetime.now().isoformat(),
        }
    return _helpers._stocks_full_build_status.get(
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
# 股票响应构建
# =============================================================================

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
    scorer = _helpers.get_leader_scorer()
    provider = provider or _helpers._get_or_create_provider()

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
        scorer = _helpers.get_leader_scorer()
        provider = provider or getattr(scorer, "provider", None) or _helpers._get_or_create_provider()
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
# 完整版成分股缓存异步构建
# =============================================================================

def _schedule_full_stock_cache_build(
    industry_name: str,
    top_n: int,
) -> None:
    """异步构建完整版行业成分股缓存。"""
    _, full_cache_key = _get_stock_cache_keys(industry_name, top_n)
    if _helpers._get_endpoint_cache(full_cache_key) is not None:
        return

    with _helpers._stocks_full_build_lock:
        if full_cache_key in _helpers._stocks_full_build_inflight:
            return
        _helpers._stocks_full_build_inflight.add(full_cache_key)
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
                _helpers._set_endpoint_cache(full_cache_key, result)
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
            with _helpers._stocks_full_build_lock:
                _helpers._stocks_full_build_inflight.discard(full_cache_key)

    _helpers._stocks_full_build_executor.submit(_task)


# =============================================================================
# Endpoint services
# =============================================================================

def get_industry_stocks(
    industry_name: str,
    top_n: int,
) -> List[StockResponse]:
    quick_cache_key, full_cache_key = _get_stock_cache_keys(industry_name, top_n)
    try:
        full_cached = _helpers._get_endpoint_cache(full_cache_key)
        if full_cached is not None:
            return full_cached

        quick_cached = _helpers._get_endpoint_cache(quick_cache_key)
        if quick_cached is not None:
            _helpers._schedule_full_stock_cache_build(industry_name, top_n)
            return quick_cached

        provider = _helpers._get_or_create_provider()
        cached_provider_rows = []
        cached_stock_loader = getattr(provider, "get_cached_stock_list_by_industry", None)
        if callable(cached_stock_loader):
            try:
                cached_provider_rows = cached_stock_loader(industry_name)
            except Exception as e:
                logger.warning(f"Failed to load cached industry stocks for {industry_name}: {e}")

        if cached_provider_rows:
            quick_result = _helpers._build_quick_industry_stock_response(
                industry_name,
                top_n,
                cached_provider_rows,
                provider=provider,
                enable_valuation_backfill=False,
            )
            _helpers._set_endpoint_cache(quick_cache_key, quick_result)
            _helpers._schedule_full_stock_cache_build(industry_name, top_n)
            return quick_result

        provider_stocks = provider.get_stock_list_by_industry(industry_name)

        if provider_stocks:
            quick_result = _helpers._build_quick_industry_stock_response(
                industry_name,
                top_n,
                provider_stocks,
                provider=provider,
            )
            _helpers._set_endpoint_cache(quick_cache_key, quick_result)
            _helpers._schedule_full_stock_cache_build(industry_name, top_n)
            return quick_result

        full_result = _helpers._build_full_industry_stock_response(industry_name, top_n, provider=provider)
        _helpers._set_endpoint_cache(full_cache_key, full_result)
        return full_result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting industry stocks: {e}")
        stale = _helpers._get_stale_endpoint_cache(full_cache_key)
        if stale is None:
            stale = _helpers._get_stale_endpoint_cache(quick_cache_key)
        if stale is not None:
            logger.warning(
                f"Using stale cache for industry stocks: {full_cache_key} / {quick_cache_key}"
            )
            return stale
        raise HTTPException(status_code=500, detail=str(e))


def get_industry_stock_build_status(
    industry_name: str,
    top_n: int,
) -> IndustryStockBuildStatusResponse:
    status = _get_stock_build_status(industry_name, top_n)
    return IndustryStockBuildStatusResponse(**status)


async def stream_industry_stock_build_status(
    industry_name: str,
    top_n: int,
):
    async def event_generator():
        emitted = None
        started_at = time.time()
        while True:
            status = _get_stock_build_status(industry_name, top_n)
            payload = json.dumps(status, ensure_ascii=False)
            if payload != emitted:
                emitted = payload
                yield f"data: {payload}\n\n"

            if status.get("status") in {"ready", "failed"}:
                break
            if (time.time() - started_at) > 30:
                break
            await asyncio.sleep(0.75)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

"""industry 包对外的 13 个 FastAPI 路由 handler。

路由层只负责"参数校验 → 调 helper / analyzer → 包装响应"。所有重型逻辑、缓存与
模块状态都在 ``._helpers`` 中。
"""

import logging
import re
import time
from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse

from backend.app.schemas.industry import (
    ClusterResponse,
    HeatmapDataItem,
    HeatmapHistoryItem,
    HeatmapHistoryResponse,
    HeatmapResponse,
    IndustryPreferencesResponse,
    IndustryRankResponse,
    IndustryRotationResponse,
    IndustryStockBuildStatusResponse,
    IndustryTrendResponse,
    LeaderDetailResponse,
    LeaderStockResponse,
    StockResponse,
)
from backend.app.services.industry_preferences import industry_preferences_store
from src.analytics.industry_stock_details import (
    has_meaningful_numeric,
    normalize_symbol,
)

from . import _helpers
# 仅 import"惯用值"工具函数（不可变 / 测试不会 patch 的）。其它由测试 monkeypatch
# 的函数（``get_industry_analyzer``、``get_leader_scorer``、``_get_or_create_provider``
# 等）一律走 ``_helpers.X(...)`` 的模块级查找，确保 ``setattr(_helpers, X, ...)``
# 能立即生效——避免单文件 module 拆分后失去 patch 兼容性。
from ._helpers import (
    _append_heatmap_history,
    _attach_execution_metadata,
    _build_execution_metadata,
    _build_industry_intelligence_result,
    _build_industry_network_result,
    _build_trend_summary_from_stock_rows,
    _dedupe_leader_responses,
    _get_endpoint_cache,
    _get_parity_cache,
    _get_stale_endpoint_cache,
    _get_stale_parity_cache,
    _get_stock_build_status,
    _get_stock_cache_keys,
    _heatmap_history,
    _heatmap_history_lock,
    _load_heatmap_history_from_disk,
    _resolve_industry_profile,
    _resolve_intelligence_rows_from_fallback,
    _set_endpoint_cache,
    _set_parity_cache,
    _should_align_trend_with_stock_rows,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# =============================================================================
# /industries/hot
# =============================================================================

@router.get("/industries/hot", response_model=List[IndustryRankResponse])
def get_hot_industries(
    top_n: int = Query(10, ge=1, le=50, description="返回前N个热门行业"),
    lookback_days: int = Query(5, ge=1, le=30, description="回看周期（天）"),
    sort_by: str = Query("total_score", description="排序字段: total_score, change_pct, money_flow, industry_volatility"),
    order: str = Query("desc", description="排序顺序: desc, asc"),
) -> List[IndustryRankResponse]:
    """获取热门行业排名"""
    try:
        cache_key = f"hot:v3:{top_n}:{lookback_days}:{sort_by}:{order}"
        cached = _get_endpoint_cache(cache_key)
        if cached is not None:
            return cached

        analyzer = _helpers.get_industry_analyzer()
        ascending = (order.lower() == "asc")
        hot_industries = analyzer.rank_industries(
            top_n=top_n,
            sort_by=sort_by,
            ascending=ascending,
            lookback_days=lookback_days,
        )

        result = [
            IndustryRankResponse(
                rank=ind.get("rank", 0),
                industry_name=ind.get("industry_name", ""),
                score=ind.get("score", 0),
                momentum=ind.get("momentum", 0),
                change_pct=ind.get("change_pct", 0),
                money_flow=ind.get("money_flow", 0),
                flow_strength=ind.get("flow_strength", 0),
                industryVolatility=ind.get("industry_volatility", 0),
                industryVolatilitySource=ind.get("industry_volatility_source", "unavailable"),
                stock_count=ind.get("stock_count", 0),
                total_market_cap=ind.get("total_market_cap", 0),
                marketCapSource=ind.get("market_cap_source", "unknown"),
                mini_trend=ind.get("mini_trend", []),
                score_breakdown=analyzer.build_rank_score_breakdown(ind),
            )
            for ind in hot_industries
        ]
        _set_endpoint_cache(cache_key, result)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting hot industries: {e}")
        stale = _get_stale_endpoint_cache(cache_key)
        if stale is not None:
            logger.warning(f"Using stale cache for hot industries: {cache_key}")
            return stale
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# /industries/{industry_name}/stocks  (+ /status, /stream)
# =============================================================================

@router.get("/industries/{industry_name}/stocks", response_model=List[StockResponse])
def get_industry_stocks(
    industry_name: str,
    top_n: int = Query(20, ge=1, le=100, description="返回前N只股票"),
) -> List[StockResponse]:
    """获取行业成分股及排名"""
    quick_cache_key, full_cache_key = _get_stock_cache_keys(industry_name, top_n)
    try:
        full_cached = _get_endpoint_cache(full_cache_key)
        if full_cached is not None:
            return full_cached

        quick_cached = _get_endpoint_cache(quick_cache_key)
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
            _set_endpoint_cache(quick_cache_key, quick_result)
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
            _set_endpoint_cache(quick_cache_key, quick_result)
            _helpers._schedule_full_stock_cache_build(industry_name, top_n)
            return quick_result

        full_result = _helpers._build_full_industry_stock_response(industry_name, top_n, provider=provider)
        _set_endpoint_cache(full_cache_key, full_result)
        return full_result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting industry stocks: {e}")
        stale = _get_stale_endpoint_cache(full_cache_key)
        if stale is None:
            stale = _get_stale_endpoint_cache(quick_cache_key)
        if stale is not None:
            logger.warning(
                f"Using stale cache for industry stocks: {full_cache_key} / {quick_cache_key}"
            )
            return stale
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/industries/{industry_name}/stocks/status", response_model=IndustryStockBuildStatusResponse)
def get_industry_stock_build_status(
    industry_name: str,
    top_n: int = Query(20, ge=1, le=100, description="返回前N只股票"),
) -> IndustryStockBuildStatusResponse:
    status = _get_stock_build_status(industry_name, top_n)
    return IndustryStockBuildStatusResponse(**status)


@router.get("/industries/{industry_name}/stocks/stream")
async def stream_industry_stock_build_status(
    industry_name: str,
    top_n: int = Query(20, ge=1, le=100, description="返回前N只股票"),
):
    import asyncio
    import json

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


# =============================================================================
# /industries/heatmap (+ /history)
# =============================================================================

@router.get("/industries/heatmap", response_model=HeatmapResponse)
def get_industry_heatmap(
    days: int = Query(5, ge=1, le=90, description="分析周期（天）"),
) -> HeatmapResponse:
    """获取行业热力图数据"""
    try:
        cache_key = f"heatmap:v2:{days}"
        cached = _get_endpoint_cache(cache_key)
        if cached is not None:
            return cached

        analyzer = _helpers.get_industry_analyzer()
        heatmap_data = analyzer.get_industry_heatmap_data(days=days)

        result = HeatmapResponse(
            industries=[
                HeatmapDataItem(
                    name=ind.get("name", ""),
                    value=ind.get("value", 0),
                    total_score=ind.get("total_score", 0),
                    size=ind.get("size", 0),
                    stockCount=ind.get("stockCount", 0),
                    moneyFlow=ind.get("moneyFlow", 0),
                    turnoverRate=ind.get("turnoverRate", 0),
                    industryVolatility=ind.get("industryVolatility", 0),
                    industryVolatilitySource=ind.get("industryVolatilitySource", "unavailable"),
                    netInflowRatio=ind.get("netInflowRatio", 0),
                    leadingStock=str(ind["leadingStock"]) if ind.get("leadingStock") and ind["leadingStock"] != 0 else None,
                    sizeSource=ind.get("sizeSource", "estimated"),
                    marketCapSource=ind.get("marketCapSource", "unknown"),
                    marketCapSnapshotAgeHours=ind.get("marketCapSnapshotAgeHours"),
                    marketCapSnapshotIsStale=ind.get("marketCapSnapshotIsStale", False),
                    valuationSource=ind.get("valuationSource", "unavailable"),
                    valuationQuality=ind.get("valuationQuality", "unavailable"),
                    dataSources=ind.get("dataSources", []),
                    industryIndex=ind.get("industryIndex", 0),
                    totalInflow=ind.get("totalInflow", 0),
                    totalOutflow=ind.get("totalOutflow", 0),
                    leadingStockChange=ind.get("leadingStockChange", 0),
                    leadingStockPrice=ind.get("leadingStockPrice", 0),
                    pe_ttm=ind.get("pe_ttm"),
                    pb=ind.get("pb"),
                    dividend_yield=ind.get("dividend_yield"),
                )
                for ind in heatmap_data.get("industries", [])
            ],
            max_value=heatmap_data.get("max_value", 0),
            min_value=heatmap_data.get("min_value", 0),
            update_time=heatmap_data.get("update_time", ""),
        )
        if result.industries:
            _set_endpoint_cache(cache_key, result)
            _append_heatmap_history(days, result)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting industry heatmap: {e}")
        stale = _get_stale_endpoint_cache(cache_key)
        if stale is not None:
            logger.warning(f"Using stale cache for heatmap: {cache_key}")
            return stale
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/industries/heatmap/history", response_model=HeatmapHistoryResponse)
def get_industry_heatmap_history(
    limit: int = Query(10, ge=1, le=50, description="返回快照数量"),
    days: Optional[int] = Query(None, ge=1, le=90, description="按周期过滤"),
) -> HeatmapHistoryResponse:
    """获取行业热力图历史快照。"""
    _load_heatmap_history_from_disk()
    with _heatmap_history_lock:
        items = list(_heatmap_history)

    if days is not None:
        items = [item for item in items if int(item.get("days", 0) or 0) == days]

    history_items = [
        HeatmapHistoryItem(
            snapshot_id=item.get("snapshot_id", ""),
            days=item.get("days", 0),
            captured_at=item.get("captured_at", ""),
            update_time=item.get("update_time", ""),
            max_value=item.get("max_value", 0),
            min_value=item.get("min_value", 0),
            industries=[
                HeatmapDataItem(**industry_item)
                for industry_item in item.get("industries", [])
            ],
        )
        for item in items[:limit]
    ]
    return HeatmapHistoryResponse(items=history_items)


# =============================================================================
# /preferences (4 个端点)
# =============================================================================

@router.get("/preferences", response_model=IndustryPreferencesResponse)
def get_industry_preferences(request: Request) -> IndustryPreferencesResponse:
    profile_id = _resolve_industry_profile(request)
    return IndustryPreferencesResponse(**industry_preferences_store.get_preferences(profile_id=profile_id))


@router.put("/preferences", response_model=IndustryPreferencesResponse)
def update_industry_preferences(payload: IndustryPreferencesResponse, request: Request) -> IndustryPreferencesResponse:
    profile_id = _resolve_industry_profile(request)
    data = industry_preferences_store.update_preferences(payload.model_dump(), profile_id=profile_id)
    return IndustryPreferencesResponse(**data)


@router.get("/preferences/export")
def export_industry_preferences(request: Request):
    profile_id = _resolve_industry_profile(request)
    return JSONResponse(content=industry_preferences_store.get_preferences(profile_id=profile_id))


@router.post("/preferences/import", response_model=IndustryPreferencesResponse)
def import_industry_preferences(payload: IndustryPreferencesResponse, request: Request) -> IndustryPreferencesResponse:
    profile_id = _resolve_industry_profile(request)
    data = industry_preferences_store.update_preferences(payload.model_dump(), profile_id=profile_id)
    return IndustryPreferencesResponse(**data)


# =============================================================================
# /industries/{industry_name}/trend
# =============================================================================

@router.get("/industries/{industry_name}/trend", response_model=IndustryTrendResponse)
def get_industry_trend(
    industry_name: str,
    days: int = Query(30, ge=1, le=90, description="分析周期（天）"),
) -> IndustryTrendResponse:
    """获取行业趋势分析"""
    cache_key = f"trend:v5:{industry_name}:{days}"
    try:
        cached = _get_endpoint_cache(cache_key)
        if cached is not None:
            return cached

        analyzer = _helpers.get_industry_analyzer()
        trend_data = analyzer.get_industry_trend(industry_name, days=days)

        if "error" in trend_data:
            raise HTTPException(status_code=404, detail=trend_data["error"])

        result = IndustryTrendResponse(
            industry_name=trend_data.get("industry_name", ""),
            stock_count=trend_data.get("stock_count", 0),
            expected_stock_count=trend_data.get("expected_stock_count", 0),
            total_market_cap=trend_data.get("total_market_cap", 0),
            avg_pe=trend_data.get("avg_pe", 0),
            industry_volatility=trend_data.get("industry_volatility", 0),
            industry_volatility_source=trend_data.get("industry_volatility_source", "unavailable"),
            period_days=trend_data.get("period_days", days),
            period_change_pct=trend_data.get("period_change_pct", 0),
            period_money_flow=trend_data.get("period_money_flow", 0),
            top_gainers=trend_data.get("top_gainers", []),
            top_losers=trend_data.get("top_losers", []),
            rise_count=trend_data.get("rise_count", 0),
            fall_count=trend_data.get("fall_count", 0),
            flat_count=trend_data.get("flat_count", 0),
            stock_coverage_ratio=trend_data.get("stock_coverage_ratio", 0),
            change_coverage_ratio=trend_data.get("change_coverage_ratio", 0),
            market_cap_coverage_ratio=trend_data.get("market_cap_coverage_ratio", 0),
            pe_coverage_ratio=trend_data.get("pe_coverage_ratio", 0),
            total_market_cap_fallback=trend_data.get("total_market_cap_fallback", False),
            avg_pe_fallback=trend_data.get("avg_pe_fallback", False),
            market_cap_source=trend_data.get("market_cap_source", "unknown"),
            valuation_source=trend_data.get("valuation_source", "unavailable"),
            valuation_quality=trend_data.get("valuation_quality", "unavailable"),
            trend_series=trend_data.get("trend_series", []),
            degraded=trend_data.get("degraded", False),
            note=trend_data.get("note"),
            update_time=trend_data.get("update_time", ""),
        )

        should_attempt_alignment = (
            result.degraded
            or (
                result.expected_stock_count > 0
                and result.stock_count > max(result.expected_stock_count * 2, result.expected_stock_count + 15)
            )
        )
        if should_attempt_alignment:
            provider = getattr(analyzer, "provider", None) or _helpers._get_or_create_provider()
            aligned_stock_rows = _helpers._load_trend_alignment_stock_rows(
                industry_name,
                result.expected_stock_count,
                provider=provider,
            )
            if _should_align_trend_with_stock_rows(result.model_dump(), aligned_stock_rows):
                aligned_summary = _build_trend_summary_from_stock_rows(
                    aligned_stock_rows,
                    expected_count=result.expected_stock_count,
                    fallback_total_market_cap=result.total_market_cap,
                    fallback_avg_pe=result.avg_pe,
                )
                aligned_payload = result.model_dump()
                aligned_payload.update(aligned_summary)
                result = IndustryTrendResponse(**aligned_payload)

        if result.degraded:
            stale = _get_stale_endpoint_cache(cache_key)
            if stale is not None and not getattr(stale, "degraded", True):
                logger.warning(f"Trend data degraded for {industry_name}, returning healthy stale cache")
                return stale

        _set_endpoint_cache(cache_key, result)
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting industry trend: {e}")
        stale = _get_stale_endpoint_cache(cache_key)
        if stale is not None:
            logger.warning(f"Using stale cache for trend: {cache_key}")
            return stale
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# /industries/clusters + /industries/rotation
# =============================================================================

@router.get("/industries/clusters", response_model=ClusterResponse)
def get_industry_clusters(
    n_clusters: int = Query(4, ge=2, le=10, description="聚类数量"),
) -> ClusterResponse:
    """获取行业聚类分析"""
    try:
        analyzer = _helpers.get_industry_analyzer()
        cluster_data = analyzer.cluster_hot_industries(n_clusters=n_clusters)

        return ClusterResponse(
            clusters=cluster_data.get("clusters", {}),
            hot_cluster=cluster_data.get("hot_cluster", -1),
            cluster_stats=cluster_data.get("cluster_stats", {}),
            points=cluster_data.get("points", []),
            selected_cluster_count=cluster_data.get("selected_cluster_count", n_clusters),
            silhouette_score=cluster_data.get("silhouette_score"),
            cluster_candidates=cluster_data.get("cluster_candidates", {}),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting industry clusters: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/industries/rotation", response_model=IndustryRotationResponse)
def get_industry_rotation(
    industries: str = Query(..., description="行业名称列表，逗号分隔"),
    periods: Optional[str] = Query(None, description="统计周期列表，逗号分隔，如 1,5,20"),
) -> IndustryRotationResponse:
    """获取行业轮动对比数据"""
    try:
        industry_list = [i.strip() for i in industries.split(",") if i.strip()]
        if len(industry_list) < 2:
            raise HTTPException(status_code=400, detail="至少需要选择 2 个行业进行对比")
        if len(industry_list) > 5:
            industry_list = industry_list[:5]

        requested_periods = None
        if periods:
            requested_periods = []
            for raw in periods.split(","):
                raw_value = raw.strip()
                if not raw_value:
                    continue
                try:
                    requested_periods.append(max(int(raw_value), 1))
                except ValueError as exc:
                    raise HTTPException(status_code=400, detail=f"非法周期参数: {raw_value}") from exc

        analyzer = _helpers.get_industry_analyzer()
        rotation_data = analyzer.get_industry_rotation(industry_list, requested_periods)

        if "error" in rotation_data:
            raise HTTPException(status_code=500, detail=rotation_data["error"])

        return IndustryRotationResponse(
            industries=rotation_data.get("industries", []),
            periods=rotation_data.get("periods", []),
            data=rotation_data.get("data", []),
            update_time=rotation_data.get("update_time", ""),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting industry rotation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# /industries/intelligence + /industries/network
# =============================================================================

@router.get("/industries/intelligence", summary="行业生命周期、ETF 映射与事件日历")
def get_industry_intelligence(
    top_n: int = Query(12, ge=1, le=30, description="分析前 N 个热门行业"),
    lookback_days: int = Query(5, ge=1, le=30, description="热度回看周期"),
    mode: Literal["live", "fast"] = Query("live", description="live=实时热度；fast=优先使用快照/兜底"),
):
    cache_key = f"industry_intelligence:v2:{top_n}:{lookback_days}:live"
    fast_cache_key = f"industry_intelligence:v2:{top_n}:{lookback_days}:fast"
    cached = _get_endpoint_cache(cache_key)
    if cached is not None:
        return _attach_execution_metadata(cached, {"cache_status": "fresh"})
    cached_fast = _get_endpoint_cache(fast_cache_key)
    if mode == "fast" and cached_fast is not None:
        return _attach_execution_metadata(cached_fast, {"cache_status": "fresh"})

    if mode == "fast":
        stale = _get_stale_endpoint_cache(cache_key)
        if stale is not None:
            return _attach_execution_metadata(stale, {"cache_status": "stale", "degraded": True})
        stale_fast = _get_stale_endpoint_cache(fast_cache_key)
        if stale_fast is not None:
            return _attach_execution_metadata(stale_fast, {"cache_status": "stale", "degraded": True})

        fallback_rows, execution = _resolve_intelligence_rows_from_fallback(top_n=top_n, lookback_days=lookback_days)
        if fallback_rows:
            result = _build_industry_intelligence_result(fallback_rows, lookback_days=lookback_days, execution=execution)
            _set_endpoint_cache(fast_cache_key, result)
            return result
    try:
        analyzer = _helpers.get_industry_analyzer()
        rows = analyzer.rank_industries(
            top_n=top_n,
            sort_by="total_score",
            ascending=False,
            lookback_days=lookback_days,
        )
        result = _build_industry_intelligence_result(
            rows,
            lookback_days=lookback_days,
            execution=_build_execution_metadata(source="live_rank", degraded=False),
        )
        _set_endpoint_cache(cache_key, result)
        return result
    except Exception as e:
        logger.error(f"Error building industry intelligence: {e}", exc_info=True)
        stale = _get_stale_endpoint_cache(cache_key)
        if stale is not None:
            return _attach_execution_metadata(stale, {"cache_status": "stale", "degraded": True})
        fallback_rows, execution = _resolve_intelligence_rows_from_fallback(top_n=top_n, lookback_days=lookback_days)
        if fallback_rows:
            result = _build_industry_intelligence_result(fallback_rows, lookback_days=lookback_days, execution=execution)
            _set_endpoint_cache(fast_cache_key, result)
            return result
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/industries/network", summary="行业相关性网络图")
def get_industry_network(
    top_n: int = Query(18, ge=4, le=50, description="网络节点数量"),
    lookback_days: int = Query(5, ge=1, le=30, description="热度回看周期"),
    min_similarity: float = Query(0.92, ge=0.0, le=1.0, description="最小相似度"),
    mode: Literal["live", "fast"] = Query("live", description="live=实时热度；fast=优先使用快照/兜底"),
):
    cache_key = f"industry_network:v2:{top_n}:{lookback_days}:{min_similarity}:live"
    fast_cache_key = f"industry_network:v2:{top_n}:{lookback_days}:{min_similarity}:fast"
    cached = _get_endpoint_cache(cache_key)
    if cached is not None:
        return _attach_execution_metadata(cached, {"cache_status": "fresh"})
    cached_fast = _get_endpoint_cache(fast_cache_key)
    if mode == "fast" and cached_fast is not None:
        return _attach_execution_metadata(cached_fast, {"cache_status": "fresh"})

    if mode == "fast":
        stale = _get_stale_endpoint_cache(cache_key)
        if stale is not None:
            return _attach_execution_metadata(stale, {"cache_status": "stale", "degraded": True})
        stale_fast = _get_stale_endpoint_cache(fast_cache_key)
        if stale_fast is not None:
            return _attach_execution_metadata(stale_fast, {"cache_status": "stale", "degraded": True})

        fallback_rows, execution = _resolve_intelligence_rows_from_fallback(top_n=top_n, lookback_days=lookback_days)
        if fallback_rows:
            result = _build_industry_network_result(
                fallback_rows,
                top_n=top_n,
                lookback_days=lookback_days,
                min_similarity=min_similarity,
                execution=execution,
            )
            _set_endpoint_cache(fast_cache_key, result)
            return result
    try:
        analyzer = _helpers.get_industry_analyzer()
        rows = analyzer.rank_industries(
            top_n=top_n,
            sort_by="total_score",
            ascending=False,
            lookback_days=lookback_days,
        )
        result = _build_industry_network_result(
            rows,
            top_n=top_n,
            lookback_days=lookback_days,
            min_similarity=min_similarity,
            execution=_build_execution_metadata(source="live_rank", degraded=False),
        )
        _set_endpoint_cache(cache_key, result)
        return result
    except Exception as e:
        logger.error(f"Error building industry network: {e}", exc_info=True)
        stale = _get_stale_endpoint_cache(cache_key)
        if stale is not None:
            return _attach_execution_metadata(stale, {"cache_status": "stale", "degraded": True})
        fallback_rows, execution = _resolve_intelligence_rows_from_fallback(top_n=top_n, lookback_days=lookback_days)
        if fallback_rows:
            result = _build_industry_network_result(
                fallback_rows,
                top_n=top_n,
                lookback_days=lookback_days,
                min_similarity=min_similarity,
                execution=execution,
            )
            _set_endpoint_cache(fast_cache_key, result)
            return result
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# /leaders (+ /leaders/{symbol}/detail)
# =============================================================================

@router.get("/leaders", response_model=List[LeaderStockResponse])
def get_leader_stocks(
    top_n: int = Query(20, ge=1, le=100, description="返回龙头股数量"),
    top_industries: int = Query(5, ge=1, le=20, description="从前N个热门行业中选取"),
    per_industry: int = Query(5, ge=1, le=20, description="每个行业选取的龙头数量"),
    list_type: Literal["hot", "core"] = Query("hot", description="榜单类型：hot(热点先锋) 或 core(核心资产)"),
) -> List[LeaderStockResponse]:
    """获取龙头股推荐列表"""
    try:
        cache_key = f"leaders:v3:{list_type}:{top_n}:{top_industries}:{per_industry}"
        cached = _get_endpoint_cache(cache_key)
        if cached is not None:
            return cached

        analyzer = _helpers.get_industry_analyzer()
        hot_industries = analyzer.rank_industries(top_n=top_industries)
        top_industry_names = set(ind.get("industry_name") for ind in hot_industries)

        # ========== 核心资产 (Core Leaders) 逻辑 ==========
        if list_type == "core":
            import concurrent.futures
            scorer = _helpers.get_leader_scorer()
            provider = analyzer.provider

            def _process_core_industry(industry):
                ind_name = industry.get("industry_name")
                if not ind_name:
                    return []
                try:
                    stocks = provider.get_stock_list_by_industry(ind_name)
                    if not stocks:
                        return []

                    candidate_pool = []
                    for stock in stocks:
                        sym = normalize_symbol(stock.get("symbol") or stock.get("code") or "")
                        if not re.fullmatch(r"\d{6}", sym):
                            continue
                        candidate_pool.append({
                            "symbol": sym,
                            "name": stock.get("name", ""),
                            "market_cap": float(stock.get("market_cap") or 0),
                            "pe_ratio": float(stock.get("pe_ratio") or 0),
                            "change_pct": float(stock.get("change_pct") or 0),
                            "amount": float(stock.get("amount") or 0),
                        })

                    if not candidate_pool:
                        return []

                    candidate_pool.sort(
                        key=lambda item: (
                            item["market_cap"] > 0,
                            item["market_cap"],
                            item["amount"],
                            abs(item["change_pct"]),
                        ),
                        reverse=True,
                    )

                    valid_stocks = []
                    for item in candidate_pool[: max(5, per_industry * 2)]:
                        mkt_cap = item["market_cap"]
                        pe = item["pe_ratio"]
                        if mkt_cap > 0 and mkt_cap < 3000000000:
                            continue
                        if pe != 0 and (pe < 0 or pe > 150):
                            continue
                        valid_stocks.append(item["symbol"])

                    if not valid_stocks:
                        valid_stocks = [item["symbol"] for item in candidate_pool[: min(5, len(candidate_pool))]]

                    logger.info(f"For {ind_name}, selected {len(valid_stocks)} valid core candidates.")
                    candidate_map = {item["symbol"]: item for item in candidate_pool}
                    industry_stats = scorer.calculate_industry_stats(candidate_pool)

                    fast_results = []
                    for sym in valid_stocks[:max(5, int(per_industry * 1.5))]:
                        snapshot = candidate_map.get(sym, {"symbol": sym, "name": sym})
                        sd = scorer.score_stock_from_snapshot(snapshot, industry_stats=industry_stats, enrich_financial=False)
                        ds = sd.get("dimension_scores", {})
                        roe = sd.get("raw_data", {}).get("roe")
                        if roe is not None and roe < 0:
                            continue
                        fast_score = sd.get("total_score", 0)
                        fast_results.append((sym, fast_score, sd))

                    fast_results.sort(key=lambda x: x[1], reverse=True)
                    top_syms = [sym for sym, _, _ in fast_results[:per_industry]]

                    ind_core_list = []
                    for sym in top_syms:
                        snapshot = candidate_map.get(sym, {"symbol": sym, "name": sym})
                        sd = None
                        try:
                            sd = scorer.score_stock_from_snapshot(
                                snapshot,
                                industry_stats=industry_stats,
                                enrich_financial=True,
                                cached_only=True,
                            )
                        except Exception:
                            pass
                        if not sd or "error" in sd:
                            sd = scorer.score_stock_from_snapshot(snapshot, industry_stats=industry_stats, enrich_financial=False)
                        ds = sd.get("dimension_scores", {})
                        roe = sd.get("raw_data", {}).get("roe")
                        if roe is not None and roe < 0:
                            continue
                        total_score = round(sd.get("total_score", 0), 2)
                        ind_core_list.append(LeaderStockResponse(
                            symbol=sym,
                            name=sd.get("name", sym),
                            industry=ind_name,
                            score_type="core",
                            global_rank=0,
                            industry_rank=0,
                            total_score=total_score,
                            market_cap=sd.get("raw_data", {}).get("market_cap", snapshot.get("market_cap", 0)),
                            pe_ratio=sd.get("raw_data", {}).get("pe_ttm", snapshot.get("pe_ratio", 0)),
                            change_pct=sd.get("raw_data", {}).get("change_pct", snapshot.get("change_pct", 0)),
                            dimension_scores=ds,
                            mini_trend=[],
                        ))

                    ind_core_list.sort(key=lambda x: x.total_score, reverse=True)
                    for rank_idx, stock in enumerate(ind_core_list[:per_industry], 1):
                        stock.industry_rank = rank_idx
                    return ind_core_list[:per_industry]
                except Exception as e:
                    logger.error(f"Error fetching core stocks for {ind_name}: {e}")
                    return []

            core_leaders = []
            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                industry_results = list(executor.map(
                    _process_core_industry, hot_industries[:top_industries]
                ))
            for result in industry_results:
                core_leaders.extend(result)

            try:
                from src.analytics.leader_stock_scorer import LeaderStockScorer
                LeaderStockScorer._persist_financial_cache()
            except Exception:
                pass

            core_leaders = _dedupe_leader_responses(core_leaders)[:top_n]

            if core_leaders:
                _set_endpoint_cache(cache_key, core_leaders)
                for leader in core_leaders:
                    _set_parity_cache(leader.symbol, "core", leader)
            else:
                stale = _get_stale_endpoint_cache(cache_key)
                if stale is not None:
                    logger.warning("Core leaders empty, using stale cache: %s", cache_key)
                    return stale
            return core_leaders

        # ========== 热点先锋 (Hot Movers) 逻辑 ==========
        heatmap_df = analyzer.analyze_money_flow(days=1)
        leaders_from_heatmap = []
        scorer = _helpers.get_leader_scorer()
        valuation_provider = getattr(analyzer, "provider", None)

        if not heatmap_df.empty and "leading_stock" in heatmap_df.columns:
            sort_col = "main_net_inflow" if "main_net_inflow" in heatmap_df.columns else "change_pct"
            sorted_df = heatmap_df.sort_values(sort_col, ascending=False)

            seen_stocks = set()
            hot_candidates = []
            for _, row in sorted_df.iterrows():
                industry_name = row.get("industry_name", "")
                leading_stock = row.get("leading_stock")
                if not leading_stock or not isinstance(leading_stock, str):
                    continue
                if top_industry_names and industry_name not in top_industry_names:
                    continue
                if leading_stock in seen_stocks:
                    continue
                seen_stocks.add(leading_stock)
                hot_candidates.append(row)
                if len(hot_candidates) >= int(top_n * 1.2):
                    break

            def _score_hot_stock(row):
                industry_name = row.get("industry_name", "")
                leading_stock = row.get("leading_stock")
                change_pct = float(row.get("leading_stock_change", row.get("change_pct", 0)) or 0)
                net_inflow_ratio = float(row.get("main_net_ratio", 0) or 0)

                quick_symbol = normalize_symbol(leading_stock)
                if re.fullmatch(r"\d{6}", quick_symbol):
                    real_symbol = quick_symbol
                else:
                    real_symbol = _helpers._resolve_symbol_with_provider(leading_stock)

                valuation_snapshot = {}
                if re.fullmatch(r"\d{6}", real_symbol) and valuation_provider and hasattr(valuation_provider, "get_stock_valuation"):
                    try:
                        candidate = valuation_provider.get_stock_valuation(real_symbol)
                        if isinstance(candidate, dict) and "error" not in candidate:
                            valuation_snapshot = candidate
                    except Exception as exc:
                        logger.warning("Failed to hydrate hot leader valuation for %s: %s", real_symbol, exc)

                snapshot_data = {
                    "symbol": real_symbol,
                    "name": leading_stock,
                    "market_cap": float(valuation_snapshot.get("market_cap") or 0),
                    "pe_ratio": float(valuation_snapshot.get("pe_ttm") or valuation_snapshot.get("pe_ratio") or 0),
                    "change_pct": change_pct,
                    "amount": float(valuation_snapshot.get("amount") or abs(float(row.get("main_net_inflow", 0) or 0))),
                    "turnover": float(valuation_snapshot.get("turnover") or 0),
                    "net_inflow_ratio": net_inflow_ratio,
                }

                score_detail = scorer.score_stock_from_snapshot(snapshot_data, score_type="hot")

                if "error" not in score_detail:
                    scored_symbol = normalize_symbol(score_detail.get("symbol", real_symbol))
                    market_cap = score_detail.get("raw_data", {}).get("market_cap", 0)
                    pe_ratio = score_detail.get("raw_data", {}).get("pe_ttm", 0)
                    dimension_scores = score_detail.get("dimension_scores", {})
                    total_score = score_detail.get("total_score", 0)
                else:
                    scored_symbol = real_symbol
                    total_score = round(min(100, max(0, (change_pct + 15) / 30 * 50 + max(0, min(50, net_inflow_ratio * 5 + 25)))), 2)
                    market_cap = 0
                    pe_ratio = 0
                    dimension_scores = {
                        "momentum": min(1.0, max(0.0, (change_pct + 15) / 30)),
                        "money_flow": min(1.0, max(0.0, (net_inflow_ratio + 10) / 20)),
                        "valuation": 0.5,
                        "profitability": 0.5,
                        "growth": 0.5,
                        "activity": 0.5,
                        "score_type": "hot",
                    }

                if not re.fullmatch(r"\d{6}", scored_symbol):
                    logger.warning(f"Skipping leader '{leading_stock}' because symbol could not be resolved: {scored_symbol}")
                    return None

                return LeaderStockResponse(
                    symbol=scored_symbol,
                    name=leading_stock,
                    industry=industry_name,
                    score_type="hot",
                    global_rank=0,
                    industry_rank=1,
                    total_score=total_score,
                    market_cap=market_cap,
                    pe_ratio=pe_ratio,
                    change_pct=change_pct,
                    dimension_scores=dimension_scores,
                    mini_trend=[],
                )

            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
                results = list(executor.map(_score_hot_stock, hot_candidates))

            for res in results:
                if res:
                    leaders_from_heatmap.append(res)

            leaders_from_heatmap = _dedupe_leader_responses(leaders_from_heatmap)[:top_n]

        if leaders_from_heatmap and len(leaders_from_heatmap) < top_n:
            logger.info(
                "Heatmap hot leaders underfilled (%s/%s), backfilling from LeaderStockScorer",
                len(leaders_from_heatmap),
                top_n,
            )
            scorer = _helpers.get_leader_scorer()
            industry_names = [ind.get("industry_name") for ind in hot_industries]
            needed_count = max(0, top_n - len(leaders_from_heatmap))
            supplemental_per_industry = max(
                1,
                (needed_count + max(len(industry_names), 1) - 1) // max(len(industry_names), 1),
            )
            supplemental = scorer.get_leader_stocks(
                industry_names,
                top_per_industry=supplemental_per_industry,
                score_type="hot",
            )
            leaders_from_heatmap.extend(
                [
                    LeaderStockResponse(
                        symbol=l.get("symbol", ""),
                        name=l.get("name", ""),
                        industry=l.get("industry", ""),
                        score_type="hot",
                        global_rank=l.get("global_rank", 0),
                        industry_rank=l.get("rank", 0),
                        total_score=l.get("total_score", 0),
                        market_cap=l.get("market_cap", 0),
                        pe_ratio=l.get("pe_ratio", 0),
                        change_pct=l.get("change_pct", 0),
                        dimension_scores=l.get("dimension_scores", {}),
                        mini_trend=l.get("mini_trend", []),
                    )
                    for l in supplemental
                ]
            )
            leaders_from_heatmap = _dedupe_leader_responses(leaders_from_heatmap)[:top_n]

        if leaders_from_heatmap:
            _set_endpoint_cache(cache_key, leaders_from_heatmap)
            for leader in leaders_from_heatmap:
                _set_parity_cache(leader.symbol, "hot", leader)
            return leaders_from_heatmap

        # ⬇️ 降级路径
        logger.warning("Heatmap leading_stock unavailable, falling back to LeaderStockScorer")
        scorer = _helpers.get_leader_scorer()
        industry_names = [ind.get("industry_name") for ind in hot_industries]
        leaders = scorer.get_leader_stocks(industry_names, top_per_industry=per_industry, score_type="hot")
        leaders = leaders[:top_n]

        result = [
            LeaderStockResponse(
                symbol=l.get("symbol", ""),
                name=l.get("name", ""),
                industry=l.get("industry", ""),
                score_type="hot",
                global_rank=l.get("global_rank", 0),
                industry_rank=l.get("rank", 0),
                total_score=l.get("total_score", 0),
                market_cap=l.get("market_cap", 0),
                pe_ratio=l.get("pe_ratio", 0),
                change_pct=l.get("change_pct", 0),
                dimension_scores=l.get("dimension_scores", {}),
                mini_trend=l.get("mini_trend", []),
            )
            for l in leaders
        ]
        result = _dedupe_leader_responses(result)[:top_n]
        if result:
            _set_endpoint_cache(cache_key, result)
            for leader in result:
                _set_parity_cache(leader.symbol, "hot", leader)
        else:
            stale = _get_stale_endpoint_cache(cache_key)
            if stale is not None:
                logger.warning("Hot leaders empty, using stale cache: %s", cache_key)
                return stale
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting leader stocks: {e}")
        stale = _get_stale_endpoint_cache(cache_key)
        if stale is not None:
            logger.warning(f"Using stale cache for leaders: {cache_key}")
            return stale
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/leaders/{symbol}/detail", response_model=LeaderDetailResponse)
def get_leader_detail(
    symbol: str,
    score_type: Literal["core", "hot"] = Query("core", description="评分类型: core 或 hot"),
) -> LeaderDetailResponse:
    """获取龙头股详细分析"""
    try:
        resolved_symbol = _helpers._resolve_symbol_with_provider(symbol)

        cache_key = f"leader_detail:v2:{resolved_symbol}:{score_type}"
        cached = _get_endpoint_cache(cache_key)
        if cached is not None:
            return cached

        scorer = _helpers.get_leader_scorer()
        detail = scorer.get_leader_detail(resolved_symbol, score_type=score_type)

        if "error" in detail:
            raise HTTPException(status_code=404, detail=detail["error"])

        # 列表/详情评分一致性
        parity = _get_parity_cache(resolved_symbol, score_type)
        if parity is None:
            parity = _get_stale_parity_cache(resolved_symbol, score_type)
            if parity:
                logger.info(f"Using stale parity cache for {resolved_symbol}:{score_type}")

        if parity:
            detail["total_score"] = parity.total_score
            if hasattr(parity, "dimension_scores") and parity.dimension_scores:
                detail["dimension_scores"] = parity.dimension_scores
            raw_data = detail.setdefault("raw_data", {})
            if hasattr(parity, "change_pct") and not has_meaningful_numeric(raw_data.get("change_pct")):
                raw_data["change_pct"] = parity.change_pct
            if hasattr(parity, "market_cap") and has_meaningful_numeric(parity.market_cap) and not has_meaningful_numeric(raw_data.get("market_cap")):
                raw_data["market_cap"] = parity.market_cap
            if hasattr(parity, "pe_ratio") and has_meaningful_numeric(parity.pe_ratio) and not has_meaningful_numeric(raw_data.get("pe_ttm")):
                raw_data["pe_ttm"] = parity.pe_ratio

        result = LeaderDetailResponse(
            symbol=normalize_symbol(detail.get("symbol", resolved_symbol)),
            name=detail.get("name", ""),
            total_score=detail.get("total_score", 0),
            score_type=score_type,
            dimension_scores=detail.get("dimension_scores", {}),
            raw_data=detail.get("raw_data", {}),
            technical_analysis=detail.get("technical_analysis", {}),
            price_data=detail.get("price_data", []),
        )
        _set_endpoint_cache(cache_key, result)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting leader detail: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# /health
# =============================================================================

@router.get("/health")
def health_check():
    """行业分析模块健康检查 + 数据源状态"""
    try:
        from src.data.providers.akshare_provider import AKSHARE_AVAILABLE
    except Exception:
        AKSHARE_AVAILABLE = False

    provider = _helpers._akshare_provider
    provider_name = "未初始化"
    provider_type = "none"

    if provider is not None:
        class_name = type(provider).__name__
        if "Sina" in class_name:
            provider_name = "新浪财经 (Sina Finance)"
            provider_type = "sina"
        elif "AKShare" in class_name:
            provider_name = "AKShare (东方财富)"
            provider_type = "akshare"
        else:
            provider_name = class_name
            provider_type = "unknown"

    capabilities = {
        "akshare": {
            "name": "AKShare (东方财富)",
            "installed": AKSHARE_AVAILABLE,
            "has_market_cap": True,
            "has_multi_day": True,
            "has_real_money_flow": True,
            "day_options": ["1日", "5日", "10日"],
            "status": "unavailable",
            "status_detail": "",
        },
        "sina": {
            "name": "新浪财经 (Sina Finance)",
            "installed": True,
            "has_market_cap": True,
            "has_multi_day": False,
            "has_real_money_flow": False,
            "day_options": ["当日"],
            "status": "unknown",
            "status_detail": "市值通过成分股数据汇总计算",
        },
        "ths": {
            "name": "同花顺 (THS)",
            "installed": True,
            "has_market_cap": False,
            "has_multi_day": True,
            "has_real_money_flow": True,
            "day_options": ["当日", "5日", "10日", "20日"],
            "status": "unknown",
            "status_detail": "多日涨跌与主力资金流向增强",
        },
    }

    if AKSHARE_AVAILABLE:
        try:
            import akshare as ak
            start = time.time()
            df = ak.stock_sector_fund_flow_rank(indicator="今日")
            elapsed = time.time() - start
            if df is not None and not df.empty:
                capabilities["akshare"]["status"] = "connected"
                capabilities["akshare"]["status_detail"] = f"响应 {elapsed:.1f}s, {len(df)} 行业"
            else:
                capabilities["akshare"]["status"] = "empty"
                capabilities["akshare"]["status_detail"] = "API 返回空数据"
        except Exception as e:
            err_msg = str(e)
            if "proxy" in err_msg.lower() or "connection" in err_msg.lower():
                capabilities["akshare"]["status"] = "blocked"
                capabilities["akshare"]["status_detail"] = "网络代理拦截"
            else:
                capabilities["akshare"]["status"] = "error"
                capabilities["akshare"]["status_detail"] = err_msg[:80]
    else:
        capabilities["akshare"]["status"] = "not_installed"
        capabilities["akshare"]["status_detail"] = "akshare 未安装"

    try:
        from src.data.providers.sina_provider import SinaFinanceProvider
        sina = SinaFinanceProvider()
        start = time.time()
        industries = sina.get_industry_list()
        elapsed = time.time() - start

        is_success = False
        data_len = 0
        if industries is not None:
            if hasattr(industries, "empty"):
                is_success = not industries.empty
                data_len = len(industries)
            else:
                is_success = len(industries) > 0
                data_len = len(industries)

        if is_success:
            capabilities["sina"]["status"] = "connected"
            capabilities["sina"]["status_detail"] = f"响应 {elapsed:.1f}s, {data_len} 行业"
        else:
            capabilities["sina"]["status"] = "empty"
            capabilities["sina"]["status_detail"] = "API 返回空数据"
    except Exception as e:
        capabilities["sina"]["status"] = "error"
        capabilities["sina"]["status_detail"] = str(e)[:80]

    try:
        from src.data.providers.sina_ths_adapter import SinaIndustryAdapter
        adapter = SinaIndustryAdapter()
        start = time.time()
        ths_df = adapter._get_ths_flow_data(days=1)
        elapsed = time.time() - start

        if not ths_df.empty:
            capabilities["ths"]["status"] = "connected"
            capabilities["ths"]["status_detail"] = f"响应 {elapsed:.1f}s, {len(ths_df)} 行业"
        else:
            capabilities["ths"]["status"] = "empty"
            capabilities["ths"]["status_detail"] = "API 返回空数据"
    except Exception as e:
        capabilities["ths"]["status"] = "error"
        capabilities["ths"]["status_detail"] = str(e)[:80]

    has_sina_fallback = False
    if _helpers._industry_analyzer and hasattr(_helpers._industry_analyzer, "_sina_fallback"):
        has_sina_fallback = True

    data_sources_contributing = []
    if capabilities.get("ths", {}).get("status") == "connected":
        data_sources_contributing.append("ths")
    if capabilities.get("sina", {}).get("status") == "connected":
        data_sources_contributing.append("sina")
    if capabilities.get("akshare", {}).get("status") == "connected":
        data_sources_contributing.append("akshare")
    if not data_sources_contributing:
        data_sources_contributing = ["unknown"]

    data_source_mode = "sina_fallback" if has_sina_fallback else "ths_primary"

    return {
        "status": "healthy" if provider is not None else "degraded",
        "active_provider": {
            "name": provider_name,
            "type": provider_type,
        },
        "data_sources": capabilities,
        "sina_fallback_active": has_sina_fallback,
        "akshare_available": AKSHARE_AVAILABLE,
        "data_sources_contributing": data_sources_contributing,
        "data_source_mode": data_source_mode,
        "message": f"当前数据源: {provider_name}",
    }

"""industry 包对外的 11 个 FastAPI 路由 handler。

路由层只负责"参数校验 → 调用对应 service → 直接返回"。重型业务逻辑、缓存
与模块状态分散在 ``heatmap_service`` / ``ranking_service`` / ``trend_service``
/ ``preferences_service``，共享单例与缓存仍在 ``_helpers``。
"""

import logging
import time
from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from backend.app.schemas.industry import (
    IndustryPreferencesResponse,
    IndustryStockBuildStatusResponse,
    IndustryTrendResponse,
    StockResponse,
)

from . import (
    _helpers,
    heatmap_service,
    preferences_service,
    ranking_service,
    trend_service,
)
from ._helpers import _resolve_industry_profile

router = APIRouter()
logger = logging.getLogger(__name__)


# =============================================================================
# /industries/{industry_name}/stocks  (+ /status, /stream)
# =============================================================================

@router.get("/industries/{industry_name}/stocks", response_model=List[StockResponse])
def get_industry_stocks(
    industry_name: str,
    top_n: int = Query(20, ge=1, le=100, description="返回前N只股票"),
) -> List[StockResponse]:
    """获取行业成分股及排名"""
    return ranking_service.get_industry_stocks(industry_name, top_n)


@router.get("/industries/{industry_name}/stocks/status", response_model=IndustryStockBuildStatusResponse)
def get_industry_stock_build_status(
    industry_name: str,
    top_n: int = Query(20, ge=1, le=100, description="返回前N只股票"),
) -> IndustryStockBuildStatusResponse:
    return ranking_service.get_industry_stock_build_status(industry_name, top_n)


@router.get("/industries/{industry_name}/stocks/stream")
async def stream_industry_stock_build_status(
    industry_name: str,
    top_n: int = Query(20, ge=1, le=100, description="返回前N只股票"),
):
    return await ranking_service.stream_industry_stock_build_status(industry_name, top_n)


# =============================================================================
# /preferences (4 个端点)
# =============================================================================

@router.get("/preferences", response_model=IndustryPreferencesResponse)
def get_industry_preferences(request: Request) -> IndustryPreferencesResponse:
    profile_id = _resolve_industry_profile(request)
    return preferences_service.get_preferences(profile_id)


@router.put("/preferences", response_model=IndustryPreferencesResponse)
def update_industry_preferences(payload: IndustryPreferencesResponse, request: Request) -> IndustryPreferencesResponse:
    profile_id = _resolve_industry_profile(request)
    return preferences_service.update_preferences(payload, profile_id)


@router.get("/preferences/export")
def export_industry_preferences(request: Request):
    profile_id = _resolve_industry_profile(request)
    return JSONResponse(content=preferences_service.export_preferences(profile_id))


@router.post("/preferences/import", response_model=IndustryPreferencesResponse)
def import_industry_preferences(payload: IndustryPreferencesResponse, request: Request) -> IndustryPreferencesResponse:
    profile_id = _resolve_industry_profile(request)
    return preferences_service.import_preferences(payload, profile_id)


# =============================================================================
# /industries/{industry_name}/trend
# =============================================================================

@router.get("/industries/{industry_name}/trend", response_model=IndustryTrendResponse)
def get_industry_trend(
    industry_name: str,
    days: int = Query(30, ge=1, le=90, description="分析周期（天）"),
) -> IndustryTrendResponse:
    """获取行业趋势分析"""
    return trend_service.get_industry_trend(industry_name, days)


# =============================================================================
# /industries/intelligence + /industries/network
# =============================================================================

@router.get("/industries/intelligence", summary="行业生命周期、ETF 映射与事件日历")
def get_industry_intelligence(
    top_n: int = Query(12, ge=1, le=30, description="分析前 N 个热门行业"),
    lookback_days: int = Query(5, ge=1, le=30, description="热度回看周期"),
    mode: Literal["live", "fast"] = Query("live", description="live=实时热度；fast=优先使用快照/兜底"),
):
    return heatmap_service.get_industry_intelligence(top_n, lookback_days, mode)


@router.get("/industries/network", summary="行业相关性网络图")
def get_industry_network(
    top_n: int = Query(18, ge=4, le=50, description="网络节点数量"),
    lookback_days: int = Query(5, ge=1, le=30, description="热度回看周期"),
    min_similarity: float = Query(0.92, ge=0.0, le=1.0, description="最小相似度"),
    mode: Literal["live", "fast"] = Query("live", description="live=实时热度；fast=优先使用快照/兜底"),
):
    return heatmap_service.get_industry_network(top_n, lookback_days, min_similarity, mode)


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

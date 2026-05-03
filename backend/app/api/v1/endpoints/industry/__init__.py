"""``backend.app.api.v1.endpoints.industry`` 包入口。

历史 ``industry.py`` 是 2464 行单文件。本包把它拆为：
- ``_helpers.py``           — 共享缓存、锁、单例 getter、ETF 映射、模型工具
- ``heatmap_service.py``    — heatmap / heatmap-history / intelligence / network
- ``ranking_service.py``    — hot industries + 行业成分股（quick/full + status/stream）
- ``trend_service.py``      — /industries/{name}/trend + 对齐 helper
- ``leader_service.py``     — /leaders + /leaders/{symbol}/detail + 评分/dedupe
- ``preferences_service.py``— /preferences (4 个端点)
- ``routes.py``             — 18 个 FastAPI 路由 handler，纯薄封装

兼容性约束：测试 ``test_industry_leader_endpoint.py`` 直接访问
``industry_endpoint._endpoint_cache`` / ``_parity_cache`` / ``_heatmap_history`` /
``_stocks_full_build_inflight`` / ``_set_parity_cache`` / ``_set_endpoint_cache`` /
``_get_stock_cache_keys`` / ``_build_full_industry_stock_response`` /
``StockResponse`` / 路由 handler 函数 等等——所有这些都通过本 ``__init__`` 在
``industry`` 命名空间重新暴露。 service 层里 monkeypatch 测试用的函数都在
``_helpers`` 命名空间通过 re-export 暴露，确保 ``setattr(_helpers, name, fn)`` 仍
能立即生效。
"""

# --- helpers / 模块级状态 / 数据 ---
from ._helpers import (
    DEFAULT_ALERT_THRESHOLDS,
    INDUSTRY_ETF_MAP,
    _akshare_provider,
    _attach_execution_metadata,
    _attach_leader_mini_trends,
    _build_execution_metadata,
    _build_full_industry_stock_response,
    _build_quick_industry_stock_response,
    _build_stock_responses,
    _build_trend_summary_from_stock_rows,
    _coerce_trend_alignment_stock_rows,
    _count_quick_stock_detail_fields,
    _dedupe_leader_responses,
    _endpoint_cache,
    _format_storage_size,
    _get_endpoint_cache,
    _get_or_create_provider,
    _get_parity_cache,
    _get_stale_endpoint_cache,
    _get_stale_parity_cache,
    _get_stock_build_status,
    _get_stock_cache_keys,
    _get_stock_status_key,
    _heatmap_history,
    _heatmap_history_lock,
    _industry_analyzer,
    _leader_scorer,
    _load_symbol_mini_trend,
    _load_trend_alignment_stock_rows,
    _model_to_dict,
    _normalize_sparkline_points,
    _parity_cache,
    _promote_detail_ready_quick_rows,
    _resolve_industry_profile,
    _resolve_symbol_with_provider,
    _schedule_full_stock_cache_build,
    _set_endpoint_cache,
    _set_parity_cache,
    _set_stock_build_status,
    _should_align_trend_with_stock_rows,
    _stocks_full_build_executor,
    _stocks_full_build_inflight,
    _stocks_full_build_lock,
    _stocks_full_build_status,
    get_industry_analyzer,
    get_leader_scorer,
    industry_preferences_store,
    logger,
)
from .heatmap_service import (
    _append_heatmap_history,
    _build_curated_fallback_rows,
    _build_industry_events,
    _build_industry_intelligence_result,
    _build_industry_network_result,
    _build_rows_from_heatmap_history,
    _classify_industry_lifecycle,
    _cosine_similarity,
    _load_heatmap_history_from_disk,
    _map_industry_etfs,
    _persist_heatmap_history_to_disk,
    _resolve_intelligence_rows_from_fallback,
    _trim_heatmap_history_payload,
)

# --- 路由 handler / router ---
from .routes import (
    export_industry_preferences,
    get_industry_intelligence,
    get_industry_network,
    get_industry_preferences,
    get_industry_stock_build_status,
    get_industry_stocks,
    get_industry_trend,
    health_check,
    import_industry_preferences,
    router,
    stream_industry_stock_build_status,
    update_industry_preferences,
)

# --- Schema re-export（测试构造 mock 时使用）---
from backend.app.schemas.industry import (  # noqa: E402
    HeatmapDataItem,
    HeatmapHistoryItem,
    IndustryPreferencesResponse,
    IndustryStockBuildStatusResponse,
    IndustryTrendResponse,
    StockResponse,
)


__all__ = [
    "router",
    # 模块级状态
    "_endpoint_cache",
    "_parity_cache",
    "_heatmap_history",
    "_heatmap_history_lock",
    "_stocks_full_build_inflight",
    "_stocks_full_build_lock",
    "_stocks_full_build_status",
    "_stocks_full_build_executor",
    "_industry_analyzer",
    "_leader_scorer",
    "_akshare_provider",
    "INDUSTRY_ETF_MAP",
    "DEFAULT_ALERT_THRESHOLDS",
    "logger",
    # cache helpers
    "_get_endpoint_cache",
    "_set_endpoint_cache",
    "_get_stale_endpoint_cache",
    "_get_parity_cache",
    "_set_parity_cache",
    "_get_stale_parity_cache",
    "_get_stock_cache_keys",
    "_get_stock_status_key",
    "_get_stock_build_status",
    "_set_stock_build_status",
    # builders
    "_build_full_industry_stock_response",
    "_build_quick_industry_stock_response",
    "_build_stock_responses",
    "_build_curated_fallback_rows",
    "_build_industry_events",
    "_build_industry_intelligence_result",
    "_build_industry_network_result",
    "_build_rows_from_heatmap_history",
    "_build_trend_summary_from_stock_rows",
    "_build_execution_metadata",
    "_attach_execution_metadata",
    "_attach_leader_mini_trends",
    "_classify_industry_lifecycle",
    "_coerce_trend_alignment_stock_rows",
    "_cosine_similarity",
    "_count_quick_stock_detail_fields",
    "_dedupe_leader_responses",
    "_format_storage_size",
    "_load_heatmap_history_from_disk",
    "_load_symbol_mini_trend",
    "_load_trend_alignment_stock_rows",
    "_map_industry_etfs",
    "_model_to_dict",
    "_normalize_sparkline_points",
    "_persist_heatmap_history_to_disk",
    "_promote_detail_ready_quick_rows",
    "_resolve_industry_profile",
    "_resolve_intelligence_rows_from_fallback",
    "_resolve_symbol_with_provider",
    "_schedule_full_stock_cache_build",
    "_should_align_trend_with_stock_rows",
    "_trim_heatmap_history_payload",
    "_append_heatmap_history",
    # singletons
    "get_industry_analyzer",
    "get_leader_scorer",
    "_get_or_create_provider",
    "industry_preferences_store",
    # routes
    "export_industry_preferences",
    "get_industry_intelligence",
    "get_industry_network",
    "get_industry_preferences",
    "get_industry_stock_build_status",
    "get_industry_stocks",
    "get_industry_trend",
    "health_check",
    "import_industry_preferences",
    "stream_industry_stock_build_status",
    "update_industry_preferences",
    # schemas
    "HeatmapDataItem",
    "HeatmapHistoryItem",
    "IndustryPreferencesResponse",
    "IndustryStockBuildStatusResponse",
    "IndustryTrendResponse",
    "StockResponse",
]

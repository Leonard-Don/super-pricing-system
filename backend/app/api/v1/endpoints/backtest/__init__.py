"""``backend.app.api.v1.endpoints.backtest`` 包入口。

历史上 ``backtest.py`` 是单文件模块，外部以三种方式 import：

1. ``from backend.app.api.v1.endpoints.backtest import router``  (api/v1 注册)
2. ``from backend.app.api.v1.endpoints import backtest as backtest_endpoint``
   并访问 ``backtest_endpoint.data_manager`` / pipeline 等 (集成测试 monkeypatch)
3. ``from backend.app.api.v1.endpoints.backtest import (run_backtest_monte_carlo_sync, ...)``
   (``backend.app.core.task_queue`` 直接导入 sync runner)

这三种用法都依赖于"backtest 是一个模块、并且这些符号在它顶层"。把它拆成包后，
本 ``__init__`` 通过显式 re-export 保持上述三种 import 路径 100% 兼容。

内部子模块约定 ``_`` 前缀 = 实现细节、不带前缀 = 路由层。
"""

from __future__ import annotations

from fastapi import APIRouter

# 兼容性 re-export：原 backtest.py 在模块顶层 import 了这些上游符号，
# 既有测试通过 ``backtest_endpoint.StrategyValidator`` / ``BatchBacktester`` 访问。
from src.backtest.batch_backtester import BatchBacktester, WalkForwardAnalyzer  # noqa: F401
from src.strategy.strategy_validator import StrategyValidator  # noqa: F401

# --- 子模块（路由）---
from . import advanced as _advanced_module
from . import batch as _batch_module
from . import history as _history_module
from . import report as _report_module
from . import single as _single_module

# --- helpers / runners / schemas — 通过 re-export 保留旧 import 路径 ---
from ._helpers import (
    STRATEGIES,
    _build_batch_backtester,
    _build_comparison_entry,
    _create_strategy_instance,
    _fetch_backtest_data,
    _parse_iso_datetime,
    _resolve_date_range,
    _strategy_factory_for_batch,
    data_manager,
    logger,
    run_backtest_pipeline,
)
from ._runners import (
    _default_market_impact_scenarios,
    _market_impact_curve,
    _submit_async_backtest_task,
    compare_strategy_significance_sync,
    run_backtest_monte_carlo_sync,
    run_market_impact_analysis_sync,
    run_multi_period_backtest_sync,
)
from ._schemas import (
    CompareRequest,
    CompareStrategyConfig,
    MarketImpactAnalysisRequest,
    MarketImpactScenarioConfig,
    MonteCarloBacktestRequest,
    MultiPeriodBacktestRequest,
    ReportRequest,
    SignificanceCompareRequest,
)
from ._series import (
    _calculate_max_drawdown_from_series,
    _classify_market_regimes,
    _compare_return_significance,
    _equity_curve_from_returns,
    _max_drawdown_from_array,
    _returns_from_portfolio_history,
    _safe_sharpe,
    _series_from_portfolio_history,
    _simulate_monte_carlo_paths,
)

# 路由 handler — 测试可能通过 ``backtest_endpoint.run_backtest`` 访问
from .batch import (
    run_batch_backtest,
    run_market_regime_backtest,
    run_portfolio_strategy_backtest,
    run_walk_forward_backtest,
)
from .advanced import (
    compare_strategy_significance,
    queue_backtest_monte_carlo,
    queue_market_impact_analysis,
    queue_multi_period_backtest,
    queue_strategy_significance,
    run_backtest_monte_carlo,
    run_market_impact_analysis,
    run_multi_period_backtest,
)
from .history import (
    delete_backtest_record,
    get_backtest_history,
    get_backtest_record,
    get_backtest_stats,
    save_advanced_history_record,
)
from .report import (
    _build_report_pdf,
    generate_report,
    generate_report_base64,
)
from .single import (
    _compare_strategies_impl,
    _normalize_compare_configs,
    compare_strategies_post,
    run_backtest,
)


# --- 聚合 router：把每个子路由模块的 router 合并到一个 APIRouter ---
router = APIRouter()
router.include_router(_single_module.router)
router.include_router(_batch_module.router)
router.include_router(_advanced_module.router)
router.include_router(_history_module.router)
router.include_router(_report_module.router)


__all__ = [
    # 公共 router
    "router",
    # 上游符号（测试可能 monkeypatch 的位置）
    "BatchBacktester",
    "StrategyValidator",
    "WalkForwardAnalyzer",
    # helpers
    "STRATEGIES",
    "data_manager",
    "logger",
    "run_backtest_pipeline",
    "_build_batch_backtester",
    "_build_comparison_entry",
    "_create_strategy_instance",
    "_fetch_backtest_data",
    "_parse_iso_datetime",
    "_resolve_date_range",
    "_strategy_factory_for_batch",
    # series helpers
    "_calculate_max_drawdown_from_series",
    "_classify_market_regimes",
    "_compare_return_significance",
    "_equity_curve_from_returns",
    "_max_drawdown_from_array",
    "_returns_from_portfolio_history",
    "_safe_sharpe",
    "_series_from_portfolio_history",
    "_simulate_monte_carlo_paths",
    # schemas
    "CompareRequest",
    "CompareStrategyConfig",
    "MarketImpactAnalysisRequest",
    "MarketImpactScenarioConfig",
    "MonteCarloBacktestRequest",
    "MultiPeriodBacktestRequest",
    "ReportRequest",
    "SignificanceCompareRequest",
    # runners
    "_default_market_impact_scenarios",
    "_market_impact_curve",
    "_submit_async_backtest_task",
    "compare_strategy_significance_sync",
    "run_backtest_monte_carlo_sync",
    "run_market_impact_analysis_sync",
    "run_multi_period_backtest_sync",
    # route handlers
    "_build_report_pdf",
    "_compare_strategies_impl",
    "_normalize_compare_configs",
    "compare_strategies_post",
    "compare_strategy_significance",
    "delete_backtest_record",
    "generate_report",
    "generate_report_base64",
    "get_backtest_history",
    "get_backtest_record",
    "get_backtest_stats",
    "queue_backtest_monte_carlo",
    "queue_market_impact_analysis",
    "queue_multi_period_backtest",
    "queue_strategy_significance",
    "run_backtest",
    "run_backtest_monte_carlo",
    "run_batch_backtest",
    "run_market_impact_analysis",
    "run_market_regime_backtest",
    "run_multi_period_backtest",
    "run_portfolio_strategy_backtest",
    "run_walk_forward_backtest",
    "save_advanced_history_record",
]

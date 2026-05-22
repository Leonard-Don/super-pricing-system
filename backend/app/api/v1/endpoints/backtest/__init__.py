"""``backend.app.api.v1.endpoints.backtest`` 包入口。

历史上 ``backtest.py`` 是单文件模块，外部以三种方式 import：

1. ``from backend.app.api.v1.endpoints.backtest import router``  (api/v1 注册)
2. ``from backend.app.api.v1.endpoints import backtest as backtest_endpoint``
   并访问 ``backtest_endpoint.data_manager`` / pipeline 等 (集成测试 monkeypatch)
3. ``from backend.app.api.v1.endpoints.backtest import (run_backtest_monte_carlo_sync, ...)``
   (``backend.app.core.task_queue`` 直接导入 sync runner)

本 ``__init__`` 通过显式 re-export 保持上述三种 import 路径 100% 兼容。

仅 re-export 真正被外部消费的符号（router + 4 个 sync runner + 4 个被
monkeypatch 的单例/类 + 2 个被直接调用的 helper + logger）。其它历史 re-export
（schemas / 路由 handler 函数 / 内部 series helper）已确认无外部使用，删除以
减少包接口面。子模块 ``_helpers`` / ``_runners`` / ``_series`` / ``_schemas`` /
``advanced`` / ``batch`` / ``history`` / ``report`` / ``single`` 仍可直接 import
（``backtest._helpers`` 等）。
"""

from __future__ import annotations

from fastapi import APIRouter

# 上游符号 — test_api.py / test_backtest_endpoint_logging.py 通过
# ``backtest_endpoint.X`` 在包命名空间下 monkeypatch
from src.backtest.batch_backtester import BatchBacktester, WalkForwardAnalyzer
from src.strategy.strategy_validator import StrategyValidator

# --- 子模块（路由）---
from . import advanced as _advanced_module
from . import batch as _batch_module
from . import history as _history_module
from . import report as _report_module
from . import single as _single_module

# helpers — test 直接调用 _fetch_backtest_data / run_backtest_pipeline，
# data_manager 被多个集成测试 monkeypatch；logger 用于 caplog 抓 backend 日志
from ._helpers import (
    _fetch_backtest_data,
    data_manager,
    logger,
    run_backtest_pipeline,
)
# 4 个 sync runner — backend.app.core.task_queue 注册成 task handler
from ._runners import (
    compare_strategy_significance_sync,
    run_backtest_monte_carlo_sync,
    run_market_impact_analysis_sync,
    run_multi_period_backtest_sync,
)


# --- 聚合 router：把每个子路由模块的 router 合并到一个 APIRouter ---
router = APIRouter()
router.include_router(_single_module.router)
router.include_router(_batch_module.router)
router.include_router(_advanced_module.router)
router.include_router(_history_module.router)
router.include_router(_report_module.router)


__all__ = [
    "router",
    # 上游符号 (monkeypatch 目标)
    "BatchBacktester",
    "StrategyValidator",
    "WalkForwardAnalyzer",
    # helpers
    "data_manager",
    "logger",
    "run_backtest_pipeline",
    "_fetch_backtest_data",
    # sync runners (task_queue.py 注册)
    "compare_strategy_significance_sync",
    "run_backtest_monte_carlo_sync",
    "run_market_impact_analysis_sync",
    "run_multi_period_backtest_sync",
]

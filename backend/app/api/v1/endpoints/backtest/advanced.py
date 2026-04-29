"""高级回测路由：Monte Carlo / 显著性 / 多周期 / 市场冲击。

路由本身只做"调用 sync runner via to_thread / 提交异步任务"两件事；重型实现在
``_runners.py``，以便 ``backend.app.core.task_queue`` 也能直接复用。
"""

import asyncio
import logging

from fastapi import APIRouter, HTTPException

from ._runners import (
    _submit_async_backtest_task,
    compare_strategy_significance_sync,
    run_backtest_monte_carlo_sync,
    run_market_impact_analysis_sync,
    run_multi_period_backtest_sync,
)
from ._schemas import (
    MarketImpactAnalysisRequest,
    MonteCarloBacktestRequest,
    MultiPeriodBacktestRequest,
    SignificanceCompareRequest,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/monte-carlo", summary="回测结果 Monte Carlo 路径模拟")
async def run_backtest_monte_carlo(request: MonteCarloBacktestRequest):
    try:
        return await asyncio.to_thread(run_backtest_monte_carlo_sync, request.model_dump())
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error running Monte Carlo backtest: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@router.post("/monte-carlo/async", summary="异步提交 Monte Carlo 回测任务")
async def queue_backtest_monte_carlo(request: MonteCarloBacktestRequest):
    try:
        return _submit_async_backtest_task("backtest_monte_carlo", request.model_dump())
    except Exception as e:
        logger.error(f"Error queueing Monte Carlo backtest: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@router.post("/compare/significance", summary="策略对比显著性检验")
async def compare_strategy_significance(request: SignificanceCompareRequest):
    try:
        return await asyncio.to_thread(compare_strategy_significance_sync, request.model_dump())
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error comparing strategy significance: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@router.post("/compare/significance/async", summary="异步提交策略显著性检验任务")
async def queue_strategy_significance(request: SignificanceCompareRequest):
    try:
        return _submit_async_backtest_task("backtest_significance", request.model_dump())
    except Exception as e:
        logger.error(f"Error queueing strategy significance: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@router.post("/multi-period", summary="多周期并行回测")
async def run_multi_period_backtest(request: MultiPeriodBacktestRequest):
    try:
        return await asyncio.to_thread(run_multi_period_backtest_sync, request.model_dump())
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error running multi-period backtest: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@router.post("/multi-period/async", summary="异步提交多周期回测任务")
async def queue_multi_period_backtest(request: MultiPeriodBacktestRequest):
    try:
        return _submit_async_backtest_task("backtest_multi_period", request.model_dump())
    except Exception as e:
        logger.error(f"Error queueing multi-period backtest: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@router.post("/impact-analysis", summary="市场冲击敏感性分析")
async def run_market_impact_analysis(request: MarketImpactAnalysisRequest):
    try:
        return await asyncio.to_thread(run_market_impact_analysis_sync, request.model_dump())
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error running market impact analysis: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@router.post("/impact-analysis/async", summary="异步提交市场冲击分析任务")
async def queue_market_impact_analysis(request: MarketImpactAnalysisRequest):
    try:
        return _submit_async_backtest_task("backtest_impact_analysis", request.model_dump())
    except Exception as e:
        logger.error(f"Error queueing market impact analysis: {e}", exc_info=True)
        return {"success": False, "error": str(e)}

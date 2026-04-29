"""单标的回测 + 多策略对比路由：``/`` 与 ``/compare``。"""

import asyncio
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException

from backend.app.schemas.backtest import BacktestRequest, BacktestResponse
from src.backtest.history import backtest_history
from src.utils.performance import timing_decorator

from ._helpers import (
    STRATEGIES,
    _build_comparison_entry,
    _fetch_backtest_data,
    run_backtest_pipeline,
)
from ._schemas import CompareRequest, CompareStrategyConfig

router = APIRouter()
logger = logging.getLogger(__name__)


def _normalize_compare_configs(
    strategies: Optional[List[str]] = None,
    strategy_configs: Optional[List[CompareStrategyConfig]] = None,
) -> List[Dict[str, Any]]:
    if strategy_configs:
        configs = [
            {
                "name": config.name.strip(),
                "parameters": config.parameters or {},
            }
            for config in strategy_configs
            if config.name and config.name.strip()
        ]
    else:
        configs = [
            {
                "name": name.strip(),
                "parameters": {},
            }
            for name in (strategies or [])
            if name and name.strip()
        ]

    if not configs:
        raise HTTPException(status_code=400, detail="At least one strategy is required")

    return configs


async def _compare_strategies_impl(
    *,
    symbol: str,
    strategy_configs: List[Dict[str, Any]],
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    initial_capital: float = 10000.0,
    commission: float = 0.001,
    slippage: float = 0.001,
    fixed_commission: float = 0.0,
    min_commission: float = 0.0,
    market_impact_bps: float = 0.0,
    market_impact_model: str = "constant",
    impact_reference_notional: float = 100000.0,
    impact_coefficient: float = 1.0,
    permanent_impact_bps: float = 0.0,
    max_holding_days: Optional[int] = None,
):
    data = _fetch_backtest_data(symbol, start_date, end_date)

    def _run_single_strategy(config):
        strategy_name = config["name"]
        if strategy_name not in STRATEGIES:
            return None

        res, _ = run_backtest_pipeline(
            symbol=symbol,
            strategy_name=strategy_name,
            parameters=config.get("parameters") or {},
            start_date=start_date,
            end_date=end_date,
            initial_capital=initial_capital,
            commission=commission,
            slippage=slippage,
            fixed_commission=fixed_commission,
            min_commission=min_commission,
            market_impact_bps=market_impact_bps,
            market_impact_model=market_impact_model,
            impact_reference_notional=impact_reference_notional,
            impact_coefficient=impact_coefficient,
            permanent_impact_bps=permanent_impact_bps,
            max_holding_days=max_holding_days,
            data=data,
        )

        return {
            "name": strategy_name,
            "metrics": _build_comparison_entry(res),
        }

    loop = asyncio.get_running_loop()
    tasks = [
        loop.run_in_executor(None, _run_single_strategy, config)
        for config in strategy_configs
    ]
    completed_strategies = await asyncio.gather(*tasks)
    valid_results = [r for r in completed_strategies if r is not None]

    if not valid_results:
        return {"success": True, "data": {}}

    max_return = max(r["metrics"]["total_return"] for r in valid_results)
    min_return = min(r["metrics"]["total_return"] for r in valid_results)
    max_sharpe = max(r["metrics"]["sharpe_ratio"] for r in valid_results)
    min_sharpe = min(r["metrics"]["sharpe_ratio"] for r in valid_results)
    max_dd = max(abs(r["metrics"]["max_drawdown"]) for r in valid_results)
    min_dd = min(abs(r["metrics"]["max_drawdown"]) for r in valid_results)

    def normalize(val, min_v, max_v, inverse=False):
        if max_v == min_v:
            return 50.0
        score = (val - min_v) / (max_v - min_v) * 100
        return 100 - score if inverse else score

    scored_results = []
    for item in valid_results:
        metrics = item["metrics"]

        return_score = normalize(metrics["total_return"], min_return, max_return)
        sharpe_score = normalize(metrics["sharpe_ratio"], min_sharpe, max_sharpe)
        risk_score = normalize(abs(metrics["max_drawdown"]), min_dd, max_dd, inverse=True)
        overall_score = (return_score * 0.4) + (sharpe_score * 0.3) + (risk_score * 0.3)

        metrics["scores"] = {
            "return_score": round(return_score),
            "sharpe_score": round(sharpe_score),
            "risk_score": round(risk_score),
            "overall_score": round(overall_score),
        }
        scored_results.append(item)

    scored_results.sort(key=lambda x: x["metrics"]["scores"]["overall_score"], reverse=True)

    final_data = {}
    for idx, item in enumerate(scored_results):
        metrics = item["metrics"]
        metrics["rank"] = idx + 1
        metrics["metrics"] = {
            **metrics.get("metrics", {}),
            "rank": idx + 1,
        }
        final_data[item["name"]] = metrics

    return {"success": True, "data": final_data}


@router.post(
    "/",
    response_model=BacktestResponse,
    summary="运行策略回测",
)
@timing_decorator
def run_backtest(request: BacktestRequest):
    """运行交易策略回测"""
    logger.info(
        f"Starting backtest for {request.symbol} with strategy {request.strategy}"
    )

    try:
        results, cleaned_params = run_backtest_pipeline(
            symbol=request.symbol,
            strategy_name=request.strategy,
            parameters=request.parameters,
            start_date=request.start_date,
            end_date=request.end_date,
            initial_capital=request.initial_capital,
            commission=request.commission,
            slippage=request.slippage,
            fixed_commission=request.fixed_commission,
            min_commission=request.min_commission,
            market_impact_bps=request.market_impact_bps,
            market_impact_model=request.market_impact_model,
            impact_reference_notional=request.impact_reference_notional,
            impact_coefficient=request.impact_coefficient,
            permanent_impact_bps=request.permanent_impact_bps,
            max_holding_days=request.max_holding_days,
        )

        total_return = results.get("total_return", 0)
        logger.info(
            f"Backtest completed successfully. Total return: {total_return: .2%}"
        )

        # 保存到历史记录
        try:
            record_id = backtest_history.save({
                "symbol": request.symbol,
                "strategy": request.strategy,
                "start_date": request.start_date,
                "end_date": request.end_date,
                "parameters": cleaned_params,
                "metrics": results,
                "performance_metrics": results,
                "result": results,
            })
            results["history_record_id"] = record_id
        except Exception as e:
            logger.warning(f"Failed to save backtest history: {e}")

        return BacktestResponse(success=True, data=results)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error running backtest: {e}", exc_info=True)
        return BacktestResponse(success=False, error=f"Internal server error: {str(e)}")


@router.post("/compare", summary="比较多个策略的性能")
async def compare_strategies_post(request: CompareRequest):
    try:
        return await _compare_strategies_impl(
            symbol=request.symbol,
            strategy_configs=_normalize_compare_configs(
                strategies=request.strategies,
                strategy_configs=request.strategy_configs,
            ),
            start_date=request.start_date,
            end_date=request.end_date,
            initial_capital=request.initial_capital,
            commission=request.commission,
            slippage=request.slippage,
            fixed_commission=request.fixed_commission,
            min_commission=request.min_commission,
            market_impact_bps=request.market_impact_bps,
            market_impact_model=request.market_impact_model,
            impact_reference_notional=request.impact_reference_notional,
            impact_coefficient=request.impact_coefficient,
            permanent_impact_bps=request.permanent_impact_bps,
            max_holding_days=request.max_holding_days,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error comparing strategies: {e}", exc_info=True)
        return {"success": False, "error": str(e)}

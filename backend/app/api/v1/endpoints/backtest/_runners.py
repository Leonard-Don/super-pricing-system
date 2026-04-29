"""同步重型计算 runner——直接被路由层 ``asyncio.to_thread()``、被任务队列复用。

本模块不应包含路由声明。``backend.app.core.task_queue`` 直接 import 这里的 4 个
``*_sync`` 函数作为后台任务 handler，所以拆分必须保持函数签名 / 路径不变。
"""

import logging
from typing import Any, Dict, List

import pandas as pd
from fastapi import HTTPException

from backend.app.core.task_queue import task_queue_manager
from src.backtest.impact_model import estimate_market_impact_rate, normalize_market_impact_model
from src.utils.data_validation import ensure_json_serializable

from ._helpers import (
    _build_comparison_entry,
    _fetch_backtest_data,
    _resolve_date_range,
    run_backtest_pipeline,
)
from ._schemas import (
    MarketImpactAnalysisRequest,
    MonteCarloBacktestRequest,
    MultiPeriodBacktestRequest,
    SignificanceCompareRequest,
)
from ._series import (
    _compare_return_significance,
    _returns_from_portfolio_history,
    _simulate_monte_carlo_paths,
)

logger = logging.getLogger(__name__)


def _submit_async_backtest_task(task_name: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    task = task_queue_manager.submit(
        name=task_name,
        payload={
            **payload,
            "task_origin": "backtest",
        },
        backend="auto",
    )
    return {
        "task": task,
        "execution_backend": task.get("execution_backend"),
        "message": "backtest task queued",
    }


def run_backtest_monte_carlo_sync(
    request: MonteCarloBacktestRequest | Dict[str, Any],
) -> Dict[str, Any]:
    if isinstance(request, dict):
        request = MonteCarloBacktestRequest(**request)
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
    returns = _returns_from_portfolio_history(results)
    simulation = _simulate_monte_carlo_paths(
        returns,
        initial_value=float(results.get("final_value") or request.initial_capital),
        simulations=request.simulations,
        horizon_days=request.horizon_days,
        seed=request.seed,
    )
    return ensure_json_serializable(
        {
            "success": True,
            "data": {
                "symbol": request.symbol,
                "strategy": request.strategy,
                "parameters": cleaned_params,
                "base_metrics": _build_comparison_entry(results),
                "monte_carlo": simulation,
            },
        }
    )


def compare_strategy_significance_sync(
    request: SignificanceCompareRequest | Dict[str, Any],
) -> Dict[str, Any]:
    if isinstance(request, dict):
        request = SignificanceCompareRequest(**request)
    # _normalize_compare_configs lives in single.py; runners shouldn't depend on routes,
    # so we inline a minimal copy here. Behaviour is identical.
    if request.strategy_configs:
        configs = [
            {
                "name": config.name.strip(),
                "parameters": config.parameters or {},
            }
            for config in request.strategy_configs
            if config.name and config.name.strip()
        ]
    else:
        configs = [
            {
                "name": name.strip(),
                "parameters": {},
            }
            for name in (request.strategies or [])
            if name and name.strip()
        ]
    if not configs:
        raise HTTPException(status_code=400, detail="At least one strategy is required")
    if len(configs) < 2:
        raise HTTPException(status_code=400, detail="At least two strategies are required for significance testing")

    data = _fetch_backtest_data(request.symbol, request.start_date, request.end_date)
    strategy_results = []
    for config in configs:
        result, cleaned_params = run_backtest_pipeline(
            symbol=request.symbol,
            strategy_name=config["name"],
            parameters=config.get("parameters") or {},
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
            data=data,
        )
        strategy_results.append(
            {
                "name": config["name"],
                "parameters": cleaned_params,
                "metrics": _build_comparison_entry(result),
                "returns": _returns_from_portfolio_history(result),
            }
        )

    baseline_name = request.baseline_strategy or strategy_results[0]["name"]
    baseline = next((item for item in strategy_results if item["name"] == baseline_name), strategy_results[0])
    comparisons = []
    for item in strategy_results:
        if item["name"] == baseline["name"]:
            continue
        comparisons.append(
            {
                "baseline": baseline["name"],
                "challenger": item["name"],
                "baseline_metrics": baseline["metrics"],
                "challenger_metrics": item["metrics"],
                "significance": _compare_return_significance(
                    baseline["returns"],
                    item["returns"],
                    bootstrap_samples=request.bootstrap_samples,
                    seed=request.seed,
                ),
            }
        )

    return ensure_json_serializable(
        {
            "success": True,
            "data": {
                "symbol": request.symbol,
                "baseline_strategy": baseline["name"],
                "comparisons": comparisons,
            },
        }
    )


def run_multi_period_backtest_sync(
    request: MultiPeriodBacktestRequest | Dict[str, Any],
) -> Dict[str, Any]:
    if isinstance(request, dict):
        request = MultiPeriodBacktestRequest(**request)
    allowed_intervals = {"1d", "1wk", "1mo"}
    intervals: List[str] = []
    for interval in request.intervals or ["1d", "1wk", "1mo"]:
        normalized_interval = str(interval).strip()
        if normalized_interval not in allowed_intervals:
            raise HTTPException(status_code=400, detail=f"Unsupported interval: {normalized_interval}")
        if normalized_interval not in intervals:
            intervals.append(normalized_interval)
    if not intervals:
        raise HTTPException(status_code=400, detail="At least one interval is required")

    _resolve_date_range(request.start_date, request.end_date)
    rows = []
    for interval in intervals:
        try:
            data = _fetch_backtest_data(
                request.symbol,
                request.start_date,
                request.end_date,
                interval=interval,
            )
        except HTTPException:
            rows.append({"interval": interval, "success": False, "error": "No data"})
            continue
        result, cleaned_params = run_backtest_pipeline(
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
            data=data,
        )
        entry = _build_comparison_entry(result)
        rows.append(
            {
                "interval": interval,
                "success": True,
                "data_points": int(len(data)),
                "parameters": cleaned_params,
                "metrics": entry,
            }
        )

    successful_rows = [row for row in rows if row.get("success")]
    best = max(
        successful_rows,
        key=lambda row: float(row["metrics"].get("sharpe_ratio") or 0),
        default=None,
    )
    import numpy as np
    return ensure_json_serializable(
        {
            "success": True,
            "data": {
                "symbol": request.symbol,
                "strategy": request.strategy,
                "intervals": rows,
                "summary": {
                    "successful_intervals": len(successful_rows),
                    "best_by_sharpe": best,
                    "average_return": float(np.mean([row["metrics"].get("total_return", 0) for row in successful_rows])) if successful_rows else 0.0,
                },
            },
        }
    )


def _market_impact_curve(
    *,
    scenario: Dict[str, Any],
    data: pd.DataFrame,
    sample_trade_values: List[float],
) -> List[Dict[str, Any]]:
    import numpy as np
    close_prices = pd.to_numeric(data.get("close"), errors="coerce").dropna()
    reference_price = float(close_prices.iloc[-1]) if not close_prices.empty else 100.0
    returns = close_prices.pct_change().replace([np.inf, -np.inf], np.nan)
    volatility_reference = float(returns.std()) if returns.dropna().size else 0.02
    if "volume" in data.columns:
        volumes = pd.to_numeric(data["volume"], errors="coerce").clip(lower=0)
        dollar_volume = (pd.to_numeric(data["close"], errors="coerce") * volumes).replace([np.inf, -np.inf], np.nan)
        liquidity_reference = (
            float(dollar_volume.dropna().median())
            if dollar_volume.dropna().size
            else float(scenario["impact_reference_notional"])
        )
    else:
        liquidity_reference = float(scenario["impact_reference_notional"])
    liquidity_reference = max(liquidity_reference, float(scenario["impact_reference_notional"]), 1.0)

    rows = []
    for trade_value in sample_trade_values:
        trade_notional = max(float(trade_value or 0.0), 0.0)
        impact = estimate_market_impact_rate(
            trade_notional,
            market_impact_bps=scenario["market_impact_bps"],
            model=scenario["market_impact_model"],
            avg_daily_notional=liquidity_reference,
            volatility=volatility_reference,
            impact_coefficient=scenario["impact_coefficient"],
            permanent_impact_bps=scenario["permanent_impact_bps"],
            reference_notional=scenario["impact_reference_notional"],
        )
        rows.append(
            {
                "trade_value": trade_notional,
                "reference_price": reference_price,
                "estimated_shares": round(float(trade_notional / reference_price), 4) if reference_price > 0 else 0.0,
                "market_impact_rate": round(float(impact["impact_rate"]), 6),
                "market_impact_bps": round(float(impact["impact_rate"]) * 10000, 2),
                "participation_rate": round(float(impact["participation_rate"]), 4),
                "estimated_cost": round(float(trade_notional * float(impact["impact_rate"])), 2),
            }
        )
    return rows


def _default_market_impact_scenarios(request: MarketImpactAnalysisRequest) -> List[Dict[str, Any]]:
    return [
        {
            "label": "无冲击基线",
            "market_impact_model": "constant",
            "market_impact_bps": 0.0,
            "impact_reference_notional": request.impact_reference_notional,
            "impact_coefficient": 1.0,
            "permanent_impact_bps": 0.0,
        },
        {
            "label": "线性冲击",
            "market_impact_model": "linear",
            "market_impact_bps": max(float(request.market_impact_bps or 8.0), 8.0),
            "impact_reference_notional": request.impact_reference_notional,
            "impact_coefficient": max(float(request.impact_coefficient or 1.0), 1.0),
            "permanent_impact_bps": 0.0,
        },
        {
            "label": "平方根冲击",
            "market_impact_model": "sqrt",
            "market_impact_bps": max(float(request.market_impact_bps or 12.0), 12.0),
            "impact_reference_notional": request.impact_reference_notional,
            "impact_coefficient": max(float(request.impact_coefficient or 1.0), 1.15),
            "permanent_impact_bps": 0.0,
        },
        {
            "label": "Almgren-Chriss",
            "market_impact_model": "almgren_chriss",
            "market_impact_bps": max(float(request.market_impact_bps or 18.0), 18.0),
            "impact_reference_notional": request.impact_reference_notional,
            "impact_coefficient": max(float(request.impact_coefficient or 1.0), 1.2),
            "permanent_impact_bps": max(float(request.permanent_impact_bps or 4.0), 4.0),
        },
    ]


def run_market_impact_analysis_sync(
    request: MarketImpactAnalysisRequest | Dict[str, Any],
) -> Dict[str, Any]:
    if isinstance(request, dict):
        request = MarketImpactAnalysisRequest(**request)
    data = _fetch_backtest_data(request.symbol, request.start_date, request.end_date)
    scenario_specs = request.scenarios or []
    scenarios = [
        {
            "label": scenario.label or f"scenario_{index}",
            "market_impact_model": normalize_market_impact_model(scenario.market_impact_model),
            "market_impact_bps": float(scenario.market_impact_bps or 0.0),
            "impact_reference_notional": float(
                scenario.impact_reference_notional or request.impact_reference_notional
            ),
            "impact_coefficient": float(scenario.impact_coefficient or 1.0),
            "permanent_impact_bps": float(scenario.permanent_impact_bps or 0.0),
        }
        for index, scenario in enumerate(scenario_specs, start=1)
    ] or _default_market_impact_scenarios(request)

    scenario_results = []
    for scenario in scenarios:
        result, cleaned_params = run_backtest_pipeline(
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
            market_impact_bps=scenario["market_impact_bps"],
            market_impact_model=scenario["market_impact_model"],
            impact_reference_notional=scenario["impact_reference_notional"],
            impact_coefficient=scenario["impact_coefficient"],
            permanent_impact_bps=scenario["permanent_impact_bps"],
            max_holding_days=request.max_holding_days,
            data=data,
        )
        scenario_results.append(
            {
                "label": scenario["label"],
                "scenario": scenario,
                "parameters": cleaned_params,
                "metrics": _build_comparison_entry(result),
                "execution_costs": result.get("execution_costs", {}),
                "impact_curve": _market_impact_curve(
                    scenario=scenario,
                    data=data,
                    sample_trade_values=request.sample_trade_values,
                ),
            }
        )

    baseline = scenario_results[0] if scenario_results else None
    baseline_return = float(baseline["metrics"].get("total_return", 0) or 0) if baseline else 0.0
    baseline_sharpe = float(baseline["metrics"].get("sharpe_ratio", 0) or 0) if baseline else 0.0
    baseline_cost = float(baseline["execution_costs"].get("estimated_market_impact_cost", 0) or 0) if baseline else 0.0
    for scenario_result in scenario_results:
        scenario_result["vs_baseline"] = {
            "return_delta": round(float(scenario_result["metrics"].get("total_return", 0) or 0) - baseline_return, 6),
            "sharpe_delta": round(float(scenario_result["metrics"].get("sharpe_ratio", 0) or 0) - baseline_sharpe, 6),
            "impact_cost_delta": round(
                float(scenario_result["execution_costs"].get("estimated_market_impact_cost", 0) or 0) - baseline_cost,
                2,
            ),
        }

    return ensure_json_serializable(
        {
            "success": True,
            "data": {
                "symbol": request.symbol,
                "strategy": request.strategy,
                "sample_trade_values": request.sample_trade_values,
                "scenarios": scenario_results,
                "summary": {
                    "scenario_count": len(scenario_results),
                    "best_by_sharpe": max(
                        scenario_results,
                        key=lambda item: float(item["metrics"].get("sharpe_ratio", 0) or 0),
                        default=None,
                    ),
                },
            },
        }
    )

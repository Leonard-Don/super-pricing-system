"""批量 / Walk-Forward / 市场状态 / 组合级回测路由。"""

import asyncio
import logging

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException

from backend.app.schemas.backtest import (
    BatchBacktestRequest,
    MarketRegimeRequest,
    PortfolioStrategyRequest,
    WalkForwardRequest,
)
from src.analytics.portfolio_optimizer import PortfolioOptimizer as AssetPortfolioOptimizer
from src.backtest.backtester import Backtester
from src.backtest.batch_backtester import BacktestTask, WalkForwardAnalyzer
from src.backtest.portfolio_backtester import PortfolioBacktester
from src.backtest.signal_adapter import SignalAdapter
from src.strategy.strategy_validator import StrategyValidator
from src.utils.data_validation import ensure_json_serializable, normalize_backtest_results

from ._helpers import (
    STRATEGIES,
    _build_batch_backtester,
    _create_strategy_instance,
    _fetch_backtest_data,
    _strategy_factory_for_batch,
    run_backtest_pipeline,
)
from ._series import (
    _calculate_max_drawdown_from_series,
    _classify_market_regimes,
    _returns_from_portfolio_history,
    _series_from_portfolio_history,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/batch", summary="批量运行多个回测任务")
async def run_batch_backtest(request: BatchBacktestRequest):
    try:
        batch = _build_batch_backtester(request.max_workers, request.use_processes)
        if request.timeout_seconds <= 0:
            raise HTTPException(status_code=400, detail="Timeout seconds must be positive")
        tasks = [
            BacktestTask(
                task_id=item.task_id or f"task_{index}",
                symbol=item.symbol,
                strategy_name=item.strategy,
                parameters=item.parameters,
                start_date=item.start_date,
                end_date=item.end_date,
                initial_capital=item.initial_capital,
                commission=item.commission,
                slippage=item.slippage,
                research_label=item.research_label,
            )
            for index, item in enumerate(request.tasks, start=1)
        ]

        results = await asyncio.wait_for(
            asyncio.to_thread(
                batch.run_batch,
                tasks=tasks,
                backtester_factory=Backtester,
                strategy_factory=_strategy_factory_for_batch,
                data_fetcher=_fetch_backtest_data,
            ),
            timeout=request.timeout_seconds,
        )

        ranked_results = batch.get_ranked_results(
            metric=request.ranking_metric,
            ascending=request.ascending,
            top_n=request.top_n,
        )

        return ensure_json_serializable({
            "success": True,
            "data": {
                "summary": batch.get_summary(),
                "execution": {
                    "max_workers": request.max_workers,
                    "use_processes": request.use_processes,
                    "timeout_seconds": request.timeout_seconds,
                },
                "results": [
                    {
                        "task_id": result.task_id,
                        "symbol": result.symbol,
                        "strategy": result.strategy_name,
                        "parameters": result.parameters,
                        "research_label": result.research_label,
                        "metrics": result.metrics,
                        "success": result.success,
                        "error": result.error,
                        "execution_time": result.execution_time,
                    }
                    for result in results
                ],
                "ranked_results": [
                    {
                        "task_id": result.task_id,
                        "symbol": result.symbol,
                        "strategy": result.strategy_name,
                        "parameters": result.parameters,
                        "research_label": result.research_label,
                        "metrics": result.metrics,
                        "success": result.success,
                        "execution_time": result.execution_time,
                    }
                    for result in ranked_results
                ],
            },
        })
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Batch backtest timed out") from exc
    except Exception as e:
        logger.error(f"Error running batch backtest: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@router.post("/walk-forward", summary="运行 Walk-Forward 分析")
async def run_walk_forward_backtest(request: WalkForwardRequest):
    try:
        if request.train_period <= 0 or request.test_period <= 0 or request.step_size <= 0:
            raise HTTPException(status_code=400, detail="Train/test/step periods must be positive")
        if request.monte_carlo_simulations <= 0:
            raise HTTPException(status_code=400, detail="Monte Carlo simulations must be positive")
        if request.optimization_method not in {"grid", "bayesian"}:
            raise HTTPException(status_code=400, detail="Optimization method must be grid or bayesian")
        if request.optimization_budget is not None and request.optimization_budget <= 0:
            raise HTTPException(status_code=400, detail="Optimization budget must be positive")
        if request.timeout_seconds <= 0:
            raise HTTPException(status_code=400, detail="Timeout seconds must be positive")

        data = _fetch_backtest_data(request.symbol, request.start_date, request.end_date)
        is_valid, error_msg, cleaned_params = StrategyValidator.validate_strategy_params(
            request.strategy, request.parameters or {}
        )
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)

        analyzer = WalkForwardAnalyzer(
            train_period=request.train_period,
            test_period=request.test_period,
            step_size=request.step_size,
        )
        result = await asyncio.wait_for(
            asyncio.to_thread(
                analyzer.analyze,
                data=data,
                strategy_factory=lambda parameters=None: _strategy_factory_for_batch(
                    request.strategy,
                    {**cleaned_params, **(parameters or {})},
                ),
                backtester_factory=lambda: Backtester(
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
                ),
                parameter_grid=request.parameter_grid,
                parameter_candidates=request.parameter_candidates,
                optimization_metric=request.optimization_metric,
                optimization_method=request.optimization_method,
                optimization_budget=request.optimization_budget,
                monte_carlo_simulations=request.monte_carlo_simulations,
            ),
            timeout=request.timeout_seconds,
        )

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        return ensure_json_serializable({
            "success": True,
            "data": {
                "symbol": request.symbol,
                "strategy": request.strategy,
                "parameters": cleaned_params,
                "train_period": request.train_period,
                "test_period": request.test_period,
                "step_size": request.step_size,
                "optimization_metric": request.optimization_metric,
                "optimization_method": request.optimization_method,
                "optimization_budget": request.optimization_budget,
                "monte_carlo_simulations": request.monte_carlo_simulations,
                "timeout_seconds": request.timeout_seconds,
                **result,
            },
        })
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Walk-forward analysis timed out") from exc
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error running walk-forward backtest: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@router.post("/market-regimes", summary="运行市场状态分层回测")
async def run_market_regime_backtest(request: MarketRegimeRequest):
    try:
        if request.lookback_days <= 1:
            raise HTTPException(status_code=400, detail="Lookback days must be greater than 1")
        if request.trend_threshold <= 0:
            raise HTTPException(status_code=400, detail="Trend threshold must be positive")

        data = _fetch_backtest_data(request.symbol, request.start_date, request.end_date)
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
            data=data,
        )

        close_column = "close" if "close" in data.columns else "Close"
        regime_frame = _classify_market_regimes(
            data[close_column],
            lookback_days=request.lookback_days,
            trend_threshold=request.trend_threshold,
        )
        strategy_returns = _returns_from_portfolio_history(results).rename("strategy_return")

        if regime_frame.empty or strategy_returns.empty:
            raise HTTPException(status_code=400, detail="Insufficient data for market regime analysis")

        aligned = regime_frame.set_index("date").join(strategy_returns, how="left")
        aligned["strategy_return"] = aligned["strategy_return"].fillna(0.0)

        regime_order = {
            "上涨趋势": 0,
            "下跌趋势": 1,
            "高波动震荡": 2,
            "低波动整理": 3,
        }
        regime_results = []
        for regime_name, group in aligned.groupby("regime"):
            strategy_curve = (1 + group["strategy_return"]).cumprod()
            market_curve = (1 + group["market_return"]).cumprod()
            strategy_total_return = float(strategy_curve.iloc[-1] - 1) if not strategy_curve.empty else 0.0
            market_total_return = float(market_curve.iloc[-1] - 1) if not market_curve.empty else 0.0
            positive_days = int((group["strategy_return"] > 0).sum())
            days = int(len(group))

            regime_results.append({
                "regime": regime_name,
                "days": days,
                "positive_days": positive_days,
                "win_rate": float(positive_days / days) if days else 0.0,
                "average_daily_return": float(group["strategy_return"].mean()) if days else 0.0,
                "strategy_total_return": strategy_total_return,
                "market_total_return": market_total_return,
                "max_drawdown": _calculate_max_drawdown_from_series(strategy_curve) if not strategy_curve.empty else 0.0,
            })

        regime_results.sort(key=lambda item: regime_order.get(item["regime"], 99))
        strongest = max(regime_results, key=lambda item: item["strategy_total_return"])
        weakest = min(regime_results, key=lambda item: item["strategy_total_return"])
        positive_regimes = sum(1 for item in regime_results if item["strategy_total_return"] > 0)

        return ensure_json_serializable({
            "success": True,
            "data": {
                "symbol": request.symbol,
                "strategy": request.strategy,
                "parameters": cleaned_params,
                "lookback_days": request.lookback_days,
                "trend_threshold": request.trend_threshold,
                "summary": {
                    "regime_count": len(regime_results),
                    "positive_regimes": positive_regimes,
                    "average_regime_return": float(np.mean([item["strategy_total_return"] for item in regime_results])) if regime_results else 0.0,
                    "strongest_regime": strongest,
                    "weakest_regime": weakest,
                },
                "regimes": regime_results,
            },
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error running market regime backtest: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@router.post("/portfolio-strategy", summary="运行组合级策略回测")
async def run_portfolio_strategy_backtest(request: PortfolioStrategyRequest):
    try:
        symbols = [symbol.strip().upper() for symbol in request.symbols if symbol and symbol.strip()]
        if len(symbols) < 2:
            raise HTTPException(status_code=400, detail="Portfolio strategy backtest requires at least 2 symbols")

        if request.strategy not in STRATEGIES:
            raise HTTPException(status_code=400, detail=f"Unknown strategy: {request.strategy}")

        is_valid, error_msg, cleaned_params = StrategyValidator.validate_strategy_params(
            request.strategy, request.parameters or {}
        )
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)

        objective = str(request.objective or "equal_weight").lower()
        if objective not in {"equal_weight", "max_sharpe", "min_volatility"}:
            raise HTTPException(status_code=400, detail="Objective must be one of: equal_weight, max_sharpe, min_volatility")

        weights = request.weights or []
        if weights and len(weights) != len(symbols):
            raise HTTPException(status_code=400, detail="Weights length must match symbols length")

        price_data = {}
        raw_weights = np.array(weights if weights else [1.0] * len(symbols), dtype="float64")
        if np.any(raw_weights < 0):
            raise HTTPException(status_code=400, detail="Weights must be non-negative")
        if float(raw_weights.sum()) <= 0:
            raise HTTPException(status_code=400, detail="Weights must sum to a positive value")

        component_results = []
        target_exposure_frames = []

        for index, symbol in enumerate(symbols):
            data = _fetch_backtest_data(symbol, request.start_date, request.end_date)
            close_column = "close" if "close" in data.columns else "Close"
            price_data[symbol] = data[close_column]
            result, _ = run_backtest_pipeline(
                symbol=symbol,
                strategy_name=request.strategy,
                parameters=cleaned_params,
                start_date=request.start_date,
                end_date=request.end_date,
                initial_capital=float(request.initial_capital),
                commission=request.commission,
                slippage=request.slippage,
                fixed_commission=request.fixed_commission,
                min_commission=request.min_commission,
                market_impact_bps=request.market_impact_bps,
                market_impact_model=request.market_impact_model,
                impact_reference_notional=request.impact_reference_notional,
                impact_coefficient=request.impact_coefficient,
                permanent_impact_bps=request.permanent_impact_bps,
                data=data,
            )
            strategy_instance = _create_strategy_instance(request.strategy, cleaned_params)
            target_exposure = SignalAdapter.single_asset_to_target_exposure(
                strategy_instance.generate_signals(data),
                index=data.index,
            ).rename(symbol)
            target_exposure_frames.append(target_exposure)

            component_series = _series_from_portfolio_history(result)
            if component_series.empty:
                continue

            component_results.append({
                "symbol": symbol,
                "total_return": float(result.get("total_return", 0) or 0),
                "annualized_return": float(result.get("annualized_return", 0) or 0),
                "max_drawdown": float(result.get("max_drawdown", 0) or 0),
                "final_value": float(result.get("final_value", 0) or 0),
                "num_trades": int(result.get("num_trades", 0) or 0),
            })

        if len(component_results) < 2 or not target_exposure_frames:
            raise HTTPException(status_code=400, detail="Insufficient valid component results for portfolio strategy backtest")

        price_frame = pd.DataFrame({symbol: price_data[symbol] for symbol in symbols}).dropna()
        target_exposure_frame = pd.concat(target_exposure_frames, axis=1).reindex(price_frame.index).ffill().fillna(0.0)
        ordered_symbols = list(target_exposure_frame.columns)
        if weights:
            normalized_weights = np.array(
                [raw_weights[symbols.index(symbol)] for symbol in ordered_symbols],
                dtype="float64",
            )
            normalized_weights = normalized_weights / normalized_weights.sum()
        elif objective == "equal_weight":
            normalized_weights = np.array([1.0 / len(ordered_symbols)] * len(ordered_symbols), dtype="float64")
        else:
            optimizer = AssetPortfolioOptimizer()
            optimization_result = optimizer.optimize_portfolio(
                price_frame,
                objective="max_sharpe" if objective == "max_sharpe" else "min_volatility",
            )
            if not optimization_result.get("success"):
                raise HTTPException(status_code=400, detail=optimization_result.get("error", "Portfolio optimization failed"))
            weight_map = optimization_result["optimal_portfolio"]["weights"]
            normalized_weights = np.array([float(weight_map.get(symbol, 0)) for symbol in ordered_symbols], dtype="float64")
            normalized_weights = normalized_weights / normalized_weights.sum()

        weight_map = {
            symbol: float(weight)
            for symbol, weight in zip(ordered_symbols, normalized_weights)
        }
        weighted_target_signals = target_exposure_frame.mul(
            pd.Series(weight_map),
            axis=1,
        )

        portfolio_results = PortfolioBacktester(
            initial_capital=float(request.initial_capital),
            commission=request.commission,
            slippage=request.slippage,
            allow_fractional_shares=True,
            max_gross_exposure=1.0,
            min_trade_value=request.min_trade_value,
            min_rebalance_weight_delta=request.min_rebalance_weight_delta,
            max_turnover_per_rebalance=request.max_turnover_per_rebalance,
            fixed_commission=request.fixed_commission,
            min_commission=request.min_commission,
            market_impact_bps=request.market_impact_bps,
            market_impact_model=request.market_impact_model,
            impact_reference_notional=request.impact_reference_notional,
            impact_coefficient=request.impact_coefficient,
            permanent_impact_bps=request.permanent_impact_bps,
        ).run(
            strategy=type(
                "PortfolioStrategyWrapper",
                (),
                {"generate_signals": lambda self, _: weighted_target_signals},
            )(),
            data=price_frame,
        )
        portfolio_history = portfolio_results.get("portfolio_history", [])
        positions_history = portfolio_results.get("positions_history", [])
        total_return = float(portfolio_results.get("total_return", 0) or 0)
        annualized_return = float(portfolio_results.get("annualized_return", 0) or 0)
        volatility = float(portfolio_results.get("volatility", 0) or 0)
        sharpe_ratio = float(portfolio_results.get("sharpe_ratio", 0) or 0)
        max_drawdown = float(portfolio_results.get("max_drawdown", 0) or 0)
        aggregate_trades = int(portfolio_results.get("num_trades", 0) or 0)
        final_value = float(portfolio_results.get("final_value", request.initial_capital) or request.initial_capital)

        for component in component_results:
            component["weight"] = float(normalized_weights[ordered_symbols.index(component["symbol"])])

        results = normalize_backtest_results({
            "symbol": ",".join(symbols),
            "strategy": request.strategy,
            "parameters": cleaned_params,
            "portfolio_history": portfolio_history,
            "portfolio": portfolio_history,
            "initial_capital": float(request.initial_capital),
            "final_value": final_value,
            "net_profit": float(final_value - float(request.initial_capital)),
            "total_return": total_return,
            "annualized_return": annualized_return,
            "volatility": volatility,
            "max_drawdown": max_drawdown,
            "sharpe_ratio": sharpe_ratio,
            "num_trades": aggregate_trades,
            "trades": portfolio_results.get("trades", []),
            "has_open_position": False,
            "total_completed_trades": 0,
            "portfolio_components": component_results,
            "portfolio_objective": objective,
            "weights": weight_map,
            "positions_history": positions_history,
            "fixed_commission": request.fixed_commission,
            "min_commission": request.min_commission,
            "market_impact_bps": request.market_impact_bps,
            "market_impact_model": request.market_impact_model,
            "impact_reference_notional": request.impact_reference_notional,
            "impact_coefficient": request.impact_coefficient,
            "permanent_impact_bps": request.permanent_impact_bps,
        })

        return ensure_json_serializable({
            "success": True,
            "data": results,
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error running portfolio strategy backtest: {e}", exc_info=True)
        return {"success": False, "error": str(e)}

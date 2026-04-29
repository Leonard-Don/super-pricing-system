"""共享于 backtest 包内的策略实例化、数据获取、与 backtest 主管线工具。

这些 helper 在多个路由 / sync runner 之间共享。集中放在这里避免循环依赖：
- 任何子模块只需 ``from ._helpers import X`` 即可，不会反向依赖路由层。
- ``data_manager`` 必须保留为模块级单例，因为测试通过
  ``monkeypatch.setattr(backtest_endpoint.data_manager, ...)`` 替换它的属性。
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, Optional, Tuple

from fastapi import HTTPException

from backend.app.schemas.backtest import BacktestRequest  # noqa: F401  (re-exported via __init__)
from src.analytics.dashboard import PerformanceAnalyzer
from src.backtest.backtester import Backtester
from src.backtest.batch_backtester import BatchBacktester
from src.backtest.impact_model import normalize_market_impact_model
from src.data.data_manager import DataManager
from src.data.synthetic_market import build_synthetic_ohlcv_frame
from src.strategy.advanced_strategies import (
    ATRTrailingStop,
    MACDStrategy,
    MeanReversionStrategy,
    MomentumStrategy,
    StochasticOscillator,
    VWAPStrategy,
)
from src.strategy.strategies import (
    BollingerBands,
    BuyAndHold,
    MovingAverageCrossover,
    MultiFactorStrategy,
    RSIStrategy,
    TurtleTradingStrategy,
)
from src.strategy.strategy_validator import StrategyValidator
from src.utils.data_validation import (
    ensure_json_serializable,
    normalize_backtest_results,
    validate_and_fix_backtest_results,
)

logger = logging.getLogger(__name__)
data_manager = DataManager()

# 策略映射
STRATEGIES = {
    "moving_average": MovingAverageCrossover,
    "rsi": RSIStrategy,
    "bollinger_bands": BollingerBands,
    "buy_and_hold": BuyAndHold,
    "macd": MACDStrategy,
    "mean_reversion": MeanReversionStrategy,
    "vwap": VWAPStrategy,
    "momentum": MomentumStrategy,
    "stochastic": StochasticOscillator,
    "atr_trailing_stop": ATRTrailingStop,
    "turtle_trading": TurtleTradingStrategy,
    "multi_factor": MultiFactorStrategy,
}


def _parse_iso_datetime(value: Optional[str], field_name: str) -> Optional[datetime]:
    """Parse ISO datetime strings used by the backtest API."""
    if not value:
        return None

    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field_name}: {value}",
        ) from exc


def _resolve_date_range(
    start_date: Optional[str], end_date: Optional[str]
) -> Tuple[Optional[datetime], Optional[datetime]]:
    start_dt = _parse_iso_datetime(start_date, "start_date")
    end_dt = _parse_iso_datetime(end_date, "end_date")

    if start_dt and end_dt and start_dt >= end_dt:
        raise HTTPException(status_code=400, detail="Start date must be before end date")

    return start_dt, end_dt


def _fetch_backtest_data(
    symbol: str,
    start_date: Optional[str],
    end_date: Optional[str],
    *,
    interval: str = "1d",
):
    start_dt, end_dt = _resolve_date_range(start_date, end_date)
    logger.debug(f"Fetching data for {symbol} from {start_dt} to {end_dt}")
    data = data_manager.get_historical_data(
        symbol=symbol,
        start_date=start_dt,
        end_date=end_dt,
        interval=interval,
    )
    if data is None or data.empty:
        logger.warning(f"No data found for symbol {symbol}")
        if start_dt is None and end_dt is None:
            fallback = build_synthetic_ohlcv_frame(
                symbol,
                start_date=start_dt,
                end_date=end_dt,
                interval=interval,
            )
            logger.warning(
                "Using synthetic fallback history for %s (%s) after provider returned no data",
                symbol,
                interval,
            )
            return fallback
        raise HTTPException(status_code=404, detail=f"No data found for symbol {symbol}")
    logger.debug(f"Retrieved {len(data)} data points")
    return data


def _create_strategy_instance(strategy_name: str, cleaned_params: Dict[str, Any]):
    strategy_class = STRATEGIES[strategy_name]

    try:
        if strategy_name == "moving_average":
            return strategy_class(
                fast_period=cleaned_params["fast_period"],
                slow_period=cleaned_params["slow_period"],
            )
        if strategy_name == "rsi":
            return strategy_class(
                period=cleaned_params["period"],
                oversold=cleaned_params["oversold"],
                overbought=cleaned_params["overbought"],
            )
        if strategy_name == "bollinger_bands":
            return strategy_class(
                period=cleaned_params["period"], num_std=cleaned_params["num_std"]
            )
        if strategy_name == "macd":
            return strategy_class(
                fast_period=cleaned_params["fast_period"],
                slow_period=cleaned_params["slow_period"],
                signal_period=cleaned_params["signal_period"],
            )
        if strategy_name == "mean_reversion":
            return strategy_class(
                lookback_period=cleaned_params["lookback_period"],
                entry_threshold=cleaned_params["entry_threshold"],
            )
        if strategy_name == "vwap":
            return strategy_class(period=cleaned_params["period"])
        if strategy_name == "momentum":
            return strategy_class(
                fast_window=cleaned_params["fast_window"],
                slow_window=cleaned_params["slow_window"],
            )
        if strategy_name == "stochastic":
            return strategy_class(
                k_period=cleaned_params["k_period"],
                d_period=cleaned_params["d_period"],
                oversold=cleaned_params["oversold"],
                overbought=cleaned_params["overbought"],
            )
        if strategy_name == "atr_trailing_stop":
            return strategy_class(
                atr_period=cleaned_params["atr_period"],
                atr_multiplier=cleaned_params["atr_multiplier"],
            )
        if strategy_name == "turtle_trading":
            return strategy_class(
                entry_period=cleaned_params["entry_period"],
                exit_period=cleaned_params["exit_period"],
            )
        if strategy_name == "multi_factor":
            return strategy_class(
                momentum_window=cleaned_params["momentum_window"],
                mean_reversion_window=cleaned_params["mean_reversion_window"],
                volume_window=cleaned_params["volume_window"],
                volatility_window=cleaned_params["volatility_window"],
                entry_threshold=cleaned_params["entry_threshold"],
                exit_threshold=cleaned_params["exit_threshold"],
            )
        return strategy_class()
    except (ValueError, TypeError) as exc:
        logger.error(f"Failed to create strategy instance: {exc}")
        raise HTTPException(
            status_code=500, detail=f"Strategy creation failed: {str(exc)}"
        ) from exc


def run_backtest_pipeline(
    *,
    symbol: str,
    strategy_name: str,
    parameters: Optional[Dict[str, Any]] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    initial_capital: float = 10000,
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
    data=None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Run the normalized backtest execution pipeline used by all endpoints."""
    logger.debug(f"Starting backtest for {symbol} with strategy {strategy_name}")

    if strategy_name not in STRATEGIES:
        logger.warning(f"Unknown strategy requested: {strategy_name}")
        raise HTTPException(status_code=400, detail=f"Unknown strategy: {strategy_name}")

    if initial_capital <= 0:
        raise HTTPException(status_code=400, detail="Initial capital must be positive")

    _resolve_date_range(start_date, end_date)

    if data is None:
        data = _fetch_backtest_data(symbol, start_date, end_date)

    is_valid, error_msg, cleaned_params = StrategyValidator.validate_strategy_params(
        strategy_name, parameters or {}
    )
    if not is_valid:
        logger.warning(f"Invalid strategy parameters: {error_msg}")
        raise HTTPException(status_code=400, detail=error_msg)

    strategy = _create_strategy_instance(strategy_name, cleaned_params)
    logger.debug(f"Running backtest with strategy: {strategy.name}")

    backtester = Backtester(
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
    )
    results = backtester.run(strategy, data)
    results = validate_and_fix_backtest_results(results)

    analyzer = PerformanceAnalyzer(results)
    results.update(analyzer.calculate_metrics())
    results.update(
        {
            "symbol": symbol,
            "strategy": strategy_name,
            "start_date": start_date,
            "end_date": end_date,
            "commission": commission,
            "slippage": slippage,
            "fixed_commission": fixed_commission,
            "min_commission": min_commission,
            "market_impact_bps": market_impact_bps,
            "market_impact_model": normalize_market_impact_model(market_impact_model),
            "impact_reference_notional": impact_reference_notional,
            "impact_coefficient": impact_coefficient,
            "permanent_impact_bps": permanent_impact_bps,
            "max_holding_days": max_holding_days,
            "parameters": cleaned_params,
        }
    )
    results = normalize_backtest_results(results)
    results = ensure_json_serializable(results)
    return results, cleaned_params


def _build_comparison_entry(results: Dict[str, Any]) -> Dict[str, Any]:
    comparison_entry = {
        "symbol": results.get("symbol"),
        "strategy": results.get("strategy"),
        "parameters": results.get("parameters", {}),
        "total_return": results.get("total_return", 0),
        "annualized_return": results.get("annualized_return", 0),
        "sharpe_ratio": results.get("sharpe_ratio", 0),
        "max_drawdown": results.get("max_drawdown", 0),
        "num_trades": results.get("num_trades", 0),
        "total_trades": results.get("total_trades", results.get("num_trades", 0)),
        "win_rate": results.get("win_rate", 0),
        "profit_factor": results.get("profit_factor", 0),
        "final_value": results.get("final_value", 0),
    }
    normalized = normalize_backtest_results(comparison_entry)
    normalized["metrics"] = {
        key: normalized.get(key)
        for key in [
            "total_return",
            "annualized_return",
            "sharpe_ratio",
            "max_drawdown",
            "num_trades",
            "total_trades",
            "win_rate",
            "profit_factor",
            "final_value",
        ]
    }
    return normalized


def _build_batch_backtester(max_workers: int, use_processes: bool = False) -> BatchBacktester:
    return BatchBacktester(max_workers=max_workers, use_processes=use_processes)


def _strategy_factory_for_batch(strategy_name: str, parameters: Dict[str, Any]):
    is_valid, error_msg, cleaned_params = StrategyValidator.validate_strategy_params(
        strategy_name, parameters or {}
    )
    if not is_valid:
        raise ValueError(error_msg)
    return _create_strategy_instance(strategy_name, cleaned_params)

"""Result-building helpers extracted from CrossMarketBacktester.

Pure relocation of price-matrix construction, trade reconstruction, and the
final results dictionary assembly. Module-level record converters that used
to live at the bottom of cross_market_backtester.py also moved here.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, Dict, List, Optional

import numpy as np
import pandas as pd

from src.backtest.metrics import (
    calculate_annualized_return,
    calculate_max_drawdown,
    calculate_sharpe_ratio,
    calculate_var,
    calculate_volatility,
)
from src.trading.cross_market import (
    AssetUniverse,
    ExecutionRouter,
    HedgePortfolioBuilder,
)

if TYPE_CHECKING:  # pragma: no cover - typing only
    from src.backtest.cross_market_backtester import CrossMarketBacktester


def build_price_matrix(
    backtester: "CrossMarketBacktester",
    universe: AssetUniverse,
    start_date: Optional[datetime],
    end_date: Optional[datetime],
    min_history_days: int,
    min_overlap_ratio: float,
) -> Dict[str, Any]:
    series_map: Dict[str, pd.Series] = {}
    symbol_alignment: List[Dict[str, Any]] = []
    liquidity_snapshot: Dict[str, Dict[str, float]] = {}
    venue_dates: Dict[str, set[pd.Timestamp]] = {}
    for asset in universe.get_assets():
        provider_name = "legacy"
        if hasattr(backtester.data_manager, "get_cross_market_historical_data"):
            result = backtester.data_manager.get_cross_market_historical_data(
                symbol=asset.symbol,
                asset_class=asset.asset_class.value,
                start_date=start_date,
                end_date=end_date,
                interval="1d",
            )
            if isinstance(result, dict):
                data = result.get("data", pd.DataFrame())
                provider_name = result.get("provider") or provider_name
            else:
                data = result
        else:
            data = backtester.data_manager.get_historical_data(
                symbol=asset.symbol,
                start_date=start_date,
                end_date=end_date,
                interval="1d",
            )
        if data.empty or "close" not in data.columns:
            raise ValueError(f"No daily close data found for {asset.symbol}")
        series = backtester._normalize_daily_close(data["close"], asset.symbol)
        if series.empty:
            raise ValueError(f"No normalized daily close data found for {asset.symbol}")
        series_map[asset.symbol] = series
        liquidity_stats = backtester._extract_liquidity_stats(data)
        liquidity_snapshot[asset.symbol] = liquidity_stats
        venue_dates.setdefault(asset.venue, set()).update(series.index.to_list())
        symbol_alignment.append(
            {
                "symbol": asset.symbol,
                "asset_class": asset.asset_class.value,
                "market": asset.market,
                "venue": asset.venue,
                "execution_channel": asset.execution_channel,
                "settlement": asset.settlement,
                "provider": provider_name,
                "raw_rows": int(len(data)),
                "valid_rows": int(len(series)),
                "first_date": series.index[0].strftime("%Y-%m-%d") if len(series) else None,
                "last_date": series.index[-1].strftime("%Y-%m-%d") if len(series) else None,
                "avg_daily_volume": liquidity_stats["avg_daily_volume"],
                "avg_daily_notional": liquidity_stats["avg_daily_notional"],
            }
        )

    outer_matrix = pd.concat(series_map.values(), axis=1, join="outer").sort_index()
    outer_matrix = outer_matrix[~outer_matrix.index.duplicated(keep="last")]

    if outer_matrix.empty:
        raise ValueError("No cross-market price history found")

    tradable_mask = outer_matrix.notna().all(axis=1)
    aligned_price_matrix = outer_matrix.loc[tradable_mask].copy()
    tradable_count = int(tradable_mask.sum())
    union_count = int(len(outer_matrix))
    tradable_day_ratio = tradable_count / union_count if union_count else 0.0
    dropped_dates_count = int(union_count - tradable_count)
    common_dates = set(aligned_price_matrix.index.to_list())

    if aligned_price_matrix.empty:
        raise ValueError("No aligned cross-market price history found after tradable-day filtering")
    if tradable_count < min_history_days:
        raise ValueError(
            f"Tradable overlap history too short: {tradable_count} days, need at least {min_history_days}"
        )
    if tradable_day_ratio < min_overlap_ratio:
        raise ValueError(
            f"Tradable overlap ratio {tradable_day_ratio:.2f} below threshold {min_overlap_ratio:.2f}"
        )

    for item in symbol_alignment:
        item["coverage_ratio"] = round(
            item["valid_rows"] / union_count if union_count else 0.0,
            4,
        )

    return {
        "raw_price_matrix": outer_matrix,
        "aligned_price_matrix": aligned_price_matrix,
        "tradable_mask": tradable_mask.astype(bool),
        "data_alignment": {
            "per_symbol": symbol_alignment,
            "union_row_count": union_count,
            "aligned_row_count": tradable_count,
            "tradable_day_ratio": round(tradable_day_ratio, 4),
            "dropped_dates_count": dropped_dates_count,
            "calendar_diagnostics": backtester._build_calendar_diagnostics(
                venue_dates=venue_dates,
                common_dates=common_dates,
                union_count=union_count,
                tradable_day_ratio=tradable_day_ratio,
            ),
        },
        "liquidity_snapshot": liquidity_snapshot,
    }


def build_results(
    backtester: "CrossMarketBacktester",
    universe: AssetUniverse,
    price_matrix: pd.DataFrame,
    signal_frame: pd.DataFrame,
    data_alignment: Dict[str, Any],
    strategy_name: str,
    parameters: Dict[str, Any],
    construction_mode: str,
    constraint_overlay: Dict[str, Any],
) -> Dict[str, Any]:
    returns = price_matrix.pct_change().fillna(0.0)
    hedge_portfolio = HedgePortfolioBuilder(universe.get_assets())
    long_assets = hedge_portfolio.long_leg.assets
    short_assets = hedge_portfolio.short_leg.assets
    leg_returns = hedge_portfolio.build_leg_returns(returns)
    long_leg_returns = leg_returns["long"]
    short_leg_returns = leg_returns["short"]
    spread_return = long_leg_returns - short_leg_returns

    positions = signal_frame["position"].shift(1).fillna(0.0)
    turnover = signal_frame["position"].diff().abs().fillna(signal_frame["position"].abs())
    transaction_cost = turnover * (backtester.commission + backtester.slippage)
    portfolio_returns = positions * spread_return - transaction_cost

    portfolio = pd.DataFrame(index=price_matrix.index)
    portfolio["long_leg_return"] = long_leg_returns
    portfolio["short_leg_return"] = short_leg_returns
    portfolio["spread_return"] = spread_return
    portfolio["position"] = positions
    portfolio["transaction_cost"] = transaction_cost
    portfolio["returns"] = portfolio_returns
    portfolio["total"] = backtester.initial_capital * (1 + portfolio_returns).cumprod()
    portfolio["cash"] = portfolio["total"]
    portfolio["exposure"] = portfolio["position"].abs() * portfolio["total"]

    trades = backtester._build_trades(signal_frame, portfolio)
    total_return = (portfolio["total"].iloc[-1] - backtester.initial_capital) / backtester.initial_capital
    daily_returns = portfolio["returns"].dropna()
    closed_holds = [
        float(trade["holding_period_days"])
        for trade in trades
        if trade["type"].startswith("CLOSE") and trade.get("holding_period_days") is not None
    ]
    avg_holding_period = float(np.mean(closed_holds)) if closed_holds else 0.0

    leg_performance = {
        "long": {
            "assets": [asset.to_dict() for asset in long_assets],
            "cumulative_return": float((1 + long_leg_returns).cumprod().iloc[-1] - 1),
        },
        "short": {
            "assets": [asset.to_dict() for asset in short_assets],
            "cumulative_return": float((1 + short_leg_returns).cumprod().iloc[-1] - 1),
        },
        "spread": {
            "cumulative_return": float((1 + spread_return).cumprod().iloc[-1] - 1),
        },
    }
    asset_contributions = hedge_portfolio.build_asset_contributions(returns)
    hedge_summary = hedge_portfolio.summarize_exposures(signal_frame.get("hedge_ratio"))
    hedge_summary["beta_neutrality"] = backtester._build_beta_neutrality(
        long_leg_returns=long_leg_returns,
        short_leg_returns=short_leg_returns,
        hedge_ratio_series=signal_frame.get("hedge_ratio"),
    )
    execution_router = ExecutionRouter(
        universe.get_assets(),
        initial_capital=backtester.initial_capital,
        avg_hedge_ratio=hedge_summary["hedge_ratio"]["average"],
        latest_prices={symbol: float(price) for symbol, price in price_matrix.iloc[-1].items()},
        liquidity_snapshots=data_alignment.get("liquidity_snapshot", {}),
    )
    execution_plan = execution_router.build_plan()
    liquidity_summary = execution_plan.get("liquidity_summary", {})
    margin_summary = execution_plan.get("margin_summary", {})

    spread_series = signal_frame.copy()
    spread_series["date"] = spread_series.index.strftime("%Y-%m-%d")
    refit_interval = int(parameters.get("refit_interval", 1))

    correlation_matrix = returns[price_matrix.columns].corr().fillna(0.0)
    cointegration_diagnostics = backtester._build_cointegration_diagnostics(
        price_matrix=price_matrix,
        long_assets=long_assets,
        short_assets=short_assets,
    )

    execution_diagnostics = {
        "construction_mode": construction_mode,
        "turnover": float(turnover.sum()),
        "cost_drag": float(transaction_cost.sum()),
        "avg_holding_period": round(avg_holding_period, 2),
        "constraint_binding_count": int(constraint_overlay.get("binding_count", 0)),
        "route_count": execution_plan["route_count"],
        "batch_count": len(execution_plan.get("batches", [])),
        "provider_count": len(execution_plan.get("by_provider", {})),
        "venue_count": len(execution_plan.get("venue_allocation", [])),
        "max_route_fraction": float(execution_plan.get("max_route_fraction", 0.0)),
        "max_batch_fraction": float(execution_plan.get("max_batch_fraction", 0.0)),
        "concentration_level": execution_plan.get("concentration", {}).get("level", "balanced"),
        "concentration_reason": execution_plan.get("concentration", {}).get("reason", ""),
        "liquidity_level": liquidity_summary.get("level", "unknown"),
        "liquidity_reason": liquidity_summary.get("reason", ""),
        "max_adv_usage": float(liquidity_summary.get("max_adv_usage", 0.0)),
        "stretched_route_count": int(liquidity_summary.get("stretched_route_count", 0)),
        "margin_level": margin_summary.get("level", "manageable"),
        "margin_reason": margin_summary.get("reason", ""),
        "margin_utilization": float(margin_summary.get("utilization", 0.0)),
        "gross_leverage": float(margin_summary.get("gross_leverage", 0.0)),
        "beta_level": hedge_summary.get("beta_neutrality", {}).get("level", "unknown"),
        "beta_reason": hedge_summary.get("beta_neutrality", {}).get("reason", ""),
        "calendar_level": data_alignment["data_alignment"].get("calendar_diagnostics", {}).get("level", "aligned"),
        "calendar_reason": data_alignment["data_alignment"].get("calendar_diagnostics", {}).get("reason", ""),
        "lot_efficiency": float(execution_plan.get("sizing_summary", {}).get("lot_efficiency", 1.0)),
        "residual_notional": float(execution_plan.get("sizing_summary", {}).get("total_residual_notional", 0.0)),
        "suggested_rebalance": backtester._suggest_rebalance_cadence(
            turnover=float(turnover.sum()),
            avg_holding_period=avg_holding_period,
            construction_mode=construction_mode,
        ),
        "stress_test_flag": execution_plan.get("execution_stress", {}).get("worst_case", {}).get(
            "concentration_level",
            "balanced",
        ),
        "stress_test_reason": execution_plan.get("execution_stress", {}).get("worst_case", {}).get(
            "concentration_reason",
            "",
        ),
        "cointegration_level": cointegration_diagnostics.get("level", "unknown"),
        "cointegration_reason": cointegration_diagnostics.get("reason", ""),
    }

    results = {
        "initial_capital": backtester.initial_capital,
        "final_value": float(portfolio["total"].iloc[-1]),
        "total_return": float(total_return),
        "annualized_return": float(calculate_annualized_return(total_return, len(portfolio))),
        "sharpe_ratio": float(calculate_sharpe_ratio(daily_returns)) if len(daily_returns) > 1 else 0.0,
        "max_drawdown": float(calculate_max_drawdown(portfolio["total"])),
        "volatility": float(calculate_volatility(daily_returns)) if len(daily_returns) > 1 else 0.0,
        "var_95": float(calculate_var(daily_returns)) if len(daily_returns) > 0 else 0.0,
        "num_trades": len(trades),
        "portfolio": _portfolio_to_records(portfolio),
        "portfolio_curve": _portfolio_curve(portfolio),
        "trades": trades,
        "spread_series": _dataframe_to_records(
            spread_series[
                ["date", "long_leg", "short_leg", "hedge_ratio", "spread", "z_score", "signal", "position"]
            ]
        ),
        "leg_performance": leg_performance,
        "correlation_matrix": {
            "columns": list(correlation_matrix.columns),
            "rows": [
                {
                    "symbol": index,
                    **{column: float(value) for column, value in row.items()},
                }
                for index, row in correlation_matrix.iterrows()
            ],
        },
        "data_alignment": data_alignment["data_alignment"],
        "execution_diagnostics": execution_diagnostics,
        "execution_plan": execution_plan,
        "hedge_portfolio": hedge_summary,
        "asset_contributions": asset_contributions,
        "cointegration_diagnostics": cointegration_diagnostics,
        "refit_summary": {
            "refit_interval": refit_interval,
            "estimated_refits": max(1, int(np.ceil(len(price_matrix) / max(refit_interval, 1)))),
            "dynamic_hedge": construction_mode == "ols_hedge" or strategy_name == "cointegration_reversion",
        },
    }
    if construction_mode == "ols_hedge":
        results["hedge_ratio_series"] = _dataframe_to_records(
            spread_series[["date", "hedge_ratio"]]
        )
    return results


def build_trades(
    backtester: "CrossMarketBacktester",
    signal_frame: pd.DataFrame,
    portfolio: pd.DataFrame,
) -> List[Dict[str, Any]]:
    trades: List[Dict[str, Any]] = []
    previous_position = 0
    entry_value: Optional[float] = None
    entry_date: Optional[str] = None
    entry_timestamp: Optional[pd.Timestamp] = None

    for idx, row in signal_frame.iterrows():
        current_position = int(row["position"])
        date_str = idx.strftime("%Y-%m-%d")
        if current_position == previous_position:
            continue

        if previous_position != 0:
            exit_value = float(portfolio.loc[idx, "total"])
            trades.append(
                {
                    "date": date_str,
                    "type": "CLOSE_LONG_SPREAD" if previous_position == 1 else "CLOSE_SHORT_SPREAD",
                    "position": 0,
                    "spread": float(row["spread"]),
                    "z_score": float(row["z_score"]),
                    "pnl": float(exit_value - (entry_value or exit_value)),
                    "entry_date": entry_date,
                    "holding_period_days": int((idx - entry_timestamp).days) if entry_timestamp is not None else None,
                }
            )
            entry_value = None
            entry_date = None
            entry_timestamp = None

        if current_position != 0:
            entry_value = float(portfolio.loc[idx, "total"])
            entry_date = date_str
            entry_timestamp = idx
            trades.append(
                {
                    "date": date_str,
                    "type": "OPEN_LONG_SPREAD" if current_position == 1 else "OPEN_SHORT_SPREAD",
                    "position": current_position,
                    "spread": float(row["spread"]),
                    "z_score": float(row["z_score"]),
                    "pnl": 0.0,
                    "entry_date": date_str,
                    "holding_period_days": None,
                }
            )

        previous_position = current_position

    return trades


def suggest_rebalance_cadence(
    *,
    turnover: float,
    avg_holding_period: float,
    construction_mode: str,
) -> str:
    if turnover >= 10 or avg_holding_period and avg_holding_period < 5:
        return "weekly"
    if construction_mode == "ols_hedge" or turnover >= 5 or avg_holding_period and avg_holding_period < 12:
        return "biweekly"
    return "monthly"


def normalize_daily_close(close_series: pd.Series, symbol: str) -> pd.Series:
    series = close_series.copy()
    series.index = pd.to_datetime(series.index, utc=True).tz_localize(None).normalize()
    series = series[~series.index.duplicated(keep="last")]
    series = series.sort_index().dropna().astype(float)
    series.name = symbol
    return series


def _portfolio_to_records(portfolio: pd.DataFrame) -> List[Dict[str, Any]]:
    records = []
    for idx, row in portfolio.iterrows():
        records.append(
            {
                "date": idx.strftime("%Y-%m-%d"),
                "total": float(row["total"]),
                "returns": float(row["returns"]),
                "cash": float(row["cash"]),
                "exposure": float(row["exposure"]),
                "position": float(row["position"]),
            }
        )
    return records


def _portfolio_curve(portfolio: pd.DataFrame) -> List[Dict[str, Any]]:
    return [
        {
            "date": idx.strftime("%Y-%m-%d"),
            "total": float(row["total"]),
            "returns": float(row["returns"]),
        }
        for idx, row in portfolio.iterrows()
    ]


def _dataframe_to_records(frame: pd.DataFrame) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    for _, row in frame.iterrows():
        records.append(
            {
                key: (float(value) if key != "date" else value)
                for key, value in row.to_dict().items()
            }
        )
    return records

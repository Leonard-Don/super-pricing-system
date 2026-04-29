"""时间序列工具：组合曲线、回撤、Monte Carlo 模拟、显著性检验、市场状态分类。"""

from __future__ import annotations

from typing import Any, Dict, Optional

import numpy as np
import pandas as pd
from fastapi import HTTPException


def _series_from_portfolio_history(results: Dict[str, Any]) -> pd.Series:
    portfolio_history = results.get("portfolio_history") or results.get("portfolio") or []
    if not portfolio_history:
        return pd.Series(dtype="float64")

    frame = pd.DataFrame(portfolio_history)
    if frame.empty or "total" not in frame.columns:
        return pd.Series(dtype="float64")

    frame = frame.copy()
    frame["date"] = pd.to_datetime(frame.get("date"), utc=True, errors="coerce")
    frame["date"] = frame["date"].dt.tz_localize(None)
    frame = frame.dropna(subset=["date"]).sort_values("date")
    if frame.empty:
        return pd.Series(dtype="float64")

    return pd.Series(frame["total"].astype(float).values, index=frame["date"])


def _calculate_max_drawdown_from_series(values: pd.Series) -> float:
    if values.empty:
        return 0.0

    running_max = values.cummax()
    drawdown = (values - running_max) / running_max.replace(0, np.nan)
    drawdown = drawdown.replace([np.inf, -np.inf], np.nan).fillna(0)
    return float(drawdown.min())


def _returns_from_portfolio_history(results: Dict[str, Any]) -> pd.Series:
    values = _series_from_portfolio_history(results)
    if values.empty:
        return pd.Series(dtype="float64")

    returns = values.pct_change().replace([np.inf, -np.inf], np.nan).fillna(0)
    returns.index = pd.to_datetime(returns.index, utc=True, errors="coerce").tz_localize(None)
    returns = returns[~returns.index.isna()]
    return returns.astype(float)


def _equity_curve_from_returns(
    returns: np.ndarray,
    initial_value: float,
) -> np.ndarray:
    return initial_value * np.cumprod(1 + returns)


def _max_drawdown_from_array(values: np.ndarray) -> float:
    if values.size == 0:
        return 0.0
    running_max = np.maximum.accumulate(values)
    drawdown = (values - running_max) / np.where(running_max == 0, np.nan, running_max)
    drawdown = np.nan_to_num(drawdown, nan=0.0, posinf=0.0, neginf=0.0)
    return float(np.min(drawdown))


def _simulate_monte_carlo_paths(
    returns: pd.Series,
    *,
    initial_value: float,
    simulations: int,
    horizon_days: Optional[int] = None,
    seed: Optional[int] = 42,
) -> Dict[str, Any]:
    clean_returns = pd.Series(returns).replace([np.inf, -np.inf], np.nan).dropna()
    clean_returns = clean_returns[clean_returns.index.notna()]
    if clean_returns.empty:
        raise HTTPException(status_code=400, detail="Insufficient return series for Monte Carlo simulation")

    horizon = max(5, min(int(horizon_days or len(clean_returns)), 756))
    sample_count = max(50, min(int(simulations or 1000), 10000))
    rng = np.random.default_rng(seed)
    source = clean_returns.to_numpy(dtype="float64")

    terminal_values = np.empty(sample_count, dtype="float64")
    path_returns = np.empty(sample_count, dtype="float64")
    max_drawdowns = np.empty(sample_count, dtype="float64")
    sampled_paths = []
    percentile_source = []

    for index in range(sample_count):
        sampled_returns = rng.choice(source, size=horizon, replace=True)
        equity = _equity_curve_from_returns(sampled_returns, initial_value)
        terminal_values[index] = equity[-1]
        path_returns[index] = (equity[-1] / initial_value) - 1
        max_drawdowns[index] = _max_drawdown_from_array(equity)
        if index < 40:
            sampled_paths.append([round(float(value), 2) for value in equity])
        if index < min(sample_count, 1500):
            percentile_source.append(equity)

    percentile_frame = np.vstack(percentile_source)
    fan_chart = []
    for day_index in range(horizon):
        day_values = percentile_frame[:, day_index]
        if day_index == 0 or day_index == horizon - 1 or day_index % max(1, horizon // 40) == 0:
            fan_chart.append(
                {
                    "step": day_index + 1,
                    "p10": round(float(np.percentile(day_values, 10)), 2),
                    "p50": round(float(np.percentile(day_values, 50)), 2),
                    "p90": round(float(np.percentile(day_values, 90)), 2),
                }
            )

    return {
        "simulations": sample_count,
        "horizon_days": horizon,
        "initial_value": round(float(initial_value), 2),
        "terminal_value": {
            "p05": round(float(np.percentile(terminal_values, 5)), 2),
            "p10": round(float(np.percentile(terminal_values, 10)), 2),
            "p50": round(float(np.percentile(terminal_values, 50)), 2),
            "p90": round(float(np.percentile(terminal_values, 90)), 2),
            "p95": round(float(np.percentile(terminal_values, 95)), 2),
        },
        "return_distribution": {
            "mean": round(float(np.mean(path_returns)), 6),
            "median": round(float(np.median(path_returns)), 6),
            "p05": round(float(np.percentile(path_returns, 5)), 6),
            "p95": round(float(np.percentile(path_returns, 95)), 6),
            "probability_of_loss": round(float(np.mean(path_returns < 0)), 4),
            "var_95": round(float(np.percentile(path_returns, 5)), 6),
            "cvar_95": round(float(path_returns[path_returns <= np.percentile(path_returns, 5)].mean()), 6),
        },
        "drawdown_distribution": {
            "median": round(float(np.median(max_drawdowns)), 6),
            "p05": round(float(np.percentile(max_drawdowns, 5)), 6),
            "worst": round(float(np.min(max_drawdowns)), 6),
        },
        "fan_chart": fan_chart,
        "sample_paths": sampled_paths,
    }


def _safe_sharpe(returns: pd.Series) -> float:
    values = pd.Series(returns).replace([np.inf, -np.inf], np.nan).dropna()
    if values.empty or float(values.std(ddof=0)) == 0:
        return 0.0
    return float(values.mean() / values.std(ddof=0) * np.sqrt(252))


def _compare_return_significance(
    baseline: pd.Series,
    challenger: pd.Series,
    *,
    bootstrap_samples: int = 1000,
    seed: Optional[int] = 42,
) -> Dict[str, Any]:
    aligned = pd.concat([baseline.rename("baseline"), challenger.rename("challenger")], axis=1).dropna()
    if aligned.empty or len(aligned) < 10:
        return {"status": "insufficient_data", "sample_size": int(len(aligned))}

    diff = aligned["challenger"] - aligned["baseline"]
    observed_mean_delta = float(diff.mean())
    observed_sharpe_delta = _safe_sharpe(aligned["challenger"]) - _safe_sharpe(aligned["baseline"])

    try:
        from scipy import stats

        t_stat, p_value = stats.ttest_rel(aligned["challenger"], aligned["baseline"], nan_policy="omit")
        t_stat = float(0 if np.isnan(t_stat) else t_stat)
        p_value = float(1 if np.isnan(p_value) else p_value)
    except Exception:
        std = float(diff.std(ddof=1))
        t_stat = float(observed_mean_delta / (std / np.sqrt(len(diff)))) if std > 0 else 0.0
        p_value = 1.0

    rng = np.random.default_rng(seed)
    sample_count = max(100, min(int(bootstrap_samples or 1000), 10000))
    boot_deltas = np.empty(sample_count, dtype="float64")
    raw = diff.to_numpy(dtype="float64")
    for index in range(sample_count):
        boot_deltas[index] = float(rng.choice(raw, size=len(raw), replace=True).mean())

    if observed_mean_delta >= 0:
        bootstrap_p = float(2 * min(np.mean(boot_deltas <= 0), np.mean(boot_deltas >= 0)))
    else:
        bootstrap_p = float(2 * min(np.mean(boot_deltas >= 0), np.mean(boot_deltas <= 0)))
    bootstrap_p = min(max(bootstrap_p, 0.0), 1.0)

    return {
        "status": "ok",
        "sample_size": int(len(aligned)),
        "observed_mean_daily_delta": round(observed_mean_delta, 8),
        "observed_annualized_delta": round(float(observed_mean_delta * 252), 6),
        "observed_sharpe_delta": round(float(observed_sharpe_delta), 6),
        "paired_t_test": {
            "t_stat": round(float(t_stat), 6),
            "p_value": round(float(p_value), 6),
            "significant_95": bool(p_value < 0.05),
        },
        "bootstrap": {
            "samples": sample_count,
            "p_value": round(float(bootstrap_p), 6),
            "ci_95": [
                round(float(np.percentile(boot_deltas, 2.5)), 8),
                round(float(np.percentile(boot_deltas, 97.5)), 8),
            ],
            "significant_95": bool(bootstrap_p < 0.05),
        },
    }


def _classify_market_regimes(
    close_prices: pd.Series,
    lookback_days: int = 20,
    trend_threshold: float = 0.03,
) -> pd.DataFrame:
    if close_prices is None or close_prices.empty:
        return pd.DataFrame(columns=["date", "regime", "market_return"])

    prices = close_prices.astype(float).dropna().copy()
    prices.index = pd.to_datetime(prices.index, utc=True, errors="coerce").tz_localize(None)
    prices = prices[~prices.index.isna()]
    if prices.empty:
        return pd.DataFrame(columns=["date", "regime", "market_return"])

    max_lookback = max(len(prices) - 1, 1)
    effective_lookback = min(max(int(lookback_days or 20), 2), max_lookback)
    vol_window = min(max(3, effective_lookback // 2), max(len(prices), 3))

    market_returns = prices.pct_change().replace([np.inf, -np.inf], np.nan).fillna(0)
    trend_returns = prices.pct_change(periods=effective_lookback).replace([np.inf, -np.inf], np.nan).fillna(0)
    rolling_vol = market_returns.rolling(vol_window, min_periods=2).std().replace([np.inf, -np.inf], np.nan)

    vol_reference = float(rolling_vol.dropna().median()) if not rolling_vol.dropna().empty else float(abs(market_returns).median())
    high_vol_threshold = vol_reference * 1.15 if vol_reference > 0 else float(abs(market_returns).mean())

    def _label_regime(date):
        trend_value = float(trend_returns.loc[date] or 0)
        volatility_value = float(rolling_vol.loc[date] or 0) if pd.notna(rolling_vol.loc[date]) else 0.0
        if trend_value >= trend_threshold:
            return "上涨趋势"
        if trend_value <= -abs(trend_threshold):
            return "下跌趋势"
        if high_vol_threshold > 0 and volatility_value >= high_vol_threshold:
            return "高波动震荡"
        return "低波动整理"

    frame = pd.DataFrame({
        "date": pd.to_datetime(prices.index, utc=True, errors="coerce").tz_localize(None),
        "market_return": market_returns.values,
    })
    frame["regime"] = frame["date"].apply(_label_regime)
    return frame

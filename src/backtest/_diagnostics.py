"""Diagnostic helpers extracted from CrossMarketBacktester.

Pure relocation of cointegration / liquidity / calendar / beta-neutrality
diagnostics. The class keeps thin forwarders so external call sites and
test ``setattr`` patches continue to work unchanged.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional

import numpy as np
import pandas as pd

if TYPE_CHECKING:  # pragma: no cover - typing only
    from src.backtest.cross_market_backtester import CrossMarketBacktester


def build_cointegration_diagnostics(
    backtester: "CrossMarketBacktester",
    *,
    price_matrix: pd.DataFrame,
    long_assets: List[Any],
    short_assets: List[Any],
) -> Dict[str, Any]:
    rows: List[Dict[str, Any]] = []
    long_symbols = [asset.symbol for asset in long_assets]
    short_symbols = [asset.symbol for asset in short_assets]

    for long_symbol in long_symbols:
        for short_symbol in short_symbols:
            if long_symbol not in price_matrix.columns or short_symbol not in price_matrix.columns:
                continue
            diagnosis = backtester._estimate_cointegration(
                price_matrix[long_symbol],
                price_matrix[short_symbol],
            )
            if diagnosis is None:
                continue
            rows.append(
                {
                    "long_symbol": long_symbol,
                    "short_symbol": short_symbol,
                    **diagnosis,
                }
            )

    if not rows:
        return {
            "available": False,
            "level": "unknown",
            "reason": "有效样本不足，暂时无法评估协整关系。",
            "pair_count": 0,
            "cointegrated_pair_count": 0,
            "rows": [],
            "best_pair": None,
        }

    rows.sort(key=lambda item: (item["p_value"], -item["sample_size"], item["long_symbol"], item["short_symbol"]))
    best_pair = rows[0]
    cointegrated_count = sum(1 for item in rows if item["p_value"] < 0.05)

    if best_pair["p_value"] < 0.05:
        level = "strong"
        reason = f"最佳配对 {best_pair['long_symbol']}/{best_pair['short_symbol']} 通过协整检验，p 值为 {best_pair['p_value']:.4f}。"
    elif best_pair["p_value"] < 0.15:
        level = "watch"
        reason = f"最佳配对 {best_pair['long_symbol']}/{best_pair['short_symbol']} 只有弱协整迹象，p 值为 {best_pair['p_value']:.4f}。"
    else:
        level = "weak"
        reason = f"当前多空腿之间没有明显协整关系，最佳配对 p 值为 {best_pair['p_value']:.4f}。"

    return {
        "available": True,
        "level": level,
        "reason": reason,
        "pair_count": len(rows),
        "cointegrated_pair_count": cointegrated_count,
        "rows": rows,
        "best_pair": best_pair,
    }


def estimate_cointegration(series_a: pd.Series, series_b: pd.Series) -> Optional[Dict[str, Any]]:
    aligned = pd.concat(
        [
            pd.to_numeric(series_a, errors="coerce"),
            pd.to_numeric(series_b, errors="coerce"),
        ],
        axis=1,
    ).dropna()
    if len(aligned) < 10:
        return None

    y1 = aligned.iloc[:, 0].astype(float).values
    y2 = aligned.iloc[:, 1].astype(float).values
    hedge_ratio = float(np.linalg.lstsq(y1.reshape(-1, 1), y2, rcond=None)[0][0]) if len(y1) else 1.0

    try:
        from statsmodels.tsa.stattools import coint

        statistic, p_value, _ = coint(y1, y2)
        method = "engle_granger"
        score = float(statistic)
    except Exception:
        spread = y2 - hedge_ratio * y1
        diff_spread = np.diff(spread)
        lagged_spread = spread[:-1]
        if len(diff_spread) < 5:
            return None
        x = np.column_stack([np.ones(len(lagged_spread)), lagged_spread])
        beta = np.linalg.lstsq(x, diff_spread, rcond=None)[0]
        residuals = diff_spread - x @ beta
        degrees_of_freedom = max(len(residuals) - 2, 1)
        residual_std = np.sqrt(np.sum(residuals ** 2) / degrees_of_freedom)
        denominator = residual_std / np.sqrt(max(np.sum(lagged_spread ** 2), 1e-9))
        test_stat = float(beta[1] / denominator) if denominator > 0 else 0.0
        try:
            from scipy import stats as scipy_stats

            p_value = float(2 * (1 - scipy_stats.t.cdf(abs(test_stat), degrees_of_freedom)))
        except Exception:
            p_value = 1.0
        method = "heuristic_adf"
        score = test_stat

    if np.isnan(p_value):
        p_value = 1.0

    return {
        "method": method,
        "test_statistic": round(float(score), 6),
        "p_value": round(float(p_value), 6),
        "sample_size": int(len(aligned)),
        "hedge_ratio": round(float(hedge_ratio), 6),
    }


def extract_liquidity_stats(data: pd.DataFrame) -> Dict[str, float]:
    if data.empty:
        return {"avg_daily_volume": 0.0, "avg_daily_notional": 0.0}

    close_series = pd.to_numeric(data.get("close"), errors="coerce")
    volume_series = pd.to_numeric(data.get("volume"), errors="coerce")
    if close_series is None or volume_series is None:
        return {"avg_daily_volume": 0.0, "avg_daily_notional": 0.0}

    valid = pd.DataFrame({"close": close_series, "volume": volume_series}).dropna()
    valid = valid[(valid["close"] > 0) & (valid["volume"] > 0)]
    if valid.empty:
        return {"avg_daily_volume": 0.0, "avg_daily_notional": 0.0}

    recent = valid.tail(20)
    avg_daily_volume = float(recent["volume"].mean())
    avg_daily_notional = float((recent["close"] * recent["volume"]).mean())
    return {
        "avg_daily_volume": round(avg_daily_volume, 2),
        "avg_daily_notional": round(avg_daily_notional, 2),
    }


def build_calendar_diagnostics(
    *,
    venue_dates: Dict[str, set[pd.Timestamp]],
    common_dates: set[pd.Timestamp],
    union_count: int,
    tradable_day_ratio: float,
) -> Dict[str, Any]:
    rows: List[Dict[str, Any]] = []
    max_mismatch_ratio = 0.0
    for venue, dates in venue_dates.items():
        active_dates = len(dates)
        common_overlap = len(dates & common_dates)
        mismatch_days = len(dates - common_dates)
        mismatch_ratio = mismatch_days / active_dates if active_dates else 0.0
        max_mismatch_ratio = max(max_mismatch_ratio, mismatch_ratio)
        rows.append(
            {
                "venue": venue,
                "active_dates": active_dates,
                "shared_dates": common_overlap,
                "mismatch_days": mismatch_days,
                "coverage_ratio": round(active_dates / union_count, 4) if union_count else 0.0,
                "mismatch_ratio": round(mismatch_ratio, 4),
            }
        )

    rows.sort(key=lambda item: (-item["mismatch_ratio"], item["venue"]))
    if tradable_day_ratio < 0.75 or max_mismatch_ratio > 0.2:
        level = "stretched"
    elif tradable_day_ratio < 0.9 or max_mismatch_ratio > 0.08:
        level = "watch"
    else:
        level = "aligned"

    top_row = rows[0] if rows else None
    reason = (
        f"tradable {round(tradable_day_ratio * 100, 1)}%"
        + (
            f", top venue {top_row['venue']} mismatch {round(top_row['mismatch_ratio'] * 100, 1)}%"
            if top_row else ""
        )
    )
    return {
        "level": level,
        "reason": reason,
        "rows": rows,
        "max_mismatch_ratio": round(max_mismatch_ratio, 6),
    }


def build_beta_neutrality(
    *,
    long_leg_returns: pd.Series,
    short_leg_returns: pd.Series,
    hedge_ratio_series: Optional[pd.Series],
) -> Dict[str, Any]:
    paired = pd.DataFrame({"long": long_leg_returns, "short": short_leg_returns}).dropna()
    if len(paired) < 5 or float(paired["short"].var(ddof=0)) == 0:
        return {
            "level": "unknown",
            "reason": "insufficient variance",
            "beta": 1.0,
            "beta_gap": 0.0,
            "rolling_beta_last": 1.0,
            "rolling_beta_mean": 1.0,
            "hedge_ratio_average": float(hedge_ratio_series.mean()) if hedge_ratio_series is not None else 1.0,
        }

    beta = float(paired["long"].cov(paired["short"]) / paired["short"].var(ddof=0))
    rolling_window = min(20, len(paired))
    rolling_cov = paired["long"].rolling(rolling_window).cov(paired["short"])
    rolling_var = paired["short"].rolling(rolling_window).var(ddof=0).replace(0, np.nan)
    rolling_beta = (rolling_cov / rolling_var).replace([np.inf, -np.inf], np.nan).dropna()
    rolling_last = float(rolling_beta.iloc[-1]) if not rolling_beta.empty else beta
    rolling_mean = float(rolling_beta.mean()) if not rolling_beta.empty else beta
    beta_gap = abs(beta - 1.0)

    if beta_gap > 0.4:
        level = "stretched"
    elif beta_gap > 0.18:
        level = "watch"
    else:
        level = "balanced"

    return {
        "level": level,
        "reason": f"beta {beta:.2f}, gap {beta_gap:.2f}, rolling {rolling_last:.2f}",
        "beta": round(beta, 6),
        "beta_gap": round(beta_gap, 6),
        "rolling_beta_last": round(rolling_last, 6),
        "rolling_beta_mean": round(rolling_mean, 6),
        "hedge_ratio_average": round(float(hedge_ratio_series.mean()) if hedge_ratio_series is not None else 1.0, 6),
    }

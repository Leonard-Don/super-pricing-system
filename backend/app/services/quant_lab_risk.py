"""Risk center domain service for Quant Lab."""

from __future__ import annotations

import math
from typing import Any, Callable, Dict, Iterable, List, Optional

import numpy as np
import pandas as pd


MODEL_Z_SCORES = {
    0.95: 1.6448536269514722,
    0.99: 2.3263478740408408,
}


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        numeric = float(value)
        if math.isnan(numeric) or math.isinf(numeric):
            return default
        return numeric
    except (TypeError, ValueError):
        return default


def _json_ready(value: Any) -> Any:
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, (pd.Series, pd.Index)):
        return [_json_ready(item) for item in value.tolist()]
    if isinstance(value, pd.DataFrame):
        return [_json_ready(item) for item in value.to_dict("records")]
    if isinstance(value, dict):
        return {str(key): _json_ready(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_ready(item) for item in value]
    return value


class QuantLabRiskService:
    """Owns Quant Lab risk analysis, factor decomposition, and attribution views."""

    def __init__(
        self,
        *,
        data_manager: Any,
        ff5_fetcher: Callable[[str], pd.DataFrame],
    ) -> None:
        self._data_manager = data_manager
        self._ff5_fetcher = ff5_fetcher

    def analyze_risk_center(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        symbols = [
            str(item or "").strip().upper()
            for item in (payload.get("symbols") or [])
            if str(item or "").strip()
        ]
        if not symbols:
            raise ValueError("symbols is required")

        period = str(payload.get("period") or "1y")
        weights = payload.get("weights")
        close_frame = self._load_close_matrix(symbols, period)
        if close_frame.empty or len(close_frame) < 40:
            raise ValueError("insufficient aligned history for risk analysis")

        returns = close_frame.pct_change().dropna(how="all").fillna(0.0)
        normalized_weights = self._normalize_weights(weights, len(symbols))
        portfolio_returns = returns.dot(np.asarray(normalized_weights, dtype=float))
        portfolio_returns.name = "portfolio"

        var_cvar = {
            "historical": self._compute_var_cvar(portfolio_returns, method="historical"),
            "parametric": self._compute_var_cvar(portfolio_returns, method="parametric"),
            "monte_carlo": self._compute_var_cvar(portfolio_returns, method="monte_carlo"),
        }
        rolling = self._build_rolling_risk(portfolio_returns)
        correlation_matrix = self._build_correlation_matrix(returns)
        factor_decomposition = self._build_factor_decomposition(portfolio_returns, period)
        stress_tests = self._build_stress_tests(portfolio_returns, factor_decomposition)
        attribution = self._build_performance_attribution(returns, normalized_weights)

        total_return = float(((1 + portfolio_returns).prod()) - 1)
        annualized_return = float((1 + total_return) ** (252 / max(len(portfolio_returns), 1)) - 1) if len(portfolio_returns) else 0.0
        volatility = float(portfolio_returns.std(ddof=0) * math.sqrt(252)) if len(portfolio_returns) else 0.0
        sharpe = float((portfolio_returns.mean() / portfolio_returns.std(ddof=0)) * math.sqrt(252)) if portfolio_returns.std(ddof=0) > 0 else 0.0

        return _json_ready(
            {
                "symbols": symbols,
                "weights": normalized_weights,
                "period": period,
                "summary": {
                    "data_points": len(portfolio_returns),
                    "total_return": round(total_return, 4),
                    "annualized_return": round(annualized_return, 4),
                    "volatility": round(volatility, 4),
                    "sharpe_ratio": round(sharpe, 4),
                    "max_drawdown": round(self._series_max_drawdown((1 + portfolio_returns).cumprod()), 4),
                },
                "var_cvar": var_cvar,
                "rolling_metrics": rolling,
                "correlation_matrix": correlation_matrix,
                "factor_decomposition": factor_decomposition,
                "stress_tests": stress_tests,
                "performance_attribution": attribution,
            }
        )

    def _load_close_matrix(self, symbols: Iterable[str], period: str) -> pd.DataFrame:
        frames = []
        for symbol in symbols:
            data = self._data_manager.get_historical_data(symbol, period=period)
            if data.empty or "close" not in data.columns:
                continue
            frames.append(data["close"].rename(symbol))
        if not frames:
            return pd.DataFrame()
        return pd.concat(frames, axis=1).dropna(how="all")

    def _normalize_weights(self, weights: Optional[List[float]], n_assets: int) -> List[float]:
        if not weights or len(weights) != n_assets:
            return [round(1 / n_assets, 4) for _ in range(n_assets)]
        numeric = np.asarray([max(_safe_float(value), 0.0) for value in weights], dtype=float)
        total = float(numeric.sum())
        if total <= 0:
            return [round(1 / n_assets, 4) for _ in range(n_assets)]
        return [round(float(value / total), 4) for value in numeric]

    def _compute_var_cvar(self, returns: pd.Series, *, method: str) -> Dict[str, Any]:
        series = pd.Series(returns).dropna()
        if series.empty:
            return {"confidence_95": None, "confidence_99": None}

        def compute(confidence: float) -> tuple[float, float]:
            if method == "historical":
                threshold = float(series.quantile(1 - confidence))
                tail = series[series <= threshold]
            elif method == "parametric":
                mu = float(series.mean())
                sigma = float(series.std(ddof=0))
                z_score = MODEL_Z_SCORES[confidence]
                threshold = mu - (z_score * sigma)
                simulated = pd.Series(np.random.default_rng(42).normal(mu, sigma or 1e-8, size=2000))
                tail = simulated[simulated <= threshold]
            else:
                mu = float(series.mean())
                sigma = float(series.std(ddof=0))
                simulated = pd.Series(np.random.default_rng(42).normal(mu, sigma or 1e-8, size=3000))
                threshold = float(simulated.quantile(1 - confidence))
                tail = simulated[simulated <= threshold]

            var_value = max(-threshold, 0.0)
            cvar_value = max(-float(tail.mean()) if not tail.empty else var_value, 0.0)
            return round(var_value, 4), round(cvar_value, 4)

        var95, cvar95 = compute(0.95)
        var99, cvar99 = compute(0.99)
        return {
            "confidence_95": {"var": var95, "cvar": cvar95},
            "confidence_99": {"var": var99, "cvar": cvar99},
        }

    def _build_rolling_risk(self, returns: pd.Series) -> List[Dict[str, Any]]:
        series = pd.Series(returns).dropna()
        window = 21
        if len(series) < window:
            return []

        cumulative = (1 + series).cumprod()
        peak = cumulative.cummax()
        drawdown = (cumulative / peak) - 1
        rolling = pd.DataFrame(
            {
                "date": series.index,
                "rolling_return": series.rolling(window).apply(lambda values: float(np.prod(1 + values) - 1), raw=False),
                "rolling_volatility": series.rolling(window).std(ddof=0) * math.sqrt(252),
                "rolling_sharpe": series.rolling(window).apply(
                    lambda values: float(np.mean(values) / np.std(values, ddof=0) * math.sqrt(252)) if np.std(values, ddof=0) > 0 else 0.0,
                    raw=False,
                ),
                "rolling_drawdown": drawdown.rolling(window).min(),
            }
        ).dropna()
        return rolling.tail(90).to_dict("records")

    def _build_correlation_matrix(self, returns: pd.DataFrame) -> Dict[str, Any]:
        correlation = returns.corr().fillna(0.0)
        symbols = list(correlation.columns)
        cells = []
        for row_symbol in symbols:
            for col_symbol in symbols:
                cells.append(
                    {
                        "symbol1": row_symbol,
                        "symbol2": col_symbol,
                        "correlation": round(float(correlation.loc[row_symbol, col_symbol]), 4),
                    }
                )
        return {"symbols": symbols, "cells": cells}

    def _build_factor_decomposition(self, portfolio_returns: pd.Series, period: str) -> Dict[str, Any]:
        factors = self._ff5_fetcher(period)
        if factors.empty:
            return {"error": "factor data unavailable"}

        portfolio_frame = pd.DataFrame({"portfolio": portfolio_returns.copy()})
        portfolio_frame.index = pd.to_datetime(portfolio_frame.index).tz_localize(None)
        factors = factors.copy()
        factors.index = pd.to_datetime(factors.index).tz_localize(None)
        aligned = portfolio_frame.join(factors, how="inner").dropna()
        if len(aligned) < 30:
            return {"error": "insufficient aligned factor data"}

        y = aligned["portfolio"] - aligned["RF"]
        factor_columns = ["Mkt-RF", "SMB", "HML", "RMW", "CMA"]
        x = aligned[factor_columns].values
        x_with_const = np.column_stack([np.ones(len(x)), x])
        coeffs = np.linalg.lstsq(x_with_const, y.values, rcond=None)[0]
        premia = aligned[factor_columns].mean() * 252
        contributions = {
            "alpha": round(float(coeffs[0] * 252), 4),
        }
        risk_split = []
        for index, column in enumerate(factor_columns, start=1):
            contribution = float(coeffs[index] * premia[column])
            contributions[column] = round(contribution, 4)
            risk_split.append({"factor": column, "loading": round(float(coeffs[index]), 4), "annual_contribution": round(contribution, 4)})

        total_abs = sum(abs(item["annual_contribution"]) for item in risk_split) or 1.0
        for item in risk_split:
            item["risk_share"] = round(abs(item["annual_contribution"]) / total_abs, 4)

        return {
            "loadings": {
                "alpha": round(float(coeffs[0]), 6),
                "market": round(float(coeffs[1]), 4),
                "size": round(float(coeffs[2]), 4),
                "value": round(float(coeffs[3]), 4),
                "profitability": round(float(coeffs[4]), 4),
                "investment": round(float(coeffs[5]), 4),
            },
            "annualized_contributions": contributions,
            "risk_split": risk_split,
        }

    def _build_stress_tests(self, returns: pd.Series, factor_decomposition: Dict[str, Any]) -> List[Dict[str, Any]]:
        market_beta = _safe_float((factor_decomposition.get("loadings") or {}).get("market"), 1.0)
        volatility = float(pd.Series(returns).std(ddof=0))
        scenarios = [
            {"name": "2008_crisis", "label": "2008 金融危机", "market_shock": -0.28, "vol_multiplier": 2.5},
            {"name": "covid_shock", "label": "COVID 暴跌", "market_shock": -0.18, "vol_multiplier": 2.0},
            {"name": "rate_spike", "label": "利率急升", "market_shock": -0.08, "vol_multiplier": 1.4},
        ]
        results = []
        for scenario in scenarios:
            projected_return = scenario["market_shock"] * market_beta
            projected_var95 = abs(projected_return) + (1.65 * volatility * scenario["vol_multiplier"])
            results.append(
                {
                    "scenario": scenario["name"],
                    "label": scenario["label"],
                    "projected_return": round(projected_return, 4),
                    "projected_var_95": round(projected_var95, 4),
                    "severity": "high" if projected_return <= -0.15 else "medium" if projected_return <= -0.08 else "low",
                }
            )
        return results

    def _build_performance_attribution(self, returns: pd.DataFrame, weights: List[float]) -> Dict[str, Any]:
        asset_returns = ((1 + returns).prod() - 1).to_dict()
        symbols = list(returns.columns)
        benchmark_weights = np.asarray([1 / len(symbols) for _ in symbols], dtype=float)
        portfolio_weights = np.asarray(weights, dtype=float)
        benchmark_return = float(sum(asset_returns[symbol] * benchmark_weights[index] for index, symbol in enumerate(symbols)))

        rows = []
        total_allocation = 0.0
        for index, symbol in enumerate(symbols):
            asset_return = float(asset_returns[symbol])
            allocation = (portfolio_weights[index] - benchmark_weights[index]) * (asset_return - benchmark_return)
            total_allocation += allocation
            rows.append(
                {
                    "symbol": symbol,
                    "portfolio_weight": round(float(portfolio_weights[index]), 4),
                    "benchmark_weight": round(float(benchmark_weights[index]), 4),
                    "asset_return": round(asset_return, 4),
                    "allocation_effect": round(float(allocation), 4),
                    "selection_effect": 0.0,
                    "interaction_effect": 0.0,
                }
            )

        return {
            "benchmark": "equal_weight",
            "rows": rows,
            "totals": {
                "allocation_effect": round(float(total_allocation), 4),
                "selection_effect": 0.0,
                "interaction_effect": 0.0,
                "total_effect": round(float(total_allocation), 4),
            },
        }

    def _series_max_drawdown(self, series: pd.Series) -> float:
        path = pd.Series(series).dropna()
        if path.empty:
            return 0.0
        peak = path.cummax()
        drawdown = (path / peak) - 1
        return float(drawdown.min())

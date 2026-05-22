"""Zero-volatility guard tests for the portfolio optimizer (P3 fix).

A portfolio built from flat / zero-variance return series has an undefined
Sharpe ratio (division by zero volatility). The optimizer must report 0.0
rather than letting inf / nan leak into the result.
"""

import math

import numpy as np
import pandas as pd

from src.strategy.portfolio_optimizer import PortfolioOptimizer


def test_calculate_portfolio_stats_zero_volatility_is_finite():
    dates = pd.date_range("2024-01-01", periods=20, freq="D")
    flat_returns = pd.DataFrame({"AAA": [0.0] * 20, "BBB": [0.0] * 20}, index=dates)

    _ret, vol, sharpe = PortfolioOptimizer().calculate_portfolio_stats(
        weights=np.array([0.5, 0.5]), returns=flat_returns
    )

    assert vol == 0.0
    assert math.isfinite(sharpe)


def test_optimize_portfolio_zero_variance_yields_finite_metrics():
    dates = pd.date_range("2024-01-01", periods=30, freq="D")
    flat_prices = pd.DataFrame({"AAA": [100.0] * 30, "BBB": [50.0] * 30}, index=dates)

    result = PortfolioOptimizer().optimize_portfolio(flat_prices)

    assert result["success"] is True
    optimal = result["optimal_portfolio"]
    assert math.isfinite(optimal["sharpe_ratio"])
    assert math.isfinite(optimal["return"])
    assert math.isfinite(optimal["volatility"])

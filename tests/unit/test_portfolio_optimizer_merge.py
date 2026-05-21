"""Characterization tests for `optimize_portfolio` on the unified optimizer (P2 #8).

`optimize_portfolio` previously lived in a separate `src/analytics/
portfolio_optimizer.py`. It is relocated verbatim onto the comprehensive
`src/strategy/portfolio_optimizer.PortfolioOptimizer` so the project keeps a
single portfolio-optimizer module. These tests lock its observable behaviour
across the move.
"""

import numpy as np
import pandas as pd
import pytest

from src.strategy.portfolio_optimizer import PortfolioOptimizer


def _price_frame() -> pd.DataFrame:
    rng = np.random.RandomState(42)
    dates = pd.date_range("2024-01-01", periods=60, freq="D")
    columns = {
        name: 100.0 * np.cumprod(1.0 + rng.normal(drift, 0.012, len(dates)))
        for name, drift in (("AAA", 0.0012), ("BBB", 0.0004), ("CCC", 0.0018))
    }
    return pd.DataFrame(columns, index=dates)


def test_optimize_portfolio_returns_weights_and_frontier():
    result = PortfolioOptimizer().optimize_portfolio(_price_frame(), objective="max_sharpe")

    assert result["success"] is True
    assert result["assets"] == ["AAA", "BBB", "CCC"]
    optimal = result["optimal_portfolio"]
    assert set(optimal["weights"]) == {"AAA", "BBB", "CCC"}
    assert sum(optimal["weights"].values()) == pytest.approx(1.0, abs=0.01)
    assert {"return", "volatility", "sharpe_ratio"} <= set(optimal)
    assert len(result["efficient_frontier"]) == 200


def test_optimize_portfolio_rejects_single_asset():
    result = PortfolioOptimizer().optimize_portfolio(_price_frame()[["AAA"]])
    assert result["success"] is False

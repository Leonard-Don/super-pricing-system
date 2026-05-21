"""Reproducibility test for the walk-forward Monte Carlo (P3 small fix).

``WalkForwardAnalyzer._run_monte_carlo_analysis`` bootstrap-resamples a return
series. It previously drew from the global, unseeded ``np.random``, so a
backtest's Monte Carlo statistics were not reproducible run to run. It now
resamples through a seeded RNG.
"""

from src.backtest.batch_backtester import WalkForwardAnalyzer

_RETURNS = [
    0.01, -0.02, 0.015, 0.03, -0.01, 0.005, -0.025, 0.02, 0.0, 0.012,
    -0.008, 0.018, -0.03, 0.022, 0.007, -0.015, 0.011, -0.004, 0.026, -0.019,
]


def test_walk_forward_monte_carlo_is_reproducible():
    analyzer = WalkForwardAnalyzer()

    first = analyzer._run_monte_carlo_analysis(_RETURNS, simulations=250)
    second = analyzer._run_monte_carlo_analysis(_RETURNS, simulations=250)

    assert first["available"] is True
    assert first == second

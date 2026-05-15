"""Falsy/default contract for estimate_market_impact_rate.

Invariant: ``impact_coefficient`` is declared on the public backtest
schema (``MarketImpactScenarioConfig.impact_coefficient: float = 1.0``)
as a non-Optional float with no lower-bound constraint, so an explicit
``0.0`` reaches ``estimate_market_impact_rate`` via the normal API path
(`single`/`batch` endpoints → ``run_backtest_pipeline`` →
``Backtester`` → ``execution_engine`` → ``estimate_market_impact_rate``).

For the ``linear`` and ``sqrt`` market-impact models the coefficient is
a direct multiplier on ``impact_rate``, so ``impact_coefficient=0.0``
should zero out the per-trade market-impact rate (a way to model
frictionless execution while keeping the chosen model). The prior
``float(impact_coefficient or 1.0)`` fallback silently flipped that
zeroed coefficient into the neutral 1.0× multiplier — the opposite
intent, producing the *largest* impact rate the model can return
instead of zero.

Missing (``None``) still falls back to 1.0 to preserve the existing
defensive behavior for non-typed callers.
"""

from __future__ import annotations

from src.backtest.impact_model import estimate_market_impact_rate


def test_explicit_zero_impact_coefficient_zeroes_linear_impact_rate():
    """impact_coefficient=0.0 must zero out the linear model's impact rate."""
    result = estimate_market_impact_rate(
        trade_notional=500_000.0,
        market_impact_bps=10.0,
        model="linear",
        avg_daily_notional=1_000_000.0,
        impact_coefficient=0.0,
    )

    assert result["impact_rate"] == 0.0, (
        "explicit impact_coefficient=0.0 collapsed to default 1.0; "
        f"got impact_rate={result['impact_rate']!r} from linear model"
    )


def test_explicit_zero_impact_coefficient_zeroes_sqrt_impact_rate():
    """impact_coefficient=0.0 must zero out the sqrt model's impact rate."""
    result = estimate_market_impact_rate(
        trade_notional=500_000.0,
        market_impact_bps=10.0,
        model="sqrt",
        avg_daily_notional=1_000_000.0,
        impact_coefficient=0.0,
    )

    assert result["impact_rate"] == 0.0, (
        "explicit impact_coefficient=0.0 collapsed to default 1.0; "
        f"got impact_rate={result['impact_rate']!r} from sqrt model"
    )


def test_explicit_unit_coefficient_produces_nonzero_impact_rate_baseline():
    """Sanity baseline: with coefficient=1.0 the linear model must produce >0 impact.

    Guards against the zero-coefficient assertions above passing only because
    base_rate or participation_rate are accidentally zero.
    """
    result = estimate_market_impact_rate(
        trade_notional=500_000.0,
        market_impact_bps=10.0,
        model="linear",
        avg_daily_notional=1_000_000.0,
        impact_coefficient=1.0,
    )

    assert result["impact_rate"] > 0.0, (
        f"baseline coefficient=1.0 produced impact_rate={result['impact_rate']!r}; "
        "test inputs are degenerate and zero-coefficient assertions are vacuous"
    )


def test_missing_impact_coefficient_defaults_to_one():
    """``None`` coefficient (e.g. from a non-typed dict caller) still defaults to 1.0."""
    result_none = estimate_market_impact_rate(
        trade_notional=500_000.0,
        market_impact_bps=10.0,
        model="linear",
        avg_daily_notional=1_000_000.0,
        impact_coefficient=None,  # type: ignore[arg-type]
    )
    result_one = estimate_market_impact_rate(
        trade_notional=500_000.0,
        market_impact_bps=10.0,
        model="linear",
        avg_daily_notional=1_000_000.0,
        impact_coefficient=1.0,
    )

    assert result_none["impact_rate"] == result_one["impact_rate"], (
        "None coefficient must default to 1.0 to preserve the prior "
        "defensive fallback for non-typed callers"
    )

"""Falsy/default contract for build_allocation_overlay risk_budget_scale fields.

Invariant: every ``*_risk_budget_scale`` field in the allocation overlay
preserves an explicit float supplied by the template_context — including
``0.0`` (extreme caution, scale risk budget to zero). Only a missing key
or ``None`` falls back to the neutral default ``1.0``.

The previous ``float(value or 1.0)`` pattern silently collapsed an explicit
``0.0`` to ``1.0``, hiding the strongest risk-down signal a template can
emit and incorrectly flipping ``source_mode_summary.active`` to ``False``.
"""

from __future__ import annotations

import pytest

from src.backtest._allocation import build_allocation_overlay


def _minimal_context(**overrides):
    base = {
        "template_id": "tpl",
        "template_name": "tpl",
        "allocation_mode": "macro_bias",
        "base_assets": [
            {"symbol": "XLU", "asset_class": "ETF", "side": "long", "weight": 0.5},
        ],
        "raw_bias_assets": [
            {"symbol": "XLU", "asset_class": "ETF", "side": "long", "weight": 0.5},
        ],
    }
    base.update(overrides)
    return base


EFFECTIVE_ASSETS = [
    {"symbol": "XLU", "asset_class": "ETF", "side": "long", "weight": 0.5},
]


RISK_BUDGET_FIELDS = [
    ("department_chaos_risk_budget_scale", "department_chaos"),
    ("policy_execution_risk_budget_scale", "policy_execution"),
    ("people_fragility_risk_budget_scale", "people_fragility"),
    ("source_mode_risk_budget_scale", "source_mode_summary"),
    ("structural_decay_radar_risk_budget_scale", "structural_decay_radar"),
]


@pytest.mark.parametrize("context_key,overlay_key", RISK_BUDGET_FIELDS)
def test_explicit_zero_risk_budget_scale_is_preserved(context_key, overlay_key):
    overlay = build_allocation_overlay(
        template_context=_minimal_context(**{context_key: 0.0}),
        effective_assets=EFFECTIVE_ASSETS,
    )

    assert overlay[overlay_key]["risk_budget_scale"] == 0.0, (
        f"explicit 0.0 in {context_key} collapsed to "
        f"{overlay[overlay_key]['risk_budget_scale']!r}; the falsy-fallback "
        "would treat extreme caution as neutral"
    )


@pytest.mark.parametrize("context_key,overlay_key", RISK_BUDGET_FIELDS)
def test_missing_risk_budget_scale_defaults_to_one(context_key, overlay_key):
    overlay = build_allocation_overlay(
        template_context=_minimal_context(),
        effective_assets=EFFECTIVE_ASSETS,
    )

    assert overlay[overlay_key]["risk_budget_scale"] == 1.0


def test_zero_source_mode_scale_marks_active():
    """source_mode_summary.active fires when scale < 0.95; explicit 0.0 must trigger it."""
    overlay = build_allocation_overlay(
        template_context=_minimal_context(source_mode_risk_budget_scale=0.0),
        effective_assets=EFFECTIVE_ASSETS,
    )

    assert overlay["source_mode_summary"]["risk_budget_scale"] == 0.0
    assert overlay["source_mode_summary"]["active"] is True


def test_explicit_zero_bias_scale_is_preserved():
    """``bias_scale=0.0`` means the bias has been fully neutralized.

    The schema (``CrossMarketTemplateContext.bias_scale``) declares it
    ``Optional[float] = None`` with no positive constraint, so ``0.0`` is a
    legitimate explicit value distinct from missing. The earlier
    ``float(value or 1.0)`` fallback silently flipped a "neutralized" signal
    into "no scaling, full bias" — the opposite intent. ``None``/missing
    still defaults to ``1.0``.
    """
    overlay = build_allocation_overlay(
        template_context=_minimal_context(bias_scale=0.0),
        effective_assets=EFFECTIVE_ASSETS,
    )

    assert overlay["bias_scale"] == 0.0, (
        "explicit bias_scale=0.0 collapsed to "
        f"{overlay['bias_scale']!r}; the falsy-fallback would invert "
        "a fully-neutralized bias into a fully-applied one"
    )


def test_missing_bias_scale_defaults_to_one():
    overlay = build_allocation_overlay(
        template_context=_minimal_context(),
        effective_assets=EFFECTIVE_ASSETS,
    )

    assert overlay["bias_scale"] == 1.0

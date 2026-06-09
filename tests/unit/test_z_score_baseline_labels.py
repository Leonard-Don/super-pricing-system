"""
Unit tests for GodEye audit P3 fixes:
  (a) z_score_baseline provenance label on macro factor outputs
  (b) LME inventory signal metric_kind / proxy_of semantic markers
"""

from __future__ import annotations

from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from src.analytics.macro_factors.base_factor import FactorResult
from src.analytics.macro_factors.credit_spread_stress import CreditSpreadStressFactor
from src.analytics.macro_factors.fx_mismatch import FXMismatchFactor
from src.analytics.macro_factors.rate_curve_pressure import RateCurvePressureFactor
from src.analytics.macro_factors.people_fragility import PeopleFragilityFactor
from src.analytics.macro_factors.baseload_mismatch import BaseloadMismatchFactor
from src.analytics.macro_factors.policy_execution_disorder import (
    PolicyExecutionDisorderFactor,
)
from src.analytics.macro_factors.tech_dilution import TechDilutionFactor
from src.analytics.macro_factors.bureaucratic_friction import BureaucraticFrictionFactor
from src.data.alternative.base_alt_provider import AltDataCategory, AltDataRecord


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_record(category: AltDataCategory, score: float = 0.3):
    return AltDataRecord(
        timestamp=datetime(2026, 1, 1),
        source="test",
        category=category,
        raw_value={},
        normalized_score=score,
        confidence=0.8,
    )


_EMPTY_CONTEXT: dict = {
    "signals": {
        "policy_radar": {},
        "supply_chain": {"dimensions": {}, "record_count": 0, "alert_count": 0, "confidence": 0.0},
        "macro_hf": {"dimensions": {}, "confidence": 0.0},
        "people_layer": {},
        "policy_execution": {},
    },
    "records": [],
    "market_indicators": {},
}


# ---------------------------------------------------------------------------
# (a) z_score_baseline label tests
# ---------------------------------------------------------------------------

class TestSyntheticBaselineMarketDrivenFactors:
    """The three market-driven factors must always report z_score_baseline == 'synthetic'."""

    def test_rate_curve_pressure_synthetic(self):
        result = RateCurvePressureFactor().compute(_EMPTY_CONTEXT)
        assert result.z_score_baseline == "synthetic"
        assert result.to_dict()["z_score_baseline"] == "synthetic"

    def test_credit_spread_stress_synthetic(self):
        result = CreditSpreadStressFactor().compute(_EMPTY_CONTEXT)
        assert result.z_score_baseline == "synthetic"
        assert result.to_dict()["z_score_baseline"] == "synthetic"

    def test_fx_mismatch_synthetic(self):
        result = FXMismatchFactor().compute(_EMPTY_CONTEXT)
        assert result.z_score_baseline == "synthetic"
        assert result.to_dict()["z_score_baseline"] == "synthetic"


class TestEmpiricalBaselineWhenRecordsPresent:
    """Record-driven factors must flip to 'empirical' when real records exist."""

    def test_people_fragility_empirical_with_records(self):
        ctx = dict(_EMPTY_CONTEXT)
        ctx["records"] = [
            _make_record(AltDataCategory.EXECUTIVE_GOVERNANCE, 0.4),
            _make_record(AltDataCategory.HIRING, 0.3),
        ]
        result = PeopleFragilityFactor().compute(ctx)
        assert result.z_score_baseline == "empirical"
        assert result.to_dict()["z_score_baseline"] == "empirical"

    def test_people_fragility_synthetic_without_records(self):
        result = PeopleFragilityFactor().compute(_EMPTY_CONTEXT)
        assert result.z_score_baseline == "synthetic"

    def test_baseload_mismatch_empirical_with_records(self):
        ctx = dict(_EMPTY_CONTEXT)
        ctx["records"] = [
            _make_record(AltDataCategory.COMMODITY_INVENTORY, 0.25),
            _make_record(AltDataCategory.BIDDING, 0.35),
        ]
        result = BaseloadMismatchFactor().compute(ctx)
        assert result.z_score_baseline == "empirical"

    def test_baseload_mismatch_synthetic_without_records(self):
        result = BaseloadMismatchFactor().compute(_EMPTY_CONTEXT)
        assert result.z_score_baseline == "synthetic"

    def test_policy_execution_disorder_empirical_with_records(self):
        ctx = dict(_EMPTY_CONTEXT)
        ctx["records"] = [_make_record(AltDataCategory.POLICY_EXECUTION, 0.55)]
        result = PolicyExecutionDisorderFactor().compute(ctx)
        assert result.z_score_baseline == "empirical"

    def test_policy_execution_disorder_synthetic_without_records(self):
        result = PolicyExecutionDisorderFactor().compute(_EMPTY_CONTEXT)
        assert result.z_score_baseline == "synthetic"

    def test_tech_dilution_empirical_with_records(self):
        ctx = dict(_EMPTY_CONTEXT)
        ctx["records"] = [_make_record(AltDataCategory.HIRING, 0.4)]
        result = TechDilutionFactor().compute(ctx)
        assert result.z_score_baseline == "empirical"

    def test_tech_dilution_synthetic_without_records(self):
        result = TechDilutionFactor().compute(_EMPTY_CONTEXT)
        assert result.z_score_baseline == "synthetic"

    def test_bureaucratic_friction_empirical_with_records(self):
        ctx = dict(_EMPTY_CONTEXT)
        ctx["records"] = [_make_record(AltDataCategory.POLICY, 0.3)]
        result = BureaucraticFrictionFactor().compute(ctx)
        assert result.z_score_baseline == "empirical"

    def test_bureaucratic_friction_synthetic_without_records(self):
        result = BureaucraticFrictionFactor().compute(_EMPTY_CONTEXT)
        assert result.z_score_baseline == "synthetic"


class TestZScoreBaselineInToDict:
    """to_dict() must include z_score_baseline for all factors."""

    def test_to_dict_contains_z_score_baseline(self):
        result = RateCurvePressureFactor().compute(_EMPTY_CONTEXT)
        d = result.to_dict()
        assert "z_score_baseline" in d
        assert d["z_score_baseline"] in ("synthetic", "empirical")

    def test_factor_result_default_is_synthetic(self):
        # FactorResult should default to synthetic so existing callers are safe.
        fr = FactorResult(
            name="test", value=0.1, z_score=0.5, signal=1, confidence=0.7
        )
        assert fr.z_score_baseline == "synthetic"


# ---------------------------------------------------------------------------
# (b) LME inventory semantic marker tests
# ---------------------------------------------------------------------------

class TestLMEInventoryProxySemantics:
    """LME analyze_inventory_trend must carry metric_kind/proxy_of markers."""

    def _make_provider(self):
        from src.data.alternative.macro_hf.lme_inventory import LMEInventoryProvider

        return LMEInventoryProvider()

    def test_lme_analysis_carries_metric_kind_price_proxy(self):
        provider = self._make_provider()
        # Patch get_inventory to return a synthetic result (no network call needed).
        with patch.object(
            provider,
            "get_inventory",
            return_value={
                "metal": "copper",
                "name": "铜",
                "symbol": "CU",
                "unit": "吨",
                "data": {
                    "latest_price": 9500.0,
                    "change": 200.0,
                    "change_pct": 2.5,
                    "volume": 1000,
                    "high_52w": 10000.0,
                    "low_52w": 8000.0,
                    "avg_price": 9200.0,
                    "volatility": 18.5,
                    "data_points": 60,
                    "trend": "up",
                },
                "source": "yfinance_proxy",
                "source_mode": "proxy",
                "fallback_reason": "lme_direct_feed_not_connected",
                "lag_days": 1,
                "coverage": 0.68,
                "timestamp": datetime.now().isoformat(),
            },
        ):
            result = provider.analyze_inventory_trend("copper")

        assert result["metric_kind"] == "price_proxy"
        assert result["proxy_of"] == "price_momentum"
        # Existing fields must still be present.
        assert result["source_mode"] == "proxy"
        assert result["fallback_reason"] == "lme_direct_feed_not_connected"

    def test_lme_analysis_unavailable_path_carries_marker(self):
        provider = self._make_provider()
        with patch.object(
            provider,
            "get_inventory",
            return_value={"metal": "copper", "data": None, "error": "unavailable"},
        ):
            result = provider.analyze_inventory_trend("copper")

        assert result["metric_kind"] == "price_proxy"
        assert result["proxy_of"] == "price_momentum"

    def test_lme_analysis_proxy_semantics_not_renamed(self):
        """The 'trend'/'signal' keys must still be present (additive, not breaking)."""
        provider = self._make_provider()
        with patch.object(
            provider,
            "get_inventory",
            return_value={
                "metal": "copper",
                "name": "铜",
                "data": {
                    "change_pct": -3.0,
                    "volatility": 15.0,
                    "trend": "down",
                },
                "source_mode": "proxy",
                "fallback_reason": "lme_direct_feed_not_connected",
                "lag_days": 1,
                "coverage": 0.68,
            },
        ):
            result = provider.analyze_inventory_trend("copper")

        assert "trend" in result
        assert "signal" in result
        assert result["metric_kind"] == "price_proxy"

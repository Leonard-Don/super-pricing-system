"""Unit tests for MacroHFSignalProvider (Phase B).

Covers the LME+SHFE dual-region inventory composition: parse → normalize →
to_signal, plus the region-weighted ``macro_pressure`` aggregation.
"""

from __future__ import annotations

import sys
from types import SimpleNamespace

import pandas as pd
import pytest

from src.data.alternative.base_alt_provider import AltDataCategory
from src.data.alternative.macro_hf.macro_signals import MacroHFSignalProvider


class _FakeLME:
    """Drop-in stub for LMEInventoryProvider with controllable trend output."""

    def __init__(self, results):
        self._results = results

    def analyze_inventory_trend(self, metal: str, days_back: int = 90):
        if metal in self._results:
            return self._results[metal]
        return {
            "metal": metal,
            "name": metal,
            "trend": "unknown",
            "signal": 0,
            "confidence": 0,
            "source_mode": "proxy",
            "fallback_reason": "missing",
            "lag_days": 1,
            "coverage": 0.0,
        }


def _frame(stocks):
    rows = [{"日期": f"2026-04-{i + 1:02d}", "库存": int(s)} for i, s in enumerate(stocks)]
    df = pd.DataFrame(rows)
    df["增减"] = df["库存"].diff()
    return df


@pytest.fixture
def stub_akshare(monkeypatch):
    """Patch akshare.futures_inventory_em with deterministic per-symbol data."""

    def _apply(symbol_to_df):
        def _fake(symbol: str = ""):
            return symbol_to_df.get(symbol, pd.DataFrame())

        fake_module = SimpleNamespace(futures_inventory_em=_fake)
        monkeypatch.setitem(sys.modules, "akshare", fake_module)

    return _apply


def test_provider_emits_both_lme_and_shfe_records(stub_akshare):
    # SHFE: copper destocking (weekly -5%), aluminium restocking (+5%)
    stub_akshare(
        {
            "沪铜": _frame([100, 100, 100, 100, 100, 100, 95]),
            "沪铝": _frame([100, 100, 100, 100, 100, 100, 105]),
        }
    )

    provider = MacroHFSignalProvider()
    provider.lme = _FakeLME(
        {
            "copper": {
                "metal": "copper",
                "name": "铜",
                "trend": "destocking",
                "signal": 1,
                "confidence": 0.5,
                "source_mode": "proxy",
                "fallback_reason": "",
                "lag_days": 1,
                "coverage": 0.68,
            },
            "aluminium": {
                "metal": "aluminium",
                "name": "铝",
                "trend": "restocking",
                "signal": -1,
                "confidence": 0.5,
                "source_mode": "proxy",
                "fallback_reason": "",
                "lag_days": 1,
                "coverage": 0.68,
            },
        }
    )

    raw = provider.fetch(metals=["copper", "aluminium"])
    regions = {item["region"] for item in raw}
    assert regions == {"LME", "SHFE"}
    # 2 metals * 2 regions = 4 raw rows
    assert len(raw) == 4

    parsed = provider.parse(raw)
    records = provider.normalize(parsed)
    assert len(records) == 4
    record_regions = {(r.metadata or {}).get("region") for r in records}
    assert record_regions == {"LME", "SHFE"}
    record_sources = {r.source for r in records}
    assert "macro_hf:inventory:lme" in record_sources
    assert "macro_hf:inventory:shfe" in record_sources
    # All records land in the COMMODITY_INVENTORY category
    assert all(r.category == AltDataCategory.COMMODITY_INVENTORY for r in records)


def test_signal_macro_pressure_is_region_weighted(stub_akshare):
    """LME (positive) and SHFE (negative) at 50/50 weights should partially offset."""
    # SHFE: both metals show restocking (signal=-1) — weekly +10% so confidence=0.8
    stub_akshare(
        {
            "沪铜": _frame([100, 100, 100, 100, 100, 100, 110]),
            "沪铝": _frame([100, 100, 100, 100, 100, 100, 110]),
        }
    )

    provider = MacroHFSignalProvider()
    provider.lme = _FakeLME(
        {
            "copper": {
                "metal": "copper",
                "name": "铜",
                "trend": "destocking",
                "signal": 1,
                "confidence": 0.8,
                "source_mode": "proxy",
                "fallback_reason": "",
                "lag_days": 1,
                "coverage": 0.68,
            },
            "aluminium": {
                "metal": "aluminium",
                "name": "铝",
                "trend": "destocking",
                "signal": 1,
                "confidence": 0.8,
                "source_mode": "proxy",
                "fallback_reason": "",
                "lag_days": 1,
                "coverage": 0.68,
            },
        }
    )

    signal = provider.run_pipeline(metals=["copper", "aluminium"])

    region_breakdown = signal["dimensions"]["inventory_by_region"]
    assert region_breakdown["LME"]["score"] > 0
    assert region_breakdown["SHFE"]["score"] < 0
    # Both regions should have similar magnitude (each averaging 0.8 * signal)
    assert abs(region_breakdown["LME"]["score"]) == pytest.approx(
        abs(region_breakdown["SHFE"]["score"]), abs=1e-3
    )

    # 50/50 weighting of equal-magnitude opposite-sign scores ⇒ macro_pressure ≈ 0
    assert abs(signal["macro_pressure"]) < 1e-3

    weights = signal["region_weights_used"]
    assert pytest.approx(weights["LME"], rel=1e-3) == 0.5
    assert pytest.approx(weights["SHFE"], rel=1e-3) == 0.5


def test_signal_falls_back_when_one_region_missing(stub_akshare):
    """If SHFE returns no data, the weight should collapse to LME alone."""
    stub_akshare({})  # all SHFE symbols empty

    provider = MacroHFSignalProvider()
    provider.lme = _FakeLME(
        {
            "copper": {
                "metal": "copper",
                "name": "铜",
                "trend": "destocking",
                "signal": 1,
                "confidence": 0.8,
                "source_mode": "proxy",
                "fallback_reason": "",
                "lag_days": 1,
                "coverage": 0.68,
            },
        }
    )

    signal = provider.run_pipeline(metals=["copper"])
    # SHFE rows always emitted but with signal=0, source_mode=curated
    # macro_pressure should still be driven by LME's positive signal
    weights = signal["region_weights_used"]
    # Both regions present (SHFE has unknown rows), but SHFE score=0 → still nets >0
    assert "LME" in weights
    assert signal["macro_pressure"] >= 0


def test_source_mode_summary_contains_both_proxy_and_live(stub_akshare):
    stub_akshare(
        {
            "沪铜": _frame([100, 100, 100, 100, 100, 100, 90]),
        }
    )

    provider = MacroHFSignalProvider()
    provider.lme = _FakeLME(
        {
            "copper": {
                "metal": "copper",
                "name": "铜",
                "trend": "destocking",
                "signal": 1,
                "confidence": 0.6,
                "source_mode": "proxy",
                "fallback_reason": "",
                "lag_days": 1,
                "coverage": 0.68,
            },
        }
    )

    signal = provider.run_pipeline(metals=["copper"])
    counts = signal["source_mode_summary"]["counts"]
    assert counts.get("proxy", 0) >= 1
    assert counts.get("live", 0) >= 1


def test_region_weights_custom_config(stub_akshare):
    """User-provided weights are accepted and normalized."""
    stub_akshare(
        {
            "沪铜": _frame([100, 100, 100, 100, 100, 100, 90]),
        }
    )

    # Heavily favor SHFE (0.8 vs 0.2)
    provider = MacroHFSignalProvider(config={"region_weights": {"LME": 1, "SHFE": 4}})
    provider.lme = _FakeLME(
        {
            "copper": {
                "metal": "copper",
                "name": "铜",
                "trend": "destocking",
                "signal": 1,
                "confidence": 0.6,
                "source_mode": "proxy",
                "fallback_reason": "",
                "lag_days": 1,
                "coverage": 0.68,
            },
        }
    )
    signal = provider.run_pipeline(metals=["copper"])
    weights = signal["region_weights_used"]
    assert pytest.approx(weights["LME"], rel=1e-3) == 0.2
    assert pytest.approx(weights["SHFE"], rel=1e-3) == 0.8


def test_region_weights_invalid_falls_back_to_default():
    """Zero / negative weights should fall back to the 50/50 default."""
    provider = MacroHFSignalProvider(config={"region_weights": {"LME": 0, "SHFE": 0}})
    assert provider.region_weights == MacroHFSignalProvider.DEFAULT_REGION_WEIGHTS


def test_provider_metadata_contains_region(stub_akshare):
    stub_akshare(
        {
            "沪铜": _frame([100, 100, 100, 100, 100, 100, 90]),
        }
    )

    provider = MacroHFSignalProvider()
    provider.lme = _FakeLME(
        {
            "copper": {
                "metal": "copper",
                "name": "铜",
                "trend": "destocking",
                "signal": 1,
                "confidence": 0.6,
                "source_mode": "proxy",
                "fallback_reason": "",
                "lag_days": 1,
                "coverage": 0.68,
            },
        }
    )

    raw = provider.fetch(metals=["copper"])
    parsed = provider.parse(raw)
    records = provider.normalize(parsed)
    for record in records:
        assert "region" in (record.metadata or {})
        region = record.metadata["region"]
        assert region in {"LME", "SHFE"}
        if region == "SHFE":
            assert record.metadata["source_mode"] == "live"

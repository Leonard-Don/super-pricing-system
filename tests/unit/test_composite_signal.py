"""Tests for the cross-component composite signal detector (Phase F4).

Covers:

- All 6 components bullish for one industry → HIGH conviction bullish.
- 3 components agree → MEDIUM conviction.
- Mixed (2 bull + 2 bear on same industry) → conflict, no signal emitted.
- Threshold tuning: ``avg_impact > +0.20`` counts as bullish; near zero
  is neutral.
- Empty inputs → empty list (graceful).
- Idempotent: two calls on the same input return identical output.
- ``include_low`` toggles 2-component (low) emissions.
- Endpoint shape: ``GET /alt-data/composite-signals`` returns the right
  schema and respects ``min_conviction``.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import alt_data as alt_data_endpoint
from src.data.alternative.base_alt_provider import (
    AltDataCategory,
    AltDataRecord,
)
from src.data.alternative.composite_signal import (
    CompositeSignal,
    SupportingComponent,
    composite_signals_to_public_summary,
    detect_composite_signals,
)


# ---------------------------------------------------------------------------
# Stub manager — light enough to instantiate without booting any provider
# ---------------------------------------------------------------------------


class _StubProvider:
    def __init__(self, records: Optional[List[AltDataRecord]] = None):
        self._history = records or []


class _StubManager:
    """Duck-typed AltDataManager exposing latest_signals + providers only."""

    def __init__(
        self,
        latest_signals: Optional[Dict[str, Any]] = None,
        providers: Optional[Dict[str, _StubProvider]] = None,
    ):
        self.latest_signals = latest_signals or {}
        self.providers = providers or {}


def _macro_hf_record(metal_en: str, metal_zh: str, trend: str, region: str) -> AltDataRecord:
    """Helper to create an inventory record the macro_hf reader can consume."""

    source = f"macro_hf:inventory:{region.lower()}"
    return AltDataRecord(
        timestamp=datetime.now() - timedelta(hours=1),
        source=source,
        category=AltDataCategory.COMMODITY_INVENTORY,
        raw_value={
            "data_type": "inventory",
            "metal": metal_en,
            "name": metal_zh,
            "trend": trend,
            "signal": 1 if trend == "destocking" else -1,
        },
        normalized_score=0.4 if trend == "destocking" else -0.4,
        confidence=0.6,
        tags=[metal_zh, "inventory", region.lower()],
        metadata={"region": region, "source_mode": "live" if region == "SHFE" else "proxy"},
    )


def _supply_chain_record(industry_id: str, industry_name: str, score: float) -> AltDataRecord:
    return AltDataRecord(
        timestamp=datetime.now() - timedelta(hours=2),
        source="supply_chain:bidding",
        category=AltDataCategory.BIDDING,
        raw_value={
            "industry": industry_id,
            "industry_id": industry_id,
            "amount": 100_000_000,
        },
        normalized_score=score,
        confidence=0.6,
        tags=[industry_id, industry_name],
        metadata={},
    )


# ---------------------------------------------------------------------------
# Builders for the canonical "all six" + "three" + "conflicting" scenarios.
# Target industry chosen so it has metals in INDUSTRY_RELEVANT_METALS, fund
# holdings in the fallback ticker mapping, and people-layer companies — i.e.
# 新能源汽车 (TSLA/BYD) and AI算力 (NVDA/AMD/688981) work.
# ---------------------------------------------------------------------------


def _build_full_bullish_manager() -> _StubManager:
    """All applicable components bullish for AI算力."""

    industry = "AI算力"
    return _StubManager(
        latest_signals={
            "policy_radar": {
                "industry_signals": {
                    industry: {
                        "avg_impact": 0.45,
                        "mentions": 12,
                        "signal": "bullish",
                    }
                }
            },
            "policy_execution": {"record_count": 6, "signal": 1},
            "northbound": {
                "top_inflow_industries": [
                    {"industry": industry, "netbuy_cny_billion": 8.0},
                ],
                "top_outflow_industries": [],
            },
            "fund_holdings": {
                "top_concentration_tickers": [
                    {"ticker": "NVDA", "total_aum_weight_pct": 0.40},
                    {"ticker": "AMD", "total_aum_weight_pct": 0.25},
                ]
            },
            "people_layer": {
                "supportive_companies": [
                    {"symbol": "NVDA", "people_fragility_score": 0.45},
                ],
                "fragile_companies": [],
            },
        },
        providers={
            "macro_hf": _StubProvider(
                records=[
                    _macro_hf_record("copper", "铜", "destocking", "LME"),
                    _macro_hf_record("copper", "铜", "destocking", "SHFE"),
                ]
            ),
            "supply_chain": _StubProvider(
                records=[
                    _supply_chain_record("ai_compute", industry, 0.35),
                    _supply_chain_record("ai_compute", industry, 0.32),
                ]
            ),
        },
    )


def _build_three_bullish_manager() -> _StubManager:
    """Exactly three components agree bullish for AI算力 → MEDIUM."""

    industry = "AI算力"
    return _StubManager(
        latest_signals={
            "policy_radar": {
                "industry_signals": {
                    industry: {
                        "avg_impact": 0.25,
                        "mentions": 5,
                        "signal": "bullish",
                    }
                }
            },
            "northbound": {
                "top_inflow_industries": [
                    {"industry": industry, "netbuy_cny_billion": 3.5},
                ],
                "top_outflow_industries": [],
            },
            "fund_holdings": {
                "top_concentration_tickers": [
                    {"ticker": "NVDA", "total_aum_weight_pct": 0.45},
                ]
            },
        },
        providers={},
    )


def _build_conflict_manager() -> _StubManager:
    """Two bullish + two bearish for the same industry → no emit."""

    industry = "新能源汽车"
    return _StubManager(
        latest_signals={
            "policy_radar": {
                "industry_signals": {
                    industry: {
                        "avg_impact": -0.40,  # bearish
                        "mentions": 8,
                        "signal": "bearish",
                    }
                }
            },
            "policy_execution": {"record_count": 6, "signal": -1},  # bearish
            "northbound": {
                "top_inflow_industries": [
                    {"industry": industry, "netbuy_cny_billion": 4.0},  # bullish
                ],
                "top_outflow_industries": [],
            },
            "fund_holdings": {
                "top_concentration_tickers": [
                    {"ticker": "TSLA", "total_aum_weight_pct": 0.60},  # bullish
                ]
            },
        },
        providers={},
    )


def _build_neutral_manager() -> _StubManager:
    """All signals near zero — nothing should emit."""

    industry = "AI算力"
    return _StubManager(
        latest_signals={
            "policy_radar": {
                "industry_signals": {
                    industry: {
                        "avg_impact": 0.05,  # below 0.20 threshold
                        "mentions": 2,
                        "signal": "neutral",
                    }
                }
            },
            "northbound": {
                "top_inflow_industries": [
                    {"industry": industry, "netbuy_cny_billion": 0.5},  # below 2B threshold
                ],
                "top_outflow_industries": [],
            },
        },
        providers={},
    )


# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------


def test_all_components_bullish_emits_high_conviction():
    """When 4+ components agree and most are strong → HIGH conviction."""

    manager = _build_full_bullish_manager()
    signals = detect_composite_signals(manager)
    targets = [s for s in signals if s.target == "AI算力" and s.direction == "bullish"]
    assert len(targets) == 1
    signal = targets[0]
    assert signal.conviction == "high"
    assert signal.direction == "bullish"
    assert signal.target_kind == "industry"
    components = {c.component for c in signal.supporting_components}
    # All applicable components contributed
    assert "policy_radar" in components
    assert "policy_execution" in components
    assert "northbound" in components
    assert "fund_holdings" in components
    assert "macro_hf" in components or "shfe_inventory" in components
    assert "people_layer" in components
    assert "supply_chain" in components
    # At least 5 agreeing components, all strong → high conviction
    assert len(signal.supporting_components) >= 5


def test_three_components_emit_medium_conviction():
    """Exactly 3 agreeing components → MEDIUM conviction."""

    manager = _build_three_bullish_manager()
    signals = detect_composite_signals(manager)
    targets = [s for s in signals if s.target == "AI算力" and s.direction == "bullish"]
    assert len(targets) == 1
    signal = targets[0]
    assert signal.conviction == "medium"
    assert len(signal.supporting_components) == 3


def test_mixed_directions_skipped():
    """When both bullish + bearish hit the 2-component floor → no emit."""

    manager = _build_conflict_manager()
    signals = detect_composite_signals(manager, include_low=True)
    # The conflicting industry must not be in either direction list.
    new_energy = [s for s in signals if s.target == "新能源汽车"]
    assert new_energy == [], f"Expected zero signals on conflict, got {new_energy}"


def test_neutral_inputs_emit_nothing():
    """Near-zero inputs must not produce a composite."""

    manager = _build_neutral_manager()
    signals = detect_composite_signals(manager, include_low=True)
    assert signals == []


def test_policy_impact_threshold_boundary():
    """``avg_impact = +0.20`` is the inclusive bullish threshold."""

    # avg_impact exactly at the threshold should contribute bullish.
    manager_at = _StubManager(
        latest_signals={
            "policy_radar": {
                "industry_signals": {
                    "光伏": {"avg_impact": 0.20, "mentions": 5},
                }
            },
            "northbound": {
                "top_inflow_industries": [
                    {"industry": "光伏", "netbuy_cny_billion": 2.5}
                ],
                "top_outflow_industries": [],
            },
        }
    )
    signals_at = detect_composite_signals(manager_at, include_low=True)
    # 2 components agree → emits low.
    bullish = [s for s in signals_at if s.target == "光伏" and s.direction == "bullish"]
    assert len(bullish) == 1
    assert bullish[0].conviction == "low"

    # avg_impact below the threshold must not contribute.
    manager_below = _StubManager(
        latest_signals={
            "policy_radar": {
                "industry_signals": {
                    "光伏": {"avg_impact": 0.15, "mentions": 5},
                }
            },
            "northbound": {
                "top_inflow_industries": [
                    {"industry": "光伏", "netbuy_cny_billion": 2.5}
                ],
                "top_outflow_industries": [],
            },
        }
    )
    signals_below = detect_composite_signals(manager_below, include_low=True)
    bullish_below = [
        s for s in signals_below if s.target == "光伏" and s.direction == "bullish"
    ]
    # northbound alone is only 1 contributor → no emit (need 2+)
    assert bullish_below == []


def test_empty_manager_returns_empty_list():
    """Empty manager → empty result, no exception."""

    manager = _StubManager()
    signals = detect_composite_signals(manager)
    assert signals == []
    assert detect_composite_signals(None) == []  # type: ignore[arg-type]


def test_idempotent_same_input_same_output():
    """Two calls with the same input return identical dicts."""

    manager = _build_full_bullish_manager()
    fixed_ts = "2026-05-17T10:00:00+00:00"
    a = [s.to_dict() for s in detect_composite_signals(manager, emit_at=fixed_ts)]
    b = [s.to_dict() for s in detect_composite_signals(manager, emit_at=fixed_ts)]
    assert a == b


def test_include_low_emits_two_component_signals():
    """The ``include_low`` switch surfaces the informational tier."""

    industry = "光伏"
    manager = _StubManager(
        latest_signals={
            "policy_radar": {
                "industry_signals": {
                    industry: {"avg_impact": 0.32, "mentions": 6},
                }
            },
            "northbound": {
                "top_inflow_industries": [
                    {"industry": industry, "netbuy_cny_billion": 3.0}
                ],
                "top_outflow_industries": [],
            },
        }
    )
    # Default: include_low=False → no low emitted
    default = detect_composite_signals(manager)
    bullish_default = [
        s for s in default if s.target == industry and s.direction == "bullish"
    ]
    assert bullish_default == []
    # include_low=True → emits the 2-component low signal
    with_low = detect_composite_signals(manager, include_low=True)
    bullish_with_low = [
        s for s in with_low if s.target == industry and s.direction == "bullish"
    ]
    assert len(bullish_with_low) == 1
    assert bullish_with_low[0].conviction == "low"


def test_public_summary_top_3_caps():
    """``composite_signals_to_public_summary`` caps each direction at top_n."""

    manager = _build_full_bullish_manager()
    composites = detect_composite_signals(manager)
    summary = composite_signals_to_public_summary(composites, top_n=3)
    assert "top_3_bullish" in summary
    assert "top_3_bearish" in summary
    assert len(summary["top_3_bullish"]) <= 3
    assert len(summary["top_3_bearish"]) <= 3
    # The bullish row must carry the industry + supporting count.
    assert summary["top_3_bullish"][0]["industry"] == "AI算力"
    assert summary["top_3_bullish"][0]["direction"] == "bullish"
    assert summary["top_3_bullish"][0]["conviction"] == "high"
    assert summary["top_3_bullish"][0]["supporting_components_count"] >= 5


def test_public_composite_payload_redacts_runtime_component_detail():
    """Component detail cannot smuggle runtime paths or raw records into API JSON."""

    signal = CompositeSignal(
        direction="bullish",
        target_kind="industry",
        target="白酒",
        conviction="medium",
        supporting_components=[
            SupportingComponent(
                component="block_trades",
                direction="bullish",
                signal_strength=0.71,
                is_strong=True,
                detail=(
                    "snapshot_path=cache/alt_data/providers/block_trades.json; "
                    "raw_value={'records': [{'desk': 'BrokerageDesk-Internal'}]}"
                ),
            ),
            SupportingComponent(
                component="northbound",
                direction="bullish",
                signal_strength=0.42,
                is_strong=True,
                detail="industry_netflow_cny_billion=+6.50; records=3",
            ),
        ],
        emit_at="2026-05-17T10:00:00+00:00",
        aggregate_strength=0.565,
    )

    payload = signal.to_dict()
    assert payload["supporting_components"][0]["detail"] == (
        "[redacted internal detail]"
    )
    assert payload["supporting_components"][1]["detail"] == (
        "industry_netflow_cny_billion=+6.50; records=3"
    )

    public_summary = composite_signals_to_public_summary([signal])
    assert public_summary["top_3_bullish"][0]["supporting_components"] == [
        "block_trades",
        "northbound",
    ]

    blob = json.dumps(
        {"payload": payload, "public_summary": public_summary},
        ensure_ascii=False,
    )
    assert "cache/alt_data" not in blob
    assert "snapshot_path" not in blob
    assert "raw_value" not in blob
    assert "BrokerageDesk-Internal" not in blob


def test_endpoint_respects_min_conviction(monkeypatch):
    """The ``/alt-data/composite-signals`` endpoint filters by tier."""

    manager = _build_full_bullish_manager()

    # Stub the manager + snapshot lookup so the endpoint can boot without a
    # live alt-data layer.
    monkeypatch.setattr(alt_data_endpoint, "_get_manager", lambda: manager)
    monkeypatch.setattr(
        manager,
        "get_dashboard_snapshot",
        lambda refresh=False: {"snapshot_timestamp": "2026-05-17T10:00:00+00:00"},
        raising=False,
    )

    app = FastAPI()
    app.include_router(alt_data_endpoint.router, prefix="/alt-data")
    client = TestClient(app)

    high_only = client.get("/alt-data/composite-signals?min_conviction=high").json()
    medium = client.get("/alt-data/composite-signals?min_conviction=medium").json()
    low = client.get("/alt-data/composite-signals?min_conviction=low").json()

    # min=high returns only the HIGH-conviction emission.
    assert all(c["conviction"] == "high" for c in high_only["composite_signals"])
    # medium drops low-tier but keeps high.
    assert all(
        c["conviction"] in {"high", "medium"} for c in medium["composite_signals"]
    )
    # low includes everything emitted.
    assert len(low["composite_signals"]) >= len(medium["composite_signals"])
    # tier_summary always reports across all detected signals.
    assert "tier_summary" in high_only
    assert isinstance(high_only["tier_summary"]["high"], int)
    # The endpoint exposes the public_summary distilled view too.
    assert "public_summary" in high_only
    assert "top_3_bullish" in high_only["public_summary"]

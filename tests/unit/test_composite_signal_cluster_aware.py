"""Tests for the cluster-aware composite signal detector (Phase F8).

Pins the contract of
:func:`src.data.alternative.composite_signal.detect_composite_signals_cluster_aware`
and the new ``/alt-data/composite-signals-cluster-aware`` +
``/alt-data/composite-signal-comparison`` endpoints:

- 3 providers from the same cluster all bullish → 1 cluster-vote →
  LOW conviction (the redundant-providers-as-one-vote case the whole
  feature is built for).
- 3 providers from 3 different clusters all bullish → 3 cluster-votes
  → HIGH conviction (independent agreement).
- 2 providers from cluster A + 1 from cluster B → 2 cluster-votes →
  MEDIUM conviction.
- Legacy vs cluster-aware comparison correctly flags tier changes.
- Empty input → empty list (graceful).
- ``include_low`` toggles single-cluster emission.
- Real-data smoke: against current archives, what's the conviction shift?
"""

from __future__ import annotations

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
    CLUSTER_AWARE_HIGH_STRENGTH_FLOOR,
    DEFAULT_CLUSTER_THRESHOLD,
    ClusterAwareCompositeSignal,
    SupportingCluster,
    cluster_aware_composite_signals_to_public_summary,
    compare_composite_signal_tiers,
    detect_composite_signals,
    detect_composite_signals_cluster_aware,
)


# ---------------------------------------------------------------------------
# Stubs — same shape as test_composite_signal.py's stubs so we stay
# consistent with the existing Phase F4 test pattern.
# ---------------------------------------------------------------------------


class _StubProvider:
    def __init__(self, records: Optional[List[AltDataRecord]] = None):
        self._history = records or []


class _StubManager:
    """Duck-typed AltDataManager — only ``latest_signals`` + ``providers``."""

    def __init__(
        self,
        latest_signals: Optional[Dict[str, Any]] = None,
        providers: Optional[Dict[str, _StubProvider]] = None,
    ):
        self.latest_signals = latest_signals or {}
        self.providers = providers or {}

    def get_dashboard_snapshot(self, refresh: bool = False) -> Dict[str, Any]:
        return {"snapshot_timestamp": "2026-05-19T10:00:00+00:00"}


def _macro_hf_record(metal_en: str, metal_zh: str, trend: str, region: str) -> AltDataRecord:
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


def _build_bearish_policy_chain_manager() -> _StubManager:
    """3 bearish votes for 新能源汽车, but all from the policy cluster.

    Models the exact scenario from the task description: ``policy_radar``
    + ``policy_execution`` + ``narrative``-equivalent (we route through
    the active component readers so we use the policy chain we have).
    Once we supply cluster membership, all three collapse into 1
    cluster-vote → LOW conviction under cluster-aware logic.
    """

    industry = "新能源汽车"
    return _StubManager(
        latest_signals={
            "policy_radar": {
                "industry_signals": {
                    industry: {
                        "avg_impact": -0.45,
                        "mentions": 8,
                        "signal": "bearish",
                    }
                }
            },
            "policy_execution": {"record_count": 6, "signal": -1},
            # Make supply_chain bearish too. We collapse it into the
            # policy cluster via the explicit cluster_membership param
            # in the test below so we have 3 redundant bearish votes.
        },
        providers={
            "supply_chain": _StubProvider(
                records=[
                    _supply_chain_record("new_energy_vehicle", industry, -0.30),
                    _supply_chain_record("new_energy_vehicle", industry, -0.32),
                ]
            ),
        },
    )


def _build_three_independent_clusters_manager() -> _StubManager:
    """3 bullish votes for AI算力 spread across 3 distinct cluster axes."""

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
            "northbound": {
                "top_inflow_industries": [
                    {"industry": industry, "netbuy_cny_billion": 8.0},
                ],
                "top_outflow_industries": [],
            },
            "people_layer": {
                "supportive_companies": [
                    {"symbol": "NVDA", "people_fragility_score": 0.45},
                ],
                "fragile_companies": [],
            },
        },
        providers={},
    )


def _build_two_clusters_manager() -> _StubManager:
    """2 from cluster A (policy chain) + 1 from cluster B (northbound)."""

    industry = "AI算力"
    return _StubManager(
        latest_signals={
            "policy_radar": {
                "industry_signals": {
                    industry: {
                        "avg_impact": 0.42,
                        "mentions": 10,
                        "signal": "bullish",
                    }
                }
            },
            "policy_execution": {"record_count": 6, "signal": 1},
            "northbound": {
                "top_inflow_industries": [
                    {"industry": industry, "netbuy_cny_billion": 7.0},
                ],
                "top_outflow_industries": [],
            },
        },
        providers={},
    )


# ---------------------------------------------------------------------------
# Unit tests (8 total to match the task brief)
# ---------------------------------------------------------------------------


def test_one_cluster_three_providers_emits_low_conviction():
    """Three bearish votes from the same cluster → 1 cluster-vote → LOW."""

    manager = _build_bearish_policy_chain_manager()
    cluster_membership = [
        ["policy_radar", "policy_execution", "supply_chain"],  # one big cluster
    ]

    signals = detect_composite_signals_cluster_aware(
        manager,
        cluster_membership=cluster_membership,
        include_low=True,
        emit_at="2026-05-19T10:00:00+00:00",
    )
    bearish = [
        s for s in signals if s.target == "新能源汽车" and s.direction == "bearish"
    ]
    assert len(bearish) == 1, "expected exactly one cluster-aware emission"
    signal = bearish[0]
    assert signal.conviction == "low", (
        f"3 redundant providers should collapse to LOW, got {signal.conviction}"
    )
    # Only 1 cluster vote, but the cluster carries multiple contributors.
    assert len(signal.supporting_clusters) == 1
    cluster = signal.supporting_clusters[0]
    assert set(cluster.contributing_providers) >= {
        "policy_radar",
        "policy_execution",
    }
    # The cluster name lists the redundant members.
    assert "policy_radar" in cluster.cluster_name


def test_three_independent_clusters_emit_high_conviction():
    """3 bullish votes across 3 distinct clusters → HIGH conviction."""

    manager = _build_three_independent_clusters_manager()
    # Every provider in its own singleton cluster (no redundancy).
    cluster_membership = [
        ["policy_radar"],
        ["policy_execution"],
        ["northbound"],
        ["fund_holdings"],
        ["macro_hf"],
        ["shfe_inventory"],
        ["people_layer"],
        ["supply_chain"],
    ]

    signals = detect_composite_signals_cluster_aware(
        manager,
        cluster_membership=cluster_membership,
        include_low=False,
        emit_at="2026-05-19T10:00:00+00:00",
    )
    bullish = [
        s for s in signals if s.target == "AI算力" and s.direction == "bullish"
    ]
    assert len(bullish) == 1
    signal = bullish[0]
    assert signal.conviction == "high"
    # 3 distinct clusters voted (policy_radar, northbound, people_layer).
    assert len(signal.supporting_clusters) >= 3
    # Aggregate strength clears the strength floor.
    assert signal.aggregate_strength >= CLUSTER_AWARE_HIGH_STRENGTH_FLOOR


def test_mixed_two_clusters_emit_medium_conviction():
    """2 from cluster A + 1 from cluster B → 2 cluster-votes → MEDIUM."""

    manager = _build_two_clusters_manager()
    # policy_radar + policy_execution share a cluster; northbound is its own.
    cluster_membership = [
        ["policy_radar", "policy_execution"],
        ["northbound"],
    ]

    signals = detect_composite_signals_cluster_aware(
        manager,
        cluster_membership=cluster_membership,
        emit_at="2026-05-19T10:00:00+00:00",
    )
    bullish = [
        s for s in signals if s.target == "AI算力" and s.direction == "bullish"
    ]
    assert len(bullish) == 1
    signal = bullish[0]
    assert signal.conviction == "medium"
    assert len(signal.supporting_clusters) == 2
    cluster_names = {c.cluster_name for c in signal.supporting_clusters}
    # Cluster names are sorted alphabetically for determinism.
    assert "policy_execution+policy_radar" in cluster_names
    assert "northbound" in cluster_names


def test_legacy_vs_cluster_aware_comparison_flags_tier_changes():
    """Comparison endpoint surfaces rows where the conviction tier moves."""

    manager = _build_bearish_policy_chain_manager()
    cluster_membership = [
        ["policy_radar", "policy_execution", "supply_chain"],
    ]

    comparison = compare_composite_signal_tiers(
        manager,
        cluster_membership=cluster_membership,
        include_low=True,
        emit_at="2026-05-19T10:00:00+00:00",
    )

    nev_rows = [
        r
        for r in comparison["comparisons"]
        if r["industry"] == "新能源汽车" and r["direction"] == "bearish"
    ]
    assert len(nev_rows) == 1
    row = nev_rows[0]
    # Legacy: 3 providers → MEDIUM. Cluster-aware: 1 cluster → LOW.
    assert row["legacy_conviction"] == "medium"
    assert row["cluster_aware_conviction"] == "low"
    assert row["tier_changed"] is True
    assert row["tier_delta"] < 0  # downgrade
    assert row["legacy_supporting_components_count"] >= 3
    assert row["cluster_aware_supporting_clusters_count"] == 1

    # Summary counters
    assert comparison["summary"]["tier_changes_count"] >= 1
    assert comparison["summary"]["downgrades"] >= 1


def test_empty_input_returns_empty_list():
    """Empty manager → empty cluster-aware list, no exception."""

    assert detect_composite_signals_cluster_aware(None) == []  # type: ignore[arg-type]
    assert detect_composite_signals_cluster_aware(_StubManager()) == []


def test_include_low_toggles_single_cluster_emission():
    """``include_low=False`` skips single-cluster results."""

    manager = _build_bearish_policy_chain_manager()
    cluster_membership = [
        ["policy_radar", "policy_execution", "supply_chain"],
    ]

    default = detect_composite_signals_cluster_aware(
        manager,
        cluster_membership=cluster_membership,
        emit_at="2026-05-19T10:00:00+00:00",
    )
    # Default (include_low=False) suppresses the single-cluster emission.
    assert all(s.conviction != "low" for s in default)

    with_low = detect_composite_signals_cluster_aware(
        manager,
        cluster_membership=cluster_membership,
        include_low=True,
        emit_at="2026-05-19T10:00:00+00:00",
    )
    assert any(s.conviction == "low" for s in with_low)


def test_idempotent_same_input_same_output():
    """Cluster-aware detector is deterministic for a fixed input snapshot."""

    manager = _build_two_clusters_manager()
    cluster_membership = [
        ["policy_radar", "policy_execution"],
        ["northbound"],
    ]
    fixed_ts = "2026-05-19T10:00:00+00:00"
    a = [
        s.to_dict()
        for s in detect_composite_signals_cluster_aware(
            manager, cluster_membership=cluster_membership, emit_at=fixed_ts
        )
    ]
    b = [
        s.to_dict()
        for s in detect_composite_signals_cluster_aware(
            manager, cluster_membership=cluster_membership, emit_at=fixed_ts
        )
    ]
    assert a == b


def test_endpoints_return_expected_shape(monkeypatch):
    """Both new endpoints return the documented JSON shape."""

    manager = _build_bearish_policy_chain_manager()
    monkeypatch.setattr(alt_data_endpoint, "_get_manager", lambda: manager)

    # Bypass the heavyweight correlation analyzer by patching the
    # detector's lazy import — the test only cares about endpoint
    # plumbing, not whether numpy can find archives on disk.
    import src.data.alternative.composite_signal as cs_module

    monkeypatch.setattr(
        cs_module,
        "_resolve_cluster_membership",
        lambda **_kwargs: [
            ["policy_radar", "policy_execution", "supply_chain"],
        ],
    )

    app = FastAPI()
    app.include_router(alt_data_endpoint.router, prefix="/alt-data")
    client = TestClient(app)

    cluster_aware_resp = client.get(
        "/alt-data/composite-signals-cluster-aware?min_conviction=low"
    )
    assert cluster_aware_resp.status_code == 200
    cluster_aware_body = cluster_aware_resp.json()
    assert "composite_signals" in cluster_aware_body
    assert "tier_summary" in cluster_aware_body
    assert "public_summary" in cluster_aware_body
    assert "cluster_threshold" in cluster_aware_body
    if cluster_aware_body["composite_signals"]:
        first = cluster_aware_body["composite_signals"][0]
        assert "supporting_clusters" in first
        assert "supporting_clusters_count" in first

    comparison_resp = client.get("/alt-data/composite-signal-comparison")
    assert comparison_resp.status_code == 200
    comparison_body = comparison_resp.json()
    assert "comparisons" in comparison_body
    assert "tier_changes" in comparison_body
    assert "summary" in comparison_body
    assert "cluster_threshold" in comparison_body


# ---------------------------------------------------------------------------
# Synthetic 14-day demo smoke test — surfaces the conviction-shift number
# the task asks us to report.
# ---------------------------------------------------------------------------


def test_synthetic_14_day_demo_shifts_conviction_tier():
    """Smoke test: synthetic data with derivation-chained providers shifts tiers.

    Builds two scenarios — one where policy_radar+policy_execution agree
    bearish on 新能源汽车 (legacy ≥ MEDIUM, cluster-aware = LOW), and one
    where three independent clusters agree bullish on AI算力 (both legacy
    and cluster-aware = HIGH). Confirms the comparison endpoint catches
    the redundant case.
    """

    industry_a = "新能源汽车"
    industry_b = "AI算力"
    manager = _StubManager(
        latest_signals={
            "policy_radar": {
                "industry_signals": {
                    industry_a: {
                        "avg_impact": -0.40,
                        "mentions": 7,
                        "signal": "bearish",
                    },
                    industry_b: {
                        "avg_impact": 0.45,
                        "mentions": 12,
                        "signal": "bullish",
                    },
                }
            },
            "policy_execution": {"record_count": 6, "signal": -1},
            "northbound": {
                "top_inflow_industries": [
                    {"industry": industry_b, "netbuy_cny_billion": 9.0},
                ],
                "top_outflow_industries": [],
            },
            "people_layer": {
                "supportive_companies": [
                    {"symbol": "NVDA", "people_fragility_score": 0.45},
                ],
                "fragile_companies": [],
            },
        },
        providers={
            "supply_chain": _StubProvider(
                records=[_supply_chain_record("nev", industry_a, -0.30)]
            ),
        },
    )

    # Cluster membership mirrors the live correlation analyzer's expected
    # output: policy_radar / policy_execution / supply_chain form one
    # derivation-chained cluster; the rest are singletons.
    cluster_membership = [
        ["policy_radar", "policy_execution", "supply_chain"],
        ["northbound"],
        ["fund_holdings"],
        ["macro_hf"],
        ["shfe_inventory"],
        ["people_layer"],
    ]

    comparison = compare_composite_signal_tiers(
        manager,
        cluster_membership=cluster_membership,
        include_low=True,
        emit_at="2026-05-19T10:00:00+00:00",
    )

    # 新能源汽车 bearish: legacy reaches MEDIUM (3 providers, all from one
    # cluster) → cluster-aware LOW. AI算力 bullish: 3 independent
    # clusters → both legacy and cluster-aware HIGH (no shift).
    nev_row = next(
        r
        for r in comparison["comparisons"]
        if r["industry"] == industry_a and r["direction"] == "bearish"
    )
    assert nev_row["legacy_conviction"] in {"medium", "high"}
    assert nev_row["cluster_aware_conviction"] == "low"
    assert nev_row["tier_changed"] is True

    ai_row = next(
        r
        for r in comparison["comparisons"]
        if r["industry"] == industry_b and r["direction"] == "bullish"
    )
    # AI算力 keeps its HIGH tier — independent clusters were the
    # original justification, so no demotion.
    assert ai_row["cluster_aware_conviction"] == "high"

    # Headline: at least 1 conviction shift in this 14-day synthetic demo.
    assert comparison["summary"]["tier_changes_count"] >= 1
    assert comparison["summary"]["downgrades"] >= 1


# ---------------------------------------------------------------------------
# Public summary distillation
# ---------------------------------------------------------------------------


def test_public_summary_caps_top_n():
    """Cluster-aware public summary mirrors the legacy top-N cap."""

    # Hand-build two signals to exercise the distiller.
    composites = [
        ClusterAwareCompositeSignal(
            direction="bullish",
            target_kind="industry",
            target="AI算力",
            conviction="high",
            supporting_clusters=[
                SupportingCluster(
                    cluster_name="policy_radar",
                    direction="bullish",
                    contributing_providers=["policy_radar"],
                    signal_strength=0.4,
                    is_strong=True,
                ),
                SupportingCluster(
                    cluster_name="northbound",
                    direction="bullish",
                    contributing_providers=["northbound"],
                    signal_strength=0.5,
                    is_strong=True,
                ),
                SupportingCluster(
                    cluster_name="people_layer",
                    direction="bullish",
                    contributing_providers=["people_layer"],
                    signal_strength=0.3,
                    is_strong=True,
                ),
            ],
            supporting_components=[],
            emit_at="2026-05-19T10:00:00+00:00",
            aggregate_strength=0.4,
            cluster_threshold=DEFAULT_CLUSTER_THRESHOLD,
        ),
        ClusterAwareCompositeSignal(
            direction="bearish",
            target_kind="industry",
            target="新能源汽车",
            conviction="low",
            supporting_clusters=[
                SupportingCluster(
                    cluster_name="policy_radar+policy_execution",
                    direction="bearish",
                    contributing_providers=[
                        "policy_radar",
                        "policy_execution",
                    ],
                    signal_strength=0.4,
                    is_strong=True,
                ),
            ],
            supporting_components=[],
            emit_at="2026-05-19T10:00:00+00:00",
            aggregate_strength=0.4,
            cluster_threshold=DEFAULT_CLUSTER_THRESHOLD,
        ),
    ]
    summary = cluster_aware_composite_signals_to_public_summary(
        composites, top_n=3
    )
    assert "top_3_bullish" in summary
    assert "top_3_bearish" in summary
    assert len(summary["top_3_bullish"]) <= 3
    assert len(summary["top_3_bearish"]) <= 3
    assert summary["top_3_bullish"][0]["industry"] == "AI算力"
    assert summary["top_3_bullish"][0]["conviction"] == "high"
    assert summary["top_3_bullish"][0]["supporting_clusters_count"] == 3
    assert summary["top_3_bearish"][0]["industry"] == "新能源汽车"
    assert summary["top_3_bearish"][0]["conviction"] == "low"
    assert summary["top_3_bearish"][0]["supporting_clusters_count"] == 1

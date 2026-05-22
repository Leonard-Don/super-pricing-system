"""Tests for the cross-provider correlation analyzer (Phase F7).

Pins the contract of
:func:`src.data.alternative.provider_correlation.compute_provider_correlation_matrix`
and the ``GET /alt-data/provider-correlation`` endpoint:

- Perfectly correlated synthetic providers → matrix shows ~1.0 →
  redundancy cluster groups them together.
- Perfectly independent providers → near-0 correlation → no clusters.
- Anti-correlated providers (r = -0.9...) → |r| > threshold so they
  still land in the same redundancy cluster (the analyzer counts
  absolute correlation, since echoing-with-sign-flip is still
  redundant information).
- Missing data (overlap < threshold) → NaN cells in matrix.
- Pearson and Spearman both computed and stored.
- Empty archives → structurally-valid NaN matrix with explanatory
  ``notes`` field, no crash.
- Endpoint shape: days_window query param respected, NaN serialised
  as ``null``, public_summary block present.
- ``correlation_matrix_to_public_summary`` returns the documented
  publication-safe shape.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import alt_data
from src.data.alternative.provider_correlation import (
    CorrelationMatrix,
    DEFAULT_DAYS_WINDOW,
    DEFAULT_PROVIDERS,
    MAX_DAYS_WINDOW,
    MIN_OVERLAPPING_OBSERVATIONS,
    REDUNDANCY_THRESHOLD,
    compute_provider_correlation_matrix,
    correlation_matrix_to_public_summary,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _utc_now() -> datetime:
    return datetime.now(tz=timezone.utc).replace(
        hour=12, minute=0, second=0, microsecond=0
    )


def _record(
    *,
    timestamp: datetime,
    source: str,
    industry: str,
    score: float,
    category: str = "policy",
) -> Dict[str, Any]:
    """Build one record payload mirroring the snapshot-store shape."""

    return {
        "record_id": f"{source}-{industry}-{timestamp.isoformat()}",
        "timestamp": timestamp.isoformat(),
        "source": source,
        "category": category,
        "raw_value": {
            "industry_impact": {industry: {"score": score, "impact": "neutral"}},
        },
        "normalized_score": float(score),
        "confidence": 0.8,
        "metadata": {},
        "tags": [industry],
    }


def _build_synthetic_records(
    *,
    industries: List[str],
    days: int,
    score_func,
    reference: datetime,
) -> List[Dict[str, Any]]:
    """Build N×industries records where score_func(day_idx, industry) → score."""

    records: List[Dict[str, Any]] = []
    for day_idx in range(days):
        ts = reference - timedelta(days=day_idx)
        for industry in industries:
            score = score_func(day_idx, industry)
            records.append(
                _record(
                    timestamp=ts,
                    source="synthetic",
                    industry=industry,
                    score=score,
                )
            )
    return records


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_perfectly_correlated_providers_land_in_same_cluster():
    """Two providers with identical signals → |r|=1.0 → same redundancy cluster."""

    reference = _utc_now()
    industries = ["AI算力", "电网", "新能源汽车", "光伏", "储能", "风电"]

    def score(day_idx: int, industry: str) -> float:
        # Deterministic but non-constant signal; same call across providers
        # yields identical vectors.
        return 0.3 * (day_idx % 5) + 0.1 * len(industry)

    shared_records = _build_synthetic_records(
        industries=industries,
        days=10,
        score_func=score,
        reference=reference,
    )

    matrix = compute_provider_correlation_matrix(
        days_window=30,
        provider_records={
            "policy_radar": shared_records,
            "policy_execution": list(shared_records),
        },
        providers=["policy_radar", "policy_execution"],
        now=reference,
    )

    # Diagonal trivially 1.0; off-diagonal must hit 1.0 too because
    # the two providers carry identical (industry, day) vectors.
    assert matrix.pearson_matrix[0, 1] == pytest.approx(1.0, abs=1e-6)
    assert matrix.pearson_matrix[1, 0] == pytest.approx(1.0, abs=1e-6)
    assert matrix.spearman_matrix[0, 1] == pytest.approx(1.0, abs=1e-6)
    # Same cluster.
    redundant_clusters = [c for c in matrix.redundancy_clusters if len(c) > 1]
    assert len(redundant_clusters) == 1
    assert redundant_clusters[0] == {"policy_radar", "policy_execution"}
    assert matrix.most_redundant_pair[0] in {"policy_radar", "policy_execution"}
    assert matrix.most_redundant_pair[1] in {"policy_radar", "policy_execution"}
    assert matrix.most_redundant_pair[2] == pytest.approx(1.0, abs=1e-6)


def test_independent_providers_have_low_correlation_and_no_clusters():
    """Uncorrelated synthetic signals → |r| ≪ threshold → all singleton clusters."""

    reference = _utc_now()
    industries = ["AI算力", "电网", "新能源汽车", "光伏", "储能", "风电"]

    def make_records(seed_offset: int) -> List[Dict[str, Any]]:
        local_rng = np.random.default_rng(seed=42 + seed_offset)
        out: List[Dict[str, Any]] = []
        for day_idx in range(20):
            ts = reference - timedelta(days=day_idx)
            for industry in industries:
                out.append(
                    _record(
                        timestamp=ts,
                        source=f"synth{seed_offset}",
                        industry=industry,
                        score=float(local_rng.normal(0.0, 0.5)),
                    )
                )
        return out

    matrix = compute_provider_correlation_matrix(
        days_window=60,
        provider_records={
            "policy_radar": make_records(0),
            "macro_hf": make_records(1),
            "people_layer": make_records(2),
        },
        providers=["policy_radar", "macro_hf", "people_layer"],
        now=reference,
    )

    # All off-diagonal Pearson values should be well below the
    # redundancy threshold (random signals, n=120 per provider so the
    # central limit theorem already pins ⟨|r|⟩ ≪ 0.85).
    for i in range(3):
        for j in range(3):
            if i == j:
                continue
            value = matrix.pearson_matrix[i, j]
            assert not np.isnan(value), f"({i},{j}) should not be NaN"
            assert abs(value) < REDUNDANCY_THRESHOLD, (
                f"random pair ({i},{j}) leaked above {REDUNDANCY_THRESHOLD}: {value}"
            )

    # No cluster has >1 member.
    assert all(len(c) == 1 for c in matrix.redundancy_clusters)
    assert matrix.most_independent_pair[0] != ""
    assert matrix.most_independent_pair[2] < 0.5


def test_anti_correlated_providers_also_cluster_as_redundant():
    """``|r|`` close to -1 still groups providers (sign-flip is redundancy)."""

    reference = _utc_now()
    industries = ["AI算力", "电网", "新能源汽车", "光伏", "储能", "风电"]

    base_records: List[Dict[str, Any]] = []
    flipped_records: List[Dict[str, Any]] = []
    for day_idx in range(15):
        ts = reference - timedelta(days=day_idx)
        for industry in industries:
            score = 0.4 * (day_idx % 7) - 0.3 * len(industry)
            base_records.append(
                _record(
                    timestamp=ts,
                    source="a",
                    industry=industry,
                    score=score,
                )
            )
            flipped_records.append(
                _record(
                    timestamp=ts,
                    source="b",
                    industry=industry,
                    score=-score,  # exact anti-correlation
                )
            )

    matrix = compute_provider_correlation_matrix(
        days_window=30,
        provider_records={
            "policy_radar": base_records,
            "northbound": flipped_records,
        },
        providers=["policy_radar", "northbound"],
        now=reference,
    )

    assert matrix.pearson_matrix[0, 1] == pytest.approx(-1.0, abs=1e-6)
    # |r| > threshold → both providers land in the same cluster.
    redundant_clusters = [
        c for c in matrix.redundancy_clusters if len(c) > 1
    ]
    assert len(redundant_clusters) == 1
    assert redundant_clusters[0] == {"policy_radar", "northbound"}


def test_missing_data_produces_nan_below_overlap_threshold():
    """Pairs with overlap < MIN_OVERLAPPING_OBSERVATIONS → NaN cells."""

    reference = _utc_now()

    # Provider A has 10 (industry, day) cells; provider B has 3 cells
    # that align with A's first 3 days — overlap = 3 < MIN floor (5).
    a_records = _build_synthetic_records(
        industries=["AI算力", "电网"],
        days=5,
        score_func=lambda d, ind: 0.2 * d,
        reference=reference,
    )
    b_records = [
        _record(
            timestamp=reference - timedelta(days=d),
            source="b",
            industry="AI算力",
            score=0.5,
        )
        for d in range(3)
    ]

    matrix = compute_provider_correlation_matrix(
        days_window=30,
        provider_records={
            "policy_radar": a_records,
            "macro_hf": b_records,
        },
        providers=["policy_radar", "macro_hf"],
        now=reference,
    )

    assert np.isnan(matrix.pearson_matrix[0, 1])
    assert np.isnan(matrix.spearman_matrix[0, 1])
    # n_overlap is reported even when below the floor.
    overlap = matrix.n_overlapping_observations[("policy_radar", "macro_hf")]
    assert overlap == 3
    assert overlap < MIN_OVERLAPPING_OBSERVATIONS


def test_pearson_and_spearman_both_computed_for_monotone_non_linear():
    """Monotone non-linear signals: Spearman ≈ 1, Pearson < 1."""

    reference = _utc_now()
    industries = ["AI算力", "电网", "新能源汽车", "光伏", "储能", "风电"]

    # Provider A signals scale linearly with day index; provider B's
    # signal is a monotone-but-non-linear transform (x^3) of A. Spearman
    # rank correlation should still be 1.0; Pearson is < 1.0 because
    # the relationship is non-linear (yet still strictly monotone).
    a_records: List[Dict[str, Any]] = []
    b_records: List[Dict[str, Any]] = []
    for day_idx in range(10):
        ts = reference - timedelta(days=day_idx)
        for ind_idx, industry in enumerate(industries):
            base = 0.05 * day_idx + 0.07 * ind_idx
            a_records.append(_record(
                timestamp=ts, source="a", industry=industry, score=base
            ))
            b_records.append(_record(
                timestamp=ts, source="b", industry=industry, score=base ** 3
            ))

    matrix = compute_provider_correlation_matrix(
        days_window=30,
        provider_records={
            "policy_radar": a_records,
            "supply_chain": b_records,
        },
        providers=["policy_radar", "supply_chain"],
        now=reference,
    )

    # Monotone → Spearman is exactly 1.0.
    assert matrix.spearman_matrix[0, 1] == pytest.approx(1.0, abs=1e-6)
    # Pearson is monotonically rising but < 1 because of the cubic curve.
    pearson_val = matrix.pearson_matrix[0, 1]
    assert 0.85 <= pearson_val < 1.0


def test_empty_archives_yield_structural_nan_matrix():
    """No records anywhere → matrix shape preserved, all off-diagonal NaN."""

    reference = _utc_now()
    matrix = compute_provider_correlation_matrix(
        days_window=30,
        provider_records={name: [] for name in DEFAULT_PROVIDERS},
        now=reference,
    )

    assert matrix.pearson_matrix.shape == (10, 10)
    assert matrix.spearman_matrix.shape == (10, 10)
    # Off-diagonal: every cell must be NaN.
    for i in range(10):
        for j in range(10):
            if i == j:
                continue
            assert np.isnan(matrix.pearson_matrix[i, j])

    # No redundancy clusters (each provider is its own singleton).
    assert all(len(c) == 1 for c in matrix.redundancy_clusters)
    assert len(matrix.redundancy_clusters) == 10
    assert matrix.most_independent_pair == ("", "", pytest.approx(float("nan"), nan_ok=True)) or np.isnan(
        matrix.most_independent_pair[2]
    )
    assert np.isnan(matrix.average_pairwise_correlation)
    # The notes field carries the data-quality story so a downstream
    # consumer doesn't need to inspect the overlap dict itself.
    assert "overlap floor" in matrix.notes.lower() or "structurally NaN" in matrix.notes


def test_correlation_matrix_to_public_summary_shape():
    """``correlation_matrix_to_public_summary`` returns the documented shape."""

    reference = _utc_now()
    industries = ["AI算力", "电网", "新能源汽车", "光伏", "储能", "风电"]
    shared_records = _build_synthetic_records(
        industries=industries,
        days=10,
        score_func=lambda d, ind: 0.3 * d,
        reference=reference,
    )

    matrix = compute_provider_correlation_matrix(
        days_window=30,
        provider_records={
            "policy_radar": shared_records,
            "policy_execution": list(shared_records),
            "macro_hf": [
                _record(
                    timestamp=reference - timedelta(days=d),
                    source="m",
                    industry="电网",
                    score=float((d % 3) - 1) * 0.5,
                )
                for d in range(8)
            ] * 2,  # widen to clear overlap floor against the AI/电网 cells
        },
        providers=["policy_radar", "policy_execution", "macro_hf"],
        now=reference,
    )

    summary = correlation_matrix_to_public_summary(matrix)
    assert set(summary.keys()) >= {
        "providers",
        "redundancy_clusters",
        "redundant_cluster_count",
        "independent_provider_count",
        "effective_provider_count",
        "most_independent_pair",
        "most_redundant_pair",
        "average_pairwise_correlation",
        "notes",
    }
    # 2-provider perfect-correlation cluster + macro_hf singleton.
    assert summary["effective_provider_count"] == 2
    assert summary["redundant_cluster_count"] == 1
    # most_redundant_pair carries the AI算力/电网-aligned providers at r=1.0.
    assert summary["most_redundant_pair"] is not None
    assert summary["most_redundant_pair"][2] == pytest.approx(1.0, abs=1e-6)


def test_endpoint_shape_and_days_window_clamp(monkeypatch):
    """``GET /alt-data/provider-correlation`` exposes the documented shape."""

    reference = _utc_now()
    industries = ["AI算力", "电网", "新能源汽车", "光伏", "储能"]

    def score(day_idx: int, industry: str) -> float:
        return 0.2 * day_idx + 0.05 * len(industry)

    shared_records = _build_synthetic_records(
        industries=industries,
        days=8,
        score_func=score,
        reference=reference,
    )

    def _compute(*, days_window: int):
        return compute_provider_correlation_matrix(
            days_window=days_window,
            provider_records={
                "policy_radar": shared_records,
                "policy_execution": list(shared_records),
            },
            providers=["policy_radar", "policy_execution"],
            now=reference,
        )

    monkeypatch.setattr(
        alt_data, "compute_provider_correlation_matrix", _compute
    )

    app = FastAPI()
    app.include_router(alt_data.router, prefix="/alt-data")
    client = TestClient(app)

    resp = client.get("/alt-data/provider-correlation")
    assert resp.status_code == 200
    payload = resp.json()
    assert set(payload.keys()) >= {
        "providers",
        "pearson_matrix",
        "spearman_matrix",
        "n_overlapping_observations",
        "redundancy_clusters",
        "most_independent_pair",
        "most_redundant_pair",
        "average_pairwise_correlation",
        "notes",
        "days_window",
        "public_summary",
        "audit_doc_url",
    }
    assert payload["days_window"] == DEFAULT_DAYS_WINDOW
    # 2x2 matrix; the off-diagonal cell carries the |r|=1.0 redundancy.
    pearson = payload["pearson_matrix"]
    assert len(pearson) == 2
    assert pearson[0][1] == pytest.approx(1.0, abs=1e-6)
    assert pearson[1][0] == pytest.approx(1.0, abs=1e-6)
    # public_summary carries the publication-safe distillation.
    assert payload["public_summary"]["effective_provider_count"] == 1
    assert payload["public_summary"]["redundant_cluster_count"] == 1

    # days_window upper-bound clamp via FastAPI's validator.
    resp_oversized = client.get(
        "/alt-data/provider-correlation",
        params={"days_window": MAX_DAYS_WINDOW + 5},
    )
    assert resp_oversized.status_code == 422

    # days_window lower-bound clamp.
    resp_zero = client.get(
        "/alt-data/provider-correlation",
        params={"days_window": 0},
    )
    assert resp_zero.status_code == 422


def test_heatmap_renderer_produces_png(tmp_path):
    """``render_correlation_heatmap`` writes a valid PNG even with NaN cells."""

    from src.data.alternative.render_correlation_heatmap import (
        render_correlation_heatmap,
    )

    providers = ["policy_radar", "policy_execution", "macro_hf"]
    pearson = np.array(
        [
            [1.0, 0.92, 0.15],
            [0.92, 1.0, 0.20],
            [0.15, 0.20, 1.0],
        ]
    )
    matrix = CorrelationMatrix(
        providers=providers,
        pearson_matrix=pearson,
        spearman_matrix=pearson * 0.95,
        n_overlapping_observations={(a, b): 8 for a in providers for b in providers},
        redundancy_clusters=[
            {"policy_radar", "policy_execution"},
            {"macro_hf"},
        ],
        most_independent_pair=("policy_radar", "macro_hf", 0.15),
        most_redundant_pair=("policy_radar", "policy_execution", 0.92),
        average_pairwise_correlation=0.42,
        notes="",
    )

    out = tmp_path / "heatmap.png"
    written = render_correlation_heatmap(matrix, output_path=out)
    assert written.exists()
    assert written.stat().st_size > 1024  # PNG header alone is < 1KB
    # PNG magic number sanity check so we don't accept e.g. a stray
    # tempfile in the output slot.
    with written.open("rb") as handle:
        assert handle.read(4) == b"\x89PNG"

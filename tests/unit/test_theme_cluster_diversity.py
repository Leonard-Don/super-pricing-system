"""Tests for the theme × cluster diversity scorer (Phase F9).

Pins the contract of
:func:`src.data.alternative.theme_cluster_diversity.compute_theme_diversity`,
:func:`enrich_themes_with_diversity`, and the new
``/alt-data/themes-with-diversity`` endpoint:

- A theme touching N providers all in 1 cluster → LOW tier, ratio
  ``1/N`` (the redundant-echo case the whole feature exists to make
  visible).
- A theme touching N providers in N distinct clusters → HIGH tier,
  ratio 1.0 (genuinely independent confirmation).
- A theme touching 4 providers in 2 clusters (3+1) → MEDIUM tier,
  dominant_cluster set to the 3-member cluster.
- Empty theme (no providers) → zero-counts payload, no crash.
- A provider missing from cluster_map → falls into its own singleton
  cluster (not silently dropped).
- ``enrich_themes_with_diversity`` resolves providers via the
  resolver callable when the theme record doesn't carry them
  directly, and merges the diversity payload under
  ``cluster_diversity``.
- Endpoint smoke test confirms the FastAPI shape with the documented
  fields (``themes``, ``diversity_summary``, ``cluster_membership``,
  etc.).
- Idempotency: same theme + cluster_map in → identical payload out.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import alt_data as alt_data_endpoint
from src.data.alternative.theme_cluster_diversity import (
    DIVERSITY_HIGH_THRESHOLD,
    DIVERSITY_MEDIUM_THRESHOLD,
    compute_theme_diversity,
    diversity_summary,
    enrich_themes_with_diversity,
    themes_diversity_to_public_summary,
)


# ---------------------------------------------------------------------------
# Stubs
# ---------------------------------------------------------------------------


class _FakeTheme:
    """Minimal theme stub carrying just ``providers`` + ``industry``.

    Mirrors the shape Phase F9 cares about while staying decoupled
    from :class:`CrossArchiveTheme`'s full schema.
    """

    def __init__(
        self,
        providers: Optional[List[str]] = None,
        *,
        industry: str = "",
        conviction: str = "medium",
    ):
        self.providers = list(providers or [])
        self.industry = industry
        self.conviction = conviction

    def to_dict(self) -> Dict[str, Any]:
        return {
            "industry": self.industry,
            "conviction": self.conviction,
            "providers": list(self.providers),
        }


# Canonical F7 clusters used across the test cases. Mirrors the
# real-data finding documented in the task spec:
# - policy_radar + policy_execution + narrative collapse (|r|=0.93)
# - fund_holdings + northbound collapse (|r|=0.86)
# Everything else is its own singleton.
_F7_CLUSTERS = [
    ["policy_radar", "policy_execution", "narrative"],
    ["fund_holdings", "northbound"],
    ["supply_chain"],
    ["macro_hf"],
    ["people_layer"],
    ["block_trades"],
    ["composite_signal"],
]


# ---------------------------------------------------------------------------
# Diversity-tier tests
# ---------------------------------------------------------------------------


def test_four_providers_one_cluster_emits_low_tier():
    """4 providers all in 1 redundancy cluster → LOW, ratio 0.25.

    This is THE case the diversity score is built for: a theme that
    looks like "4 provider confirmation" but is really one signal
    echoing through derivation-chained providers.
    """

    theme = _FakeTheme(
        providers=["policy_radar", "policy_execution", "narrative", "fund_holdings"],
        industry="copper",
    )
    cluster_map = [
        ["policy_radar", "policy_execution", "narrative", "fund_holdings"],
    ]
    result = compute_theme_diversity(theme, cluster_map)

    assert result["providers_count"] == 4
    assert result["clusters_count"] == 1
    assert result["diversity_ratio"] == 0.25
    assert result["diversity_tier"] == "LOW"
    assert result["dominant_cluster"] is not None
    # Breakdown carries all 4 providers under the single cluster.
    only_cluster = next(iter(result["cluster_breakdown"].values()))
    assert sorted(only_cluster) == [
        "fund_holdings",
        "narrative",
        "policy_execution",
        "policy_radar",
    ]


def test_four_providers_four_clusters_emits_high_tier():
    """4 providers in 4 distinct clusters → HIGH, ratio 1.0.

    The "genuinely diverse confirmation" case — the theme draws from
    four independent information sources.
    """

    theme = _FakeTheme(
        providers=["policy_radar", "fund_holdings", "supply_chain", "macro_hf"],
        industry="新能源汽车",
    )
    result = compute_theme_diversity(theme, _F7_CLUSTERS)

    assert result["providers_count"] == 4
    assert result["clusters_count"] == 4
    assert result["diversity_ratio"] == 1.0
    assert result["diversity_tier"] == "HIGH"
    # No cluster dominates when every cluster has exactly one provider.
    assert result["dominant_cluster"] is None
    assert len(result["cluster_breakdown"]) == 4


def test_four_providers_two_clusters_three_one_split_emits_medium_with_dominant():
    """4 providers, 2 clusters (3+1 split) → MEDIUM, dominant_cluster set.

    Three providers from the policy/narrative cluster + one from a
    different cluster. Diversity is 2/4 = 0.5, right on the MEDIUM
    floor; the policy/narrative cluster is the dominant contributor.
    """

    theme = _FakeTheme(
        providers=["policy_radar", "policy_execution", "narrative", "supply_chain"],
        industry="政策标的",
    )
    result = compute_theme_diversity(theme, _F7_CLUSTERS)

    assert result["providers_count"] == 4
    assert result["clusters_count"] == 2
    assert result["diversity_ratio"] == 0.5
    assert result["diversity_tier"] == "MEDIUM"
    # The 3-member cluster dominates over the 1-member one.
    dominant_members = result["cluster_breakdown"][result["dominant_cluster"]]
    assert sorted(dominant_members) == ["narrative", "policy_execution", "policy_radar"]


def test_empty_theme_handled_gracefully():
    """No providers → zero-counts payload, no crash.

    A theme that didn't pick up any provider attribution shouldn't
    take the diversity scorer down. Returns the structurally-valid
    zero shape with ``LOW`` tier (no attribution can't claim
    diversity).
    """

    theme = _FakeTheme(providers=[], industry="ghost")
    result = compute_theme_diversity(theme, _F7_CLUSTERS)

    assert result == {
        "providers_count": 0,
        "clusters_count": 0,
        "diversity_ratio": 0.0,
        "diversity_tier": "LOW",
        "cluster_breakdown": {},
        "dominant_cluster": None,
    }


def test_provider_missing_from_cluster_map_becomes_singleton():
    """A provider absent from cluster_map → its own singleton, not dropped.

    Mirrors Phase F8's fallback: with no evidence of redundancy, a
    provider is treated as an independent information source. Three
    providers in cluster A + one unknown provider should land as 2
    clusters (the known cluster + the unknown's singleton).
    """

    theme = _FakeTheme(
        providers=["policy_radar", "policy_execution", "narrative", "mystery_provider"],
        industry="x",
    )
    cluster_map = [["policy_radar", "policy_execution", "narrative"]]
    result = compute_theme_diversity(theme, cluster_map)

    # Three known providers + one singleton = 2 clusters total.
    assert result["clusters_count"] == 2
    assert result["providers_count"] == 4
    # The unknown provider's singleton is keyed by its own name.
    assert "mystery_provider" in result["cluster_breakdown"]
    assert result["cluster_breakdown"]["mystery_provider"] == ["mystery_provider"]


def test_cluster_map_dict_shape_works_in_addition_to_sequence():
    """The function accepts both list-of-clusters AND ``{provider: cid}`` dict.

    Phase F8's :func:`_build_provider_to_cluster_map` returns a flat
    dict; the F7 analyzer returns a list of sets. Both shapes must
    work without the caller having to convert.
    """

    providers = ["a", "b", "c", "d"]
    theme = _FakeTheme(providers=providers, industry="z")

    dict_map = {"a": "C1", "b": "C1", "c": "C2", "d": "C3"}
    result_from_dict = compute_theme_diversity(theme, dict_map)

    list_map = [["a", "b"], ["c"], ["d"]]
    result_from_list = compute_theme_diversity(theme, list_map)

    # Both shapes should compute the same counts (the cluster names
    # may differ — list shape uses ``a+b``; dict shape uses ``C1``).
    assert result_from_dict["providers_count"] == result_from_list["providers_count"]
    assert result_from_dict["clusters_count"] == result_from_list["clusters_count"]
    assert result_from_dict["diversity_ratio"] == result_from_list["diversity_ratio"]
    assert result_from_dict["diversity_tier"] == result_from_list["diversity_tier"]


def test_idempotent_same_input_same_output():
    """compute_theme_diversity is pure. Re-running yields identical output."""

    theme = _FakeTheme(
        providers=["a", "b", "c"], industry="x", conviction="high"
    )
    cluster_map = [["a", "b"], ["c"]]
    first = compute_theme_diversity(theme, cluster_map)
    second = compute_theme_diversity(theme, cluster_map)
    assert first == second


# ---------------------------------------------------------------------------
# Batch enrichment + resolver
# ---------------------------------------------------------------------------


def test_enrich_themes_with_diversity_uses_provided_resolver():
    """The resolver callable is consulted when supplied.

    ``CrossArchiveTheme`` doesn't carry provider attribution directly
    (it carries archives); the endpoint passes a resolver that maps a
    theme to its provider set via an industry → providers scan. Tests
    here use a synthetic resolver.
    """

    themes = [
        _FakeTheme(industry="copper", providers=["unused"]),
        _FakeTheme(industry="lithium", providers=["unused"]),
    ]
    industry_to_providers = {
        "copper": ["policy_radar", "policy_execution", "narrative"],
        "lithium": ["policy_radar", "fund_holdings", "supply_chain", "macro_hf"],
    }
    cluster_map = _F7_CLUSTERS

    def resolver(theme: Any) -> List[str]:
        return industry_to_providers.get(theme.industry, [])

    enriched = enrich_themes_with_diversity(
        themes, cluster_map, theme_providers_resolver=resolver
    )

    assert len(enriched) == 2
    # copper: 3 providers all in policy/narrative cluster → LOW
    copper = next(row for row in enriched if row["industry"] == "copper")
    assert copper["cluster_diversity"]["diversity_tier"] == "LOW"
    assert copper["cluster_diversity"]["providers_count"] == 3
    assert copper["providers"] == industry_to_providers["copper"]

    # lithium: 4 providers from 4 different clusters → HIGH
    lithium = next(row for row in enriched if row["industry"] == "lithium")
    assert lithium["cluster_diversity"]["diversity_tier"] == "HIGH"
    assert lithium["cluster_diversity"]["clusters_count"] == 4


def test_diversity_summary_counts_tiers_and_fractions():
    """diversity_summary tallies the HIGH/MEDIUM/LOW counts + fractions."""

    enriched = [
        {"cluster_diversity": {"diversity_tier": "HIGH"}},
        {"cluster_diversity": {"diversity_tier": "HIGH"}},
        {"cluster_diversity": {"diversity_tier": "MEDIUM"}},
        {"cluster_diversity": {"diversity_tier": "LOW"}},
    ]
    summary = diversity_summary(enriched)
    assert summary["total"] == 4
    assert summary["tier_counts"] == {"HIGH": 2, "MEDIUM": 1, "LOW": 1}
    assert summary["tier_fractions"]["HIGH"] == 0.5
    assert summary["tier_fractions"]["MEDIUM"] == 0.25
    assert summary["tier_fractions"]["LOW"] == 0.25


def test_themes_diversity_to_public_summary_buckets_top_n():
    """themes_diversity_to_public_summary buckets themes by tier + caps top-N."""

    enriched = [
        {
            "industry": f"high_{i}",
            "conviction": "high",
            "cluster_diversity": {
                "diversity_tier": "HIGH",
                "diversity_ratio": 1.0,
                "providers_count": 3,
                "clusters_count": 3,
                "dominant_cluster": None,
            },
        }
        for i in range(7)
    ] + [
        {
            "industry": "low_one",
            "conviction": "medium",
            "cluster_diversity": {
                "diversity_tier": "LOW",
                "diversity_ratio": 0.25,
                "providers_count": 4,
                "clusters_count": 1,
                "dominant_cluster": "abc",
            },
        }
    ]
    summary = themes_diversity_to_public_summary(enriched, top_n=3)
    assert summary["total"] == 8
    assert summary["tier_counts"]["HIGH"] == 7
    assert summary["tier_counts"]["LOW"] == 1
    # top_3_high_diversity capped at 3
    assert len(summary["top_3_high_diversity"]) == 3
    assert len(summary["top_3_low_diversity"]) == 1


# ---------------------------------------------------------------------------
# Endpoint smoke test
# ---------------------------------------------------------------------------


def test_themes_with_diversity_endpoint_returns_expected_shape(monkeypatch):
    """``GET /alt-data/themes-with-diversity`` returns the documented shape.

    We stub the cross-archive detector, the correlation analyzer, and
    the provider attribution scanner so the test doesn't depend on
    actual on-disk archives. Cluster membership is pinned to the F7
    real-data finding (policy_radar+policy_execution+narrative).
    """

    # Build a synthetic theme. We use a duck-typed object that
    # behaves like CrossArchiveTheme just enough for the endpoint code
    # path (industry + conviction + to_dict).
    class _StubTheme:
        def __init__(self, industry: str, conviction: str):
            self.industry = industry
            self.conviction = conviction

        def to_dict(self) -> Dict[str, Any]:
            return {
                "industry": self.industry,
                "conviction": self.conviction,
                "supporting_archives": ["narrative", "composite"],
            }

    fake_themes = [
        _StubTheme(industry="copper", conviction="high"),
        _StubTheme(industry="lithium", conviction="high"),
    ]

    fake_industry_to_providers = {
        "copper": ["policy_radar", "policy_execution", "narrative"],
        "lithium": ["policy_radar", "fund_holdings", "supply_chain", "macro_hf"],
    }

    # Stub the detector + the heavy provider-attribution scanner.
    monkeypatch.setattr(
        alt_data_endpoint,
        "detect_cross_archive_themes",
        lambda days_window: list(fake_themes),
    )
    monkeypatch.setattr(
        alt_data_endpoint,
        "build_industry_to_providers_map",
        lambda days_window: fake_industry_to_providers,
    )

    class _FakeMatrix:
        redundancy_clusters = [
            {"policy_radar", "policy_execution", "narrative"},
            {"fund_holdings", "northbound"},
            {"supply_chain"},
            {"macro_hf"},
        ]

    monkeypatch.setattr(
        alt_data_endpoint,
        "compute_provider_correlation_matrix",
        lambda days_window, redundancy_threshold: _FakeMatrix(),
    )

    app = FastAPI()
    app.include_router(alt_data_endpoint.router, prefix="/alt-data")
    client = TestClient(app)

    resp = client.get("/alt-data/themes-with-diversity?min_conviction=low")
    assert resp.status_code == 200
    body = resp.json()

    # Documented shape.
    assert "themes" in body
    assert "diversity_summary" in body
    assert "cluster_membership" in body
    assert "cluster_threshold" in body
    assert "public_summary" in body
    assert "min_providers" in body
    assert "days_window" in body

    # Per-theme enrichment carries the cluster_diversity field.
    assert len(body["themes"]) == 2
    first = body["themes"][0]
    assert "cluster_diversity" in first
    assert first["cluster_diversity"]["diversity_tier"] in {"HIGH", "MEDIUM", "LOW"}

    # The copper theme (3 providers all in policy cluster) → LOW.
    copper = next(t for t in body["themes"] if t["industry"] == "copper")
    assert copper["cluster_diversity"]["diversity_tier"] == "LOW"
    assert copper["cluster_diversity"]["providers_count"] == 3
    assert copper["cluster_diversity"]["clusters_count"] == 1

    # The lithium theme (4 providers from 4 clusters) → HIGH.
    lithium = next(t for t in body["themes"] if t["industry"] == "lithium")
    assert lithium["cluster_diversity"]["diversity_tier"] == "HIGH"
    assert lithium["cluster_diversity"]["providers_count"] == 4
    assert lithium["cluster_diversity"]["clusters_count"] == 4

    # Summary aggregates correctly.
    assert body["diversity_summary"]["tier_counts"]["LOW"] == 1
    assert body["diversity_summary"]["tier_counts"]["HIGH"] == 1
    assert body["diversity_summary"]["total"] == 2


def test_themes_with_diversity_endpoint_applies_min_providers_filter(monkeypatch):
    """``min_providers`` query param drops themes below the floor."""

    class _StubTheme:
        def __init__(self, industry: str):
            self.industry = industry
            self.conviction = "medium"

        def to_dict(self) -> Dict[str, Any]:
            return {"industry": self.industry, "conviction": self.conviction}

    fake_themes = [_StubTheme("solo"), _StubTheme("crowd")]
    fake_industry_to_providers = {
        "solo": ["policy_radar"],
        "crowd": ["policy_radar", "fund_holdings", "supply_chain"],
    }

    monkeypatch.setattr(
        alt_data_endpoint,
        "detect_cross_archive_themes",
        lambda days_window: list(fake_themes),
    )
    monkeypatch.setattr(
        alt_data_endpoint,
        "build_industry_to_providers_map",
        lambda days_window: fake_industry_to_providers,
    )

    class _FakeMatrix:
        redundancy_clusters = [
            ["policy_radar"],
            ["fund_holdings"],
            ["supply_chain"],
        ]

    monkeypatch.setattr(
        alt_data_endpoint,
        "compute_provider_correlation_matrix",
        lambda days_window, redundancy_threshold: _FakeMatrix(),
    )

    app = FastAPI()
    app.include_router(alt_data_endpoint.router, prefix="/alt-data")
    client = TestClient(app)

    resp = client.get("/alt-data/themes-with-diversity?min_providers=2")
    assert resp.status_code == 200
    body = resp.json()
    # solo (1 provider) filtered out; crowd (3 providers) remains.
    industries = [t["industry"] for t in body["themes"]]
    assert "solo" not in industries
    assert "crowd" in industries
    assert body["min_providers"] == 2


# ---------------------------------------------------------------------------
# Threshold constant guardrail — makes the tier definition self-documenting.
# ---------------------------------------------------------------------------


def test_threshold_constants_define_documented_tier_bands():
    """The diversity tier thresholds are the documented 0.75 / 0.5 floors."""

    assert DIVERSITY_HIGH_THRESHOLD == 0.75
    assert DIVERSITY_MEDIUM_THRESHOLD == 0.5

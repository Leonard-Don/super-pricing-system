"""Cluster-aware composite signal detector (Phase F8).

Extracted from ``composite_signal.py`` — zero-behavior-change relocation.

The legacy ``detect_composite_signals`` counts every contributing provider
as one independent vote. Phase F7 (provider correlation analyzer, commit
4427016) showed that some providers are not independent at all: when
``policy_radar`` derives from upstream policy text and ``policy_execution``
re-aggregates the same records by department, both will move in lockstep
(|r_pearson| > 0.85) and an apparent 3-provider agreement may secretly
be 1 cluster of derivation-chained providers + 1 unrelated source.

The cluster-aware detector imports the redundancy clusters from the
correlation analyzer and re-counts agreements per cluster, so "HIGH
conviction" now means **multiple independent information sources agree**,
not "many redundant providers fired the same wire". When the correlation
analyzer has insufficient overlap (a fresh deployment with sparse
archives), every provider falls into its own singleton cluster — which is
exactly the right fallback: with no evidence of redundancy, the
cluster-aware tier collapses to the legacy provider-vote tier.

Tier definitions for cluster-aware conviction:
  HIGH:   3+ distinct clusters agree AND aggregate strength clears 0.30
  MEDIUM: 2 distinct clusters agree
  LOW:    1 cluster (potentially many providers from that cluster)

Conflict skipping mirrors the legacy detector: if BOTH directions have
at least one cluster agreeing, no signal is emitted — downstream conflict
tracker is the correct surface for that.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .composite_signal import (
    SupportingComponent,
    _COMPONENT_READERS,
    _collect_target_industries,
    detect_composite_signals,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tuning constants
# ---------------------------------------------------------------------------

# Aggregate strength threshold a HIGH tier must clear (in addition to the
# 3-cluster floor). Keeps a single-strong-provider per-cluster pattern
# from accidentally being upgraded to HIGH.
CLUSTER_AWARE_HIGH_STRENGTH_FLOOR = 0.30

# Tier counts re-keyed for cluster-aware logic.
MIN_CLUSTERS_FOR_HIGH = 3
MIN_CLUSTERS_FOR_MEDIUM = 2
MIN_CLUSTERS_FOR_LOW = 1

# Default correlation matrix tunables passed through to the analyzer when
# the caller hasn't supplied an explicit matrix. ``cluster_threshold`` is
# parameterised on the public detector entry-point.
DEFAULT_CLUSTER_THRESHOLD = 0.85


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass
class SupportingCluster:
    """Per-cluster contribution to a cluster-aware composite signal.

    Mirrors :class:`~composite_signal.SupportingComponent` but represents an
    entire redundancy cluster's vote rather than one provider's vote. The
    cluster's signal strength is the **average** of its contributing
    providers' strengths (per-cluster strength is more honest than
    sum-of-strengths because the providers were redundant).
    """

    cluster_name: str
    direction: str  # "bullish" / "bearish"
    contributing_providers: List[str] = field(default_factory=list)
    signal_strength: float = 0.0
    is_strong: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "cluster_name": self.cluster_name,
            "direction": self.direction,
            "contributing_providers": list(self.contributing_providers),
            "contributing_provider_count": len(self.contributing_providers),
            "signal_strength": round(float(self.signal_strength), 4),
            "is_strong": bool(self.is_strong),
        }


@dataclass
class ClusterAwareCompositeSignal:
    """Cluster-aware cross-component composite signal (Phase F8).

    Same shape as :class:`~composite_signal.CompositeSignal` but with an
    additional ``supporting_clusters`` axis. Conviction is derived from the
    **cluster count**, not the provider count, so redundant providers no
    longer inflate the tier.
    """

    direction: str  # "bullish" / "bearish"
    target_kind: str  # "industry" / "ticker"
    target: str
    conviction: str  # "high" / "medium" / "low"
    supporting_clusters: List[SupportingCluster] = field(default_factory=list)
    supporting_components: List[SupportingComponent] = field(default_factory=list)
    emit_at: str = ""
    aggregate_strength: float = 0.0
    cluster_threshold: float = DEFAULT_CLUSTER_THRESHOLD

    def to_dict(self) -> Dict[str, Any]:
        return {
            "direction": self.direction,
            "target_kind": self.target_kind,
            "target": self.target,
            "conviction": self.conviction,
            "supporting_clusters": [
                cluster.to_dict() for cluster in self.supporting_clusters
            ],
            "supporting_clusters_count": len(self.supporting_clusters),
            "supporting_components": [
                component.to_dict() for component in self.supporting_components
            ],
            "supporting_components_count": len(self.supporting_components),
            "aggregate_strength": round(float(self.aggregate_strength), 4),
            "cluster_threshold": round(float(self.cluster_threshold), 4),
            "emit_at": self.emit_at,
        }


# ---------------------------------------------------------------------------
# Cluster infrastructure helpers
# ---------------------------------------------------------------------------


def _cluster_name_for_members(members: List[str]) -> str:
    """Build a stable, human-readable name for a cluster.

    A 1-member cluster's name is the provider name itself; a multi-member
    cluster's name is a "+"-joined sorted list of members so the same
    set of providers always yields the same cluster label across runs.
    """

    sorted_members = sorted(members)
    if len(sorted_members) == 1:
        return sorted_members[0]
    return "+".join(sorted_members)


def _build_provider_to_cluster_map(
    cluster_membership: Optional[List[List[str]]],
    known_providers: List[str],
) -> Dict[str, str]:
    """Resolve each provider to its cluster name.

    Providers absent from the input cluster membership land in their own
    singleton cluster. This is the "no evidence of redundancy → treat as
    independent" fallback the cluster analyzer itself uses.
    """

    provider_to_cluster: Dict[str, str] = {}
    seen_providers: set = set()
    if cluster_membership:
        for cluster in cluster_membership:
            if not cluster:
                continue
            name = _cluster_name_for_members(list(cluster))
            for provider in cluster:
                if not provider:
                    continue
                provider_to_cluster[provider] = name
                seen_providers.add(provider)

    # Any known provider missing from the membership goes into its own
    # singleton cluster keyed by its own name. This keeps the cluster
    # space partitioning total: every contributing provider can resolve
    # to exactly one cluster.
    for provider in known_providers:
        if provider not in seen_providers:
            provider_to_cluster.setdefault(provider, provider)

    return provider_to_cluster


def _classify_cluster_aware_conviction(
    cluster_count: int,
    aggregate_strength: float,
) -> str:
    """Cluster-aware tier mapping. See the module-level docstring."""

    if (
        cluster_count >= MIN_CLUSTERS_FOR_HIGH
        and aggregate_strength >= CLUSTER_AWARE_HIGH_STRENGTH_FLOOR
    ):
        return "high"
    if cluster_count >= MIN_CLUSTERS_FOR_MEDIUM:
        return "medium"
    return "low"


def _group_components_by_cluster(
    components: List[SupportingComponent],
    provider_to_cluster: Dict[str, str],
) -> List[SupportingCluster]:
    """Partition supporting components into per-cluster aggregations.

    For each cluster: average the contributing components' signal
    strengths; mark the cluster ``is_strong`` if *any* component within
    it is strong (the cluster-strength signal is "at least one source
    in this cluster is confident").
    """

    cluster_buckets: Dict[str, List[SupportingComponent]] = {}
    cluster_order: List[str] = []  # preserve first-seen order for determinism
    for component in components:
        cluster_name = provider_to_cluster.get(
            component.component, component.component
        )
        if cluster_name not in cluster_buckets:
            cluster_buckets[cluster_name] = []
            cluster_order.append(cluster_name)
        cluster_buckets[cluster_name].append(component)

    clusters: List[SupportingCluster] = []
    for cluster_name in cluster_order:
        bucket = cluster_buckets[cluster_name]
        if not bucket:
            continue
        # All contributions in a single bucket already share the same
        # direction (caller filtered by direction before invoking this
        # helper). Average the strengths and OR-aggregate is_strong.
        avg_strength = sum(c.signal_strength for c in bucket) / len(bucket)
        clusters.append(
            SupportingCluster(
                cluster_name=cluster_name,
                direction=bucket[0].direction,
                contributing_providers=[c.component for c in bucket],
                signal_strength=avg_strength,
                is_strong=any(c.is_strong for c in bucket),
            )
        )
    # Deterministic ordering: signal strength desc, cluster name asc
    clusters.sort(key=lambda c: (-c.signal_strength, c.cluster_name))
    return clusters


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def detect_composite_signals_cluster_aware(
    manager: Any,
    *,
    cluster_threshold: float = DEFAULT_CLUSTER_THRESHOLD,
    cluster_membership: Optional[List[List[str]]] = None,
    correlation_matrix: Any = None,
    days_window: int = 30,
    include_low: bool = False,
    emit_at: Optional[str] = None,
) -> List[ClusterAwareCompositeSignal]:
    """Synthesize cluster-aware composite signals from ``manager``.

    Unlike :func:`~composite_signal.detect_composite_signals` (which counts
    every contributing provider as one vote), this entry-point first resolves
    providers into **redundancy clusters** via the cross-provider
    correlation analyzer (commit 4427016) and counts *cluster* votes for
    each industry. ``policy_radar`` + ``policy_execution`` move in
    lockstep and collapse into 1 cluster-vote; a 3-provider agreement
    that's actually a single derivation chain emits LOW conviction, not
    MEDIUM.

    Parameters
    ----------
    manager:
        An ``AltDataManager`` (or duck-typed equivalent exposing
        ``latest_signals`` + ``providers``).
    cluster_threshold:
        ``|r_pearson|`` floor above which two providers collapse into
        one cluster. Defaults to :data:`DEFAULT_CLUSTER_THRESHOLD`
        (0.85); identical to the analyzer's default.
    cluster_membership:
        Optional pre-computed cluster membership list (list of provider
        lists). When supplied, the correlation analyzer is not invoked.
        Tests use this for deterministic synthetic input.
    correlation_matrix:
        Optional pre-computed ``CorrelationMatrix``-like object whose
        ``redundancy_clusters`` attribute provides the cluster
        membership. Used by the comparison endpoint to avoid running
        the analyzer twice per request.
    days_window:
        Lookback window passed through to the correlation analyzer when
        it's invoked. Ignored when cluster membership is supplied
        explicitly.
    include_low:
        When ``True``, surfaces 1-cluster (low-conviction) signals in
        addition to MEDIUM / HIGH.
    emit_at:
        Optional override for the timestamp. Defaults to current UTC.

    Returns
    -------
    list[ClusterAwareCompositeSignal]
        Sorted by conviction desc, aggregate strength desc, target asc.
        Idempotent for a given input snapshot + cluster membership.
    """

    if manager is None:
        return []

    timestamp = emit_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    industries = _collect_target_industries(manager)
    if not industries:
        return []

    known_providers = [name for name, _reader in _COMPONENT_READERS]
    # ``_resolve_cluster_membership`` lives in composite_signal so that tests
    # can monkeypatch it on that module's namespace. Import lazily to avoid a
    # circular import at module load time.
    import src.data.alternative.composite_signal as _cs_mod

    resolved_clusters = _cs_mod._resolve_cluster_membership(
        cluster_membership=cluster_membership,
        correlation_matrix=correlation_matrix,
        days_window=days_window,
        cluster_threshold=cluster_threshold,
    )
    provider_to_cluster = _build_provider_to_cluster_map(
        resolved_clusters, known_providers
    )

    out: List[ClusterAwareCompositeSignal] = []

    for industry in industries:
        contributions: List[SupportingComponent] = []
        for _name, reader in _COMPONENT_READERS:
            try:
                contribution = reader(manager, industry)
            except Exception:
                contribution = None
            if contribution is not None and contribution.direction in {
                "bullish",
                "bearish",
            }:
                contributions.append(contribution)

        if not contributions:
            continue

        bullish_components = [c for c in contributions if c.direction == "bullish"]
        bearish_components = [c for c in contributions if c.direction == "bearish"]

        bullish_clusters = _group_components_by_cluster(
            bullish_components, provider_to_cluster
        )
        bearish_clusters = _group_components_by_cluster(
            bearish_components, provider_to_cluster
        )

        # Conflict skip mirrors the legacy detector: if BOTH directions
        # clear the LOW floor (≥1 cluster vs ≥1 cluster in the
        # cluster-aware ruleset is too tight because singleton-cluster
        # fallback already makes 1 vote cheap), we wait until at least
        # one side reaches the MEDIUM floor before treating it as a
        # real conflict. This keeps a one-off contrarian vote from
        # cancelling a multi-cluster consensus.
        if (
            len(bullish_clusters) >= MIN_CLUSTERS_FOR_MEDIUM
            and len(bearish_clusters) >= MIN_CLUSTERS_FOR_MEDIUM
        ):
            continue

        for direction, dir_clusters, dir_components, opposing_clusters in (
            (
                "bullish",
                bullish_clusters,
                bullish_components,
                bearish_clusters,
            ),
            (
                "bearish",
                bearish_clusters,
                bearish_components,
                bullish_clusters,
            ),
        ):
            cluster_count = len(dir_clusters)
            if cluster_count < MIN_CLUSTERS_FOR_LOW:
                continue
            # Tie-break: the opposing side must have strictly fewer
            # clusters for this direction to emit. Equal cluster counts
            # mean the signal is genuinely contested and we defer to
            # the conflict tracker rather than emitting twice.
            if len(opposing_clusters) >= cluster_count:
                continue
            aggregate_strength = (
                sum(c.signal_strength for c in dir_clusters) / cluster_count
            )
            conviction = _classify_cluster_aware_conviction(
                cluster_count, aggregate_strength
            )
            if not include_low and conviction == "low":
                continue
            out.append(
                ClusterAwareCompositeSignal(
                    direction=direction,
                    target_kind="industry",
                    target=industry,
                    conviction=conviction,
                    supporting_clusters=list(dir_clusters),
                    supporting_components=list(dir_components),
                    emit_at=timestamp,
                    aggregate_strength=aggregate_strength,
                    cluster_threshold=cluster_threshold,
                )
            )

    conviction_rank = {"high": 3, "medium": 2, "low": 1}
    out.sort(
        key=lambda c: (
            -conviction_rank.get(c.conviction, 0),
            -c.aggregate_strength,
            c.target,
        )
    )
    return out


def cluster_aware_composite_signals_to_public_summary(
    composites: List[ClusterAwareCompositeSignal],
    *,
    top_n: int = 3,
) -> Dict[str, Any]:
    """Distill cluster-aware detector output for ``alt_data_summary.json``.

    Mirrors :func:`~composite_signal.composite_signals_to_public_summary`
    but surfaces the cluster-vote count (the headline cluster-aware figure)
    rather than the raw provider count.
    """

    def _row(c: ClusterAwareCompositeSignal) -> Dict[str, Any]:
        return {
            "industry": c.target,
            "direction": c.direction,
            "conviction": c.conviction,
            "supporting_clusters_count": len(c.supporting_clusters),
            "supporting_clusters": [
                cl.cluster_name for cl in c.supporting_clusters
            ],
            "supporting_components_count": len(c.supporting_components),
            "aggregate_strength": round(float(c.aggregate_strength), 4),
        }

    bullish = [c for c in composites if c.direction == "bullish"]
    bearish = [c for c in composites if c.direction == "bearish"]
    return {
        f"top_{top_n}_bullish": [_row(c) for c in bullish[:top_n]],
        f"top_{top_n}_bearish": [_row(c) for c in bearish[:top_n]],
        "total_bullish": len(bullish),
        "total_bearish": len(bearish),
    }


def compare_composite_signal_tiers(
    manager: Any,
    *,
    cluster_threshold: float = DEFAULT_CLUSTER_THRESHOLD,
    cluster_membership: Optional[List[List[str]]] = None,
    correlation_matrix: Any = None,
    days_window: int = 30,
    include_low: bool = True,
    emit_at: Optional[str] = None,
) -> Dict[str, Any]:
    """Side-by-side comparison of legacy vs cluster-aware conviction tiers.

    Returns a ``{comparisons, tier_changes, summary}`` payload where
    each comparison row is keyed by ``(industry, direction)`` and
    carries the legacy and cluster-aware conviction tiers. ``tier_changes``
    surfaces rows where the conviction tier moved (the most useful
    diagnostic).

    ``include_low`` defaults to ``True`` here so a HIGH → LOW shift
    (the most dramatic comparison case) still surfaces in the output.
    """

    from typing import Tuple

    from .composite_signal import CompositeSignal

    legacy = detect_composite_signals(
        manager, include_low=include_low, emit_at=emit_at
    )
    cluster_aware = detect_composite_signals_cluster_aware(
        manager,
        cluster_threshold=cluster_threshold,
        cluster_membership=cluster_membership,
        correlation_matrix=correlation_matrix,
        days_window=days_window,
        include_low=include_low,
        emit_at=emit_at,
    )

    legacy_index: Dict[Tuple[str, str], CompositeSignal] = {
        (c.target, c.direction): c for c in legacy
    }
    cluster_aware_index: Dict[Tuple[str, str], ClusterAwareCompositeSignal] = {
        (c.target, c.direction): c for c in cluster_aware
    }

    all_keys = sorted(
        set(legacy_index.keys()) | set(cluster_aware_index.keys())
    )
    rank = {"high": 3, "medium": 2, "low": 1, "": 0}

    comparisons: List[Dict[str, Any]] = []
    tier_changes: List[Dict[str, Any]] = []

    for target, direction in all_keys:
        legacy_signal = legacy_index.get((target, direction))
        cluster_aware_signal = cluster_aware_index.get((target, direction))

        legacy_conviction = legacy_signal.conviction if legacy_signal else ""
        cluster_aware_conviction = (
            cluster_aware_signal.conviction if cluster_aware_signal else ""
        )
        legacy_count = (
            len(legacy_signal.supporting_components) if legacy_signal else 0
        )
        cluster_aware_count = (
            len(cluster_aware_signal.supporting_clusters)
            if cluster_aware_signal
            else 0
        )

        row = {
            "industry": target,
            "direction": direction,
            "legacy_conviction": legacy_conviction,
            "cluster_aware_conviction": cluster_aware_conviction,
            "legacy_supporting_components_count": legacy_count,
            "cluster_aware_supporting_clusters_count": cluster_aware_count,
            "tier_changed": legacy_conviction != cluster_aware_conviction,
            "tier_delta": (
                rank.get(cluster_aware_conviction, 0)
                - rank.get(legacy_conviction, 0)
            ),
        }
        comparisons.append(row)
        if row["tier_changed"]:
            tier_changes.append(row)

    # Sort tier_changes so the most dramatic downgrades surface first
    # (largest negative delta = biggest demotion under cluster-aware).
    tier_changes.sort(
        key=lambda r: (
            r["tier_delta"],
            r["industry"],
            r["direction"],
        )
    )

    summary = {
        "legacy_total": len(legacy),
        "cluster_aware_total": len(cluster_aware),
        "tier_changes_count": len(tier_changes),
        "downgrades": sum(1 for r in tier_changes if r["tier_delta"] < 0),
        "upgrades": sum(1 for r in tier_changes if r["tier_delta"] > 0),
    }

    return {
        "comparisons": comparisons,
        "tier_changes": tier_changes,
        "summary": summary,
        "cluster_threshold": round(float(cluster_threshold), 4),
    }


__all__ = [
    "CLUSTER_AWARE_HIGH_STRENGTH_FLOOR",
    "ClusterAwareCompositeSignal",
    "DEFAULT_CLUSTER_THRESHOLD",
    "MIN_CLUSTERS_FOR_HIGH",
    "MIN_CLUSTERS_FOR_LOW",
    "MIN_CLUSTERS_FOR_MEDIUM",
    "SupportingCluster",
    "cluster_aware_composite_signals_to_public_summary",
    "compare_composite_signal_tiers",
    "detect_composite_signals_cluster_aware",
]

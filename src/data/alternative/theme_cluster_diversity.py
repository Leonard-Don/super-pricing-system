"""Theme × cluster diversity scorer (Phase F9).

Phase F6 (``cross_archive_themes.py``) detects themes that recur across
multiple archives over multiple days — "industries showing up on
narrative + composite + macro_briefing for ≥3 days each". Phase F7
(``provider_correlation.py``) showed that the 10 alt-data providers
collapse into 8 effective clusters under ``|r_pearson| > 0.85``
single-linkage; two notable redundancy clusters are
``policy_radar + policy_execution + narrative`` (|r| ≈ 0.93) and
``fund_holdings + northbound`` (|r| ≈ 0.86).

**The synthesis question Phase F9 answers**: a F6 theme touches a set
of providers (the providers whose snapshot store records mention the
theme's industry over the window). Are those providers genuinely
independent, or are they all from the same redundancy cluster? The
diversity score makes this visible:

- HIGH DIVERSITY: 4 providers from 4 different clusters → genuinely
  diverse confirmation; the theme is supported by independent
  information sources.
- LOW DIVERSITY: 4 providers all from one cluster → one signal
  echoing through derivation-chained providers; the apparent "4
  provider agreement" is really one source repeated.

The honest framing: this is **not** an upgrade to the theme detector's
existing HIGH/MEDIUM/LOW conviction tier (which counts archive×day
persistence). It's an **orthogonal** axis — the diversity score
answers "is the provider set diverse?" not "is the theme persistent?".
A HIGH-conviction theme with LOW diversity is a long-running signal
from one derivation chain. A MEDIUM-conviction theme with HIGH
diversity is a less persistent signal from multiple independent
sources. Both are real; the diversity score lets a consumer make the
distinction.

Synthesis is **strictly deterministic** — no LLM call, no network
I/O. The cluster_map is consumed verbatim (callers supply it from the
F7 analyzer); the diversity arithmetic is pure dict-counting. Same
theme + cluster_map in → same diversity payload out.

Module exposes:

- :func:`compute_theme_diversity` — diversity for one theme
- :func:`enrich_themes_with_diversity` — batch helper that resolves
  providers for each :class:`CrossArchiveTheme`, applies diversity,
  and returns the enriched records

See ``docs/alt_data_audit.md`` § 25 for the architecture writeup.
"""

from __future__ import annotations

from collections import defaultdict
import logging
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Diversity tier thresholds
# ---------------------------------------------------------------------------

# A theme is HIGH-diversity when ≥ 75% of its providers come from
# distinct clusters (e.g. 4 providers / 3+ clusters, or 3 / 3).
# MEDIUM is the in-between band; LOW means most providers collapse
# into a single cluster (e.g. 4 providers / 1 cluster = 0.25).
DIVERSITY_HIGH_THRESHOLD = 0.75
DIVERSITY_MEDIUM_THRESHOLD = 0.5


# ---------------------------------------------------------------------------
# Cluster-map normalisation
# ---------------------------------------------------------------------------


def _normalize_cluster_map(
    cluster_map: Any,
) -> Dict[str, str]:
    """Coerce the input cluster_map into a ``{provider: cluster_id}`` dict.

    Two shapes are accepted, mirroring how callers actually source the
    cluster membership in the rest of the codebase:

    1. ``Dict[str, str]`` — a flat ``provider → cluster_id`` map. Used
       internally by Phase F8's :func:`_build_provider_to_cluster_map`.
    2. ``Sequence[Sequence[str]]`` — a list of clusters where each
       inner sequence is the list of provider names in that cluster.
       Mirrors :attr:`CorrelationMatrix.redundancy_clusters`. Each
       cluster is keyed by a stable, deterministic name (sorted +
       ``+``-joined for multi-member clusters, the provider name
       itself for singletons), matching :func:`_cluster_name_for_members`
       in :mod:`src.data.alternative.composite_signal`.

    Returns an empty dict when the input is None / empty -- the caller
    must treat every provider as its own singleton cluster.
    """

    if cluster_map is None:
        return {}

    if isinstance(cluster_map, Mapping):
        return {
            str(provider): str(cluster_id)
            for provider, cluster_id in cluster_map.items()
            if provider
        }

    # Sequence-of-sequences shape: build the canonical cluster name
    # ourselves so a 1-member cluster's name is the provider name and
    # a multi-member cluster's name is a "+"-joined sorted list.
    out: Dict[str, str] = {}
    for cluster in cluster_map:
        if not cluster:
            continue
        members = sorted(str(m) for m in cluster if m)
        if not members:
            continue
        if len(members) == 1:
            cluster_name = members[0]
        else:
            cluster_name = "+".join(members)
        for provider in members:
            out[provider] = cluster_name
    return out


def _extract_theme_providers(theme: Any) -> List[str]:
    """Pull the set of provider names the theme touches.

    Two access patterns are tolerated:

    1. Theme has a ``providers`` attribute (any iterable of strings).
       The most flexible shape — tests use it directly.
    2. Theme has a ``providers`` key (dict-like access). Useful when
       the theme has already been serialized to a dict.

    Returns an empty list when no provider attribution can be found.
    The caller decides how to handle that (the empty-theme branch in
    :func:`compute_theme_diversity` returns a zero-counts payload
    rather than crashing).
    """

    candidate: Any = None
    if hasattr(theme, "providers"):
        candidate = getattr(theme, "providers")
    elif isinstance(theme, Mapping) and "providers" in theme:
        candidate = theme.get("providers")

    if candidate is None:
        return []

    if isinstance(candidate, str):
        # A bare string would degrade into a list of characters under
        # ``list(candidate)`` — guard explicitly so a single provider
        # name still works.
        return [candidate]

    if isinstance(candidate, Iterable):
        return [str(p) for p in candidate if p]

    return []


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def compute_theme_diversity(
    theme: Any,
    cluster_map: Any,
) -> Dict[str, Any]:
    """Compute the cluster diversity payload for one theme.

    Honest framing: this makes echo-confirmations visible. A theme
    touching 4 providers from 1 cluster is one signal repeated, not
    four independent confirmations. The diversity score (clusters /
    providers) is the headline figure; the breakdown lets the consumer
    see exactly which cluster is dominating.

    Parameters
    ----------
    theme:
        A theme record with a ``providers`` attribute or key (any
        iterable of provider name strings). When the theme has no
        provider attribution -- including the empty-set degenerate
        case -- a zero-counts payload is returned rather than crashing.
    cluster_map:
        Either a ``{provider: cluster_id}`` dict or a sequence of
        clusters (each cluster a sequence of provider names). When a
        provider is absent from the map it falls into its own
        singleton cluster keyed by the provider name -- mirroring the
        F8 detector's "no evidence of redundancy → treat as
        independent" fallback.

    Returns
    -------
    Dict[str, Any]
        Payload with the following fields:

        ``providers_count``
            Number of providers the theme touches.
        ``clusters_count``
            Number of distinct clusters the providers map into.
        ``diversity_ratio``
            ``clusters_count / providers_count``; 1.0 = maximum
            diversity (every provider in its own cluster), 0.25 = 4
            providers all in one cluster. ``0.0`` when the theme has
            no provider attribution.
        ``diversity_tier``
            ``"HIGH"`` when ``diversity_ratio >= 0.75``; ``"MEDIUM"``
            when ``>= 0.5``; ``"LOW"`` otherwise. Empty themes get the
            ``"LOW"`` tier — no provider attribution can't claim
            diversity. (The :data:`DIVERSITY_HIGH_THRESHOLD` /
            :data:`DIVERSITY_MEDIUM_THRESHOLD` constants are the
            source of truth; do not infer the band from the strings.)
        ``cluster_breakdown``
            ``{cluster_id: [provider names in that cluster]}``. Lets a
            consumer see which providers ended up in which cluster
            without re-running the lookup.
        ``dominant_cluster``
            The cluster id contributing the **most** providers; ``None``
            when no cluster strictly dominates (tied counts) or when
            the theme has no providers.
    """

    providers = _extract_theme_providers(theme)
    cmap = _normalize_cluster_map(cluster_map)

    if not providers:
        return {
            "providers_count": 0,
            "clusters_count": 0,
            "diversity_ratio": 0.0,
            "diversity_tier": "LOW",
            "cluster_breakdown": {},
            "dominant_cluster": None,
        }

    # Deduplicate while preserving order so the breakdown is stable
    # across runs even when the caller passes a duplicate-laden list.
    seen: set = set()
    unique_providers: List[str] = []
    for provider in providers:
        if provider in seen:
            continue
        seen.add(provider)
        unique_providers.append(provider)

    # Resolve each provider to its cluster id; absent providers fall
    # into a singleton cluster keyed by the provider name itself.
    cluster_breakdown: Dict[str, List[str]] = defaultdict(list)
    for provider in unique_providers:
        cluster_id = cmap.get(provider, provider)
        cluster_breakdown[cluster_id].append(provider)

    providers_count = len(unique_providers)
    clusters_count = len(cluster_breakdown)
    diversity_ratio = clusters_count / providers_count

    if diversity_ratio >= DIVERSITY_HIGH_THRESHOLD:
        tier = "HIGH"
    elif diversity_ratio >= DIVERSITY_MEDIUM_THRESHOLD:
        tier = "MEDIUM"
    else:
        tier = "LOW"

    # Dominant cluster = the one contributing strictly more providers
    # than any other. When two or more clusters tie for the top, no
    # cluster is dominant and we surface ``None`` rather than picking
    # arbitrarily.
    counts = sorted(
        ((len(members), cluster_id) for cluster_id, members in cluster_breakdown.items()),
        key=lambda item: (-item[0], item[1]),
    )
    if counts and (len(counts) == 1 or counts[0][0] > counts[1][0]):
        dominant_cluster: Optional[str] = counts[0][1]
    else:
        dominant_cluster = None

    return {
        "providers_count": providers_count,
        "clusters_count": clusters_count,
        "diversity_ratio": round(float(diversity_ratio), 4),
        "diversity_tier": tier,
        # Sort breakdown for deterministic output. Convert defaultdict
        # to plain dict so JSON encoding doesn't carry the factory.
        "cluster_breakdown": {
            cluster_id: sorted(members)
            for cluster_id, members in sorted(cluster_breakdown.items())
        },
        "dominant_cluster": dominant_cluster,
    }


def enrich_themes_with_diversity(
    themes: Sequence[Any],
    cluster_map: Any,
    *,
    theme_providers_resolver: Optional[Any] = None,
) -> List[Dict[str, Any]]:
    """Enrich a batch of themes with cluster diversity payloads.

    Each theme is serialized via its ``to_dict()`` method (when
    available, e.g. :class:`CrossArchiveTheme`) or used verbatim when
    it's already a dict. The diversity payload from
    :func:`compute_theme_diversity` is merged under the
    ``cluster_diversity`` key so the original theme fields stay intact.

    Parameters
    ----------
    themes:
        Iterable of theme records.
    cluster_map:
        Forwarded to :func:`compute_theme_diversity`.
    theme_providers_resolver:
        Optional callable ``(theme) -> Iterable[str]`` used when the
        theme record doesn't directly carry a ``providers`` field.
        The endpoint passes a resolver that maps the theme's industry
        + lookback window to the set of providers whose snapshot
        records mention that industry. When ``None``, providers are
        read off the theme record directly (whatever
        :func:`_extract_theme_providers` returns).

    Returns
    -------
    List[Dict[str, Any]]
        One enriched dict per input theme, preserving the input order.
    """

    enriched: List[Dict[str, Any]] = []
    for theme in themes:
        if hasattr(theme, "to_dict"):
            payload = dict(theme.to_dict())
        elif isinstance(theme, Mapping):
            payload = dict(theme)
        else:
            # Last-resort: serialize via __dict__ so we don't crash on
            # an unexpected shape. Test stubs may pass a plain object.
            payload = dict(getattr(theme, "__dict__", {}))

        if theme_providers_resolver is not None:
            try:
                resolved = list(theme_providers_resolver(theme) or [])
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning(
                    "Theme providers resolver raised on %r: %s", theme, exc
                )
                resolved = []
            # Surface the resolved providers on the payload so the
            # diversity computation can read them, and so downstream
            # consumers can see which providers the theme touched.
            payload["providers"] = list(resolved)

        diversity = compute_theme_diversity(payload, cluster_map)
        payload["cluster_diversity"] = diversity
        enriched.append(payload)

    return enriched


def build_industry_to_providers_map(
    *,
    days_window: int = 30,
    providers_dir: Optional[Any] = None,
    provider_records: Optional[Mapping[str, Sequence[Mapping[str, Any]]]] = None,
    now: Optional[Any] = None,
) -> Dict[str, List[str]]:
    """Scan provider snapshots and build ``{industry: [providers...]}``.

    Reuses the per-provider record loader + industry extractor from
    :mod:`src.data.alternative.provider_correlation` so the
    industry-vocabulary mapping stays consistent with the F7
    correlation analyzer. Providers whose snapshot file is missing
    (fresh deployment without that provider seeded) simply contribute
    nothing to the map -- no crash.

    Lazy-imports numpy via :mod:`provider_correlation`, mirroring the
    pattern Phase F8's :func:`_resolve_cluster_membership` uses. When
    numpy isn't available, returns an empty map rather than crashing
    the endpoint.

    Parameters
    ----------
    days_window
        Lookback window in days. Same semantics as the F7 analyzer's
        ``days_window`` parameter.
    providers_dir
        Optional directory containing ``<provider>.json`` snapshot
        files. Defaults to the canonical cache path.
    provider_records
        Optional explicit ``{provider → records}`` mapping that
        bypasses the on-disk loader. Tests use this for deterministic
        synthetic input.
    now
        Reference "now" for the day-window cutoff. Production passes
        ``None`` and gets the wall clock.

    Returns
    -------
    Dict[str, List[str]]
        Sorted ``industry → [provider names...]`` map. Each provider
        list is sorted lexicographically for deterministic output.
    """

    try:
        from datetime import datetime, timedelta, timezone

        from .provider_correlation import (  # noqa: F401 - lazy import
            DEFAULT_ALT_DATA_CACHE_DIR,
            DEFAULT_PROVIDERS,
            _load_provider_records,
            _record_industries,
            _parse_iso,
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "Failed to lazy-import provider_correlation for theme diversity "
            "resolver: %s",
            exc,
        )
        return {}

    days_window = max(int(days_window), 1)
    cutoff_now = now or datetime.now(tz=timezone.utc)
    if hasattr(cutoff_now, "tzinfo") and cutoff_now.tzinfo is None:
        cutoff_now = cutoff_now.replace(tzinfo=timezone.utc)
    cutoff = cutoff_now - timedelta(days=days_window)

    snapshots_dir = providers_dir or (DEFAULT_ALT_DATA_CACHE_DIR / "providers")
    industry_to_providers: Dict[str, set] = defaultdict(set)
    for provider in DEFAULT_PROVIDERS:
        if provider_records is not None:
            records = list(provider_records.get(provider, []) or [])
        else:
            try:
                records = _load_provider_records(
                    provider, providers_dir=snapshots_dir
                )
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning(
                    "Failed to load provider %s snapshot for theme diversity "
                    "resolver: %s",
                    provider,
                    exc,
                )
                records = []

        for record in records:
            try:
                ts = _parse_iso(record.get("timestamp"))
            except Exception:
                ts = None
            if ts is None or ts < cutoff:
                continue
            for industry in _record_industries(record):
                if industry:
                    industry_to_providers[industry].add(provider)

    return {
        industry: sorted(providers)
        for industry, providers in sorted(industry_to_providers.items())
    }


def themes_diversity_to_public_summary(
    enriched_themes: Sequence[Mapping[str, Any]],
    *,
    top_n: int = 5,
) -> Dict[str, Any]:
    """Distill a batch of enriched themes for ``alt_data_summary.json``.

    Returns the tier summary + top-N HIGH/MEDIUM/LOW diversity themes
    in the publication-safe shape (only industry, conviction, tier,
    ratio, dominant cluster). The full provider lists stay private to
    the live endpoint.
    """

    summary = diversity_summary(enriched_themes)

    def _row(theme: Mapping[str, Any]) -> Dict[str, Any]:
        diversity = theme.get("cluster_diversity") or {}
        return {
            "industry": theme.get("industry") or "",
            "conviction": theme.get("conviction") or "",
            "diversity_tier": diversity.get("diversity_tier") or "LOW",
            "diversity_ratio": diversity.get("diversity_ratio") or 0.0,
            "providers_count": diversity.get("providers_count") or 0,
            "clusters_count": diversity.get("clusters_count") or 0,
            "dominant_cluster": diversity.get("dominant_cluster"),
        }

    buckets: Dict[str, List[Dict[str, Any]]] = {"HIGH": [], "MEDIUM": [], "LOW": []}
    for theme in enriched_themes:
        diversity = theme.get("cluster_diversity") or {}
        tier = diversity.get("diversity_tier") or "LOW"
        if tier in buckets and len(buckets[tier]) < top_n:
            buckets[tier].append(_row(theme))

    return {
        **summary,
        f"top_{top_n}_high_diversity": buckets["HIGH"],
        f"top_{top_n}_medium_diversity": buckets["MEDIUM"],
        f"top_{top_n}_low_diversity": buckets["LOW"],
    }


def diversity_summary(
    enriched_themes: Sequence[Mapping[str, Any]],
) -> Dict[str, Any]:
    """Tier-count summary across a batch of enriched themes.

    Returns a ``{HIGH, MEDIUM, LOW, total}`` count payload + the
    fraction of themes in each tier. Used by the endpoint /
    public-summary distillation to surface "what % of themes are
    HIGH/MEDIUM/LOW diversity" without making the caller iterate.
    """

    tier_counts: Dict[str, int] = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
    total = 0
    for theme in enriched_themes:
        diversity = theme.get("cluster_diversity") or {}
        tier = diversity.get("diversity_tier") or "LOW"
        tier_counts[tier] = tier_counts.get(tier, 0) + 1
        total += 1

    tier_fractions: Dict[str, Optional[float]] = {}
    for tier, count in tier_counts.items():
        tier_fractions[tier] = (
            round(count / total, 4) if total else None
        )

    return {
        "total": total,
        "tier_counts": tier_counts,
        "tier_fractions": tier_fractions,
    }


__all__ = [
    "DIVERSITY_HIGH_THRESHOLD",
    "DIVERSITY_MEDIUM_THRESHOLD",
    "build_industry_to_providers_map",
    "compute_theme_diversity",
    "diversity_summary",
    "enrich_themes_with_diversity",
    "themes_diversity_to_public_summary",
]

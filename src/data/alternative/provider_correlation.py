"""Cross-provider signal correlation analyzer (Phase F7).

The platform now ships 10 alt-data providers — but **no one has measured
whether they actually carry independent information**. If
``policy_radar`` and ``policy_execution`` move in lockstep (the latter
derives directly from the former) the "10 providers" headline is
misleading: it is effectively 7-8 independent sources. This module
answers the question quantitatively.

For each provider we extract a **per-industry per-day signed strength
vector** from the snapshot store records (``cache/alt_data/providers/
*.json``), align on ``(industry, utc-day)`` keys, and compute pairwise
**Pearson** and **Spearman** correlations across every pair of
providers. Industries pin the cross-sectional axis (the question is
"do the providers agree on which industries are hot?"); the UTC day
pins the time axis (the question is "do they agree on when?"). Pairs
with fewer than :data:`MIN_OVERLAPPING_OBSERVATIONS` aligned points
emit ``NaN`` rather than a noisy correlation -- low-coverage cells are
honestly empty, not falsely uncorrelated.

The output is a :class:`CorrelationMatrix` dataclass that the
``GET /alt-data/provider-correlation`` endpoint, the
``render_correlation_heatmap.py`` visualizer, and the public summary
export all consume. Redundancy clusters are built by single-linkage
on ``|r_pearson| > REDUNDANCY_THRESHOLD`` so any pair of providers
that move together with |r| > 0.85 collapse into one cluster -- which
is what we ultimately care about when re-stating "independent provider
count".

Synthesis is **strictly deterministic** -- numpy + scipy only, no
network I/O, no LLM call. Same archives in → same matrix out (modulo
the floating-point determinism that ``scipy.stats.pearsonr`` /
``spearmanr`` already provide). Empty archives yield a ``NaN`` matrix
with the structural fields populated; we don't fabricate correlations
out of thin air.

See ``docs/alt_data_audit.md`` § 23 for the architecture writeup.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
import json
import logging
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

import numpy as np

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tuning constants
# ---------------------------------------------------------------------------

# Canonical list of the 10 alt-data providers exposed by the platform.
# Ordering is the source of truth for matrix rows/columns -- changing
# this list is a breaking change to the public-summary contract.
DEFAULT_PROVIDERS: Tuple[str, ...] = (
    "policy_radar",
    "policy_execution",
    "supply_chain",
    "macro_hf",
    "people_layer",
    "fund_holdings",
    "northbound",
    "block_trades",
    "narrative",
    "composite_signal",
)

# Default lookback window. 30 days balances "enough overlap for a
# stable correlation" against "narrow enough to reflect current
# coupling between providers, not historical archived joins".
DEFAULT_DAYS_WINDOW = 30

# Hard upper bound -- mirrors the per-archive ``ARCHIVE_MAX_DAYS_WINDOW``
# clamp so the FastAPI layer can validate identically.
MAX_DAYS_WINDOW = 365

# Minimum number of aligned ``(industry, utc-day)`` observations
# required for a correlation to be reported. Below this floor we emit
# NaN instead of a noisy estimate. Pearson/Spearman with n=3 is too
# noisy to be meaningfully interpreted; n=5 is the field-standard
# floor for "OK, this is not pure coincidence".
MIN_OVERLAPPING_OBSERVATIONS = 5

# Pearson |r| threshold above which two providers are deemed
# **redundant** and collapsed into one cluster. 0.85 is the
# field-standard cut for "strongly correlated" -- below this two
# providers can still carry independent residual information; above,
# the second provider's incremental information content is < 15%.
REDUNDANCY_THRESHOLD = 0.85


# ---------------------------------------------------------------------------
# Output dataclass
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CorrelationMatrix:
    """Pairwise correlation matrix across alt-data providers.

    Attributes
    ----------
    providers
        Ordered list of provider names; matrix row/column indices map
        1:1 to this list.
    pearson_matrix
        ``(N, N)`` matrix of Pearson correlations on the aligned
        ``(industry, utc-day) → signed strength`` vectors. Cells with
        fewer than :data:`MIN_OVERLAPPING_OBSERVATIONS` aligned points
        are ``NaN``.
    spearman_matrix
        ``(N, N)`` matrix of Spearman rank correlations on the same
        aligned vectors. Robust to non-linear monotone relationships
        and outliers; useful sanity check on the Pearson cells.
    n_overlapping_observations
        Dict keyed by ``(provider_a, provider_b)`` tuple (sorted) →
        number of aligned ``(industry, utc-day)`` cells contributed to
        the correlation. Tuples with the same name on both sides
        report the provider's own coverage count.
    redundancy_clusters
        List of provider-name sets, each cluster containing providers
        connected by ``|r_pearson| > REDUNDANCY_THRESHOLD`` under
        single-linkage. Singleton providers (no redundant peer) are
        included as 1-element sets so the cluster list partitions the
        full provider population.
    most_independent_pair
        ``(provider_a, provider_b, |r|)`` for the pair with the
        **lowest** absolute Pearson correlation among pairs that have
        ≥ :data:`MIN_OVERLAPPING_OBSERVATIONS` aligned points. Empty
        tuple ``("", "", float("nan"))`` when no eligible pair exists.
    most_redundant_pair
        ``(provider_a, provider_b, |r|)`` for the pair with the
        **highest** absolute Pearson correlation among eligible pairs.
        Empty tuple when no eligible pair exists.
    average_pairwise_correlation
        Mean of ``|r_pearson|`` across all eligible off-diagonal
        pairs. ``NaN`` when no eligible pair exists.
    notes
        Free-text annotation describing data conditions (e.g. "sparse
        archives -- only N pairs cleared the overlap floor"). Empty
        string in the well-populated case.
    """

    providers: List[str]
    pearson_matrix: np.ndarray
    spearman_matrix: np.ndarray
    n_overlapping_observations: Dict[Tuple[str, str], int]
    redundancy_clusters: List[Set[str]] = field(default_factory=list)
    most_independent_pair: Tuple[str, str, float] = ("", "", float("nan"))
    most_redundant_pair: Tuple[str, str, float] = ("", "", float("nan"))
    average_pairwise_correlation: float = float("nan")
    notes: str = ""

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for the FastAPI response / public summary.

        ``numpy.ndarray`` is unrolled into nested lists with ``NaN``
        coerced to ``None`` so the JSON encoder doesn't choke. Tuple
        keys on ``n_overlapping_observations`` are flattened to
        ``"a|b"`` strings since JSON dicts only allow string keys.
        """

        def _matrix_to_list(matrix: np.ndarray) -> List[List[Any]]:
            rows: List[List[Any]] = []
            for row in matrix.tolist():
                rendered_row: List[Any] = []
                for value in row:
                    if value is None or (
                        isinstance(value, float) and np.isnan(value)
                    ):
                        rendered_row.append(None)
                    else:
                        rendered_row.append(round(float(value), 4))
                rows.append(rendered_row)
            return rows

        def _round_or_nan(value: float) -> Optional[float]:
            if value is None or (
                isinstance(value, float) and np.isnan(value)
            ):
                return None
            return round(float(value), 4)

        n_overlap_serialized = {
            f"{a}|{b}": int(count)
            for (a, b), count in self.n_overlapping_observations.items()
        }
        clusters_serialized = [
            sorted(cluster) for cluster in self.redundancy_clusters
        ]

        return {
            "providers": list(self.providers),
            "pearson_matrix": _matrix_to_list(self.pearson_matrix),
            "spearman_matrix": _matrix_to_list(self.spearman_matrix),
            "n_overlapping_observations": n_overlap_serialized,
            "redundancy_clusters": clusters_serialized,
            "most_independent_pair": (
                [
                    self.most_independent_pair[0],
                    self.most_independent_pair[1],
                    _round_or_nan(self.most_independent_pair[2]),
                ]
                if self.most_independent_pair[0]
                else None
            ),
            "most_redundant_pair": (
                [
                    self.most_redundant_pair[0],
                    self.most_redundant_pair[1],
                    _round_or_nan(self.most_redundant_pair[2]),
                ]
                if self.most_redundant_pair[0]
                else None
            ),
            "average_pairwise_correlation": _round_or_nan(
                self.average_pairwise_correlation
            ),
            "notes": self.notes,
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_iso(value: Any) -> Optional[datetime]:
    """Parse an ISO-8601 timestamp; tolerates ``Z`` suffix and naive strings."""

    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _record_industries(record: Dict[str, Any]) -> Set[str]:
    """Industries referenced by one snapshot record.

    Three signals stack here, mirroring the cross-archive theme
    detector's industry extraction:

    1. Explicit ``tags`` list (when the provider stamped one).
    2. ``raw_value.industry_impact`` keys (policy_radar's primary
       industry-attribution surface).
    3. ``raw_value.industry`` / ``raw_value.target`` scalar fields
       (some providers carry a single industry hint).

    Industries are returned as the raw string; the caller is responsible
    for filtering against ``KNOWN_INDUSTRIES`` if a canonical set is
    needed. Returning raw strings lets the analyzer handle provider-
    specific industry vocabularies (e.g. ``macro_hf`` keys by metal
    rather than industry).
    """

    found: Set[str] = set()
    tags = record.get("tags") or []
    if isinstance(tags, (list, tuple)):
        for tag in tags:
            if tag and isinstance(tag, str):
                found.add(tag.strip())

    raw_value = record.get("raw_value") or {}
    if isinstance(raw_value, dict):
        industry_impact = raw_value.get("industry_impact") or {}
        if isinstance(industry_impact, dict):
            for industry in industry_impact.keys():
                if industry and isinstance(industry, str):
                    found.add(industry.strip())

        for key in ("industry", "target", "industry_id", "company"):
            value = raw_value.get(key)
            if value and isinstance(value, str):
                found.add(value.strip())

    return {industry for industry in found if industry}


def _record_signal_strength(record: Dict[str, Any]) -> float:
    """Extract the signed signal strength from one snapshot record.

    We prefer ``normalized_score`` (already on [-1, 1]); fall back to
    ``raw_value.score`` / ``raw_value.policy_shift`` / ``raw_value.avg_impact``
    when the top-level normalised score is missing or zero (some
    providers emit 0.0 by default and store the real value in the
    raw payload).
    """

    score = record.get("normalized_score")
    if isinstance(score, (int, float)) and not np.isnan(float(score)):
        return float(score)

    raw_value = record.get("raw_value") or {}
    if isinstance(raw_value, dict):
        for key in ("score", "avg_impact", "policy_shift", "impact"):
            value = raw_value.get(key)
            if isinstance(value, (int, float)) and not np.isnan(float(value)):
                return float(value)

    return 0.0


def _records_to_industry_day_signal(
    records: Iterable[Dict[str, Any]],
    *,
    cutoff: Optional[datetime] = None,
) -> Dict[Tuple[str, str], float]:
    """Aggregate a stream of records into ``(industry, utc-day) → mean signal``.

    Multiple records on the same ``(industry, utc-day)`` cell are
    averaged. Records older than ``cutoff`` are dropped. Records with
    no industry attribution are skipped entirely (the analyzer is
    industry-cross-sectional; rows with no industry axis can't
    participate).
    """

    aggregated: Dict[Tuple[str, str], List[float]] = defaultdict(list)
    for record in records:
        timestamp = _parse_iso(record.get("timestamp"))
        if timestamp is None:
            continue
        if cutoff is not None and timestamp < cutoff:
            continue
        utc_day = timestamp.astimezone(timezone.utc).date().isoformat()
        industries = _record_industries(record)
        if not industries:
            continue
        signal = _record_signal_strength(record)
        for industry in industries:
            aggregated[(industry, utc_day)].append(signal)

    return {
        key: float(np.mean(values))
        for key, values in aggregated.items()
        if values
    }


def _pearson(x: np.ndarray, y: np.ndarray) -> float:
    """Pearson correlation with explicit constant-input guard.

    ``numpy.corrcoef`` emits ``NaN`` for constant inputs but also a
    runtime warning that hammers the test logs. We short-circuit on
    zero variance.
    """

    if x.size < 2 or y.size < 2:
        return float("nan")
    if np.std(x) == 0.0 or np.std(y) == 0.0:
        return float("nan")
    with np.errstate(invalid="ignore"):
        coef = np.corrcoef(x, y)[0, 1]
    if np.isnan(coef):
        return float("nan")
    return float(coef)


def _rankdata(values: np.ndarray) -> np.ndarray:
    """Mid-rank ranking (ties get the average rank).

    Self-contained so we don't pull in ``scipy.stats.rankdata`` for a
    100-line analyzer. Field-standard average ranking, matches
    ``scipy.stats.spearmanr`` for tie-handling.
    """

    sorted_indices = np.argsort(values, kind="mergesort")
    ranks = np.empty_like(values, dtype=float)
    ranks[sorted_indices] = np.arange(1, len(values) + 1)
    # Average ranks within tie groups.
    n = len(values)
    i = 0
    while i < n:
        j = i + 1
        while j < n and values[sorted_indices[j]] == values[sorted_indices[i]]:
            j += 1
        if j - i > 1:
            avg = (ranks[sorted_indices[i]] + ranks[sorted_indices[j - 1]]) / 2.0
            for k in range(i, j):
                ranks[sorted_indices[k]] = avg
        i = j
    return ranks


def _spearman(x: np.ndarray, y: np.ndarray) -> float:
    """Spearman rank correlation = Pearson on the rank-transformed series."""

    if x.size < 2 or y.size < 2:
        return float("nan")
    return _pearson(_rankdata(x), _rankdata(y))


def _build_redundancy_clusters(
    providers: List[str],
    pearson_matrix: np.ndarray,
    threshold: float,
) -> List[Set[str]]:
    """Single-linkage clusters on ``|r_pearson| > threshold``.

    Two providers fall in the same cluster when their absolute Pearson
    correlation exceeds ``threshold``. The clustering is transitive
    (A↔B and B↔C ⇒ A, B, C in one cluster). Singletons land as
    1-element sets so the cluster list partitions the full provider
    population.
    """

    n = len(providers)
    # Union-find structure indexed by provider position.
    parent = list(range(n))

    def find(node: int) -> int:
        while parent[node] != node:
            parent[node] = parent[parent[node]]
            node = parent[node]
        return node

    def union(a: int, b: int) -> None:
        root_a, root_b = find(a), find(b)
        if root_a != root_b:
            parent[root_b] = root_a

    for i in range(n):
        for j in range(i + 1, n):
            value = pearson_matrix[i, j]
            if isinstance(value, float) and np.isnan(value):
                continue
            if abs(float(value)) > threshold:
                union(i, j)

    groups: Dict[int, Set[str]] = defaultdict(set)
    for idx, provider in enumerate(providers):
        groups[find(idx)].add(provider)

    # Sort clusters by size desc, then by lexicographic min member to keep
    # output deterministic across runs.
    return sorted(
        list(groups.values()),
        key=lambda cluster: (-len(cluster), sorted(cluster)[0] if cluster else ""),
    )


# ---------------------------------------------------------------------------
# Snapshot loading
# ---------------------------------------------------------------------------


DEFAULT_ALT_DATA_CACHE_DIR = Path(__file__).resolve().parents[3] / "cache" / "alt_data"


def _load_provider_records(
    provider: str,
    *,
    providers_dir: Path,
) -> List[Dict[str, Any]]:
    """Load raw records for one provider from its on-disk snapshot.

    Returns an empty list when the snapshot is absent, malformed, or
    carries no records -- the analyzer must degrade quietly so a fresh
    deployment still produces a structural (NaN-filled) matrix.
    """

    path = providers_dir / f"{provider}.json"
    if not path.exists():
        return []
    try:
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning(
            "Failed to read provider snapshot %s: %s", path, exc
        )
        return []
    records = payload.get("records")
    if not isinstance(records, list):
        return []
    return [r for r in records if isinstance(r, dict)]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def compute_provider_correlation_matrix(
    *,
    days_window: int = DEFAULT_DAYS_WINDOW,
    providers: Optional[List[str]] = None,
    providers_dir: Optional[Path] = None,
    provider_records: Optional[Dict[str, List[Dict[str, Any]]]] = None,
    now: Optional[datetime] = None,
    redundancy_threshold: float = REDUNDANCY_THRESHOLD,
    min_overlapping_observations: int = MIN_OVERLAPPING_OBSERVATIONS,
) -> CorrelationMatrix:
    """Compute pairwise Pearson + Spearman correlations across providers.

    Parameters
    ----------
    days_window
        Lookback window in days. Clamped to ``[1, MAX_DAYS_WINDOW]``.
    providers
        Optional explicit provider list. Defaults to
        :data:`DEFAULT_PROVIDERS` (the canonical 10 providers).
    providers_dir
        Directory containing ``<provider>.json`` snapshot files.
        Defaults to ``cache/alt_data/providers/``. Tests typically
        pass ``tmp_path`` here.
    provider_records
        Optional explicit ``{provider → records list}`` mapping that
        bypasses the on-disk loader entirely. Tests use this for
        deterministic synthetic input.
    now
        Reference "now" for the day-window cutoff. Production passes
        ``None`` and gets the wall clock.
    redundancy_threshold
        ``|r_pearson|`` floor above which two providers are deemed
        redundant. Defaults to :data:`REDUNDANCY_THRESHOLD`.
    min_overlapping_observations
        Minimum overlap floor for a correlation to be reported.
        Defaults to :data:`MIN_OVERLAPPING_OBSERVATIONS`.

    Returns
    -------
    CorrelationMatrix
        Always a structurally-valid matrix; NaN cells when overlap is
        below the floor.
    """

    days_window = max(int(days_window), 1)
    days_window = min(days_window, MAX_DAYS_WINDOW)

    provider_names = list(providers) if providers else list(DEFAULT_PROVIDERS)
    cutoff_now = (now or datetime.now(tz=timezone.utc))
    if cutoff_now.tzinfo is None:
        cutoff_now = cutoff_now.replace(tzinfo=timezone.utc)
    cutoff = cutoff_now - timedelta(days=days_window)

    # Step 1: build per-provider ``(industry, utc-day) → mean signal`` maps.
    snapshots_dir = providers_dir or (DEFAULT_ALT_DATA_CACHE_DIR / "providers")
    per_provider_vectors: Dict[str, Dict[Tuple[str, str], float]] = {}
    for name in provider_names:
        if provider_records is not None:
            records = provider_records.get(name, [])
        else:
            records = _load_provider_records(name, providers_dir=snapshots_dir)
        per_provider_vectors[name] = _records_to_industry_day_signal(
            records, cutoff=cutoff
        )

    n = len(provider_names)
    pearson = np.full((n, n), np.nan, dtype=float)
    spearman = np.full((n, n), np.nan, dtype=float)
    n_overlap: Dict[Tuple[str, str], int] = {}

    # Diagonal: trivially 1.0 when the provider has any data; report
    # the provider's own coverage count for transparency.
    for i, name in enumerate(provider_names):
        own_count = len(per_provider_vectors[name])
        if own_count >= 2:
            pearson[i, i] = 1.0
            spearman[i, i] = 1.0
        n_overlap[(name, name)] = own_count

    # Step 2: pairwise correlation on aligned ``(industry, utc-day)`` keys.
    notes_parts: List[str] = []
    for i in range(n):
        for j in range(i + 1, n):
            name_a, name_b = provider_names[i], provider_names[j]
            keys_a = set(per_provider_vectors[name_a].keys())
            keys_b = set(per_provider_vectors[name_b].keys())
            common = sorted(keys_a & keys_b)
            n_overlap[(name_a, name_b)] = len(common)
            if len(common) < min_overlapping_observations:
                continue
            x = np.array(
                [per_provider_vectors[name_a][key] for key in common],
                dtype=float,
            )
            y = np.array(
                [per_provider_vectors[name_b][key] for key in common],
                dtype=float,
            )
            r_pearson = _pearson(x, y)
            r_spearman = _spearman(x, y)
            pearson[i, j] = pearson[j, i] = r_pearson
            spearman[i, j] = spearman[j, i] = r_spearman

    # Step 3: redundancy clusters via union-find on |r_pearson| > threshold.
    clusters = _build_redundancy_clusters(
        provider_names, pearson, redundancy_threshold
    )

    # Step 4: most-independent / most-redundant pair + average correlation.
    eligible_pairs: List[Tuple[str, str, float]] = []
    for i in range(n):
        for j in range(i + 1, n):
            value = pearson[i, j]
            if isinstance(value, float) and np.isnan(value):
                continue
            eligible_pairs.append(
                (provider_names[i], provider_names[j], abs(float(value)))
            )

    if eligible_pairs:
        # Independent pair: lowest |r|. Tie-break by lexicographic
        # provider names so the output is deterministic across runs.
        most_independent = min(
            eligible_pairs, key=lambda item: (item[2], item[0], item[1])
        )
        # Redundant pair: highest |r|. Tie-break by lexicographic
        # names (ascending) so a run with two perfectly-tied 1.0 pairs
        # picks the alphabetically-earliest pair deterministically.
        most_redundant = max(
            eligible_pairs,
            key=lambda item: (item[2], -ord(item[0][0]), -ord(item[1][0])),
        )
        avg_corr = float(np.mean([item[2] for item in eligible_pairs]))
    else:
        most_independent = ("", "", float("nan"))
        most_redundant = ("", "", float("nan"))
        avg_corr = float("nan")

    # Surface the data-quality story in ``notes`` so callers don't have
    # to inspect the overlap dict themselves. Two failure modes:
    # (a) no pair has any overlap at all, (b) some pairs have overlap
    # but the inputs are constant so |r| is NaN.
    max_pair_overlap = max(
        (
            count
            for (a, b), count in n_overlap.items()
            if a != b
        ),
        default=0,
    )
    total_off_diagonal = (n * (n - 1)) // 2
    if not eligible_pairs and max_pair_overlap < min_overlapping_observations:
        notes_parts.append(
            f"No provider pair cleared the n>={min_overlapping_observations} "
            f"overlap floor over the last {days_window} days; matrix is "
            f"structurally NaN. Populate provider archives before re-running."
        )
    elif not eligible_pairs:
        notes_parts.append(
            f"Some pairs reached n>={min_overlapping_observations} overlap "
            f"but all carried constant signal vectors; Pearson is undefined "
            f"(division by zero variance). Verify provider normalisation."
        )
    elif len(eligible_pairs) < total_off_diagonal:
        notes_parts.append(
            f"Only {len(eligible_pairs)}/{total_off_diagonal} provider pairs "
            f"cleared the overlap floor; remaining cells are NaN."
        )

    return CorrelationMatrix(
        providers=provider_names,
        pearson_matrix=pearson,
        spearman_matrix=spearman,
        n_overlapping_observations=n_overlap,
        redundancy_clusters=clusters,
        most_independent_pair=most_independent,
        most_redundant_pair=most_redundant,
        average_pairwise_correlation=avg_corr,
        notes=" ".join(notes_parts),
    )


def correlation_matrix_to_public_summary(
    matrix: CorrelationMatrix,
) -> Dict[str, Any]:
    """Distill a :class:`CorrelationMatrix` for ``data/public/alt_data_summary.json``.

    Returns the publication-safe shape: cluster names + the single
    most-independent / most-redundant pair + the average correlation.
    The full matrix stays private (it's a 10×10 numeric grid that
    bloats the public file without adding actionable info).
    """

    clusters = [sorted(cluster) for cluster in matrix.redundancy_clusters]
    return {
        "providers": list(matrix.providers),
        "redundancy_clusters": clusters,
        "redundant_cluster_count": sum(1 for c in clusters if len(c) > 1),
        "independent_provider_count": sum(1 for c in clusters if len(c) == 1),
        "effective_provider_count": len(clusters),
        "most_independent_pair": (
            list(matrix.most_independent_pair[:2])
            + [
                None
                if (
                    isinstance(matrix.most_independent_pair[2], float)
                    and np.isnan(matrix.most_independent_pair[2])
                )
                else round(float(matrix.most_independent_pair[2]), 4)
            ]
            if matrix.most_independent_pair[0]
            else None
        ),
        "most_redundant_pair": (
            list(matrix.most_redundant_pair[:2])
            + [
                None
                if (
                    isinstance(matrix.most_redundant_pair[2], float)
                    and np.isnan(matrix.most_redundant_pair[2])
                )
                else round(float(matrix.most_redundant_pair[2]), 4)
            ]
            if matrix.most_redundant_pair[0]
            else None
        ),
        "average_pairwise_correlation": (
            None
            if (
                isinstance(matrix.average_pairwise_correlation, float)
                and np.isnan(matrix.average_pairwise_correlation)
            )
            else round(float(matrix.average_pairwise_correlation), 4)
        ),
        "notes": matrix.notes,
    }


__all__ = [
    "CorrelationMatrix",
    "DEFAULT_DAYS_WINDOW",
    "DEFAULT_PROVIDERS",
    "MAX_DAYS_WINDOW",
    "MIN_OVERLAPPING_OBSERVATIONS",
    "REDUNDANCY_THRESHOLD",
    "compute_provider_correlation_matrix",
    "correlation_matrix_to_public_summary",
]

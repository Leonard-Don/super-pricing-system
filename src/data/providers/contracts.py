"""Provider source-health contract (ADR 0001 Phase 2).

This module is **mostly** type-only — at runtime each TypedDict is a plain
`dict`, which means existing producers and consumers stay binary-compatible.
The goal is to centralize the field-by-field semantics so that later phases
(`_execute_with_fallback` extraction in Phase 4, alt-data field alignment
in Phase 3) can refer to a single source of truth rather than re-deriving
the shape from `DataProviderFactory` internals.

Phase 3 also exposes one runtime helper: `normalize_provider_record_metadata`
coerces a raw producer-side dict into a `ProviderRecord` (clamps quality
scores, validates evidence URLs, re-derives freshness label/weight from
`age_hours`). Provider implementations should pipe their per-row metadata
through this helper instead of hand-rolling validation.

See `docs/adr/0001-provider-abstraction.md` §"标准字段语义" + 附加 list for
the field catalog, and `frontend/src/utils/marketSourceHealth.js` for the
SPA-side consumer that already reads these keys.
"""
from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any, List, Literal, Optional, Tuple, TypedDict


# ---------------------------------------------------------------------------
# Phase 3 forward-declared fields (per-record metadata returned by providers).
# All keys are optional today — Phase 3 implementations will populate them.
# ---------------------------------------------------------------------------

FreshnessLabel = Literal["fresh", "recent", "aging", "stale"]


class FreshnessMeta(TypedDict):
    """Age-band metadata for a single fetched record.

    Buckets match `AltDataManager._build_freshness_meta`:
    `fresh` (≤24h, weight 1.0), `recent` (≤3d, weight 0.75),
    `aging` (≤7d, weight 0.5), `stale` (>7d, weight 0.25).
    """

    age_hours: float
    label: FreshnessLabel
    weight: float


class ProviderRecord(TypedDict, total=False):
    """Per-record metadata a provider may attach alongside data rows.

    Phase 2 declares the contract; Phase 3 will populate these on the
    market-data providers (Yahoo / Sina / AKShare) and rename
    `people_quality_score` to `quality_score` on the alt-data side.
    """

    quality_score: Optional[float]
    evidence_url: Optional[str]
    freshness: Optional[FreshnessMeta]


# ---------------------------------------------------------------------------
# Phase 2 fields — these are the runtime shape `DataProviderFactory` already
# produces today and the frontend `MarketSourceHealthCard` already reads.
# ---------------------------------------------------------------------------


class ProviderCapabilities(TypedDict, total=False):
    """Capabilities a provider declares (introspection, not live probing)."""

    historical_data: bool
    latest_quote: bool
    fundamental_data: bool
    order_book: bool


class SourceHealthEntry(TypedDict):
    """One row in `SourceHealthReport.sources` — see `_provider_health_entry`."""

    id: str
    name: str
    label: str
    ok: bool
    status: str
    reason: Optional[str]
    required: bool
    fallback: bool
    requires_api_key: bool
    priority: Optional[int]
    rate_limit: Optional[int]
    capabilities: ProviderCapabilities
    checked_at: str


class ProviderEvent(TypedDict):
    """A lifecycle event recorded during `_initialize_providers`."""

    provider: str
    status: str
    reason: Optional[str]
    checked_at: str


class FetchAttempt(TypedDict):
    """One link in the per-request attempt chain — see `_record_fetch_health`."""

    id: str
    ok: bool
    status: str
    reason: Optional[str]
    row_count: Optional[int]
    fallback: bool
    checked_at: str


class FetchHealthReport(TypedDict):
    """A request-scoped fetch report attached to `DataFrame.attrs["source_health"]`."""

    checked_at: str
    symbol: str
    interval: str
    status: str
    selected_source: Optional[str]
    fallback_used: bool
    attempts: List[FetchAttempt]


class SourceHealthReport(TypedDict):
    """Top-level health envelope from `DataProviderFactory.get_source_health_report`."""

    checked_at: str
    default_source: str
    fallback_enabled: bool
    configured_sources: List[str]
    active_provider_count: int
    configured_provider_count: int
    sources: List[SourceHealthEntry]
    last_fetch: Optional[FetchHealthReport]


# ---------------------------------------------------------------------------
# Phase 3 producer-side helper.
#
# The TypedDicts above describe the *shape* of a normalized record; this
# helper enforces the *semantics* so every provider produces them the same
# way. Keep the rules here narrow — the helper exists to dedupe trivial
# coercion, not to make provider-side decisions.
# ---------------------------------------------------------------------------


def normalize_provider_record_metadata(
    metadata: Optional[Mapping[str, Any]],
) -> ProviderRecord:
    """Coerce a raw producer-side metadata mapping into a `ProviderRecord`.

    Rules (per ADR 0001 §"标准字段语义"):

    - `quality_score`: must be a finite number in `[0.0, 1.0]`. Out-of-range
      finite numbers are clamped; non-finite (`NaN`/`inf`) and non-numeric
      values become `None` ("not assessed"). The legacy alt-data alias
      `people_quality_score` is consumed only when the canonical key is
      absent — see Migration Plan Phase 3 §"保留兼容字段".
    - `evidence_url`: must be a non-empty `http`/`https` URL after trimming.
      Anything else (blank, non-string, `file://`, `javascript:`, ...) is
      coerced to `None`. Phase 3/4 will tighten this further with a host
      whitelist; for now the scheme check is the minimum safety net.
    - `freshness`: must be a mapping containing a finite `age_hours`. The
      `label`/`weight` are always re-derived from `age_hours` so the bucket
      stays internally consistent (single source of truth = `age_hours`).
      The bucket boundaries mirror `AltDataManager._build_freshness_meta`.

    Absent input keys remain absent on output, so callers can still
    distinguish "provider didn't declare" (key missing) from "provider
    explicitly didn't assess" (key present, value `None`). Unknown keys
    are dropped — only the standardized `ProviderRecord` keys survive.
    """
    out: ProviderRecord = {}
    if not metadata:
        return out

    if "quality_score" in metadata:
        out["quality_score"] = _coerce_quality_score(metadata["quality_score"])
    elif "people_quality_score" in metadata:
        out["quality_score"] = _coerce_quality_score(metadata["people_quality_score"])

    if "evidence_url" in metadata:
        out["evidence_url"] = _coerce_evidence_url(metadata["evidence_url"])

    if "freshness" in metadata:
        out["freshness"] = _coerce_freshness(metadata["freshness"])

    return out


def _coerce_quality_score(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, bool):
        # bool is a subclass of int — reject explicitly so True/False don't slip through.
        return None
    try:
        score = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(score):
        return None
    if score < 0.0:
        return 0.0
    if score > 1.0:
        return 1.0
    return score


def _coerce_evidence_url(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    if not trimmed:
        return None
    if not (trimmed.startswith("http://") or trimmed.startswith("https://")):
        return None
    return trimmed


def _coerce_freshness(value: Any) -> Optional[FreshnessMeta]:
    if not isinstance(value, Mapping):
        return None
    raw_age = value.get("age_hours")
    if raw_age is None or isinstance(raw_age, bool):
        return None
    try:
        age_hours = float(raw_age)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(age_hours):
        return None
    age_hours = max(age_hours, 0.0)
    label, weight = _freshness_bucket(age_hours)
    return FreshnessMeta(age_hours=round(age_hours, 2), label=label, weight=weight)


def _freshness_bucket(age_hours: float) -> Tuple[FreshnessLabel, float]:
    if age_hours <= 24:
        return "fresh", 1.0
    if age_hours <= 24 * 3:
        return "recent", 0.75
    if age_hours <= 24 * 7:
        return "aging", 0.5
    return "stale", 0.25


__all__ = [
    "FreshnessLabel",
    "FreshnessMeta",
    "ProviderRecord",
    "ProviderCapabilities",
    "SourceHealthEntry",
    "ProviderEvent",
    "FetchAttempt",
    "FetchHealthReport",
    "SourceHealthReport",
    "normalize_provider_record_metadata",
]

"""Provider source-health contract (ADR 0001 Phase 2).

This module is **type-only** — at runtime each TypedDict is a plain `dict`,
which means existing producers and consumers stay binary-compatible. The
goal is to centralize the field-by-field semantics so that later phases
(`_execute_with_fallback` extraction in Phase 4, alt-data field alignment
in Phase 3) can refer to a single source of truth rather than re-deriving
the shape from `DataProviderFactory` internals.

See `docs/adr/0001-provider-abstraction.md` §"标准字段语义" + 附加 list for
the field catalog, and `frontend/src/utils/marketSourceHealth.js` for the
SPA-side consumer that already reads these keys.
"""
from __future__ import annotations

from typing import List, Literal, Optional, TypedDict


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
]

"""Runtime health manifest for the alternative-data pipeline.

This module exposes a machine-readable mirror of the per-component verdict
table currently maintained as markdown in ``docs/alt_data_audit.md`` (§ 2).
The static manifest below is the source-of-truth for what the audit calls
the *current real verdicts post-Phase-D*:

- Phase A (`alt_data_audit.md` § 6) cut three SCAFFOLDING-ONLY components
  (``macro_hf/port_congestion``, ``macro_hf/customs_data`` and the
  ``supply_chain/hiring`` 51job fetch path). They are no longer represented
  in the manifest.
- Phase B (`§ 8`) added ``macro_hf/shfe_inventory`` as the first
  ``source_mode=live`` adapter in the repo.
- Phase D (`§ 9`) refreshed the CN selectors in ``policy_radar`` (NDRC HTML
  + new NEA JSON datasource path) without adding a new component.

The two still-wired SCAFFOLDING-ONLY sub-crawlers of ``supply_chain``
(``bidding`` + ``env_assessment``) are intentionally excluded from the
manifest: they yield zero records in the current snapshot and have not been
promoted to a real verdict tier. Consumers wanting the historical inventory
of cut/never-promoted components should read the audit doc directly.

The :func:`refresh_runtime_state` helper overlays runtime state - currently
just ``last_refresh_at`` from the on-disk snapshot's mtime - onto the static
manifest, so the ``/alt-data/health`` endpoint can answer *"when did each
component last actually refresh"* without having to query each provider.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:  # pragma: no cover - imported only for typing
    from .alt_data_manager import AltDataManager


# ---------------------------------------------------------------------------
# Verdict labels
# ---------------------------------------------------------------------------

VERDICT_PRODUCTION = "PRODUCTION"
VERDICT_WORKING_PROTOTYPE = "WORKING-PROTOTYPE"
VERDICT_SCAFFOLDING_ONLY = "SCAFFOLDING-ONLY"
VERDICT_DEAD = "DEAD"

VALID_VERDICTS = frozenset(
    {
        VERDICT_PRODUCTION,
        VERDICT_WORKING_PROTOTYPE,
        VERDICT_SCAFFOLDING_ONLY,
        VERDICT_DEAD,
    }
)


# ---------------------------------------------------------------------------
# ComponentHealth dataclass
# ---------------------------------------------------------------------------


@dataclass
class ComponentHealth:
    """One row of the alt-data per-component verdict table.

    Field semantics mirror the columns of ``docs/alt_data_audit.md`` § 2
    plus the runtime overlay produced by :func:`refresh_runtime_state`.
    """

    name: str
    sub_package: str
    source: str
    cadence_minutes: Optional[int]
    persistence_target: str
    verdict: str
    audit_section_ref: str
    last_refresh_at: Optional[str] = None
    notes: str = ""
    snapshot_provider_key: Optional[str] = None
    extras: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.verdict not in VALID_VERDICTS:
            raise ValueError(
                f"Invalid verdict {self.verdict!r} for component {self.name!r}; "
                f"must be one of {sorted(VALID_VERDICTS)}"
            )

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ---------------------------------------------------------------------------
# Static manifest -- the source-of-truth for current real verdicts
# ---------------------------------------------------------------------------

ALT_DATA_HEALTH_MANIFEST: List[ComponentHealth] = [
    ComponentHealth(
        name="policy_radar",
        sub_package="policy_radar",
        source=(
            "fed/ecb RSS via _safe_request; ndrc HTML (ul.u-list > li) "
            "+ nea JSON datasource (Phase D)"
        ),
        cadence_minutes=60,
        persistence_target="cache/alt_data/providers/policy_radar.json",
        verdict=VERDICT_WORKING_PROTOTYPE,
        audit_section_ref="docs/alt_data_audit.md#2-per-sub-package-verdict-table",
        snapshot_provider_key="policy_radar",
        notes=(
            "Phase D refreshed CN selectors (NDRC ul.u-list, NEA JSON "
            "datasource); BoE deprecated (Akamai TLS terminates)."
        ),
    ),
    ComponentHealth(
        name="policy_execution",
        sub_package="policy_radar",
        source=(
            "Derived from policy_radar history; computes per-department "
            "reversal counts"
        ),
        cadence_minutes=120,
        persistence_target="cache/alt_data/providers/policy_execution.json",
        verdict=VERDICT_WORKING_PROTOTYPE,
        audit_section_ref="docs/alt_data_audit.md#2-per-sub-package-verdict-table",
        snapshot_provider_key="policy_execution",
        notes=(
            "Inherits CN coverage automatically once policy_radar Phase D "
            "selectors flow through."
        ),
    ),
    ComponentHealth(
        name="lme_inventory",
        sub_package="macro_hf",
        source="yfinance futures price (HG=F, ALI=F, ZNC=F, NI=F) as inventory proxy",
        cadence_minutes=180,
        persistence_target="cache/alt_data/providers/macro_hf.json",
        verdict=VERDICT_WORKING_PROTOTYPE,
        audit_section_ref="docs/alt_data_audit.md#2-per-sub-package-verdict-table",
        snapshot_provider_key="macro_hf",
        notes="source_mode=proxy, lag_days=1; honest about its proxy nature.",
        extras={"source_mode": "proxy", "region": "LME"},
    ),
    ComponentHealth(
        name="shfe_inventory",
        sub_package="macro_hf",
        source=(
            "akshare.futures_inventory_em (real SHFE warehouse stock for "
            "copper/aluminium/zinc/nickel)"
        ),
        cadence_minutes=180,
        persistence_target="cache/alt_data/providers/macro_hf.json",
        verdict=VERDICT_WORKING_PROTOTYPE,
        audit_section_ref="docs/alt_data_audit.md#8-phase-b-actions-2026-05-16--shfe-inventory-parallel-proxy",
        snapshot_provider_key="macro_hf",
        notes=(
            "Phase B addition; source_mode=live, lag_days=1, coverage=1.0 -- "
            "first live exchange-aggregated adapter in the repo."
        ),
        extras={"source_mode": "live", "region": "SHFE"},
    ),
    ComponentHealth(
        name="people_layer",
        sub_package="people",
        source=(
            "Hand-curated dicts: EXECUTIVE_PROFILE_CATALOG (~16 tickers), "
            "INSIDER_FLOW_CATALOG (10 tickers), CURATED_HIRING_SIGNALS (4 tickers)"
        ),
        cadence_minutes=360,
        persistence_target="cache/alt_data/providers/people_layer.json",
        verdict=VERDICT_PRODUCTION,
        audit_section_ref="docs/alt_data_audit.md#2-per-sub-package-verdict-table",
        snapshot_provider_key="people_layer",
        notes=(
            "source_mode=curated, lag_days=21; the most reliable provider "
            "specifically because it has no I/O."
        ),
        extras={"source_mode": "curated", "lag_days": 21},
    ),
    ComponentHealth(
        name="entity_resolution",
        sub_package="entity_resolution",
        source="Pure-Python alias table (no I/O)",
        cadence_minutes=None,
        persistence_target="n/a (utility)",
        verdict=VERDICT_PRODUCTION,
        audit_section_ref="docs/alt_data_audit.md#2-per-sub-package-verdict-table",
        snapshot_provider_key=None,
        notes="Utility used by alt_data_manager._record_to_evidence.",
    ),
    ComponentHealth(
        name="governance",
        sub_package="governance",
        source=(
            "Pure-Python infrastructure: AltDataSnapshotStore + "
            "AltDataRefreshService + AltDataScheduler"
        ),
        cadence_minutes=None,
        persistence_target=(
            "cache/alt_data/*.json via tempfile atomic-rename; "
            "Celery beat (Phase C) for prod refresh cadence"
        ),
        verdict=VERDICT_PRODUCTION,
        audit_section_ref="docs/alt_data_audit.md#2-per-sub-package-verdict-table",
        snapshot_provider_key=None,
        notes=(
            "Phase C wired Celery beat as the additive replacement for the "
            "in-process APScheduler when ALT_DATA_USE_CELERY_BEAT or "
            "CELERY_BROKER_URL is set."
        ),
    ),
    ComponentHealth(
        name="fund_holdings",
        sub_package="fund_holdings",
        source=(
            "akshare.fund_portfolio_hold_em(symbol=<code>, date=<year>) "
            "for the curated 50-name 公募基金 catalog (CN-A market); "
            "aggregates to per-ticker concentration metrics"
        ),
        cadence_minutes=60 * 24 * 7,
        persistence_target="cache/alt_data/providers/fund_holdings.json",
        verdict=VERDICT_WORKING_PROTOTYPE,
        audit_section_ref="docs/alt_data_audit.md#15-phase-f2-actions-2026-05-17--fund-holdings-provider",
        snapshot_provider_key="fund_holdings",
        notes=(
            "source_mode=public_disclosure, lag_days=15 quarterly-disclosure "
            "freshness heuristic. Akshare fund_portfolio_hold_em is the primary "
            "feed path; legacy fallback exists only for older local installs."
        ),
        extras={"source_mode": "public_disclosure", "lag_days": 15},
    ),
]


# ---------------------------------------------------------------------------
# Runtime overlay
# ---------------------------------------------------------------------------


def _format_mtime(path: Path) -> Optional[str]:
    """Return an ISO-8601 UTC timestamp for ``path``'s mtime, or None."""
    try:
        if not path.exists():
            return None
        mtime_epoch = path.stat().st_mtime
    except OSError:
        return None
    return (
        datetime.fromtimestamp(mtime_epoch, tz=timezone.utc)
        .replace(microsecond=0)
        .isoformat()
    )


def refresh_runtime_state(
    manager: "AltDataManager",
    *,
    base_manifest: Optional[List[ComponentHealth]] = None,
) -> List[ComponentHealth]:
    """Overlay runtime state onto :data:`ALT_DATA_HEALTH_MANIFEST`.

    For each component that has a ``snapshot_provider_key``, read the on-disk
    snapshot's mtime via the manager's snapshot store and write it into
    ``last_refresh_at``. Components without a snapshot key (utility modules
    like ``entity_resolution`` and ``governance``) get ``last_refresh_at =
    None``.

    The returned list is a fresh copy -- the module-level manifest is never
    mutated.
    """

    snapshot_store = manager.snapshot_store
    providers_dir = snapshot_store.providers_dir
    source = list(base_manifest) if base_manifest is not None else list(
        ALT_DATA_HEALTH_MANIFEST
    )

    overlaid: List[ComponentHealth] = []
    for component in source:
        last_refresh_at: Optional[str] = None
        if component.snapshot_provider_key:
            snapshot_path = providers_dir / f"{component.snapshot_provider_key}.json"
            last_refresh_at = _format_mtime(snapshot_path)
        overlaid.append(
            ComponentHealth(
                name=component.name,
                sub_package=component.sub_package,
                source=component.source,
                cadence_minutes=component.cadence_minutes,
                persistence_target=component.persistence_target,
                verdict=component.verdict,
                audit_section_ref=component.audit_section_ref,
                last_refresh_at=last_refresh_at,
                notes=component.notes,
                snapshot_provider_key=component.snapshot_provider_key,
                extras=dict(component.extras),
            )
        )
    return overlaid


def summarize_manifest(manifest: List[ComponentHealth]) -> Dict[str, Any]:
    """Aggregate per-verdict counts for a (overlaid or static) manifest."""

    counts: Dict[str, int] = {
        VERDICT_PRODUCTION: 0,
        VERDICT_WORKING_PROTOTYPE: 0,
        VERDICT_SCAFFOLDING_ONLY: 0,
        VERDICT_DEAD: 0,
    }
    for component in manifest:
        counts[component.verdict] = counts.get(component.verdict, 0) + 1
    return {
        "total_components": len(manifest),
        "production_count": counts[VERDICT_PRODUCTION],
        "working_prototype_count": counts[VERDICT_WORKING_PROTOTYPE],
        "scaffolding_only_count": counts[VERDICT_SCAFFOLDING_ONLY],
        "dead_count": counts[VERDICT_DEAD],
    }


__all__ = [
    "ComponentHealth",
    "ALT_DATA_HEALTH_MANIFEST",
    "VERDICT_PRODUCTION",
    "VERDICT_WORKING_PROTOTYPE",
    "VERDICT_SCAFFOLDING_ONLY",
    "VERDICT_DEAD",
    "VALID_VERDICTS",
    "refresh_runtime_state",
    "summarize_manifest",
]

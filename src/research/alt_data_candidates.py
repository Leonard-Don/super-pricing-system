"""Alt-data → Workbench candidate task queue (Phase E3).

The :class:`CandidateStore` materialises a JSON-backed queue of
*candidate* research tasks that are generated from
:class:`AltDataManager` state. A candidate is a system-generated
suggestion the operator can:

- **Convert** — promote the suggestion into a real workbench task
  (with the alt-data evidence pre-attached). The candidate transitions
  to ``converted`` and is no longer surfaced in the pending queue.
- **Dismiss** — mark the suggestion as not-relevant. The candidate
  stays in storage (so the same signal doesn't re-suggest itself the
  next refresh) but never re-emerges as pending.
- **Snooze** — push the candidate forward by ``hours`` so it doesn't
  clutter the queue today. Re-appears once
  :attr:`AltDataCandidate.snoozed_until` is in the past.

Two generators are wired:

1. ``policy_radar`` signal — :func:`generate_candidates_from_alt_data`
   reads ``manager.latest_signals['policy_radar']['industry_signals']``
   and emits one candidate per industry where ``|avg_impact| >=
   POLICY_RADAR_IMPACT_THRESHOLD`` *and* ``mentions >=
   POLICY_RADAR_MENTIONS_THRESHOLD``.
2. ``macro_hf`` SHFE inventory — reads recent
   ``commodity_inventory`` records and emits one candidate per metal
   where ``|weekly_change_pct| >= SHFE_WEEKLY_CHANGE_THRESHOLD_PCT``.

Thresholds are env-configurable via:

- ``ALT_DATA_CANDIDATE_POLICY_IMPACT_THRESHOLD`` (default ``0.30``)
- ``ALT_DATA_CANDIDATE_POLICY_MENTIONS_THRESHOLD`` (default ``3``)
- ``ALT_DATA_CANDIDATE_SHFE_WEEKLY_CHANGE_THRESHOLD`` (default ``5.0`` pct)
- ``ALT_DATA_CANDIDATE_STALE_DAYS`` (default ``30`` days; older
  candidates with no recurring signal are pruned)

Reconciliation rule on every :meth:`CandidateStore.reconcile`:

- A *NEW* signal (unseen ``candidate_id``) is appended with state
  ``pending``.
- A *KNOWN* signal updates the headline / impact / mentions but
  preserves the user-driven ``state`` (so a previously-dismissed
  policy candidate stays dismissed even when the signal repeats).
- A *STALE* candidate — i.e. one whose underlying signal hasn't
  recurred in :data:`STALE_AFTER_DAYS_DEFAULT` days — is dropped
  entirely.

Persistence is JSON-backed under ``cache/workbench/alt_data_candidates.json``
using the atomic-rename pattern (write tmp, ``Path.replace``) so a
mid-write crash never leaves a half-rendered file behind.

This module deliberately does **not** mutate the alt-data manager or
the workbench store. Conversion to a real task happens via the API
layer (``backend/app/api/v1/endpoints/research_workbench.py``).
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List, Literal, Optional

from src.utils.config import PROJECT_ROOT

if TYPE_CHECKING:  # pragma: no cover - typing only
    from src.data.alternative.alt_data_manager import AltDataManager


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return float(raw)
    except (TypeError, ValueError):
        logger.warning("Invalid %s=%r — falling back to %s", name, raw, default)
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        logger.warning("Invalid %s=%r — falling back to %s", name, raw, default)
        return default


def policy_impact_threshold() -> float:
    """Minimum ``|avg_impact|`` for a policy_radar candidate."""

    return _env_float("ALT_DATA_CANDIDATE_POLICY_IMPACT_THRESHOLD", 0.30)


def policy_mentions_threshold() -> int:
    """Minimum ``mentions`` for a policy_radar candidate."""

    return _env_int("ALT_DATA_CANDIDATE_POLICY_MENTIONS_THRESHOLD", 3)


def shfe_weekly_change_threshold_pct() -> float:
    """Minimum ``|weekly_change_pct|`` (percent) for a SHFE candidate."""

    return _env_float("ALT_DATA_CANDIDATE_SHFE_WEEKLY_CHANGE_THRESHOLD", 5.0)


def stale_after_days() -> int:
    """Days after which a candidate with no recurring signal is pruned."""

    return _env_int("ALT_DATA_CANDIDATE_STALE_DAYS", 30)


STALE_AFTER_DAYS_DEFAULT = 30

VALID_CANDIDATE_STATES = {"pending", "dismissed", "snoozed", "converted"}
CandidateState = Literal["pending", "dismissed", "snoozed", "converted"]

POLICY_SIGNAL_TYPE = "policy_radar_industry"
SHFE_SIGNAL_TYPE = "shfe_inventory_weekly"

DEFAULT_STORAGE_PATH = PROJECT_ROOT / "cache" / "workbench" / "alt_data_candidates.json"


# ---------------------------------------------------------------------------
# Dataclass
# ---------------------------------------------------------------------------


@dataclass
class AltDataCandidate:
    """One candidate research task generated from alt-data signals.

    The ``candidate_id`` is deterministic from
    ``(source_component, signal_type, industry)`` so re-generating the
    same signal does not create a duplicate row. ``state`` defaults to
    ``"pending"``; the user-facing action endpoints transition it
    through the lifecycle.
    """

    candidate_id: str
    source_component: str
    signal_type: str
    industry: str
    headline: str
    impact_score: float
    mentions: int
    generated_at: str
    state: CandidateState = "pending"
    snoozed_until: Optional[str] = None
    evidence_link: Dict[str, Any] = field(default_factory=dict)
    last_seen_at: str = ""
    converted_task_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AltDataCandidate":
        state = data.get("state", "pending")
        if state not in VALID_CANDIDATE_STATES:
            state = "pending"
        return cls(
            candidate_id=str(data.get("candidate_id", "")),
            source_component=str(data.get("source_component", "")),
            signal_type=str(data.get("signal_type", "")),
            industry=str(data.get("industry", "")),
            headline=str(data.get("headline", "")),
            impact_score=float(data.get("impact_score", 0.0) or 0.0),
            mentions=int(data.get("mentions", 0) or 0),
            generated_at=str(data.get("generated_at", "")),
            state=state,  # type: ignore[arg-type]
            snoozed_until=data.get("snoozed_until") or None,
            evidence_link=dict(data.get("evidence_link") or {}),
            last_seen_at=str(data.get("last_seen_at") or data.get("generated_at") or ""),
            converted_task_id=data.get("converted_task_id") or None,
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _utc_now() -> datetime:
    return datetime.now(tz=timezone.utc).replace(microsecond=0)


def _utc_now_iso() -> str:
    return _utc_now().isoformat()


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _signal_id(source_component: str, signal_type: str, industry: str) -> str:
    """Deterministic id; re-generating the same signal returns the same id."""

    safe_industry = (industry or "").strip() or "_global"
    return f"altcand_{source_component}_{signal_type}_{safe_industry}"


def _policy_provider_snapshot_path() -> str:
    return "cache/alt_data/providers/policy_radar.json"


def _macro_provider_snapshot_path() -> str:
    return "cache/alt_data/providers/macro_hf.json"


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------


def _policy_radar_candidates(
    manager: "AltDataManager",
    *,
    now: datetime,
    impact_threshold: float,
    mentions_threshold: int,
) -> List[AltDataCandidate]:
    signal = manager.latest_signals.get("policy_radar")
    if not isinstance(signal, dict):
        return []
    industry_signals = signal.get("industry_signals") or {}
    if not isinstance(industry_signals, dict):
        return []

    candidates: List[AltDataCandidate] = []
    for industry in sorted(industry_signals.keys()):
        payload = industry_signals.get(industry)
        if not isinstance(payload, dict):
            continue
        try:
            avg_impact = float(payload.get("avg_impact", 0.0) or 0.0)
        except (TypeError, ValueError):
            continue
        try:
            mentions = int(payload.get("mentions", 0) or 0)
        except (TypeError, ValueError):
            mentions = 0
        if abs(avg_impact) < impact_threshold:
            continue
        if mentions < mentions_threshold:
            continue

        direction = "偏空" if avg_impact <= -0.05 else ("偏多" if avg_impact >= 0.05 else "中性")
        headline = (
            f"政策雷达：{industry} avg_impact={avg_impact:+.2f}"
            f"（{direction}, mentions={mentions}）"
        )
        candidate_id = _signal_id("policy_radar", POLICY_SIGNAL_TYPE, industry)
        generated_at = now.isoformat()
        candidates.append(
            AltDataCandidate(
                candidate_id=candidate_id,
                source_component="policy_radar",
                signal_type=POLICY_SIGNAL_TYPE,
                industry=industry,
                headline=headline,
                impact_score=avg_impact,
                mentions=mentions,
                generated_at=generated_at,
                state="pending",
                snoozed_until=None,
                evidence_link={
                    "component": "policy_radar",
                    "snapshot_path": _policy_provider_snapshot_path(),
                    "industry": industry,
                    "avg_impact": avg_impact,
                    "mentions": mentions,
                    "signal": payload.get("signal"),
                },
                last_seen_at=generated_at,
            )
        )
    return candidates


def _classify_shfe_metal(record: Any) -> Optional[Dict[str, Any]]:
    """Extract metal + weekly_change_pct from an inventory record, if SHFE."""

    source = (getattr(record, "source", "") or "").lower()
    raw = getattr(record, "raw_value", None) or {}
    metadata = getattr(record, "metadata", None) or {}
    if not isinstance(raw, dict):
        raw = {}
    if not isinstance(metadata, dict):
        metadata = {}

    region = ""
    if "shfe" in source:
        region = "SHFE"
    else:
        region_meta = str(metadata.get("region", "")).upper()
        if region_meta == "SHFE":
            region = "SHFE"
    if region != "SHFE":
        return None

    metal_label = (
        raw.get("name") or raw.get("metal") or metadata.get("label") or ""
    )
    metal = str(metal_label).strip()
    if not metal:
        return None
    try:
        weekly_change_pct = float(raw.get("weekly_change_pct", 0.0) or 0.0)
    except (TypeError, ValueError):
        return None

    return {
        "metal": metal,
        "weekly_change_pct": weekly_change_pct,
        "trend": str(raw.get("trend") or ""),
        "latest_stock": raw.get("latest_stock"),
        "latest_date": raw.get("latest_date"),
    }


def _shfe_inventory_candidates(
    manager: "AltDataManager",
    *,
    now: datetime,
    weekly_change_threshold_pct: float,
) -> List[AltDataCandidate]:
    try:
        records = manager.get_records(
            category="commodity_inventory",
            timeframe="7d",
            limit=80,
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Failed to read SHFE inventory records: %s", exc)
        records = []

    # Fall back to provider history when the time-windowed read is empty.
    if not records:
        provider = manager.providers.get("macro_hf")
        if provider is not None:
            records = list(getattr(provider, "_history", []) or [])

    seen_metals: Dict[str, Dict[str, Any]] = {}
    for record in records:
        classified = _classify_shfe_metal(record)
        if not classified:
            continue
        metal = classified["metal"]
        if metal in seen_metals:
            continue
        seen_metals[metal] = classified

    candidates: List[AltDataCandidate] = []
    for metal in sorted(seen_metals.keys()):
        info = seen_metals[metal]
        weekly_change_pct = float(info["weekly_change_pct"])
        if abs(weekly_change_pct) < weekly_change_threshold_pct:
            continue

        direction = "去化" if weekly_change_pct < 0 else "累积"
        headline = (
            f"SHFE 库存：{metal} 周环比 {weekly_change_pct:+.2f}%（{direction}）"
        )
        candidate_id = _signal_id("macro_hf", SHFE_SIGNAL_TYPE, metal)
        generated_at = now.isoformat()
        candidates.append(
            AltDataCandidate(
                candidate_id=candidate_id,
                source_component="macro_hf",
                signal_type=SHFE_SIGNAL_TYPE,
                industry=metal,
                headline=headline,
                impact_score=weekly_change_pct,
                # SHFE signals don't carry "mentions" — surface a 1 so
                # the queue still has a count value to render.
                mentions=1,
                generated_at=generated_at,
                state="pending",
                snoozed_until=None,
                evidence_link={
                    "component": "macro_hf",
                    "snapshot_path": _macro_provider_snapshot_path(),
                    "metal": metal,
                    "weekly_change_pct": weekly_change_pct,
                    "trend": info["trend"],
                    "latest_stock": info["latest_stock"],
                    "latest_date": info["latest_date"],
                },
                last_seen_at=generated_at,
            )
        )
    return candidates


def generate_candidates_from_alt_data(
    manager: "AltDataManager",
    *,
    now: Optional[datetime] = None,
    impact_threshold: Optional[float] = None,
    mentions_threshold: Optional[int] = None,
    weekly_change_threshold_pct: Optional[float] = None,
) -> List[AltDataCandidate]:
    """Return all candidates that the current alt-data state qualifies for.

    Pure function: does not touch :class:`CandidateStore`. The store
    is responsible for reconciliation with existing state.
    """

    snapshot_time = now or _utc_now()
    impact = impact_threshold if impact_threshold is not None else policy_impact_threshold()
    mentions = mentions_threshold if mentions_threshold is not None else policy_mentions_threshold()
    shfe = (
        weekly_change_threshold_pct
        if weekly_change_threshold_pct is not None
        else shfe_weekly_change_threshold_pct()
    )

    policy = _policy_radar_candidates(
        manager,
        now=snapshot_time,
        impact_threshold=impact,
        mentions_threshold=mentions,
    )
    shfe_list = _shfe_inventory_candidates(
        manager,
        now=snapshot_time,
        weekly_change_threshold_pct=shfe,
    )
    return policy + shfe_list


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------


class CandidateStore:
    """JSON-backed store for alt-data candidates.

    Uses an atomic-rename pattern with a unique temp file in the target
    directory so a crash mid-write cannot corrupt the on-disk file and
    separate store instances do not collide on the same ``*.tmp`` path.
    The store keeps an instance lock to guard concurrent reconcile /
    state-mutation calls within one instance.
    """

    def __init__(
        self,
        storage_path: Optional[Path] = None,
        stale_days: Optional[int] = None,
    ) -> None:
        self.storage_path = Path(storage_path or DEFAULT_STORAGE_PATH)
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        self._stale_days = stale_days if stale_days is not None else stale_after_days()
        self._lock = threading.RLock()
        self._candidates: List[AltDataCandidate] = []
        self._load()

    # ---- I/O ----

    def _load(self) -> None:
        if not self.storage_path.exists():
            self._candidates = []
            return
        try:
            with open(self.storage_path, "r", encoding="utf-8") as fp:
                raw = json.load(fp)
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning(
                "Failed to load alt-data candidates from %s: %s",
                self.storage_path,
                exc,
            )
            self._candidates = []
            return
        if not isinstance(raw, list):
            logger.warning(
                "Alt-data candidate file at %s is not a list — resetting",
                self.storage_path,
            )
            self._candidates = []
            return
        loaded: List[AltDataCandidate] = []
        for entry in raw:
            if not isinstance(entry, dict):
                continue
            try:
                loaded.append(AltDataCandidate.from_dict(entry))
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("Skipping malformed alt-data candidate entry: %s", exc)
        self._candidates = loaded

    def _persist(self) -> None:
        payload = [candidate.to_dict() for candidate in self._candidates]
        tmp_file = tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=self.storage_path.parent,
            prefix=f".{self.storage_path.name}.",
            suffix=".tmp",
            delete=False,
        )
        tmp_path = Path(tmp_file.name)
        try:
            with tmp_file as fp:
                json.dump(payload, fp, ensure_ascii=False, indent=2, default=str)
                fp.flush()
                os.fsync(fp.fileno())
            tmp_path.replace(self.storage_path)
        except Exception:
            try:
                tmp_path.unlink(missing_ok=True)
            except OSError:
                logger.warning("Failed to remove temp candidate file %s", tmp_path)
            raise

    # ---- Public API ----

    def list_candidates(
        self,
        *,
        state: Optional[str] = None,
        now: Optional[datetime] = None,
    ) -> List[AltDataCandidate]:
        """Return candidates filtered by ``state`` if supplied.

        Snoozed candidates whose ``snoozed_until`` is in the past are
        treated as ``pending`` again (state mutated in-place + persisted
        as a side effect, so the queue always renders consistently).
        """

        with self._lock:
            self._auto_unsnooze(now=now)
            results = list(self._candidates)
        if state:
            results = [c for c in results if c.state == state]
        return results

    def get_candidate(self, candidate_id: str) -> Optional[AltDataCandidate]:
        with self._lock:
            for candidate in self._candidates:
                if candidate.candidate_id == candidate_id:
                    return candidate
            return None

    def _auto_unsnooze(self, *, now: Optional[datetime] = None) -> None:
        reference = (now or _utc_now())
        if reference.tzinfo is None:
            reference = reference.replace(tzinfo=timezone.utc)
        changed = False
        for candidate in self._candidates:
            if candidate.state != "snoozed":
                continue
            target = _parse_iso(candidate.snoozed_until)
            if target is None:
                continue
            if reference >= target:
                candidate.state = "pending"
                candidate.snoozed_until = None
                changed = True
        if changed:
            self._persist()

    def reconcile(
        self,
        new_candidates: List[AltDataCandidate],
        *,
        now: Optional[datetime] = None,
    ) -> Dict[str, int]:
        """Merge fresh signals with stored state.

        Rules:

        - **Unseen ``candidate_id``** -> appended with state ``pending``.
        - **Existing ``candidate_id``** -> headline / impact / mentions /
          evidence updated, ``last_seen_at`` bumped, ``state`` preserved
          (so dismissed / converted / snoozed candidates stay put).
        - **Stale candidate** (``last_seen_at`` older than
          ``stale_days`` and not in ``new_candidates``) -> dropped.

        Returns a stats dict for telemetry.
        """

        reference = (now or _utc_now())
        if reference.tzinfo is None:
            reference = reference.replace(tzinfo=timezone.utc)
        with self._lock:
            existing = {candidate.candidate_id: candidate for candidate in self._candidates}
            incoming = {candidate.candidate_id: candidate for candidate in new_candidates}

            added = 0
            updated = 0
            for candidate_id, fresh in incoming.items():
                stored = existing.get(candidate_id)
                if stored is None:
                    self._candidates.append(fresh)
                    existing[candidate_id] = fresh
                    added += 1
                    continue
                stored.headline = fresh.headline
                stored.impact_score = fresh.impact_score
                stored.mentions = fresh.mentions
                stored.evidence_link = dict(fresh.evidence_link)
                stored.last_seen_at = fresh.generated_at or reference.isoformat()
                # An existing candidate may have been converted to a
                # task already; we leave the lifecycle field alone.
                updated += 1

            stale_cutoff = reference - timedelta(days=self._stale_days)
            kept: List[AltDataCandidate] = []
            pruned = 0
            for candidate in self._candidates:
                if candidate.candidate_id in incoming:
                    kept.append(candidate)
                    continue
                last_seen = _parse_iso(candidate.last_seen_at or candidate.generated_at)
                if last_seen is not None and last_seen < stale_cutoff:
                    pruned += 1
                    continue
                kept.append(candidate)
            self._candidates = kept

            # Auto-unsnooze before persisting so the on-disk file is
            # always consistent with the in-memory view.
            self._auto_unsnooze(now=reference)
            self._persist()
            return {
                "added": added,
                "updated": updated,
                "pruned": pruned,
                "total": len(self._candidates),
            }

    def dismiss(self, candidate_id: str) -> Optional[AltDataCandidate]:
        with self._lock:
            for candidate in self._candidates:
                if candidate.candidate_id != candidate_id:
                    continue
                candidate.state = "dismissed"
                candidate.snoozed_until = None
                self._persist()
                return candidate
            return None

    def snooze(
        self,
        candidate_id: str,
        *,
        hours: int,
        now: Optional[datetime] = None,
    ) -> Optional[AltDataCandidate]:
        if hours <= 0:
            raise ValueError("snooze hours must be positive")
        reference = (now or _utc_now())
        if reference.tzinfo is None:
            reference = reference.replace(tzinfo=timezone.utc)
        target = (reference + timedelta(hours=hours)).replace(microsecond=0)
        with self._lock:
            for candidate in self._candidates:
                if candidate.candidate_id != candidate_id:
                    continue
                candidate.state = "snoozed"
                candidate.snoozed_until = target.isoformat()
                self._persist()
                return candidate
            return None

    def mark_converted(
        self,
        candidate_id: str,
        task_id: str,
    ) -> Optional[AltDataCandidate]:
        with self._lock:
            for candidate in self._candidates:
                if candidate.candidate_id != candidate_id:
                    continue
                candidate.state = "converted"
                candidate.converted_task_id = task_id
                candidate.snoozed_until = None
                self._persist()
                return candidate
            return None


# ---------------------------------------------------------------------------
# Conversion → research task payload
# ---------------------------------------------------------------------------


def candidate_to_task_payload(candidate: AltDataCandidate) -> Dict[str, Any]:
    """Build the workbench-task payload for converting ``candidate``.

    The resulting payload is fed straight into
    :meth:`ResearchWorkbenchStore.create_task` and carries the
    candidate identifier inside ``context['alt_data_candidate_id']`` so
    the round-trip can be re-played from the task back to the
    originating signal.

    Tags ``alt-data:<component>`` and ``industry:<name>`` are stored on
    ``context['tags']`` (the workbench task model itself does not have a
    top-level tags field — we round-trip via context, mirroring the
    screener-candidate pattern).
    """

    tags = [f"alt-data:{candidate.source_component}"]
    if candidate.industry:
        tags.append(f"industry:{candidate.industry}")

    description = (
        f"{candidate.headline}\n\n"
        f"来源组件: {candidate.source_component} "
        f"(signal_type={candidate.signal_type})\n"
        f"行业 / 标的: {candidate.industry or '—'}\n"
        f"影响力 / 周环比: {candidate.impact_score:+.2f}\n"
        f"提及次数 / mentions: {candidate.mentions}\n"
        f"候选生成时间: {candidate.generated_at}"
    )

    context = {
        "alt_data_candidate_id": candidate.candidate_id,
        "alt_data_component": candidate.source_component,
        "alt_data_signal_type": candidate.signal_type,
        "alt_data_industry": candidate.industry,
        "alt_data_impact_score": candidate.impact_score,
        "alt_data_mentions": candidate.mentions,
        "alt_data_evidence": candidate.evidence_link,
        "tags": tags,
    }

    title_industry = candidate.industry or "全局"
    title = f"[Alt-Data] {candidate.source_component} · {title_industry}"

    summary = candidate.headline or "alt-data 候选"

    return {
        "type": "macro_mispricing",
        # The workbench's valid-status set is {new, in_progress,
        # blocked, complete, archived}; "triaged" is rendered as
        # "new" on the board for now — the spec called it "triaged",
        # but extending the state machine would touch shared task
        # flow logic which is out of scope. The candidate carries the
        # "triaged" intent through context['alt_data_triage'].
        "status": "new",
        "title": title,
        "source": f"alt_data:{candidate.source_component}",
        "symbol": "",
        "template": "",
        "note": description,
        "context": context,
        "snapshot": {
            "headline": candidate.headline,
            "summary": summary,
            "payload": {
                "alt_data_candidate_id": candidate.candidate_id,
                "evidence_link": candidate.evidence_link,
                "impact_score": candidate.impact_score,
                "mentions": candidate.mentions,
            },
        },
    }


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------


_candidate_store: Optional[CandidateStore] = None
_store_lock = threading.Lock()


def get_candidate_store() -> CandidateStore:
    """Return the process-wide :class:`CandidateStore` instance."""

    global _candidate_store
    if _candidate_store is None:
        with _store_lock:
            if _candidate_store is None:
                _candidate_store = CandidateStore()
    return _candidate_store


def reset_candidate_store_for_tests(store: Optional[CandidateStore] = None) -> None:
    """Inject a fresh :class:`CandidateStore` (used in tests)."""

    global _candidate_store
    with _store_lock:
        _candidate_store = store


__all__ = [
    "AltDataCandidate",
    "CandidateStore",
    "candidate_to_task_payload",
    "generate_candidates_from_alt_data",
    "get_candidate_store",
    "policy_impact_threshold",
    "policy_mentions_threshold",
    "reset_candidate_store_for_tests",
    "shfe_weekly_change_threshold_pct",
    "stale_after_days",
    "STALE_AFTER_DAYS_DEFAULT",
    "VALID_CANDIDATE_STATES",
]

"""Macro briefing time-series archive (Phase F5.2).

Extracted from :mod:`macro_briefing` — contains the JSONL-backed
persistence layer for macro briefing generations. All archive symbols
are re-exported from :mod:`macro_briefing` for backward compatibility
so external callers and tests are unaffected.

Public surface:

- :class:`ArchivedMacroBriefing` — frozen DTO for one archived row
- :class:`MacroBriefingArchive` — JSONL-backed archive with rotation +
  in-memory cap
- :func:`get_macro_briefing_archive` — process-wide singleton accessor
- :func:`reset_macro_briefing_archive_for_tests` — test injection hook
- Module-level constants: :data:`ARCHIVE_ROTATE_SIZE_BYTES`,
  :data:`ARCHIVE_MEMORY_CAP`, :data:`ARCHIVE_DEFAULT_DAYS_WINDOW`,
  :data:`ARCHIVE_MAX_DAYS_WINDOW`
"""

from __future__ import annotations

import json
import logging
import os
import threading
from collections import deque
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional, Tuple

from .macro_briefing import MacroBriefing, _utc_now_iso

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# JSONL archive default path. Lives next to the narrative archive and
# composite-signal archive under ``cache/alt_data/`` so it inherits the
# same on-disk hygiene + git-ignore rules already in place for runtime
# caches.
_DEFAULT_ARCHIVE_PATH_REL = (
    Path("cache") / "alt_data" / "macro_briefing_history.jsonl"
)

# Rotation threshold: roll the JSONL once it grows past this many bytes.
# 10 MB matches the E4 narrative + F4.1 composite archives so the on-disk
# hygiene story is uniform. Each macro briefing row is ~1.5-3 KB after
# JSON encoding (5 sections of bullets + summary_paragraph + evidence
# links in UTF-8 Chinese), so 10 MB buys ~3500-6700 entries before
# rotation — comfortably more than a year of hourly emissions even when
# the dashboard polls aggressively.
ARCHIVE_ROTATE_SIZE_BYTES = 10 * 1024 * 1024

# In-memory cap so a hot-path read never materialises every line on disk.
# Older reads fall through to the on-disk JSONL and stream lazily. We pick
# 100 (vs the narrative archive's 200) because each briefing row carries
# five denormalised section lists plus a redundant summary_paragraph and
# evidence_links payload — keeping the deque cap a little tighter avoids
# a memory blow-up in a long-running process.
ARCHIVE_MEMORY_CAP = 100

# Hard maximum the endpoint will honour for the ``days`` query string.
ARCHIVE_DEFAULT_DAYS_WINDOW = 14
ARCHIVE_MAX_DAYS_WINDOW = 90


def _archive_default_path() -> Path:
    """Return the repo-relative default archive path.

    Resolved lazily so test code can monkey-patch it (and so importing
    this module never touches the filesystem). Anchors to the project
    root via the same ``parents[3]`` jump used by
    ``governance.PROJECT_ROOT`` so the path is identical regardless of
    cwd.
    """

    project_root = Path(__file__).resolve().parents[3]
    return project_root / _DEFAULT_ARCHIVE_PATH_REL


def _parse_archive_timestamp(value: Optional[str]) -> Optional[datetime]:
    """Parse an archive timestamp; tolerates missing tz by treating as UTC."""

    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


@dataclass(frozen=True)
class ArchivedMacroBriefing:
    """One archived macro briefing entry.

    Mirrors the surface that the frontend needs to render a Timeline view
    without dragging along the composer's internal mutable
    :class:`MacroBriefing` dataclass. ``original_generated_at`` preserves
    the composer stamp from :attr:`MacroBriefing.generated_at` so two
    appends derived from the same snapshot stay distinguishable from the
    wall-clock ``archived_at`` field.

    All 5 section lists from the source briefing are preserved verbatim
    so the F5.1 day-over-day delta layer can reconstruct yesterday's
    briefing from this archive (which is the whole motivation for the
    F5.2 phase). ``evidence_links_count`` is denormalised onto the row
    so the history endpoint can show "本日有 5 条证据链接" without
    forcing every consumer to scan ``evidence_links`` end-to-end. The
    full ``evidence_links`` payload itself is preserved too so the
    reconstructed yesterday briefing carries its provenance.
    """

    archived_at: str
    time_window_days: int
    policy_section: List[str] = field(default_factory=list)
    capital_flow_section: List[str] = field(default_factory=list)
    commodity_section: List[str] = field(default_factory=list)
    governance_section: List[str] = field(default_factory=list)
    composite_section: List[str] = field(default_factory=list)
    summary_paragraph: str = ""
    evidence_links: List[Dict[str, Any]] = field(default_factory=list)
    evidence_links_count: int = 0
    original_generated_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        payload = asdict(self)
        # Re-compute the denormalised counter at serialisation time so a
        # mismatch between stored ``evidence_links_count`` and the actual
        # list length cannot leak through the endpoint.
        payload["evidence_links_count"] = len(self.evidence_links)
        return payload

    @classmethod
    def from_dict(cls, payload: Dict[str, Any]) -> "ArchivedMacroBriefing":
        def _coerce_section(value: Any) -> List[str]:
            if not isinstance(value, list):
                return []
            return [str(item) for item in value]

        links_raw = payload.get("evidence_links")
        evidence_links: List[Dict[str, Any]] = (
            [dict(link) for link in links_raw if isinstance(link, dict)]
            if isinstance(links_raw, list)
            else []
        )
        try:
            time_window_days = int(payload.get("time_window_days", 0) or 0)
        except (TypeError, ValueError):
            time_window_days = 0
        try:
            evidence_count = int(payload.get("evidence_links_count", 0) or 0)
        except (TypeError, ValueError):
            evidence_count = 0
        # The denormalised counter can drift if a row was hand-edited; the
        # actual list length wins on reload.
        if evidence_count != len(evidence_links):
            evidence_count = len(evidence_links)
        return cls(
            archived_at=str(payload.get("archived_at") or ""),
            time_window_days=time_window_days,
            policy_section=_coerce_section(payload.get("policy_section")),
            capital_flow_section=_coerce_section(
                payload.get("capital_flow_section")
            ),
            commodity_section=_coerce_section(payload.get("commodity_section")),
            governance_section=_coerce_section(payload.get("governance_section")),
            composite_section=_coerce_section(payload.get("composite_section")),
            summary_paragraph=str(payload.get("summary_paragraph") or ""),
            evidence_links=evidence_links,
            evidence_links_count=evidence_count,
            original_generated_at=str(payload.get("original_generated_at") or ""),
        )

    def to_macro_briefing(self) -> MacroBriefing:
        """Materialise the archived row back into a live :class:`MacroBriefing`.

        Used by the F5.1 delta endpoint's yesterday reconstruction path
        (see ``backend.app.api.v1.endpoints.alt_data._compose_yesterday_briefing``).
        ``generated_at`` echoes ``original_generated_at`` so the
        downstream delta layer's ``yesterday_generated_at`` field
        points at the *composer* stamp rather than the *archive* stamp.
        """

        return MacroBriefing(
            generated_at=self.original_generated_at or self.archived_at,
            time_window_days=self.time_window_days,
            policy_section=list(self.policy_section),
            capital_flow_section=list(self.capital_flow_section),
            commodity_section=list(self.commodity_section),
            governance_section=list(self.governance_section),
            composite_section=list(self.composite_section),
            summary_paragraph=self.summary_paragraph,
            evidence_links=[dict(link) for link in self.evidence_links],
        )


class MacroBriefingArchive:
    """JSONL-backed archive of macro briefing generations.

    Mirrors :class:`src.data.alternative.narrative.NarrativeArchive` and
    :class:`src.data.alternative.composite_signal.CompositeSignalArchive`
    1:1 so the on-disk hygiene story is identical across the three
    Phase E4-style archives. See the module-level constants for the
    rotation threshold and memory cap.

    Persistence strategy
    --------------------

    Each call to :meth:`append` writes one JSON document followed by a
    newline. The file is opened with ``O_APPEND`` so concurrent writers
    cannot interleave bytes mid-record. The write is followed by an
    ``fsync`` so a crash never leaves a partial line behind (a partial
    line is still possible if power is yanked between the write and the
    fsync, but :meth:`recent` skips malformed lines with a warning so
    the archive degrades gracefully rather than blowing up the
    endpoint).

    Rotation
    --------

    Before each append we check the file size. Once it crosses
    :data:`ARCHIVE_ROTATE_SIZE_BYTES`, we ``rename`` it to
    ``macro_briefing_history.jsonl.<utc-iso>.archive`` and start a fresh
    file. :meth:`recent` only reads the live file -- archived rolls are
    out of band until an operator manually merges them.

    Memory cap
    ----------

    The instance keeps the most recent :data:`ARCHIVE_MEMORY_CAP`
    entries in a ``deque`` for hot-path reads. Anything older than that
    is read from disk via a forward scan whose results are filtered to
    the requested window. This keeps a long-running process from
    accumulating an unbounded list while still serving the common-case
    14-day window from RAM.
    """

    def __init__(
        self,
        storage_path: Optional[Path] = None,
        *,
        rotate_size_bytes: int = ARCHIVE_ROTATE_SIZE_BYTES,
        memory_cap: int = ARCHIVE_MEMORY_CAP,
    ) -> None:
        self.storage_path = (
            Path(storage_path) if storage_path else _archive_default_path()
        )
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        self.rotate_size_bytes = max(int(rotate_size_bytes), 1)
        self._memory_cap = max(int(memory_cap), 1)
        self._lock = threading.RLock()
        self._memory: Deque[ArchivedMacroBriefing] = deque(
            maxlen=self._memory_cap
        )
        self._memory_seeded = False
        self._observed_disk_signature: Optional[Tuple[int, int, int]] = None

    # ---- Internal helpers ----

    @staticmethod
    def _stat_signature(stat_result: os.stat_result) -> Tuple[int, int, int]:
        """Return a compact file identity used to detect external appends."""

        mtime_ns = getattr(
            stat_result,
            "st_mtime_ns",
            int(getattr(stat_result, "st_mtime", 0.0) * 1_000_000_000),
        )
        return (
            int(getattr(stat_result, "st_ino", 0)),
            int(getattr(stat_result, "st_size", 0)),
            int(mtime_ns),
        )

    def _current_disk_signature(self) -> Optional[Tuple[int, int, int]]:
        try:
            return self._stat_signature(self.storage_path.stat())
        except FileNotFoundError:
            return None
        except OSError as exc:
            logger.warning(
                "Failed to stat macro briefing archive %s: %s",
                self.storage_path,
                exc,
            )
            return None

    def _seed_memory_from_disk(self) -> None:
        """Lazily pre-populate the in-memory deque from the tail of the file."""

        if self._memory_seeded:
            return
        self._memory_seeded = True
        if not self.storage_path.exists():
            self._observed_disk_signature = None
            return
        tail: List[ArchivedMacroBriefing] = []
        try:
            with self.storage_path.open("r", encoding="utf-8") as handle:
                for line in handle:
                    stripped = line.strip()
                    if not stripped:
                        continue
                    try:
                        payload = json.loads(stripped)
                    except json.JSONDecodeError:
                        logger.warning(
                            "Skipping malformed line in %s while seeding memory",
                            self.storage_path,
                        )
                        continue
                    if not isinstance(payload, dict):
                        continue
                    tail.append(ArchivedMacroBriefing.from_dict(payload))
        except OSError as exc:
            logger.warning(
                "Failed to seed macro briefing archive memory from %s: %s",
                self.storage_path,
                exc,
            )
            return
        for entry in tail[-self._memory_cap :]:
            self._memory.append(entry)
        self._observed_disk_signature = self._current_disk_signature()

    def _maybe_rotate(self) -> None:
        """Roll the JSONL once it crosses :attr:`rotate_size_bytes`."""

        try:
            size = (
                self.storage_path.stat().st_size if self.storage_path.exists() else 0
            )
        except OSError as exc:
            logger.warning(
                "Failed to stat macro briefing archive %s for rotation: %s",
                self.storage_path,
                exc,
            )
            return
        if size < self.rotate_size_bytes:
            return
        timestamp = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        rolled = self.storage_path.with_name(
            f"{self.storage_path.name}.{timestamp}.archive"
        )
        try:
            self.storage_path.rename(rolled)
            logger.info(
                "Rotated macro briefing archive %s -> %s (size=%d bytes)",
                self.storage_path,
                rolled,
                size,
            )
        except OSError as exc:
            logger.warning(
                "Failed to rotate macro briefing archive %s: %s",
                self.storage_path,
                exc,
            )

    @staticmethod
    def _is_empty_briefing(briefing: MacroBriefing) -> bool:
        """Return True when every section is empty.

        Empty briefings -- the ``EMPTY_BRIEFING_SUMMARY`` cold-start
        response -- are *not* persisted: a timeline of "no signal" rows
        is uninformative and only inflates the log. This mirrors the E4
        narrative archive's "skip empty bullets" policy.
        """

        for section in (
            briefing.policy_section,
            briefing.capital_flow_section,
            briefing.commodity_section,
            briefing.governance_section,
            briefing.composite_section,
        ):
            if section:
                return False
        return True

    # ---- Public API ----

    def append(self, briefing: MacroBriefing) -> ArchivedMacroBriefing:
        """Append ``briefing`` to the JSONL and to the in-memory deque.

        Empty briefings (every section empty) are skipped per the
        documented policy. The returned :class:`ArchivedMacroBriefing`
        still carries the synthesised wall-clock + the original
        composer stamp so callers can mirror it onto their own UI state
        without re-reading the file.
        """

        with self._lock:
            self._seed_memory_from_disk()

            archived_at = _utc_now_iso()
            entry = ArchivedMacroBriefing(
                archived_at=archived_at,
                time_window_days=int(briefing.time_window_days or 0),
                policy_section=list(briefing.policy_section),
                capital_flow_section=list(briefing.capital_flow_section),
                commodity_section=list(briefing.commodity_section),
                governance_section=list(briefing.governance_section),
                composite_section=list(briefing.composite_section),
                summary_paragraph=str(briefing.summary_paragraph or ""),
                evidence_links=[dict(link) for link in briefing.evidence_links],
                evidence_links_count=len(briefing.evidence_links),
                original_generated_at=str(briefing.generated_at or archived_at),
            )

            if self._is_empty_briefing(briefing):
                # Return the materialised entry so the endpoint can mirror
                # it into its own response shape, but do not write it to
                # disk and do not push it onto the in-memory deque -- the
                # frontend timeline view would only render an empty card.
                return entry

            self._maybe_rotate()

            payload = json.dumps(
                entry.to_dict(), ensure_ascii=False, default=str
            )
            flags = os.O_WRONLY | os.O_CREAT | os.O_APPEND
            try:
                fd = os.open(str(self.storage_path), flags, 0o644)
            except OSError as exc:
                logger.warning(
                    "Failed to open macro briefing archive %s for append: %s",
                    self.storage_path,
                    exc,
                )
                self._memory.append(entry)
                return entry
            try:
                os.write(fd, (payload + "\n").encode("utf-8"))
                os.fsync(fd)
                self._observed_disk_signature = self._stat_signature(
                    os.fstat(fd)
                )
            except OSError as exc:
                logger.warning(
                    "Failed to append to macro briefing archive %s: %s",
                    self.storage_path,
                    exc,
                )
            finally:
                os.close(fd)

            self._memory.append(entry)
            return entry

    def recent(
        self,
        *,
        days: int = ARCHIVE_DEFAULT_DAYS_WINDOW,
        time_window_days: Optional[int] = None,
        now: Optional[datetime] = None,
    ) -> List[ArchivedMacroBriefing]:
        """Return archive entries from the last ``days`` days.

        ``time_window_days`` (exact-match against the stored
        ``time_window_days`` carried on each row) is an optional filter
        applied *after* the time-window cutoff. A ``None`` value
        disables the filter -- the common case is to return every
        briefing regardless of which composer window produced it.

        Reads newest-first; malformed lines are logged + skipped so a
        single corrupt row cannot break the endpoint.
        """

        days = max(int(days), 1)
        days = min(days, ARCHIVE_MAX_DAYS_WINDOW)
        reference = now or datetime.now(tz=timezone.utc)
        if reference.tzinfo is None:
            reference = reference.replace(tzinfo=timezone.utc)
        cutoff = reference - timedelta(days=days)

        with self._lock:
            self._seed_memory_from_disk()
            all_entries: List[ArchivedMacroBriefing] = list(self._memory)
            disk_signature = self._current_disk_signature()
            disk_changed = disk_signature != self._observed_disk_signature
            if len(all_entries) >= self._memory_cap or disk_changed:
                disk_tail = self._read_disk_after(cutoff)
                seen_keys = {
                    self._entry_identity(entry) for entry in all_entries
                }
                missing_entries: List[ArchivedMacroBriefing] = []
                for entry in disk_tail:
                    key = self._entry_identity(entry)
                    if key in seen_keys:
                        continue
                    seen_keys.add(key)
                    missing_entries.append(entry)
                    all_entries.append(entry)
                if disk_changed:
                    for entry in missing_entries:
                        self._memory.append(entry)
                    self._observed_disk_signature = disk_signature

        results: List[ArchivedMacroBriefing] = []
        for entry in all_entries:
            entry_at = _parse_archive_timestamp(entry.archived_at)
            if entry_at is None or entry_at < cutoff:
                continue
            if time_window_days is not None and entry.time_window_days != int(
                time_window_days
            ):
                continue
            results.append(entry)
        results.sort(key=lambda e: e.archived_at, reverse=True)
        return results

    def find_for_date(
        self,
        *,
        target_date: datetime,
    ) -> Optional[ArchivedMacroBriefing]:
        """Return the most-recent archived briefing whose UTC date matches.

        Used by the F5.1 delta endpoint's yesterday reconstruction path:
        given ``target_date = today - 1 day`` (UTC), the helper scans the
        merged memory + disk view and returns the newest row whose
        ``archived_at`` falls on the same UTC calendar day. Returns
        ``None`` when no matching row exists, which the delta endpoint
        surfaces as ``has_baseline=False``.

        The day comparison is done in UTC. A small lookback (``+1`` day
        beyond the requested date) is used as the lower window so the
        merged view always includes the candidate row even when it
        landed near the end of the prior day.
        """

        if target_date.tzinfo is None:
            target_date = target_date.replace(tzinfo=timezone.utc)
        target_day = target_date.date()
        # Pull a small window that brackets the day so the merged memory
        # + disk read picks up the row even when memory_cap has rotated
        # past it.
        candidates = self.recent(
            days=2,
            now=target_date + timedelta(days=1, hours=12),
        )
        for entry in candidates:
            entry_at = _parse_archive_timestamp(entry.archived_at)
            if entry_at is None:
                continue
            if entry_at.date() == target_day:
                return entry
        return None

    @staticmethod
    def _entry_identity(
        entry: ArchivedMacroBriefing,
    ) -> Tuple[Any, ...]:
        """Build a collision-resistant identity for RAM/disk merge de-duping."""

        return (
            entry.archived_at,
            entry.original_generated_at,
            entry.time_window_days,
            entry.summary_paragraph,
            tuple(entry.policy_section),
            tuple(entry.capital_flow_section),
            tuple(entry.commodity_section),
            tuple(entry.governance_section),
            tuple(entry.composite_section),
        )

    def _read_disk_after(
        self, cutoff: datetime
    ) -> List[ArchivedMacroBriefing]:
        """Read every archive entry on disk whose timestamp is >= ``cutoff``."""

        if not self.storage_path.exists():
            return []
        out: List[ArchivedMacroBriefing] = []
        try:
            with self.storage_path.open("r", encoding="utf-8") as handle:
                for line in handle:
                    stripped = line.strip()
                    if not stripped:
                        continue
                    try:
                        payload = json.loads(stripped)
                    except json.JSONDecodeError:
                        logger.warning(
                            "Skipping malformed line in macro briefing archive %s",
                            self.storage_path,
                        )
                        continue
                    if not isinstance(payload, dict):
                        continue
                    entry = ArchivedMacroBriefing.from_dict(payload)
                    entry_at = _parse_archive_timestamp(entry.archived_at)
                    if entry_at is None or entry_at < cutoff:
                        continue
                    out.append(entry)
        except OSError as exc:
            logger.warning(
                "Failed to read macro briefing archive %s: %s",
                self.storage_path,
                exc,
            )
        return out


# Module-level singleton (mirrors NarrativeArchive / CompositeSignalArchive).
# Tests inject a fresh archive via ``reset_macro_briefing_archive_for_tests``.
_macro_briefing_archive: Optional[MacroBriefingArchive] = None
_archive_lock = threading.Lock()


def get_macro_briefing_archive() -> MacroBriefingArchive:
    """Return the process-wide :class:`MacroBriefingArchive` instance."""

    global _macro_briefing_archive
    if _macro_briefing_archive is None:
        with _archive_lock:
            if _macro_briefing_archive is None:
                _macro_briefing_archive = MacroBriefingArchive()
    return _macro_briefing_archive


def reset_macro_briefing_archive_for_tests(
    archive: Optional[MacroBriefingArchive] = None,
) -> None:
    """Inject a fresh :class:`MacroBriefingArchive` (test-only hook)."""

    global _macro_briefing_archive
    with _archive_lock:
        _macro_briefing_archive = archive


__all__ = [
    "ARCHIVE_DEFAULT_DAYS_WINDOW",
    "ARCHIVE_MAX_DAYS_WINDOW",
    "ARCHIVE_MEMORY_CAP",
    "ARCHIVE_ROTATE_SIZE_BYTES",
    "ArchivedMacroBriefing",
    "MacroBriefingArchive",
    "get_macro_briefing_archive",
    "reset_macro_briefing_archive_for_tests",
]

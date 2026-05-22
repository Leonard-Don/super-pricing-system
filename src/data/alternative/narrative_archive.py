"""Phase E4: time-series archive of alt-data narrative generations.

Extracted from :mod:`src.data.alternative.narrative` (which re-exports every
public symbol defined here for backward compatibility).

Persistence strategy
--------------------

Each call to :meth:`NarrativeArchive.append` writes one JSON document
followed by a newline. The file is opened with ``O_APPEND`` so concurrent
writers cannot interleave bytes mid-record. The write is followed by an
``fsync`` so a crash never leaves a partial line behind (a partial line is
still possible if power is yanked between the write and the fsync, but
:meth:`NarrativeArchive.recent` skips malformed lines with a warning so the
archive degrades gracefully rather than blowing up the endpoint).

Rotation
--------

Before each append we check the file size. Once it crosses
:data:`ARCHIVE_ROTATE_SIZE_BYTES`, we ``rename`` it to
``narrative_history.jsonl.<utc-iso>.archive`` and start a fresh file.
``recent`` only reads the live file -- archived rolls are out of band until
an operator manually merges them.
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
from typing import TYPE_CHECKING, Any, Deque, Dict, List, Optional, Tuple

if TYPE_CHECKING:  # pragma: no cover - imported only for typing
    from .narrative import AltDataNarrative


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# JSONL archive default path. Lives next to the rest of the alt-data cache
# under ``cache/alt_data/`` so it inherits the same on-disk hygiene.
_DEFAULT_ARCHIVE_PATH_REL = Path("cache") / "alt_data" / "narrative_history.jsonl"

# Rotation threshold: roll the JSONL once it grows past this many bytes.
# 10 MB lets us accumulate roughly 30k narrative entries (each row is
# typically 250-400 bytes after JSON encoding with redundant snapshot
# paths) before we lazily archive the file and start a fresh one --
# comfortably more than a year of hourly refreshes at expected cadence.
ARCHIVE_ROTATE_SIZE_BYTES = 10 * 1024 * 1024

# In-memory cap so a hot path read never materialises every line on disk.
# Older reads fall through to the on-disk JSONL and stream lazily.
ARCHIVE_MEMORY_CAP = 200

# Hard maximum the endpoint will honour for the ``days`` query string. The
# default is 14 -- this clamp lets a determined operator drill into the
# 90-day tail without forcing the read pattern to load the entire log.
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


def _utc_now_iso() -> str:
    return (
        datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()
    )


@dataclass(frozen=True)
class ArchivedNarrative:
    """One archived narrative entry.

    Mirrors the surface that the frontend needs to render a Timeline view
    without dragging along the synthesiser's internal evidence-link
    metadata. ``original_generated_at`` preserves the synthesis stamp
    from :attr:`AltDataNarrative.generated_at` so two appends with the
    same underlying snapshot stay distinguishable from the wall-clock
    ``archived_at`` field.
    """

    archived_at: str
    industry: Optional[str]
    summary: str
    bullets: List[str] = field(default_factory=list)
    evidence_links: List[Dict[str, Any]] = field(default_factory=list)
    original_generated_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: Dict[str, Any]) -> "ArchivedNarrative":
        bullets_raw = payload.get("bullets")
        bullets: List[str] = (
            [str(b) for b in bullets_raw] if isinstance(bullets_raw, list) else []
        )
        links_raw = payload.get("evidence_links")
        evidence_links: List[Dict[str, Any]] = (
            [dict(link) for link in links_raw if isinstance(link, dict)]
            if isinstance(links_raw, list)
            else []
        )
        industry = payload.get("industry")
        if industry is not None:
            industry = str(industry) or None
        return cls(
            archived_at=str(payload.get("archived_at") or ""),
            industry=industry if industry else None,
            summary=str(payload.get("summary") or ""),
            bullets=bullets,
            evidence_links=evidence_links,
            original_generated_at=str(payload.get("original_generated_at") or ""),
        )


class NarrativeArchive:
    """JSONL-backed archive of alt-data narrative generations.

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
    ``narrative_history.jsonl.<utc-iso>.archive`` and start a fresh
    file. ``recent`` only reads the live file -- archived rolls are out
    of band until an operator manually merges them. This matches the
    audit doc Phase E4 spec ("rotate when > 10 MB; keep N=200 in memory;
    rest on disk").

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
        self._memory: Deque[ArchivedNarrative] = deque(maxlen=self._memory_cap)
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
        """Return the live JSONL signature, or ``None`` if it is absent."""

        try:
            return self._stat_signature(self.storage_path.stat())
        except FileNotFoundError:
            return None
        except OSError as exc:
            logger.warning(
                "Failed to stat narrative archive %s: %s",
                self.storage_path,
                exc,
            )
            return None

    def _seed_memory_from_disk(self) -> None:
        """Lazily pre-populate the in-memory deque from the tail of the file.

        We only seed once per instance to keep ``append`` cheap, then
        keep the deque in sync via the appended entries themselves.
        """

        if self._memory_seeded:
            return
        self._memory_seeded = True
        if not self.storage_path.exists():
            self._observed_disk_signature = None
            return
        tail: List[ArchivedNarrative] = []
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
                    tail.append(ArchivedNarrative.from_dict(payload))
        except OSError as exc:
            logger.warning(
                "Failed to seed narrative archive memory from %s: %s",
                self.storage_path,
                exc,
            )
            return
        # Keep only the trailing ``memory_cap`` entries -- the deque
        # ``maxlen`` already enforces this, but slicing avoids building
        # the full list into the deque just to discard the head.
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
                "Failed to stat narrative archive %s for rotation: %s",
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
                "Rotated narrative archive %s -> %s (size=%d bytes)",
                self.storage_path,
                rolled,
                size,
            )
        except OSError as exc:
            logger.warning(
                "Failed to rotate narrative archive %s: %s",
                self.storage_path,
                exc,
            )

    # ---- Public API ----

    def append(
        self,
        narrative: "AltDataNarrative",
        industry: Optional[str] = None,
    ) -> ArchivedNarrative:
        """Append ``narrative`` to the on-disk JSONL and to the in-memory deque.

        Skips empty-state generations (where ``bullets`` is empty) -- a
        timeline of "no signals" rows is not useful and just inflates
        the log size for nothing.
        """

        with self._lock:
            self._seed_memory_from_disk()
            if not narrative.bullets:
                # The empty-state copy is informational; don't archive it.
                return ArchivedNarrative(
                    archived_at=_utc_now_iso(),
                    industry=(industry or None),
                    summary=narrative.summary,
                    bullets=[],
                    evidence_links=[],
                    original_generated_at=narrative.generated_at or "",
                )
            self._maybe_rotate()

            archived_at = _utc_now_iso()
            entry = ArchivedNarrative(
                archived_at=archived_at,
                industry=(industry or None),
                summary=narrative.summary,
                bullets=list(narrative.bullets),
                evidence_links=[dict(link) for link in narrative.evidence_links],
                original_generated_at=narrative.generated_at or archived_at,
            )

            payload = json.dumps(entry.to_dict(), ensure_ascii=False, default=str)
            # ``os.O_APPEND`` guarantees the OS will place every write
            # at the current end-of-file even across processes; combined
            # with a single ``write()`` call this keeps lines atomic
            # without a heavyweight temp-file rename per record.
            flags = os.O_WRONLY | os.O_CREAT | os.O_APPEND
            try:
                fd = os.open(str(self.storage_path), flags, 0o644)
            except OSError as exc:
                logger.warning(
                    "Failed to open narrative archive %s for append: %s",
                    self.storage_path,
                    exc,
                )
                # Still update the in-memory deque so the current
                # process surfaces the entry on subsequent reads.
                self._memory.append(entry)
                return entry
            try:
                # Single write keeps the line atomic at the OS level.
                os.write(fd, (payload + "\n").encode("utf-8"))
                os.fsync(fd)
                self._observed_disk_signature = self._stat_signature(os.fstat(fd))
            except OSError as exc:
                logger.warning(
                    "Failed to append to narrative archive %s: %s",
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
        industry: Optional[str] = None,
        now: Optional[datetime] = None,
    ) -> List[ArchivedNarrative]:
        """Return archive entries from the last ``days`` days.

        Reads in reverse chronological order so the caller sees the most
        recent entries first (the frontend Timeline renders top-to-bottom
        as newest-to-oldest). ``industry`` filter applies *after* the
        time-window filter -- a None / empty value matches every row.

        Malformed JSON lines are logged + skipped so a single corrupt
        row cannot break the endpoint.
        """

        days = max(int(days), 1)
        days = min(days, ARCHIVE_MAX_DAYS_WINDOW)
        reference = now or datetime.now(tz=timezone.utc)
        if reference.tzinfo is None:
            reference = reference.replace(tzinfo=timezone.utc)
        cutoff = reference - timedelta(days=days)

        with self._lock:
            self._seed_memory_from_disk()
            all_entries: List[ArchivedNarrative] = list(self._memory)
            disk_signature = self._current_disk_signature()
            disk_changed = disk_signature != self._observed_disk_signature
            # When the in-memory deque is saturated, also read older
            # entries from disk so the requested window is honoured. If
            # another worker/scheduler appended after our last read,
            # merge the fresh rows even while the deque is not yet full.
            if len(all_entries) >= self._memory_cap or disk_changed:
                disk_tail = self._read_disk_after(cutoff)
                seen_keys = {self._entry_identity(entry) for entry in all_entries}
                missing_entries: List[ArchivedNarrative] = []
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

        results: List[ArchivedNarrative] = []
        for entry in all_entries:
            entry_at = _parse_archive_timestamp(entry.archived_at)
            if entry_at is None or entry_at < cutoff:
                continue
            if industry:
                if (entry.industry or "") != industry:
                    continue
            results.append(entry)
        results.sort(key=lambda e: e.archived_at, reverse=True)
        return results

    @staticmethod
    def _entry_identity(entry: ArchivedNarrative) -> Tuple[Any, ...]:
        """Build a collision-resistant identity for RAM/disk merge de-duping."""

        return (
            entry.archived_at,
            entry.original_generated_at,
            entry.industry or "",
            entry.summary,
            tuple(entry.bullets),
        )

    def _read_disk_after(self, cutoff: datetime) -> List[ArchivedNarrative]:
        """Read every archive entry on disk whose timestamp is >= ``cutoff``."""

        if not self.storage_path.exists():
            return []
        out: List[ArchivedNarrative] = []
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
                            "Skipping malformed line in narrative archive %s",
                            self.storage_path,
                        )
                        continue
                    if not isinstance(payload, dict):
                        continue
                    entry = ArchivedNarrative.from_dict(payload)
                    entry_at = _parse_archive_timestamp(entry.archived_at)
                    if entry_at is None or entry_at < cutoff:
                        continue
                    out.append(entry)
        except OSError as exc:
            logger.warning(
                "Failed to read narrative archive %s: %s",
                self.storage_path,
                exc,
            )
        return out


# Module-level singleton (mirrors CandidateStore in
# src/research/alt_data_candidates.py). Tests inject a fresh archive
# via ``reset_narrative_archive_for_tests``.
_narrative_archive: Optional[NarrativeArchive] = None
_archive_lock = threading.Lock()


def get_narrative_archive() -> NarrativeArchive:
    """Return the process-wide :class:`NarrativeArchive` instance."""

    global _narrative_archive
    if _narrative_archive is None:
        with _archive_lock:
            if _narrative_archive is None:
                _narrative_archive = NarrativeArchive()
    return _narrative_archive


def reset_narrative_archive_for_tests(
    archive: Optional[NarrativeArchive] = None,
) -> None:
    """Inject a fresh :class:`NarrativeArchive` (test-only hook)."""

    global _narrative_archive
    with _archive_lock:
        _narrative_archive = archive


__all__ = [
    "ARCHIVE_DEFAULT_DAYS_WINDOW",
    "ARCHIVE_MAX_DAYS_WINDOW",
    "ARCHIVE_MEMORY_CAP",
    "ARCHIVE_ROTATE_SIZE_BYTES",
    "ArchivedNarrative",
    "NarrativeArchive",
    "get_narrative_archive",
    "reset_narrative_archive_for_tests",
]

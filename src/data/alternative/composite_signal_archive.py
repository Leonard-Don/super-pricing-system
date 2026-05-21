"""Time-series archive of composite-signal emissions (Phase F4.1).

Extracted from :mod:`composite_signal` so the cross-component detector stays
focused on detection. :class:`CompositeSignalArchive` is a JSONL-backed,
size-rotating store mirroring ``NarrativeArchive`` / ``MacroBriefingArchive``;
see the module-level constants for the rotation threshold and memory cap.
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

from .composite_signal import CompositeSignal, _sanitize_supporting_component_payload

logger = logging.getLogger(__name__)

# JSONL archive default path. Lives next to the narrative archive under
# ``cache/alt_data/`` so it inherits the same on-disk hygiene + git-ignore
# rules already in place for runtime caches.
_DEFAULT_ARCHIVE_PATH_REL = (
    Path("cache") / "alt_data" / "composite_signal_history.jsonl"
)

# Rotation threshold: roll the JSONL once it grows past this many bytes.
# 10 MB at ~400-600 bytes/row gives us ~17-25k entries before rotation,
# which is comfortably more than a year of hourly emissions even when
# each refresh fires multiple composites at once. Mirrors the narrative
# archive's threshold so on-disk hygiene is identical across the two
# Phase E4-style archives.
ARCHIVE_ROTATE_SIZE_BYTES = 10 * 1024 * 1024

# In-memory cap so a hot-path read never materialises every line on disk.
# Older reads fall through to the on-disk JSONL and stream lazily. We
# pick 100 (vs the narrative archive's 200) because each composite row
# carries a denormalised supporting_components list and therefore takes
# more RAM per entry — keeping the deque cap a little tighter avoids a
# memory blow-up in a long-running process when many high-fan-out
# composites are emitted per refresh.
ARCHIVE_MEMORY_CAP = 100

# Hard maximum the endpoint will honour for the ``days`` query string.
ARCHIVE_DEFAULT_DAYS_WINDOW = 14
ARCHIVE_MAX_DAYS_WINDOW = 90

# Conviction tier ranking used by ``recent()`` so callers can ask for
# "give me every composite at or above MEDIUM" without re-implementing
# the comparison locally.
_CONVICTION_RANK = {"high": 3, "medium": 2, "low": 1}


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


def _utc_now_iso() -> str:
    return (
        datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()
    )


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
class ArchivedCompositeSignal:
    """One archived composite-signal entry.

    Mirrors the surface that the frontend needs to render a timeline
    view without dragging along the detector's internal mutable
    ``CompositeSignal`` dataclass. ``original_emit_at`` preserves the
    detector stamp from :attr:`CompositeSignal.emit_at` so two appends
    derived from the same snapshot stay distinguishable from the
    wall-clock ``archived_at`` field.
    """

    archived_at: str
    direction: str
    target_kind: str
    target: str
    conviction: str
    supporting_components: List[Dict[str, Any]] = field(default_factory=list)
    aggregate_strength: float = 0.0
    original_emit_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        payload = asdict(self)
        # The ``supporting_components`` list is already a list-of-dicts
        # courtesy of the append-time serialisation; ``asdict`` returns
        # it as such. Round the aggregate to keep the JSON stable across
        # platform float repr drift.
        payload["supporting_components"] = [
            _sanitize_supporting_component_payload(component)
            for component in self.supporting_components
            if isinstance(component, dict)
        ]
        payload["aggregate_strength"] = round(
            float(self.aggregate_strength), 4
        )
        payload["supporting_components_count"] = len(
            payload["supporting_components"]
        )
        return payload

    @classmethod
    def from_dict(cls, payload: Dict[str, Any]) -> "ArchivedCompositeSignal":
        components_raw = payload.get("supporting_components")
        components: List[Dict[str, Any]] = (
            [
                _sanitize_supporting_component_payload(item)
                for item in components_raw
                if isinstance(item, dict)
            ]
            if isinstance(components_raw, list)
            else []
        )
        try:
            aggregate = float(payload.get("aggregate_strength", 0.0) or 0.0)
        except (TypeError, ValueError):
            aggregate = 0.0
        return cls(
            archived_at=str(payload.get("archived_at") or ""),
            direction=str(payload.get("direction") or ""),
            target_kind=str(payload.get("target_kind") or ""),
            target=str(payload.get("target") or ""),
            conviction=str(payload.get("conviction") or ""),
            supporting_components=components,
            aggregate_strength=aggregate,
            original_emit_at=str(payload.get("original_emit_at") or ""),
        )

    @property
    def industry(self) -> Optional[str]:
        """Return ``target`` when ``target_kind == 'industry'``, else ``None``."""

        return self.target if self.target_kind == "industry" else None


class CompositeSignalArchive:
    """JSONL-backed archive of composite-signal emissions.

    Mirrors :class:`src.data.alternative.narrative.NarrativeArchive` 1:1
    so the on-disk hygiene story is identical across the two
    Phase E4-style archives. See the module-level constants for the
    rotation threshold and memory cap.
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
        self._memory: Deque[ArchivedCompositeSignal] = deque(
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
                "Failed to stat composite signal archive %s: %s",
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
        tail: List[ArchivedCompositeSignal] = []
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
                    tail.append(ArchivedCompositeSignal.from_dict(payload))
        except OSError as exc:
            logger.warning(
                "Failed to seed composite signal archive memory from %s: %s",
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
                "Failed to stat composite signal archive %s for rotation: %s",
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
                "Rotated composite signal archive %s -> %s (size=%d bytes)",
                self.storage_path,
                rolled,
                size,
            )
        except OSError as exc:
            logger.warning(
                "Failed to rotate composite signal archive %s: %s",
                self.storage_path,
                exc,
            )

    # ---- Public API ----

    def append(self, signal: CompositeSignal) -> ArchivedCompositeSignal:
        """Append ``signal`` to the JSONL and to the in-memory deque.

        Returns the materialised :class:`ArchivedCompositeSignal` so callers
        can mirror it onto their own UI state without re-reading the file.
        """

        with self._lock:
            self._seed_memory_from_disk()
            self._maybe_rotate()

            archived_at = _utc_now_iso()
            components_payload: List[Dict[str, Any]] = []
            for component in signal.supporting_components or []:
                if hasattr(component, "to_dict"):
                    components_payload.append(dict(component.to_dict()))
                elif isinstance(component, dict):
                    components_payload.append(dict(component))
            entry = ArchivedCompositeSignal(
                archived_at=archived_at,
                direction=str(signal.direction or ""),
                target_kind=str(signal.target_kind or ""),
                target=str(signal.target or ""),
                conviction=str(signal.conviction or ""),
                supporting_components=components_payload,
                aggregate_strength=float(signal.aggregate_strength or 0.0),
                original_emit_at=str(signal.emit_at or archived_at),
            )

            payload = json.dumps(
                entry.to_dict(), ensure_ascii=False, default=str
            )
            flags = os.O_WRONLY | os.O_CREAT | os.O_APPEND
            try:
                fd = os.open(str(self.storage_path), flags, 0o644)
            except OSError as exc:
                logger.warning(
                    "Failed to open composite signal archive %s for append: %s",
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
                    "Failed to append to composite signal archive %s: %s",
                    self.storage_path,
                    exc,
                )
            finally:
                os.close(fd)

            self._memory.append(entry)
            return entry

    def append_many(
        self, signals: List[CompositeSignal]
    ) -> List[ArchivedCompositeSignal]:
        """Convenience: append a list of signals, skipping empty input.

        The endpoint and any scheduler hook call ``detect_composite_signals``
        and want to persist the *whole batch* in one shot. Skipping the
        empty case keeps a "no composite this refresh" run from inflating
        the on-disk log with nothing useful.
        """

        if not signals:
            return []
        return [self.append(signal) for signal in signals]

    def recent(
        self,
        *,
        days: int = ARCHIVE_DEFAULT_DAYS_WINDOW,
        industry: Optional[str] = None,
        min_conviction: Optional[str] = None,
        now: Optional[datetime] = None,
    ) -> List[ArchivedCompositeSignal]:
        """Return archive entries from the last ``days`` days.

        ``industry`` (exact-match against ``target`` when ``target_kind``
        is ``industry``) and ``min_conviction`` (one of ``high`` /
        ``medium`` / ``low``) are both applied *after* the time-window
        filter. A ``None`` / empty value disables the filter.

        Reads newest-first; malformed lines are logged + skipped so a
        single corrupt row cannot break the endpoint.
        """

        days = max(int(days), 1)
        days = min(days, ARCHIVE_MAX_DAYS_WINDOW)
        reference = now or datetime.now(tz=timezone.utc)
        if reference.tzinfo is None:
            reference = reference.replace(tzinfo=timezone.utc)
        cutoff = reference - timedelta(days=days)

        min_rank: Optional[int] = None
        if min_conviction:
            min_rank = _CONVICTION_RANK.get(str(min_conviction).lower())

        with self._lock:
            self._seed_memory_from_disk()
            all_entries: List[ArchivedCompositeSignal] = list(self._memory)
            disk_signature = self._current_disk_signature()
            disk_changed = disk_signature != self._observed_disk_signature
            if len(all_entries) >= self._memory_cap or disk_changed:
                disk_tail = self._read_disk_after(cutoff)
                seen_keys = {
                    self._entry_identity(entry) for entry in all_entries
                }
                missing_entries: List[ArchivedCompositeSignal] = []
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

        results: List[ArchivedCompositeSignal] = []
        for entry in all_entries:
            entry_at = _parse_archive_timestamp(entry.archived_at)
            if entry_at is None or entry_at < cutoff:
                continue
            if industry and entry.target != industry:
                continue
            if min_rank is not None:
                entry_rank = _CONVICTION_RANK.get(
                    str(entry.conviction).lower(), 0
                )
                if entry_rank < min_rank:
                    continue
            results.append(entry)
        results.sort(key=lambda e: e.archived_at, reverse=True)
        return results

    @staticmethod
    def _entry_identity(
        entry: ArchivedCompositeSignal,
    ) -> Tuple[Any, ...]:
        """Build a collision-resistant identity for RAM/disk merge de-duping."""

        return (
            entry.archived_at,
            entry.original_emit_at,
            entry.direction,
            entry.target_kind,
            entry.target,
            entry.conviction,
        )

    def _read_disk_after(
        self, cutoff: datetime
    ) -> List[ArchivedCompositeSignal]:
        """Read every archive entry on disk whose timestamp is >= ``cutoff``."""

        if not self.storage_path.exists():
            return []
        out: List[ArchivedCompositeSignal] = []
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
                            "Skipping malformed line in composite signal archive %s",
                            self.storage_path,
                        )
                        continue
                    if not isinstance(payload, dict):
                        continue
                    entry = ArchivedCompositeSignal.from_dict(payload)
                    entry_at = _parse_archive_timestamp(entry.archived_at)
                    if entry_at is None or entry_at < cutoff:
                        continue
                    out.append(entry)
        except OSError as exc:
            logger.warning(
                "Failed to read composite signal archive %s: %s",
                self.storage_path,
                exc,
            )
        return out


# Module-level singleton (mirrors NarrativeArchive). Tests inject a fresh
# archive via ``reset_composite_signal_archive_for_tests``.
_composite_archive: Optional[CompositeSignalArchive] = None
_archive_lock = threading.Lock()


def get_composite_signal_archive() -> CompositeSignalArchive:
    """Return the process-wide :class:`CompositeSignalArchive` instance."""

    global _composite_archive
    if _composite_archive is None:
        with _archive_lock:
            if _composite_archive is None:
                _composite_archive = CompositeSignalArchive()
    return _composite_archive


def reset_composite_signal_archive_for_tests(
    archive: Optional[CompositeSignalArchive] = None,
) -> None:
    """Inject a fresh :class:`CompositeSignalArchive` (test-only hook)."""

    global _composite_archive
    with _archive_lock:
        _composite_archive = archive


__all__ = [
    "ARCHIVE_DEFAULT_DAYS_WINDOW",
    "ARCHIVE_MAX_DAYS_WINDOW",
    "ARCHIVE_MEMORY_CAP",
    "ARCHIVE_ROTATE_SIZE_BYTES",
    "ArchivedCompositeSignal",
    "CompositeSignalArchive",
    "get_composite_signal_archive",
    "reset_composite_signal_archive_for_tests",
]

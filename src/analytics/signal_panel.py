"""Point-in-time persistence for structural-decay / mispricing signals.

The macro research workbench computes a ``structural_decay`` score (see
:func:`src.analytics.structural_decay.build_structural_decay`) once per
analysis request and then discards it. Because no score time-series is ever
persisted, ``scripts/validate_structural_decay.py`` had to *reconstruct* a
panel from scratch every run, and the architecture could not validate its
own signals.

This module closes that gap. Every time the engine computes a structural
decay score it appends one row to a JSONL panel store. Each row records
``(symbol, timestamp, component scores..., final score)`` — i.e. exactly
what was knowable at that timestamp.

POINT-IN-TIME DISCIPLINE
------------------------
A row is written at analysis time and is never mutated afterwards. The
``observed_at`` field is the wall-clock UTC instant the score became known;
a downstream validator must only ever join a row's score against price
data *after* ``observed_at`` (no look-ahead). The forward-return side of any
backtest is the consumer's responsibility — this store deliberately persists
*only* what was knowable at ``t`` and nothing about the future.

DESIGN
------
The on-disk hygiene mirrors :class:`CompositeSignalArchive` and
:class:`NarrativeArchive` 1:1 (atomic append, size-based rotation, lazy
in-memory seed, malformed-line skip) so the JSONL story is identical across
every history archive in the repo. See ``docs/structural_decay_validation.md``
for how the panel feeds the walk-forward rank-IC / IR validation.
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

logger = logging.getLogger(__name__)

DiskSignature = Tuple[Tuple[str, int, int, int], ...]


# ---------------------------------------------------------------------------
# Storage constants
# ---------------------------------------------------------------------------

# JSONL panel store path. Lives next to the rest of the alt-data history
# archives (``narrative_history.jsonl`` / ``composite_signal_history.jsonl``)
# so on-disk hygiene and backup scope are uniform.
_DEFAULT_PANEL_PATH_REL = Path("cache") / "alt_data" / "structural_decay_panel.jsonl"

# Rotation threshold: roll the JSONL once it grows past this many bytes.
# 10 MB at ~300-450 bytes/row gives ~23-35k rows before rotation — well over
# a year of routine analysis traffic. Mirrors the narrative / composite
# archives' threshold.
PANEL_ROTATE_SIZE_BYTES = 10 * 1024 * 1024

# In-memory cap so a hot-path read never materialises every row on disk.
# Older reads fall through to the on-disk JSONL and stream lazily.
PANEL_MEMORY_CAP = 400

# Hard maximum the validation capability will honour for a lookback window.
PANEL_DEFAULT_DAYS_WINDOW = 365
PANEL_MAX_DAYS_WINDOW = 3650


def _panel_default_path() -> Path:
    """Return the repo-relative default panel path.

    Resolved lazily so importing this module never touches the filesystem
    and test code can monkey-patch a tmp path. Anchors to the project root
    via the same ``parents[2]`` jump that locates ``src/`` from this file.
    """

    project_root = Path(__file__).resolve().parents[2]
    return project_root / _DEFAULT_PANEL_PATH_REL


def _utc_now_iso() -> str:
    return datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()


def _parse_panel_timestamp(value: Optional[str]) -> Optional[datetime]:
    """Parse a panel timestamp; tolerates a missing tz by treating it as UTC."""

    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _coerce_float(value: Any, default: float = 0.0) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return default
    if numeric != numeric or numeric in (float("inf"), float("-inf")):
        return default
    return numeric


# ---------------------------------------------------------------------------
# Panel row
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SignalPanelRow:
    """One point-in-time structural-decay observation.

    ``observed_at`` is the wall-clock UTC instant the score became known. A
    backtest must only join this score against price data strictly *after*
    ``observed_at``.

    ``component_scores`` holds the per-category contributions that summed to
    ``final_score`` (``people`` / ``execution`` / ``valuation`` / ``evidence``)
    plus the raw point-in-time inputs that drove them (``capm_alpha_pct`` /
    ``ff3_alpha_pct`` / ``gap_pct`` / ``people_fragility_score``). Persisting
    the inputs as well as the outputs means a future validator can re-derive
    a component without re-running the whole engine.
    """

    observed_at: str
    symbol: str
    signal_name: str
    final_score: float
    action: str = ""
    dominant_failure_mode: str = ""
    component_scores: Dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        payload = asdict(self)
        payload["final_score"] = round(_coerce_float(self.final_score), 6)
        payload["component_scores"] = {
            str(key): round(_coerce_float(val), 6)
            for key, val in (self.component_scores or {}).items()
        }
        return payload

    @classmethod
    def from_dict(cls, payload: Dict[str, Any]) -> "SignalPanelRow":
        components_raw = payload.get("component_scores")
        components: Dict[str, float] = {}
        if isinstance(components_raw, dict):
            components = {
                str(key): _coerce_float(val) for key, val in components_raw.items()
            }
        return cls(
            observed_at=str(payload.get("observed_at") or ""),
            symbol=str(payload.get("symbol") or "").upper(),
            signal_name=str(payload.get("signal_name") or "structural_decay"),
            final_score=_coerce_float(payload.get("final_score")),
            action=str(payload.get("action") or ""),
            dominant_failure_mode=str(payload.get("dominant_failure_mode") or ""),
            component_scores=components,
        )


# ---------------------------------------------------------------------------
# Panel store
# ---------------------------------------------------------------------------


class SignalPanelStore:
    """JSONL-backed point-in-time panel of mispricing-signal scores.

    Mirrors :class:`src.data.alternative.composite_signal.CompositeSignalArchive`
    so the on-disk hygiene story is identical across every history archive
    in the repo. See the module-level constants for the rotation threshold
    and the in-memory cap.
    """

    def __init__(
        self,
        storage_path: Optional[Path] = None,
        *,
        rotate_size_bytes: int = PANEL_ROTATE_SIZE_BYTES,
        memory_cap: int = PANEL_MEMORY_CAP,
    ) -> None:
        self.storage_path = (
            Path(storage_path) if storage_path else _panel_default_path()
        )
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        self.rotate_size_bytes = max(int(rotate_size_bytes), 1)
        self._memory_cap = max(int(memory_cap), 1)
        self._lock = threading.RLock()
        self._memory: Deque[SignalPanelRow] = deque(maxlen=self._memory_cap)
        self._memory_seeded = False
        self._observed_disk_signature: Optional[DiskSignature] = None
        self._observed_disk_cutoff: datetime | None = None

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

    def _storage_paths(self) -> List[Path]:
        """Return rotated archive segments followed by the active JSONL."""

        paths: List[Path] = []
        try:
            for candidate in self.storage_path.parent.iterdir():
                name = candidate.name
                if (
                    name.startswith(f"{self.storage_path.name}.")
                    and name.endswith(".archive")
                    and candidate.is_file()
                ):
                    paths.append(candidate)
        except OSError as exc:
            logger.warning(
                "Failed to list structural-decay panel archives under %s: %s",
                self.storage_path.parent,
                exc,
            )
        paths.sort(key=lambda path: path.name)
        if self.storage_path.exists():
            paths.append(self.storage_path)
        return paths

    def _current_disk_signature(self) -> Optional[DiskSignature]:
        signatures: List[Tuple[str, int, int, int]] = []
        for path in self._storage_paths():
            try:
                inode, size, mtime_ns = self._stat_signature(path.stat())
            except OSError as exc:
                logger.warning(
                    "Failed to stat structural-decay panel segment %s: %s",
                    path,
                    exc,
                )
                continue
            signatures.append((path.name, inode, size, mtime_ns))
        return tuple(signatures) or None

    def _seed_memory_from_disk(self) -> None:
        """Lazily pre-populate the in-memory deque from the tail of the file."""

        if self._memory_seeded:
            return
        self._memory_seeded = True
        storage_paths = self._storage_paths()
        if not storage_paths:
            self._observed_disk_signature = None
            return
        tail: List[SignalPanelRow] = []
        for path in storage_paths:
            try:
                with path.open("r", encoding="utf-8") as handle:
                    for line in handle:
                        stripped = line.strip()
                        if not stripped:
                            continue
                        try:
                            payload = json.loads(stripped)
                        except json.JSONDecodeError:
                            logger.warning(
                                "Skipping malformed line in %s while seeding memory",
                                path,
                            )
                            continue
                        if not isinstance(payload, dict):
                            continue
                        tail.append(SignalPanelRow.from_dict(payload))
            except OSError as exc:
                logger.warning(
                    "Failed to seed structural-decay panel memory from %s: %s",
                    path,
                    exc,
                )
                continue
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
                "Failed to stat structural-decay panel %s for rotation: %s",
                self.storage_path,
                exc,
            )
            return
        if size < self.rotate_size_bytes:
            return
        timestamp = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        sequence = 0
        while True:
            rolled = self.storage_path.with_name(
                f"{self.storage_path.name}.{timestamp}.{sequence:06d}.archive"
            )
            if not rolled.exists():
                break
            sequence += 1
        try:
            self.storage_path.rename(rolled)
            logger.info(
                "Rotated structural-decay panel %s -> %s (size=%d bytes)",
                self.storage_path,
                rolled,
                size,
            )
        except OSError as exc:
            logger.warning(
                "Failed to rotate structural-decay panel %s: %s",
                self.storage_path,
                exc,
            )

    # ---- Public API ----

    def append(self, row: SignalPanelRow) -> SignalPanelRow:
        """Append ``row`` to the JSONL and to the in-memory deque.

        Returns the persisted :class:`SignalPanelRow` so callers can mirror
        it without re-reading the file.
        """

        with self._lock:
            self._seed_memory_from_disk()
            self._maybe_rotate()

            payload = json.dumps(row.to_dict(), ensure_ascii=False, default=str)
            flags = os.O_WRONLY | os.O_CREAT | os.O_APPEND
            try:
                fd = os.open(str(self.storage_path), flags, 0o644)
            except OSError as exc:
                logger.warning(
                    "Failed to open structural-decay panel %s for append: %s",
                    self.storage_path,
                    exc,
                )
                self._memory.append(row)
                return row
            try:
                os.write(fd, (payload + "\n").encode("utf-8"))
                os.fsync(fd)
                self._observed_disk_signature = self._current_disk_signature()
            except OSError as exc:
                logger.warning(
                    "Failed to append to structural-decay panel %s: %s",
                    self.storage_path,
                    exc,
                )
            finally:
                os.close(fd)

            self._memory.append(row)
            return row

    def record_structural_decay(
        self,
        *,
        symbol: str,
        structural_decay: Dict[str, Any],
        factor: Optional[Dict[str, Any]] = None,
        gap: Optional[Dict[str, Any]] = None,
        valuation: Optional[Dict[str, Any]] = None,
        people_layer: Optional[Dict[str, Any]] = None,
        observed_at: Optional[str] = None,
    ) -> Optional[SignalPanelRow]:
        """Persist one structural-decay result as a point-in-time panel row.

        ``structural_decay`` is the dict returned by
        :func:`src.analytics.structural_decay.build_structural_decay`. The
        per-category deltas are recomputed from its ``components`` list so the
        stored ``component_scores`` always reconcile to ``final_score``.

        Returns ``None`` (and persists nothing) when ``symbol`` is empty —
        a row with no symbol cannot anchor a cross-sectional rank-IC and
        would only pollute the panel.
        """

        clean_symbol = str(symbol or "").strip().upper()
        if not clean_symbol or not isinstance(structural_decay, dict):
            return None

        category_scores: Dict[str, float] = {
            "people": 0.0,
            "execution": 0.0,
            "valuation": 0.0,
            "evidence": 0.0,
        }
        for component in structural_decay.get("components", []) or []:
            if not isinstance(component, dict):
                continue
            # ``structural_decay`` does not surface the category per component,
            # so map it back via the stable component-key prefix used by
            # ``build_structural_decay``.
            key = str(component.get("key") or "")
            delta = _coerce_float(component.get("delta"))
            category = _category_for_component_key(key)
            category_scores[category] = category_scores.get(category, 0.0) + delta

        factor = factor or {}
        gap = gap or {}
        valuation = valuation or {}
        people_layer = people_layer or {}
        capm_alpha = _coerce_float((factor.get("capm", {}) or {}).get("alpha_pct"))
        ff3_alpha = _coerce_float(
            (factor.get("fama_french", {}) or {}).get("alpha_pct")
        )

        component_scores: Dict[str, float] = dict(category_scores)
        component_scores["capm_alpha_pct"] = capm_alpha
        component_scores["ff3_alpha_pct"] = ff3_alpha
        component_scores["gap_pct"] = _coerce_float(gap.get("gap_pct"))
        component_scores["people_fragility_score"] = _coerce_float(
            people_layer.get("people_fragility_score")
        )

        row = SignalPanelRow(
            observed_at=observed_at or _utc_now_iso(),
            symbol=clean_symbol,
            signal_name="structural_decay",
            final_score=_coerce_float(structural_decay.get("score")),
            action=str(structural_decay.get("action") or ""),
            dominant_failure_mode=str(
                structural_decay.get("dominant_failure_mode") or ""
            ),
            component_scores=component_scores,
        )
        return self.append(row)

    def recent(
        self,
        *,
        days: int = PANEL_DEFAULT_DAYS_WINDOW,
        symbol: Optional[str] = None,
        signal_name: Optional[str] = None,
        now: Optional[datetime] = None,
    ) -> List[SignalPanelRow]:
        """Return panel rows from the last ``days`` days, oldest-first.

        ``symbol`` (exact, case-insensitive) and ``signal_name`` filters are
        applied after the time-window filter. Malformed lines on disk are
        logged and skipped so one corrupt row cannot break a read.
        """

        days = max(int(days), 1)
        days = min(days, PANEL_MAX_DAYS_WINDOW)
        reference = now or datetime.now(tz=timezone.utc)
        if reference.tzinfo is None:
            reference = reference.replace(tzinfo=timezone.utc)
        cutoff = reference - timedelta(days=days)

        symbol_filter = str(symbol or "").strip().upper() or None
        signal_filter = str(signal_name or "").strip() or None

        with self._lock:
            self._seed_memory_from_disk()
            all_rows: List[SignalPanelRow] = list(self._memory)
            disk_signature = self._current_disk_signature()
            disk_changed = disk_signature != self._observed_disk_signature
            disk_window_needs_refresh = (
                self._observed_disk_cutoff is not None
                and cutoff < self._observed_disk_cutoff
            )
            should_refresh_disk_window = (
                len(all_rows) >= self._memory_cap
                or disk_changed
                or disk_window_needs_refresh
            )
            if should_refresh_disk_window:
                disk_tail = self._read_disk_after(cutoff)
                memory_keys = {self._row_identity(row) for row in all_rows}
                missing_rows: List[SignalPanelRow] = []
                disk_rows: List[SignalPanelRow] = []
                disk_keys = set()
                for row in disk_tail:
                    key = self._row_identity(row)
                    disk_keys.add(key)
                    # Preserve disk line cardinality: identical same-second
                    # computations are still distinct point-in-time appends.
                    disk_rows.append(row)
                    if key not in memory_keys:
                        missing_rows.append(row)
                if disk_rows:
                    all_rows = [
                        *disk_rows,
                        *(
                            row
                            for row in all_rows
                            if self._row_identity(row) not in disk_keys
                        ),
                    ]
                if disk_changed or disk_window_needs_refresh:
                    for row in missing_rows:
                        self._memory.append(row)
                    self._observed_disk_signature = disk_signature
                    if disk_changed or self._observed_disk_cutoff is None:
                        self._observed_disk_cutoff = cutoff
                    else:
                        self._observed_disk_cutoff = min(
                            self._observed_disk_cutoff,
                            cutoff,
                        )

        results: List[SignalPanelRow] = []
        for row in all_rows:
            row_at = _parse_panel_timestamp(row.observed_at)
            if row_at is None or row_at < cutoff or row_at > reference:
                continue
            if symbol_filter and row.symbol != symbol_filter:
                continue
            if signal_filter and row.signal_name != signal_filter:
                continue
            results.append(row)
        results.sort(
            key=lambda r: _parse_panel_timestamp(r.observed_at)
            or datetime.min.replace(tzinfo=timezone.utc)
        )
        return results

    def observation_count(self) -> int:
        """Return the total number of rows on disk (whole panel, not windowed).

        Used by the validation capability to report an honest "panel has N
        observations" status when the cross-section is too thin to test.
        """

        storage_paths = self._storage_paths()
        if not storage_paths:
            return 0
        count = 0
        for path in storage_paths:
            try:
                with path.open("r", encoding="utf-8") as handle:
                    for line in handle:
                        stripped = line.strip()
                        if not stripped:
                            continue
                        try:
                            payload = json.loads(stripped)
                        except json.JSONDecodeError:
                            logger.warning(
                                "Skipping malformed line while counting structural-decay panel %s",
                                path,
                            )
                            continue
                        if isinstance(payload, dict):
                            count += 1
            except OSError as exc:
                logger.warning(
                    "Failed to count rows in structural-decay panel segment %s: %s",
                    path,
                    exc,
                )
        return count

    @staticmethod
    def _row_identity(row: SignalPanelRow) -> Tuple[Any, ...]:
        """Build a collision-resistant identity for RAM/disk merge de-duping."""

        component_identity = tuple(
            sorted(
                (str(key), round(_coerce_float(value), 6))
                for key, value in (row.component_scores or {}).items()
            )
        )
        return (
            row.observed_at,
            row.symbol,
            row.signal_name,
            round(row.final_score, 6),
            row.action,
            row.dominant_failure_mode,
            component_identity,
        )

    def _read_disk_after(self, cutoff: datetime) -> List[SignalPanelRow]:
        """Read every panel row on disk whose timestamp is >= ``cutoff``."""

        storage_paths = self._storage_paths()
        if not storage_paths:
            return []
        out: List[SignalPanelRow] = []
        for path in storage_paths:
            try:
                with path.open("r", encoding="utf-8") as handle:
                    for line in handle:
                        stripped = line.strip()
                        if not stripped:
                            continue
                        try:
                            payload = json.loads(stripped)
                        except json.JSONDecodeError:
                            logger.warning(
                                "Skipping malformed line in structural-decay panel %s",
                                path,
                            )
                            continue
                        if not isinstance(payload, dict):
                            continue
                        row = SignalPanelRow.from_dict(payload)
                        row_at = _parse_panel_timestamp(row.observed_at)
                        if row_at is None or row_at < cutoff:
                            continue
                        out.append(row)
            except OSError as exc:
                logger.warning(
                    "Failed to read structural-decay panel segment %s: %s",
                    path,
                    exc,
                )
        return out


# Component-key prefix -> failure-mode category. Mirrors the ``category``
# argument passed to ``add_component`` inside ``build_structural_decay`` so a
# persisted row's ``component_scores`` reconcile exactly to ``final_score``.
_COMPONENT_KEY_CATEGORY = {
    "people_fragility": "people",
    "hiring_dilution": "people",
    "insider_flow": "people",
    "execution_decay": "execution",
    "valuation_excess": "valuation",
    "value_trap": "valuation",
    "evidence_conflict": "evidence",
    "confidence_regime": "evidence",
}


def _category_for_component_key(key: str) -> str:
    return _COMPONENT_KEY_CATEGORY.get(key, "evidence")


# Module-level singleton (mirrors NarrativeArchive / CompositeSignalArchive).
# Tests inject a fresh store via ``reset_signal_panel_store_for_tests``.
_panel_store: Optional[SignalPanelStore] = None
_panel_lock = threading.Lock()


def get_signal_panel_store() -> SignalPanelStore:
    """Return the process-wide :class:`SignalPanelStore` instance."""

    global _panel_store
    if _panel_store is None:
        with _panel_lock:
            if _panel_store is None:
                _panel_store = SignalPanelStore()
    return _panel_store


def reset_signal_panel_store_for_tests(
    store: Optional[SignalPanelStore] = None,
) -> None:
    """Inject a fresh :class:`SignalPanelStore` (test-only hook)."""

    global _panel_store
    with _panel_lock:
        _panel_store = store


__all__ = [
    "PANEL_DEFAULT_DAYS_WINDOW",
    "PANEL_MAX_DAYS_WINDOW",
    "PANEL_MEMORY_CAP",
    "PANEL_ROTATE_SIZE_BYTES",
    "SignalPanelRow",
    "SignalPanelStore",
    "get_signal_panel_store",
    "reset_signal_panel_store_for_tests",
]

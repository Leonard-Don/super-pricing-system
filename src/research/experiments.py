"""Lightweight experiment registry for quantitative research runs.

The registry tracks one record per strategy / market-data diagnostic run.
Each record carries stable metadata so dashboards and downstream services
can attribute results back to their inputs:

* ``run_id`` — registry-assigned UUID4 hex
* ``name`` / ``kind`` — caller-supplied human label and bucket
* ``status`` — lifecycle state from :data:`VALID_RUN_STATUSES`
* ``created_at`` / ``updated_at`` — ISO-8601 UTC timestamps (``Z`` suffix)
* ``params`` — input parameters (redacted on write)
* ``metrics`` — output metrics, merged on update
* ``artifacts`` — references to files, object-store paths, task ids, etc.
* ``tags`` — free-form labels for filtering
* ``source_health`` — optional snapshot from the data provider factory

The registry is in-memory by default. Passing ``storage_path`` enables a
newline-delimited JSON (JSONL) backend; the file is rewritten on each
mutation so semantics stay simple and crash-safe enough for a research
workbench. Credential redaction mirrors the rules used by
``DataProviderFactory._public_reason`` so the registry is safe to persist
even when callers forward raw provider error strings.
"""

from __future__ import annotations

import json
import logging
import math
import re
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Union

logger = logging.getLogger(__name__)


VALID_RUN_STATUSES: frozenset[str] = frozenset(
    {"created", "running", "completed", "failed", "aborted"}
)

_RECORD_FIELDS = (
    "run_id",
    "name",
    "kind",
    "status",
    "created_at",
    "updated_at",
    "params",
    "metrics",
    "artifacts",
    "tags",
    "source_health",
)

_SENSITIVE_KEY_TOKENS = (
    "api_key",
    "apikey",
    "access_token",
    "accesstoken",
    "token",
    "secret",
    "authorization",
    "password",
)

_SECRET_QUERY_RE = re.compile(
    r"(?i)(api[_-]?key|apikey|access[_-]?token|token|secret|authorization|bearer|password)=([^&\s]+)"
)
# Match `Authorization Bearer X`, `Authorization: Bearer X`, `Bearer X`,
# or `Authorization X` in one pass so the inner `Bearer` doesn't get
# captured as the credential value (which would leave `X` exposed).
_SECRET_BEARER_RE = re.compile(
    r"(?i)(authorization|bearer)\s*:?\s*(?:bearer\s+)?[^\s,;]+"
)


class ExperimentRegistryError(ValueError):
    """Raised on invalid registry operations (bad status, missing run, …)."""


def _utc_iso() -> str:
    """Return a stable UTC timestamp (``YYYY-MM-DDTHH:MM:SSZ``)."""
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def _redact_text(text: str) -> str:
    text = _SECRET_QUERY_RE.sub(r"\1=[REDACTED]", text)
    text = _SECRET_BEARER_RE.sub(r"\1 [REDACTED]", text)
    return text


def _sort_key_for_run(record: Dict[str, Any]) -> str:
    return str(record.get("created_at") or "")


def _is_sensitive_key(key: Any) -> bool:
    lowered = str(key).lower()
    return any(token in lowered for token in _SENSITIVE_KEY_TOKENS)


def _redact_value(value: Any) -> Any:
    """Recursively redact secrets in dicts, lists, and strings.

    Sensitive dictionary keys (``api_key``, ``token``, …) are replaced
    wholesale with ``[REDACTED]``; otherwise strings are scrubbed of the
    common credential-in-URL / bearer patterns.
    """
    if isinstance(value, str):
        return _redact_text(value)
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {
            key: ("[REDACTED]" if _is_sensitive_key(key) else _redact_value(item))
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_redact_value(item) for item in value]
    if isinstance(value, tuple):
        return [_redact_value(item) for item in value]
    return value


class ExperimentRegistry:
    """Track lifecycle metadata for strategy / market-data diagnostic runs."""

    def __init__(self, storage_path: Optional[Union[str, Path]] = None) -> None:
        self.storage_path: Optional[Path] = Path(storage_path) if storage_path else None
        self._lock = threading.RLock()
        self._runs: Dict[str, Dict[str, Any]] = {}
        self._order: List[str] = []
        if self.storage_path is not None:
            self._load()

    # ------------------------------------------------------------------
    # public API
    # ------------------------------------------------------------------
    def create_run(
        self,
        *,
        name: str,
        kind: str,
        status: str = "created",
        params: Optional[Dict[str, Any]] = None,
        metrics: Optional[Dict[str, Any]] = None,
        artifacts: Optional[Iterable[str]] = None,
        tags: Optional[Iterable[str]] = None,
        source_health: Optional[Dict[str, Any]] = None,
        run_id: Optional[str] = None,
        timestamp: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Register a new run and return an isolated copy of the record."""
        if status not in VALID_RUN_STATUSES:
            raise ExperimentRegistryError(
                f"Unknown run status: {status!r}. Allowed: {sorted(VALID_RUN_STATUSES)}"
            )

        created_at = timestamp or _utc_iso()
        record: Dict[str, Any] = {
            "run_id": run_id or uuid.uuid4().hex,
            "name": str(_redact_value(name)),
            "kind": str(_redact_value(kind)),
            "status": status,
            "created_at": created_at,
            "updated_at": created_at,
            "params": _redact_value(dict(params or {})),
            "metrics": _redact_value(dict(metrics or {})),
            "artifacts": _redact_value(list(artifacts or [])),
            "tags": _redact_value(list(tags or [])),
            "source_health": _redact_value(dict(source_health)) if source_health else None,
        }

        with self._lock:
            if record["run_id"] in self._runs:
                raise ExperimentRegistryError(
                    f"run_id collision for {record['run_id']!r}"
                )
            self._runs[record["run_id"]] = record
            self._order.insert(0, record["run_id"])
            self._persist()

        return self._copy(record)

    def get_run(self, run_id: str) -> Dict[str, Any]:
        with self._lock:
            record = self._runs.get(run_id)
            if record is None:
                raise ExperimentRegistryError(f"Unknown run_id: {run_id!r}")
            return self._copy(record)

    def list_runs(
        self,
        *,
        kind: Optional[str] = None,
        status: Optional[str] = None,
        tag: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        if limit is not None:
            if limit < 0:
                raise ExperimentRegistryError("limit must be >= 0")
            if limit == 0:
                return []

        with self._lock:
            results: List[Dict[str, Any]] = []
            for run_id in self._order:
                record = self._runs.get(run_id)
                if record is None:
                    continue
                if kind is not None and record["kind"] != kind:
                    continue
                if status is not None and record["status"] != status:
                    continue
                if tag is not None and tag not in record["tags"]:
                    continue
                results.append(self._copy(record))
                if limit is not None and len(results) >= limit:
                    break
            return results

    def update_run(
        self,
        run_id: str,
        *,
        status: Optional[str] = None,
        metrics: Optional[Dict[str, Any]] = None,
        artifacts: Optional[Iterable[str]] = None,
        tags: Optional[Iterable[str]] = None,
        source_health: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        timestamp: Optional[str] = None,
    ) -> Dict[str, Any]:
        if status is not None and status not in VALID_RUN_STATUSES:
            raise ExperimentRegistryError(
                f"Unknown run status: {status!r}. Allowed: {sorted(VALID_RUN_STATUSES)}"
            )

        with self._lock:
            record = self._runs.get(run_id)
            if record is None:
                raise ExperimentRegistryError(f"Unknown run_id: {run_id!r}")

            if status is not None:
                record["status"] = status
            if metrics is not None:
                merged = dict(record["metrics"])
                merged.update(_redact_value(metrics))
                record["metrics"] = merged
            if artifacts is not None:
                seen = set(record["artifacts"])
                merged_artifacts = list(record["artifacts"])
                for entry in _redact_value(list(artifacts)):
                    if entry in seen:
                        continue
                    seen.add(entry)
                    merged_artifacts.append(entry)
                record["artifacts"] = merged_artifacts
            if tags is not None:
                seen_tags = set(record["tags"])
                merged_tags = list(record["tags"])
                for tag in _redact_value(list(tags)):
                    if tag in seen_tags:
                        continue
                    seen_tags.add(tag)
                    merged_tags.append(tag)
                record["tags"] = merged_tags
            if source_health is not None:
                record["source_health"] = _redact_value(dict(source_health))
            if params is not None:
                merged_params = dict(record["params"])
                merged_params.update(_redact_value(dict(params)))
                record["params"] = merged_params

            record["updated_at"] = timestamp or _utc_iso()
            self._persist()
            return self._copy(record)

    # ------------------------------------------------------------------
    # internal helpers
    # ------------------------------------------------------------------
    def _copy(self, record: Dict[str, Any]) -> Dict[str, Any]:
        # json round-trip gives us a cheap deep copy and guarantees the
        # caller can't mutate nested params/metrics inside the registry.
        return json.loads(json.dumps(record, default=str, allow_nan=False))

    def _serialize(self, record: Dict[str, Any]) -> str:
        ordered = {field: record.get(field) for field in _RECORD_FIELDS}
        return json.dumps(ordered, ensure_ascii=False, default=str, allow_nan=False)

    def _persist(self) -> None:
        if self.storage_path is None:
            return
        try:
            self.storage_path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.storage_path.with_suffix(self.storage_path.suffix + ".tmp")
            with tmp.open("w", encoding="utf-8") as handle:
                for run_id in self._order:
                    record = self._runs.get(run_id)
                    if record is None:
                        continue
                    handle.write(self._serialize(record))
                    handle.write("\n")
            tmp.replace(self.storage_path)
        except OSError as exc:
            raise ExperimentRegistryError(
                f"Failed to persist experiment registry: {exc}"
            ) from exc

    def _load(self) -> None:
        assert self.storage_path is not None
        if not self.storage_path.exists():
            return
        try:
            raw = self.storage_path.read_text(encoding="utf-8")
        except OSError as exc:
            raise ExperimentRegistryError(
                f"Failed to read experiment registry {self.storage_path}: {exc}"
            ) from exc

        loaded: List[Dict[str, Any]] = []
        for line in raw.splitlines():
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                logger.warning("Skipping corrupt experiment registry line: %s", line[:120])
                continue
            if not isinstance(record, dict) or "run_id" not in record:
                continue
            normalized = {
                "run_id": str(record.get("run_id")),
                "name": str(record.get("name", "")),
                "kind": str(record.get("kind", "")),
                "status": str(record.get("status", "created")),
                "created_at": str(record.get("created_at") or _utc_iso()),
                "updated_at": str(record.get("updated_at") or record.get("created_at") or _utc_iso()),
                "params": dict(record.get("params") or {}),
                "metrics": dict(record.get("metrics") or {}),
                "artifacts": list(record.get("artifacts") or []),
                "tags": list(record.get("tags") or []),
                "source_health": record.get("source_health"),
            }
            loaded.append(normalized)

        # Sort by created_at descending so the in-memory order is always
        # newest-first regardless of how the file was written or merged.
        loaded.sort(key=_sort_key_for_run, reverse=True)
        for record in loaded:
            self._runs[record["run_id"]] = record
            self._order.append(record["run_id"])

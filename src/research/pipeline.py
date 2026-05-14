"""Lightweight Qlib-style research pipeline contracts.

These immutable-ish dataclass contracts intentionally stay dependency-free so
pricing research notebooks, services, and tests can share the same metadata
shape without pulling in a full ML/backtest stack.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any


class PipelineError(ValueError):
    """Raised when a research pipeline contract is malformed."""


def _clean_name(value: str, field: str = "name") -> str:
    if not isinstance(value, str) or not value.strip():
        raise PipelineError(f"{field} must be a non-empty string")
    return value.strip()


def _validate_string_sequence(values: Sequence[str], *, field: str, allow_empty: bool = False) -> tuple[str, ...]:
    if not isinstance(values, Sequence) or isinstance(values, (str, bytes)):
        raise PipelineError(f"{field} must be a sequence")
    result: list[str] = []
    for value in values:
        if not isinstance(value, str):
            raise PipelineError("column names must be strings")
        if not value.strip():
            raise PipelineError(f"{field} contains a blank value")
        result.append(value.strip())
    if not allow_empty and not result:
        raise PipelineError(f"{field} must contain at least one column")
    if len(set(result)) != len(result):
        raise PipelineError(f"{field} contains duplicate columns")
    return tuple(result)


def _stable_digest(payload: Mapping[str, Any]) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    return "sha256:" + hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _normalize_records(records: Iterable[Mapping[str, Any]]) -> tuple[dict[str, Any], ...]:
    rows: list[dict[str, Any]] = []
    for row in records:
        if not isinstance(row, Mapping):
            raise PipelineError("records must be mappings")
        for key in row:
            if not isinstance(key, str):
                raise PipelineError("column names must be strings")
        rows.append(dict(row))
    return tuple(rows)


def _validate_metrics(metrics: Mapping[str, Any]) -> dict[str, float | int]:
    if not isinstance(metrics, Mapping):
        raise PipelineError("metrics must be a mapping")
    normalized: dict[str, float | int] = {}
    for key, value in metrics.items():
        if not isinstance(key, str) or not key.strip():
            raise PipelineError("metric names must be non-empty strings")
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            raise PipelineError("metrics must be numeric")
        if not math.isfinite(float(value)):
            raise PipelineError("metrics must be finite")
        normalized[key] = value
    return normalized


@dataclass(frozen=True)
class DataHandler:
    name: str
    records: tuple[dict[str, Any], ...]
    columns: tuple[str, ...]
    provider: str | None = None
    fingerprint: str = ""

    @classmethod
    def from_records(
        cls,
        *,
        name: str,
        records: Iterable[Mapping[str, Any]],
        provider: str | None = None,
        columns: Sequence[str] | None = None,
    ) -> DataHandler:
        clean_name = _clean_name(name)
        rows = _normalize_records(records)
        if columns is None:
            seen: list[str] = []
            for row in rows:
                for key in row:
                    if key not in seen:
                        seen.append(key)
            if not seen and rows:
                raise PipelineError("records expose no columns")
            inferred = tuple(seen)
        else:
            inferred = _validate_string_sequence(columns, field="columns", allow_empty=False)
            all_keys = set().union(*(row.keys() for row in rows)) if rows else set(inferred)
            unknown = [col for col in inferred if rows and col not in all_keys]
            if unknown:
                raise PipelineError(f"unknown column(s): {unknown}")
        if not inferred:
            raise PipelineError("at least one column is required")
        payload = {
            "name": clean_name,
            "provider": provider,
            "columns": list(inferred),
            "records": rows,
        }
        return cls(clean_name, rows, inferred, provider, _stable_digest(payload))

    @property
    def row_count(self) -> int:
        return len(self.records)

    @property
    def column_count(self) -> int:
        return len(self.columns)

    @property
    def missingness(self) -> dict[str, float]:
        if self.row_count == 0:
            return {col: 0.0 for col in self.columns}
        return {
            col: sum(1 for row in self.records if col not in row or row.get(col) is None) / self.row_count
            for col in self.columns
        }

    def summary(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "provider": self.provider,
            "columns": self.columns,
            "row_count": self.row_count,
            "column_count": self.column_count,
            "missingness": self.missingness,
            "fingerprint": self.fingerprint,
        }


@dataclass(frozen=True)
class FeatureSet:
    name: str
    feature_columns: tuple[str, ...]
    target: str
    sample_count: int
    missingness: dict[str, float]
    fingerprint: str
    data_handler_fingerprint: str
    data_handler_name: str

    @classmethod
    def from_handler(
        cls,
        handler: DataHandler,
        *,
        name: str,
        features: Sequence[str],
        target: str,
    ) -> FeatureSet:
        if not isinstance(handler, DataHandler):
            raise PipelineError("handler must be a DataHandler")
        clean_name = _clean_name(name)
        if not features:
            raise PipelineError("at least one feature is required")
        feature_columns = _validate_string_sequence(features, field="features", allow_empty=False)
        clean_target = _clean_name(target, "target")
        if clean_target in feature_columns:
            raise PipelineError("target overlaps with feature columns")
        unknown = [col for col in (*feature_columns, clean_target) if col not in handler.columns]
        if unknown:
            raise PipelineError(f"unknown column(s): {unknown}")
        base_missing = handler.missingness
        feature_missing_total = sum(base_missing[col] for col in feature_columns)
        missingness = {col: base_missing[col] for col in feature_columns}
        missingness["_target"] = base_missing[clean_target]
        missingness["_total"] = feature_missing_total / len(feature_columns)
        payload = {
            "name": clean_name,
            "features": feature_columns,
            "target": clean_target,
            "handler": handler.fingerprint,
        }
        return cls(
            clean_name,
            feature_columns,
            clean_target,
            handler.row_count,
            missingness,
            _stable_digest(payload),
            handler.fingerprint,
            handler.name,
        )

    def summary(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "feature_columns": self.feature_columns,
            "target": self.target,
            "sample_count": self.sample_count,
            "missingness": self.missingness,
            "fingerprint": self.fingerprint,
            "data_handler_fingerprint": self.data_handler_fingerprint,
            "data_handler_name": self.data_handler_name,
        }


@dataclass(frozen=True)
class ModelRun:
    name: str
    model_type: str
    parameters: dict[str, Any]
    metrics: dict[str, float | int]
    artifacts: tuple[str, ...]
    provider: str | None
    data_handler_fingerprint: str
    data_handler_name: str
    feature_set_fingerprint: str
    feature_set_name: str

    @classmethod
    def create(
        cls,
        *,
        name: str,
        model_type: str,
        parameters: Mapping[str, Any],
        metrics: Mapping[str, Any],
        data_handler: DataHandler,
        feature_set: FeatureSet,
        artifacts: Sequence[str] = (),
    ) -> ModelRun:
        clean_name = _clean_name(name)
        clean_type = _clean_name(model_type, "model_type")
        if feature_set.data_handler_fingerprint != data_handler.fingerprint:
            raise PipelineError("feature_set does not belong to data_handler")
        artifact_tuple = tuple(str(a) for a in artifacts)
        return cls(
            clean_name,
            clean_type,
            dict(parameters),
            _validate_metrics(metrics),
            artifact_tuple,
            data_handler.provider,
            data_handler.fingerprint,
            data_handler.name,
            feature_set.fingerprint,
            feature_set.name,
        )

    def provenance(self) -> dict[str, str]:
        return {
            "data_handler_fingerprint": self.data_handler_fingerprint,
            "data_handler_name": self.data_handler_name,
            "feature_set_fingerprint": self.feature_set_fingerprint,
            "feature_set_name": self.feature_set_name,
        }

    def summary(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "model_type": self.model_type,
            "parameters": self.parameters,
            "metrics": self.metrics,
            "artifacts": self.artifacts,
            "provider": self.provider,
            "provenance": self.provenance(),
        }


@dataclass(frozen=True)
class BacktestReport:
    name: str
    strategy: str
    metrics: dict[str, float | int]
    source_health: Mapping[str, Any] | None = None
    artifacts: tuple[str, ...] = ()

    @classmethod
    def create(
        cls,
        *,
        name: str,
        strategy: str,
        metrics: Mapping[str, Any],
        source_health: Mapping[str, Any] | None = None,
        artifacts: Sequence[str] = (),
    ) -> BacktestReport:
        return cls(
            _clean_name(name),
            _clean_name(strategy, "strategy"),
            _validate_metrics(metrics),
            dict(source_health) if source_health is not None else None,
            tuple(str(a) for a in artifacts),
        )

    @property
    def required_source_failed(self) -> bool:
        sources = (self.source_health or {}).get("sources", []) if isinstance(self.source_health, Mapping) else []
        return any(bool(src.get("required")) and not bool(src.get("ok")) for src in sources if isinstance(src, Mapping))

    @property
    def fallback_used(self) -> bool:
        if not isinstance(self.source_health, Mapping):
            return False
        if self.source_health.get("fallback_used") is True:
            return True
        sources = self.source_health.get("sources", [])
        return any(bool(src.get("fallback")) for src in sources if isinstance(src, Mapping))

    def summary(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "strategy": self.strategy,
            "metrics": self.metrics,
            "artifacts": self.artifacts,
            "source_health": self.source_health,
            "required_source_failed": self.required_source_failed,
            "fallback_used": self.fallback_used,
        }

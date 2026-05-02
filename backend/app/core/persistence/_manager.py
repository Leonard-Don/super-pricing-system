"""PersistenceManager 主类（30+ 方法）。

依赖 ``_helpers`` 提供的纯函数与 ``_connection`` 提供的 driver / schema 工具。
完整 SQLite/PostgreSQL 双 driver 实现：health、diagnostics、bootstrap、迁移、
record CRUD、timeseries。

The connection / driver / schema-bootstrap helpers live in ``_connection`` and
are invoked through thin wrappers below so the public API on this class stays
unchanged.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

from src.utils.config import PROJECT_ROOT

from . import _connection, _diagnostics, _records, _timeseries
from ._helpers import (
    _json_dumps,
    _utcnow_iso,
)


class PersistenceManager:
    """Small storage facade for research records, jobs and time-series payloads."""

    def __init__(self, database_url: Optional[str] = None, sqlite_path: Optional[str | Path] = None):
        self.database_url = database_url or os.getenv("DATABASE_URL")
        self.sqlite_path = Path(sqlite_path or PROJECT_ROOT / "data" / "infrastructure" / "local_store.sqlite3")
        self.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._driver = self._detect_driver()
        if self._driver.startswith("postgres"):
            try:
                self._ensure_postgres_schema()
            except Exception:
                self._driver = "sqlite"
                self._ensure_sqlite_schema()
        else:
            self._ensure_sqlite_schema()

    def _detect_driver(self) -> str:
        return _connection.detect_driver(self)

    def _schema_file_path(self) -> Path:
        return _connection.schema_file_path(self)

    def _connect_sqlite(self) -> sqlite3.Connection:
        return _connection.connect_sqlite(self)

    def _connect_sqlite_path(self, sqlite_path: str | Path) -> sqlite3.Connection:
        return _connection.connect_sqlite_path(self, sqlite_path)

    def _connect_postgres(self):
        return _connection.connect_postgres(self)

    def _ensure_sqlite_schema(self) -> None:
        _connection.ensure_sqlite_schema(self)

    def _ensure_postgres_schema(self) -> None:
        _connection.ensure_postgres_schema(self)

    def _execute_postgres_script(self, script: str) -> List[str]:
        return _connection.execute_postgres_script(self, script)

    def persistence_diagnostics(self) -> Dict[str, Any]:
        return _diagnostics.persistence_diagnostics(self)

    def bootstrap_postgres(self, enable_timescale_schema: bool = True) -> Dict[str, Any]:
        if not self.database_url:
            raise RuntimeError("DATABASE_URL is not configured")
        if not self._driver.startswith("postgres"):
            raise RuntimeError("PostgreSQL driver is not available; install psycopg or psycopg2")

        executed: List[str] = []
        warnings: List[str] = []
        self._ensure_postgres_schema()
        executed.append("infra_records + infra_timeseries")

        if enable_timescale_schema:
            schema_path = self._schema_file_path()
            if not schema_path.exists():
                warnings.append(f"schema file not found: {schema_path}")
            else:
                try:
                    executed.extend(self._execute_postgres_script(schema_path.read_text(encoding="utf-8")))
                except Exception as exc:
                    warnings.append(f"timescale schema bootstrap partially failed: {exc}")

        diagnostics = self.persistence_diagnostics()
        return {
            "status": "ok" if diagnostics.get("connection_ok") else "degraded",
            "executed": executed,
            "warnings": warnings,
            "diagnostics": diagnostics,
        }

    def health(self) -> Dict[str, Any]:
        return _diagnostics.health(self)

    def sqlite_source_snapshot(self, sqlite_path: Optional[str | Path] = None) -> Dict[str, Any]:
        path = Path(sqlite_path or self.sqlite_path)
        snapshot: Dict[str, Any] = {
            "path": str(path),
            "exists": path.exists(),
            "record_count": 0,
            "timeseries_count": 0,
            "record_types": [],
            "series_names": [],
            "latest_record_updated_at": None,
            "latest_timeseries_timestamp": None,
            "error": None,
        }
        if not path.exists():
            snapshot["error"] = "SQLite source file does not exist"
            return snapshot
        try:
            with self._lock, self._connect_sqlite_path(path) as connection:
                record_row = connection.execute(
                    "SELECT COUNT(*) AS total, MAX(updated_at) AS latest_updated_at FROM infra_records"
                ).fetchone()
                timeseries_row = connection.execute(
                    "SELECT COUNT(*) AS total, MAX(ts) AS latest_ts FROM infra_timeseries"
                ).fetchone()
                record_types = connection.execute(
                    """
                    SELECT record_type, COUNT(*) AS total
                    FROM infra_records
                    GROUP BY record_type
                    ORDER BY total DESC, record_type ASC
                    LIMIT 12
                    """
                ).fetchall()
                series_names = connection.execute(
                    """
                    SELECT series_name, COUNT(*) AS total
                    FROM infra_timeseries
                    GROUP BY series_name
                    ORDER BY total DESC, series_name ASC
                    LIMIT 12
                    """
                ).fetchall()
            snapshot.update(
                {
                    "record_count": int((record_row["total"] if record_row else 0) or 0),
                    "timeseries_count": int((timeseries_row["total"] if timeseries_row else 0) or 0),
                    "record_types": [
                        {"record_type": row["record_type"], "count": int(row["total"] or 0)}
                        for row in record_types
                    ],
                    "series_names": [
                        {"series_name": row["series_name"], "count": int(row["total"] or 0)}
                        for row in series_names
                    ],
                    "latest_record_updated_at": record_row["latest_updated_at"] if record_row else None,
                    "latest_timeseries_timestamp": timeseries_row["latest_ts"] if timeseries_row else None,
                }
            )
        except Exception as exc:
            snapshot["error"] = str(exc)
        return snapshot

    def preview_sqlite_fallback_migration(self, sqlite_path: Optional[str | Path] = None) -> Dict[str, Any]:
        source = self.sqlite_source_snapshot(sqlite_path=sqlite_path)
        diagnostics = self.persistence_diagnostics()
        can_migrate = bool(
            self.database_url
            and self._driver.startswith("postgres")
            and diagnostics.get("connection_ok")
        )
        return {
            "status": "ready" if can_migrate else "blocked",
            "source": source,
            "target": {
                "mode": diagnostics.get("mode"),
                "connection_ok": diagnostics.get("connection_ok"),
                "database_name": diagnostics.get("database_name"),
                "driver": diagnostics.get("driver"),
                "timescale_extension_installed": diagnostics.get("timescale_extension_installed"),
                "hypertables": diagnostics.get("hypertables") or [],
            },
            "plan": {
                "records": source.get("record_count") or 0,
                "timeseries": source.get("timeseries_count") or 0,
                "record_strategy": "upsert by id",
                "timeseries_strategy": "insert if exact row is not already present",
            },
            "recommended_next_steps": diagnostics.get("recommended_next_steps") or [],
        }

    def _record_exists_postgres(self, identifier: str) -> bool:
        return _records.record_exists_postgres(self, identifier)

    def _timeseries_exists_postgres(
        self,
        *,
        series_name: str,
        symbol: str,
        timestamp: str,
        value: Optional[float],
        payload: Dict[str, Any],
    ) -> bool:
        return _timeseries.timeseries_exists_postgres(
            self,
            series_name=series_name,
            symbol=symbol,
            timestamp=timestamp,
            value=value,
            payload=payload,
        )

    def _put_record_postgres_preserving_timestamps(
        self,
        *,
        identifier: str,
        normalized_type: str,
        normalized_key: str,
        payload: Dict[str, Any],
        created_at: str,
        updated_at: str,
    ) -> Dict[str, Any]:
        return _records.put_record_postgres_preserving_timestamps(
            self,
            identifier=identifier,
            normalized_type=normalized_type,
            normalized_key=normalized_key,
            payload=payload,
            created_at=created_at,
            updated_at=updated_at,
        )

    def _put_timeseries_postgres_preserving_created_at(
        self,
        *,
        series_name: str,
        symbol: str,
        timestamp: str,
        value: Optional[float],
        payload: Dict[str, Any],
        created_at: str,
    ) -> Dict[str, Any]:
        return _timeseries.put_timeseries_postgres_preserving_created_at(
            self,
            series_name=series_name,
            symbol=symbol,
            timestamp=timestamp,
            value=value,
            payload=payload,
            created_at=created_at,
        )

    def migrate_sqlite_fallback_to_postgres(
        self,
        *,
        sqlite_path: Optional[str | Path] = None,
        dry_run: bool = True,
        include_records: bool = True,
        include_timeseries: bool = True,
        dedupe_timeseries: bool = True,
        record_limit: Optional[int] = None,
        timeseries_limit: Optional[int] = None,
    ) -> Dict[str, Any]:
        source_path = Path(sqlite_path or self.sqlite_path)
        preview = self.preview_sqlite_fallback_migration(sqlite_path=source_path)
        if preview["status"] != "ready":
            return {
                "status": "blocked",
                "dry_run": dry_run,
                "preview": preview,
                "planned_records": (preview.get("plan") or {}).get("records", 0),
                "planned_timeseries": (preview.get("plan") or {}).get("timeseries", 0),
                "migrated_records": 0,
                "updated_records": 0,
                "migrated_timeseries": 0,
                "skipped_timeseries": 0,
                "warnings": ["PostgreSQL target is not ready for migration"],
            }

        record_rows = []
        timeseries_rows = []
        with self._lock, self._connect_sqlite_path(source_path) as connection:
            if include_records:
                query = "SELECT * FROM infra_records ORDER BY updated_at ASC"
                params: List[Any] = []
                if record_limit:
                    query += " LIMIT ?"
                    params.append(max(1, min(int(record_limit), 100_000)))
                record_rows = connection.execute(query, params).fetchall()
            if include_timeseries:
                query = "SELECT * FROM infra_timeseries ORDER BY ts ASC"
                params = []
                if timeseries_limit:
                    query += " LIMIT ?"
                    params.append(max(1, min(int(timeseries_limit), 100_000)))
                timeseries_rows = connection.execute(query, params).fetchall()

        result: Dict[str, Any] = {
            "status": "preview" if dry_run else "ok",
            "dry_run": dry_run,
            "source_path": str(source_path),
            "source": preview.get("source"),
            "target": preview.get("target"),
            "planned_records": len(record_rows),
            "planned_timeseries": len(timeseries_rows),
            "migrated_records": 0,
            "updated_records": 0,
            "migrated_timeseries": 0,
            "skipped_timeseries": 0,
            "warnings": [],
            "sample_record_ids": [row["id"] for row in record_rows[:5]],
            "sample_series": [
                {
                    "series_name": row["series_name"],
                    "symbol": row["symbol"],
                    "timestamp": row["ts"],
                }
                for row in timeseries_rows[:5]
            ],
        }
        if dry_run:
            return result

        for row in record_rows:
            try:
                payload = json.loads(row["payload"] or "{}")
            except Exception:
                payload = {}
            existed = self._record_exists_postgres(str(row["id"]))
            self._put_record_postgres_preserving_timestamps(
                identifier=str(row["id"]),
                normalized_type=str(row["record_type"] or "generic"),
                normalized_key=str(row["record_key"] or "default"),
                payload=payload,
                created_at=str(row["created_at"] or _utcnow_iso()),
                updated_at=str(row["updated_at"] or row["created_at"] or _utcnow_iso()),
            )
            if existed:
                result["updated_records"] += 1
            else:
                result["migrated_records"] += 1

        for row in timeseries_rows:
            try:
                payload = json.loads(row["payload"] or "{}")
            except Exception:
                payload = {}
            row_signature = {
                "series_name": str(row["series_name"] or "generic"),
                "symbol": str(row["symbol"] or "").upper(),
                "timestamp": str(row["ts"]),
                "value": row["value"],
                "payload": payload,
            }
            if dedupe_timeseries and self._timeseries_exists_postgres(**row_signature):
                result["skipped_timeseries"] += 1
                continue
            self._put_timeseries_postgres_preserving_created_at(
                created_at=str(row["created_at"] or _utcnow_iso()),
                **row_signature,
            )
            result["migrated_timeseries"] += 1

        result["status"] = "ok"
        result["post_migration"] = self.health()
        return result

    def put_record(self, record_type: str, record_key: str, payload: Dict[str, Any], record_id: Optional[str] = None) -> Dict[str, Any]:
        return _records.put_record(self, record_type, record_key, payload, record_id)

    def _put_record_postgres(
        self,
        identifier: str,
        normalized_type: str,
        normalized_key: str,
        payload: Dict[str, Any],
        now: str,
    ) -> Dict[str, Any]:
        return _records.put_record_postgres(self, identifier, normalized_type, normalized_key, payload, now)

    def _normalize_record_limit(self, limit: int) -> int:
        return _records.normalize_record_limit(self, limit)

    def _row_to_record(self, row: Any) -> Dict[str, Any]:
        return _records.row_to_record(self, row)

    def list_records_page(
        self,
        record_type: Optional[str] = None,
        limit: int = 50,
        cursor: Optional[str] = None,
        payload_filters: Optional[Dict[str, Any]] = None,
        sort_by: Optional[str] = None,
        sort_direction: Optional[str] = None,
    ) -> Dict[str, Any]:
        return _records.list_records_page(
            self,
            record_type=record_type,
            limit=limit,
            cursor=cursor,
            payload_filters=payload_filters,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )

    def list_records(self, record_type: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        return _records.list_records(self, record_type=record_type, limit=limit)

    def count_records(self, record_type: Optional[str] = None, payload_filters: Optional[Dict[str, Any]] = None) -> int:
        return _records.count_records(self, record_type=record_type, payload_filters=payload_filters)

    def get_record(self, record_type: str, record_key: str) -> Optional[Dict[str, Any]]:
        return _records.get_record(self, record_type, record_key)

    def put_timeseries(
        self,
        series_name: str,
        symbol: str,
        timestamp: str,
        value: Optional[float],
        payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return _timeseries.put_timeseries(self, series_name, symbol, timestamp, value, payload)

    def list_timeseries(
        self,
        *,
        series_name: Optional[str] = None,
        symbol: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        return _timeseries.list_timeseries(self, series_name=series_name, symbol=symbol, limit=limit)

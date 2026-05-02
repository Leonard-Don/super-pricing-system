"""PersistenceManager facade.

The class itself stays a thin facade — every method is a one-line forwarder
to a module-level helper. The actual implementations live in:

- ``_helpers``      pure functions for cursor encode/decode, payload filters,
                    record sort plans
- ``_connection``   driver detection, sqlite/postgres connection factories,
                    schema bootstrap DDL, postgres script execution
- ``_records``      record CRUD (``put_record``, ``list_records_page``,
                    ``count_records``, ``get_record`` and the postgres-specific
                    helpers)
- ``_timeseries``   time-series CRUD (``put_timeseries``, ``list_timeseries``
                    and the postgres-specific helpers)
- ``_diagnostics``  ``persistence_diagnostics`` and ``health``
- ``_migrations``   ``bootstrap_postgres``, ``sqlite_source_snapshot``,
                    ``preview_sqlite_fallback_migration`` and
                    ``migrate_sqlite_fallback_to_postgres``

The public and private method signatures on ``PersistenceManager`` are
unchanged, so every call site (auth, task_queue, infrastructure,
scripts/migrate, all existing tests) continues to work.
"""

from __future__ import annotations

import os
import sqlite3
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

from src.utils.config import PROJECT_ROOT

from . import _connection, _diagnostics, _migrations, _records, _timeseries


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
        return _migrations.bootstrap_postgres(self, enable_timescale_schema)

    def health(self) -> Dict[str, Any]:
        return _diagnostics.health(self)

    def sqlite_source_snapshot(self, sqlite_path: Optional[str | Path] = None) -> Dict[str, Any]:
        return _migrations.sqlite_source_snapshot(self, sqlite_path=sqlite_path)

    def preview_sqlite_fallback_migration(self, sqlite_path: Optional[str | Path] = None) -> Dict[str, Any]:
        return _migrations.preview_sqlite_fallback_migration(self, sqlite_path=sqlite_path)

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
        return _migrations.migrate_sqlite_fallback_to_postgres(
            self,
            sqlite_path=sqlite_path,
            dry_run=dry_run,
            include_records=include_records,
            include_timeseries=include_timeseries,
            dedupe_timeseries=dedupe_timeseries,
            record_limit=record_limit,
            timeseries_limit=timeseries_limit,
        )

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

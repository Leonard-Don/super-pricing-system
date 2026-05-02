"""Migration / bootstrap helpers for ``PersistenceManager``.

Module-level functions take the ``PersistenceManager`` instance as their first
positional argument so the public API on the manager class can stay a thin
facade. SQL strings, locking semantics, error handling and return shapes are
identical to the former in-class implementation — pure relocation.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from . import _connection, _records, _timeseries
from ._helpers import _utcnow_iso

if TYPE_CHECKING:  # pragma: no cover - import cycle avoidance
    from ._manager import PersistenceManager


def bootstrap_postgres(
    manager: "PersistenceManager",
    enable_timescale_schema: bool = True,
) -> Dict[str, Any]:
    if not manager.database_url:
        raise RuntimeError("DATABASE_URL is not configured")
    if not manager._driver.startswith("postgres"):
        raise RuntimeError("PostgreSQL driver is not available; install psycopg or psycopg2")

    executed: List[str] = []
    warnings: List[str] = []
    _connection.ensure_postgres_schema(manager)
    executed.append("infra_records + infra_timeseries")

    if enable_timescale_schema:
        schema_path = _connection.schema_file_path(manager)
        if not schema_path.exists():
            warnings.append(f"schema file not found: {schema_path}")
        else:
            try:
                executed.extend(
                    _connection.execute_postgres_script(manager, schema_path.read_text(encoding="utf-8"))
                )
            except Exception as exc:
                warnings.append(f"timescale schema bootstrap partially failed: {exc}")

    diagnostics = manager.persistence_diagnostics()
    return {
        "status": "ok" if diagnostics.get("connection_ok") else "degraded",
        "executed": executed,
        "warnings": warnings,
        "diagnostics": diagnostics,
    }


def sqlite_source_snapshot(
    manager: "PersistenceManager",
    sqlite_path: Optional[str | Path] = None,
) -> Dict[str, Any]:
    path = Path(sqlite_path or manager.sqlite_path)
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
        with manager._lock, _connection.connect_sqlite_path(manager, path) as connection:
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


def preview_sqlite_fallback_migration(
    manager: "PersistenceManager",
    sqlite_path: Optional[str | Path] = None,
) -> Dict[str, Any]:
    source = manager.sqlite_source_snapshot(sqlite_path=sqlite_path)
    diagnostics = manager.persistence_diagnostics()
    can_migrate = bool(
        manager.database_url
        and manager._driver.startswith("postgres")
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


def migrate_sqlite_fallback_to_postgres(
    manager: "PersistenceManager",
    *,
    sqlite_path: Optional[str | Path] = None,
    dry_run: bool = True,
    include_records: bool = True,
    include_timeseries: bool = True,
    dedupe_timeseries: bool = True,
    record_limit: Optional[int] = None,
    timeseries_limit: Optional[int] = None,
) -> Dict[str, Any]:
    source_path = Path(sqlite_path or manager.sqlite_path)
    preview = manager.preview_sqlite_fallback_migration(sqlite_path=source_path)
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
    with manager._lock, _connection.connect_sqlite_path(manager, source_path) as connection:
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
        existed = _records.record_exists_postgres(manager, str(row["id"]))
        _records.put_record_postgres_preserving_timestamps(
            manager,
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
        if dedupe_timeseries and _timeseries.timeseries_exists_postgres(manager, **row_signature):
            result["skipped_timeseries"] += 1
            continue
        _timeseries.put_timeseries_postgres_preserving_created_at(
            manager,
            created_at=str(row["created_at"] or _utcnow_iso()),
            **row_signature,
        )
        result["migrated_timeseries"] += 1

    result["status"] = "ok"
    result["post_migration"] = manager.health()
    return result

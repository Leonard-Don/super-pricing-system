"""Diagnostics + health helpers for ``PersistenceManager``.

Module-level functions take the ``PersistenceManager`` instance as their first
positional argument so the public API on the manager class can stay a thin
facade. SQL strings, locking semantics, error handling and return shapes are
identical to the former in-class implementation — pure relocation.
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any, Dict, List

from . import _connection

if TYPE_CHECKING:  # pragma: no cover - import cycle avoidance
    from ._manager import PersistenceManager


def persistence_diagnostics(manager: "PersistenceManager") -> Dict[str, Any]:
    schema_path = _connection.schema_file_path(manager)
    diagnostics: Dict[str, Any] = {
        "mode": "postgres" if manager._driver.startswith("postgres") else "sqlite_fallback",
        "driver": manager._driver,
        "database_url_configured": bool(manager.database_url),
        "sqlite_path": str(manager.sqlite_path),
        "schema_file": {
            "path": str(schema_path),
            "exists": schema_path.exists(),
            "size_bytes": schema_path.stat().st_size if schema_path.exists() else 0,
        },
        "connection_ok": False,
        "connection_latency_ms": None,
        "database_name": None,
        "server_version": None,
        "current_user": None,
        "timescale_extension_installed": False,
        "timescale_extension_version": None,
        "hypertables": [],
        "tables": [],
        "recommended_next_steps": [],
        "error": None,
        "sqlite_source": manager.sqlite_source_snapshot(),
    }
    if not manager.database_url:
        diagnostics["recommended_next_steps"] = [
            "Set DATABASE_URL to a PostgreSQL / TimescaleDB instance",
            "Install psycopg so the backend can connect with psycopg3",
            "Run persistence bootstrap after the database is reachable",
        ]
        return diagnostics
    if not manager._driver.startswith("postgres"):
        diagnostics["error"] = "DATABASE_URL is configured but no PostgreSQL driver is importable"
        diagnostics["recommended_next_steps"] = [
            "Install psycopg[binary] or psycopg2",
            "Restart backend and re-run persistence bootstrap",
        ]
        return diagnostics
    started_at = time.perf_counter()
    try:
        with manager._lock, _connection.connect_postgres(manager) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT current_database(), current_user, version()")
                db_name, current_user, version = cursor.fetchone()
                diagnostics["database_name"] = db_name
                diagnostics["current_user"] = current_user
                diagnostics["server_version"] = version
                cursor.execute("SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'")
                extension = cursor.fetchone()
                diagnostics["timescale_extension_installed"] = bool(extension)
                diagnostics["timescale_extension_version"] = extension[0] if extension else None
                cursor.execute(
                    """
                    SELECT tablename
                    FROM pg_tables
                    WHERE schemaname = 'public'
                      AND (tablename LIKE 'infra_%'
                           OR tablename IN (
                               'market_timeseries',
                               'research_tasks',
                               'strategy_config_versions',
                               'alert_events',
                               'valuation_snapshots',
                               'data_quality_events'
                           ))
                    ORDER BY tablename
                    """
                )
                diagnostics["tables"] = [row[0] for row in cursor.fetchall()]
                if diagnostics["timescale_extension_installed"]:
                    cursor.execute(
                        """
                        SELECT hypertable_name
                        FROM timescaledb_information.hypertables
                        WHERE hypertable_schema = 'public'
                        ORDER BY hypertable_name
                        """
                    )
                    diagnostics["hypertables"] = [row[0] for row in cursor.fetchall()]
        diagnostics["connection_ok"] = True
        diagnostics["connection_latency_ms"] = round((time.perf_counter() - started_at) * 1000, 2)
    except Exception as exc:
        diagnostics["error"] = str(exc)
        diagnostics["recommended_next_steps"] = [
            "Verify DATABASE_URL credentials and network reachability",
            "Ensure the target PostgreSQL user can create extensions and tables",
            "Re-run persistence bootstrap after connectivity is fixed",
        ]
        return diagnostics

    recommendations: List[str] = []
    if not diagnostics["timescale_extension_installed"]:
        recommendations.append("Install or enable the timescaledb extension on the PostgreSQL instance")
    if "market_timeseries" not in diagnostics["tables"]:
        recommendations.append("Run persistence bootstrap to install production research tables")
    if diagnostics["timescale_extension_installed"] and not diagnostics["hypertables"]:
        recommendations.append("Run persistence bootstrap to create hypertables from the schema file")
    if not recommendations:
        recommendations.append("Persistence stack looks ready for PostgreSQL / TimescaleDB workloads")
    diagnostics["recommended_next_steps"] = recommendations
    return diagnostics


def health(manager: "PersistenceManager") -> Dict[str, Any]:
    postgres_configured = bool(manager.database_url)
    record_count = 0
    timeseries_count = 0
    distinct_series = 0
    diagnostics = persistence_diagnostics(manager)
    try:
        if manager._driver.startswith("postgres"):
            with manager._lock, _connection.connect_postgres(manager) as connection:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT COUNT(*) FROM infra_records")
                    record_count = int(cursor.fetchone()[0] or 0)
                    cursor.execute("SELECT COUNT(*), COUNT(DISTINCT series_name) FROM infra_timeseries")
                    counts = cursor.fetchone()
                    timeseries_count = int(counts[0] or 0)
                    distinct_series = int(counts[1] or 0)
        else:
            with manager._lock, _connection.connect_sqlite(manager) as connection:
                row = connection.execute("SELECT COUNT(*) AS total FROM infra_records").fetchone()
                record_count = int(row["total"] or 0)
                series_row = connection.execute(
                    "SELECT COUNT(*) AS total, COUNT(DISTINCT series_name) AS series_count FROM infra_timeseries"
                ).fetchone()
                timeseries_count = int(series_row["total"] or 0)
                distinct_series = int(series_row["series_count"] or 0)
    except Exception:
        pass
    return {
        "mode": "postgres" if manager._driver.startswith("postgres") else "sqlite_fallback",
        "driver": manager._driver,
        "postgres_configured": postgres_configured,
        "sqlite_path": str(manager.sqlite_path),
        "timescale_ready": bool(
            diagnostics.get("connection_ok")
            and diagnostics.get("timescale_extension_installed")
            and diagnostics.get("hypertables")
        ),
        "database_name": diagnostics.get("database_name"),
        "connection_ok": diagnostics.get("connection_ok"),
        "connection_latency_ms": diagnostics.get("connection_latency_ms"),
        "timescale_extension_installed": diagnostics.get("timescale_extension_installed"),
        "hypertable_count": len(diagnostics.get("hypertables") or []),
        "schema_tables": diagnostics.get("tables") or [],
        "record_count": record_count,
        "timeseries_count": timeseries_count,
        "distinct_series": distinct_series,
        "sqlite_source": manager.sqlite_source_snapshot(),
        "note": (
            "PostgreSQL / TimescaleDB connection is healthy"
            if diagnostics.get("connection_ok") and diagnostics.get("timescale_extension_installed")
            else diagnostics.get("error")
            or (
                "DATABASE_URL is configured and a PostgreSQL driver is importable"
                if manager._driver.startswith("postgres")
                else "Using local SQLite fallback; configure DATABASE_URL plus psycopg to enable PostgreSQL/TimescaleDB"
            )
        ),
    }

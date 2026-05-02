"""Connection / driver / schema-bootstrap helpers for ``PersistenceManager``.

Module-level functions take a ``PersistenceManager`` instance as their first
argument so the public API on the manager class can stay a thin facade. All
SQL strings, locking semantics, and error handling are kept identical to the
former in-class implementation — this is a pure relocation.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import TYPE_CHECKING, List

from src.utils.config import PROJECT_ROOT

if TYPE_CHECKING:  # pragma: no cover - import cycle avoidance
    from ._manager import PersistenceManager


def detect_driver(manager: "PersistenceManager") -> str:
    if not manager.database_url:
        return "sqlite"
    try:
        import psycopg  # noqa: F401

        return "postgres_psycopg3"
    except Exception:
        try:
            import psycopg2  # noqa: F401

            return "postgres_psycopg2"
        except Exception:
            return "sqlite"


def schema_file_path(manager: "PersistenceManager") -> Path:
    return PROJECT_ROOT / "backend" / "app" / "db" / "timescale_schema.sql"


def connect_sqlite(manager: "PersistenceManager") -> sqlite3.Connection:
    connection = sqlite3.connect(manager.sqlite_path)
    connection.row_factory = sqlite3.Row
    return connection


def connect_sqlite_path(manager: "PersistenceManager", sqlite_path: str | Path) -> sqlite3.Connection:
    connection = sqlite3.connect(str(sqlite_path))
    connection.row_factory = sqlite3.Row
    return connection


def connect_postgres(manager: "PersistenceManager"):
    if manager._driver == "postgres_psycopg3":
        import psycopg

        return psycopg.connect(manager.database_url)
    if manager._driver == "postgres_psycopg2":
        import psycopg2

        return psycopg2.connect(manager.database_url)
    raise RuntimeError("PostgreSQL driver is not available")


def ensure_sqlite_schema(manager: "PersistenceManager") -> None:
    with manager._lock, connect_sqlite(manager) as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS infra_records (
                id TEXT PRIMARY KEY,
                record_type TEXT NOT NULL,
                record_key TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_infra_records_type_key
                ON infra_records(record_type, record_key);
            CREATE INDEX IF NOT EXISTS idx_infra_records_updated
                ON infra_records(updated_at DESC, id DESC);
            CREATE INDEX IF NOT EXISTS idx_infra_records_type_updated
                ON infra_records(record_type, updated_at DESC, id DESC);
            CREATE INDEX IF NOT EXISTS idx_infra_records_task_status
                ON infra_records(record_type, json_extract(payload, '$.status'), updated_at DESC, id DESC);
            CREATE INDEX IF NOT EXISTS idx_infra_records_task_backend
                ON infra_records(record_type, json_extract(payload, '$.execution_backend'), updated_at DESC, id DESC);
            CREATE INDEX IF NOT EXISTS idx_infra_records_task_activity
                ON infra_records(
                    record_type,
                    CASE json_extract(payload, '$.status')
                        WHEN 'failed' THEN 5
                        WHEN 'running' THEN 4
                        WHEN 'queued' THEN 3
                        WHEN 'completed' THEN 2
                        WHEN 'cancelled' THEN 1
                        ELSE 0
                    END DESC,
                    updated_at DESC,
                    id DESC
                );

            CREATE TABLE IF NOT EXISTS infra_timeseries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                series_name TEXT NOT NULL,
                symbol TEXT NOT NULL,
                ts TEXT NOT NULL,
                value REAL,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_infra_timeseries_lookup
                ON infra_timeseries(series_name, symbol, ts);
            """
        )


def ensure_postgres_schema(manager: "PersistenceManager") -> None:
    with manager._lock, connect_postgres(manager) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS infra_records (
                    id TEXT PRIMARY KEY,
                    record_type TEXT NOT NULL,
                    record_key TEXT NOT NULL,
                    payload JSONB NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_infra_records_type_key
                    ON infra_records(record_type, record_key);
                CREATE INDEX IF NOT EXISTS idx_infra_records_updated
                    ON infra_records(updated_at DESC, id DESC);
                CREATE INDEX IF NOT EXISTS idx_infra_records_type_updated
                    ON infra_records(record_type, updated_at DESC, id DESC);
                CREATE INDEX IF NOT EXISTS idx_infra_records_task_status
                    ON infra_records(record_type, (payload->>'status'), updated_at DESC, id DESC);
                CREATE INDEX IF NOT EXISTS idx_infra_records_task_backend
                    ON infra_records(record_type, (payload->>'execution_backend'), updated_at DESC, id DESC);
                CREATE INDEX IF NOT EXISTS idx_infra_records_task_activity
                    ON infra_records(
                        record_type,
                        (CASE payload->>'status'
                            WHEN 'failed' THEN 5
                            WHEN 'running' THEN 4
                            WHEN 'queued' THEN 3
                            WHEN 'completed' THEN 2
                            WHEN 'cancelled' THEN 1
                            ELSE 0
                        END) DESC,
                        updated_at DESC,
                        id DESC
                    );

                CREATE TABLE IF NOT EXISTS infra_timeseries (
                    id BIGSERIAL PRIMARY KEY,
                    series_name TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    ts TIMESTAMPTZ NOT NULL,
                    value DOUBLE PRECISION,
                    payload JSONB NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_infra_timeseries_lookup
                    ON infra_timeseries(series_name, symbol, ts);
                """
            )
        connection.commit()


def execute_postgres_script(manager: "PersistenceManager", script: str) -> List[str]:
    statements = [item.strip() for item in str(script or "").split(";") if item.strip()]
    executed: List[str] = []
    with manager._lock, connect_postgres(manager) as connection:
        with connection.cursor() as cursor:
            for statement in statements:
                cursor.execute(statement)
                executed.append(statement.splitlines()[0][:120])
        connection.commit()
    return executed

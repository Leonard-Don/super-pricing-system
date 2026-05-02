"""Time-series helpers for ``PersistenceManager``.

Module-level functions take the ``PersistenceManager`` instance as their first
positional argument so the public API on the manager class can stay a thin
facade. SQL strings, locking semantics, error handling and return shapes are
identical to the former in-class implementation — pure relocation.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from . import _connection
from ._helpers import _json_dumps, _utcnow_iso

if TYPE_CHECKING:  # pragma: no cover - import cycle avoidance
    from ._manager import PersistenceManager


def timeseries_exists_postgres(
    manager: "PersistenceManager",
    *,
    series_name: str,
    symbol: str,
    timestamp: str,
    value: Optional[float],
    payload: Dict[str, Any],
) -> bool:
    with manager._lock, _connection.connect_postgres(manager) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT 1
                FROM infra_timeseries
                WHERE series_name = %s
                  AND symbol = %s
                  AND ts = %s
                  AND ((value IS NULL AND %s IS NULL) OR value = %s)
                  AND payload = %s::jsonb
                LIMIT 1
                """,
                (
                    str(series_name or "generic"),
                    str(symbol or "").upper(),
                    str(timestamp),
                    value,
                    value,
                    _json_dumps(payload or {}),
                ),
            )
            return bool(cursor.fetchone())


def put_timeseries_postgres_preserving_created_at(
    manager: "PersistenceManager",
    *,
    series_name: str,
    symbol: str,
    timestamp: str,
    value: Optional[float],
    payload: Dict[str, Any],
    created_at: str,
) -> Dict[str, Any]:
    with manager._lock, _connection.connect_postgres(manager) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO infra_timeseries(series_name, symbol, ts, value, payload, created_at)
                VALUES (%s, %s, %s, %s, %s::jsonb, %s)
                RETURNING id
                """,
                (
                    str(series_name or "generic"),
                    str(symbol or "").upper(),
                    str(timestamp),
                    value,
                    _json_dumps(payload or {}),
                    created_at,
                ),
            )
            inserted_id = cursor.fetchone()[0]
        connection.commit()
    return {
        "id": inserted_id,
        "series_name": str(series_name or "generic"),
        "symbol": str(symbol or "").upper(),
        "timestamp": str(timestamp),
        "value": value,
        "created_at": created_at,
        "payload": payload,
    }


def put_timeseries(
    manager: "PersistenceManager",
    series_name: str,
    symbol: str,
    timestamp: str,
    value: Optional[float],
    payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    now = _utcnow_iso()
    if manager._driver.startswith("postgres"):
        with manager._lock, _connection.connect_postgres(manager) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO infra_timeseries(series_name, symbol, ts, value, payload, created_at)
                    VALUES (%s, %s, %s, %s, %s::jsonb, %s)
                    RETURNING id
                    """,
                    (
                        str(series_name or "generic"),
                        str(symbol or "").upper(),
                        str(timestamp),
                        value,
                        _json_dumps(payload or {}),
                        now,
                    ),
                )
                inserted_id = cursor.fetchone()[0]
            connection.commit()
        return {
            "id": inserted_id,
            "series_name": series_name,
            "symbol": str(symbol or "").upper(),
            "timestamp": timestamp,
            "value": value,
            "created_at": now,
        }

    with manager._lock, _connection.connect_sqlite(manager) as connection:
        cursor = connection.execute(
            """
            INSERT INTO infra_timeseries(series_name, symbol, ts, value, payload, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                str(series_name or "generic"),
                str(symbol or "").upper(),
                str(timestamp),
                value,
                _json_dumps(payload or {}),
                now,
            ),
        )
        inserted_id = cursor.lastrowid
    return {
        "id": inserted_id,
        "series_name": series_name,
        "symbol": str(symbol or "").upper(),
        "timestamp": timestamp,
        "value": value,
        "created_at": now,
    }


def list_timeseries(
    manager: "PersistenceManager",
    *,
    series_name: Optional[str] = None,
    symbol: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    query = "SELECT * FROM infra_timeseries"
    clauses: List[str] = []
    params: List[Any] = []
    if series_name:
        clauses.append("series_name = ?")
        params.append(str(series_name).strip())
    if symbol:
        clauses.append("symbol = ?")
        params.append(str(symbol).strip().upper())
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY ts DESC LIMIT ?"
    params.append(max(1, min(int(limit or 100), 500)))

    if manager._driver.startswith("postgres"):
        placeholder = "%s"
        with manager._lock, _connection.connect_postgres(manager) as connection:
            with connection.cursor() as cursor:
                cursor.execute(query.replace("?", placeholder), params)
                rows = cursor.fetchall()
                columns = [description[0] for description in cursor.description]
        items = []
        for raw_row in rows:
            row = dict(zip(columns, raw_row))
            payload = row["payload"] if isinstance(row["payload"], dict) else json.loads(row["payload"] or "{}")
            items.append(
                {
                    "id": row["id"],
                    "series_name": row["series_name"],
                    "symbol": row["symbol"],
                    "timestamp": row["ts"].isoformat() if hasattr(row["ts"], "isoformat") else row["ts"],
                    "value": row["value"],
                    "payload": payload,
                    "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else row["created_at"],
                }
            )
        return items

    with manager._lock, _connection.connect_sqlite(manager) as connection:
        rows = connection.execute(query, params).fetchall()
    items = []
    for row in rows:
        try:
            payload = json.loads(row["payload"])
        except Exception:
            payload = {}
        items.append(
            {
                "id": row["id"],
                "series_name": row["series_name"],
                "symbol": row["symbol"],
                "timestamp": row["ts"],
                "value": row["value"],
                "payload": payload,
                "created_at": row["created_at"],
            }
        )
    return items

"""Record CRUD helpers for ``PersistenceManager``.

Module-level functions take the ``PersistenceManager`` instance as their first
positional argument so the public API on the manager class can stay a thin
facade. SQL strings, locking semantics, error handling and return shapes are
identical to the former in-class implementation — pure relocation.
"""

from __future__ import annotations

import json
import sqlite3
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from . import _connection
from ._helpers import (
    MAX_RECORD_LIST_LIMIT,
    _build_payload_filter_conditions,
    _build_record_cursor_condition,
    _build_record_sort_plan,
    _decode_record_cursor,
    _encode_record_cursor,
    _json_dumps,
    _normalize_payload_filters,
    _normalize_record_sort,
    _utcnow_iso,
)

if TYPE_CHECKING:  # pragma: no cover - import cycle avoidance
    from ._manager import PersistenceManager


def record_exists_postgres(manager: "PersistenceManager", identifier: str) -> bool:
    with manager._lock, _connection.connect_postgres(manager) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1 FROM infra_records WHERE id = %s LIMIT 1", (identifier,))
            return bool(cursor.fetchone())


def put_record_postgres_preserving_timestamps(
    manager: "PersistenceManager",
    *,
    identifier: str,
    normalized_type: str,
    normalized_key: str,
    payload: Dict[str, Any],
    created_at: str,
    updated_at: str,
) -> Dict[str, Any]:
    with manager._lock, _connection.connect_postgres(manager) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO infra_records(id, record_type, record_key, payload, created_at, updated_at)
                VALUES (%s, %s, %s, %s::jsonb, %s, %s)
                ON CONFLICT(id) DO UPDATE SET
                    record_type = EXCLUDED.record_type,
                    record_key = EXCLUDED.record_key,
                    payload = EXCLUDED.payload,
                    updated_at = EXCLUDED.updated_at
                """,
                (identifier, normalized_type, normalized_key, _json_dumps(payload), created_at, updated_at),
            )
        connection.commit()
    return {
        "id": identifier,
        "record_type": normalized_type,
        "record_key": normalized_key,
        "payload": payload,
        "created_at": created_at,
        "updated_at": updated_at,
    }


def put_record(
    manager: "PersistenceManager",
    record_type: str,
    record_key: str,
    payload: Dict[str, Any],
    record_id: Optional[str] = None,
) -> Dict[str, Any]:
    now = _utcnow_iso()
    normalized_type = str(record_type or "generic").strip() or "generic"
    normalized_key = str(record_key or "default").strip() or "default"
    identifier = record_id or f"{normalized_type}:{normalized_key}"
    if manager._driver.startswith("postgres"):
        return put_record_postgres(manager, identifier, normalized_type, normalized_key, payload, now)

    with manager._lock, _connection.connect_sqlite(manager) as connection:
        existing = connection.execute(
            "SELECT created_at FROM infra_records WHERE id = ?",
            (identifier,),
        ).fetchone()
        created_at = existing["created_at"] if existing else now
        connection.execute(
            """
            INSERT INTO infra_records(id, record_type, record_key, payload, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                record_type = excluded.record_type,
                record_key = excluded.record_key,
                payload = excluded.payload,
                updated_at = excluded.updated_at
            """,
            (identifier, normalized_type, normalized_key, _json_dumps(payload), created_at, now),
        )
    return {
        "id": identifier,
        "record_type": normalized_type,
        "record_key": normalized_key,
        "payload": payload,
        "created_at": created_at,
        "updated_at": now,
    }


def put_record_postgres(
    manager: "PersistenceManager",
    identifier: str,
    normalized_type: str,
    normalized_key: str,
    payload: Dict[str, Any],
    now: str,
) -> Dict[str, Any]:
    with manager._lock, _connection.connect_postgres(manager) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT created_at FROM infra_records WHERE id = %s", (identifier,))
            existing = cursor.fetchone()
            created_at = (
                existing[0].isoformat()
                if existing and hasattr(existing[0], "isoformat")
                else existing[0]
                if existing
                else now
            )
            cursor.execute(
                """
                INSERT INTO infra_records(id, record_type, record_key, payload, created_at, updated_at)
                VALUES (%s, %s, %s, %s::jsonb, %s, %s)
                ON CONFLICT(id) DO UPDATE SET
                    record_type = EXCLUDED.record_type,
                    record_key = EXCLUDED.record_key,
                    payload = EXCLUDED.payload,
                    updated_at = EXCLUDED.updated_at
                """,
                (identifier, normalized_type, normalized_key, _json_dumps(payload), created_at, now),
            )
        connection.commit()
    return {
        "id": identifier,
        "record_type": normalized_type,
        "record_key": normalized_key,
        "payload": payload,
        "created_at": created_at,
        "updated_at": now,
    }


def normalize_record_limit(manager: "PersistenceManager", limit: int) -> int:
    return max(1, min(int(limit or 50), MAX_RECORD_LIST_LIMIT))


def row_to_record(manager: "PersistenceManager", row: Any) -> Dict[str, Any]:
    if isinstance(row, sqlite3.Row):
        try:
            payload = json.loads(row["payload"])
        except Exception:
            payload = {}
        return {
            "id": row["id"],
            "record_type": row["record_type"],
            "record_key": row["record_key"],
            "payload": payload,
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    payload = row["payload"] if isinstance(row["payload"], dict) else json.loads(row["payload"] or "{}")
    return {
        "id": row["id"],
        "record_type": row["record_type"],
        "record_key": row["record_key"],
        "payload": payload,
        "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else row["created_at"],
        "updated_at": row["updated_at"].isoformat() if hasattr(row["updated_at"], "isoformat") else row["updated_at"],
    }


def list_records_page(
    manager: "PersistenceManager",
    record_type: Optional[str] = None,
    limit: int = 50,
    cursor: Optional[str] = None,
    payload_filters: Optional[Dict[str, Any]] = None,
    sort_by: Optional[str] = None,
    sort_direction: Optional[str] = None,
) -> Dict[str, Any]:
    normalized_limit = normalize_record_limit(manager, limit)
    cursor_payload = _decode_record_cursor(cursor)
    normalized_filters = _normalize_payload_filters(payload_filters)
    normalized_sort = _normalize_record_sort(sort_by, sort_direction)
    sort_plan = _build_record_sort_plan(
        normalized_sort["sort_by"],
        normalized_sort["sort_direction"],
        manager._driver,
    )
    direction = normalized_sort["sort_direction"].upper()
    query = "SELECT * FROM infra_records"
    params: List[Any] = []
    conditions: List[str] = []
    if record_type:
        conditions.append("record_type = ?")
        params.append(record_type)
    payload_condition_bundle = _build_payload_filter_conditions(normalized_filters, manager._driver)
    conditions.extend(payload_condition_bundle["conditions"])
    params.extend(payload_condition_bundle["params"])
    if cursor_payload:
        if (
            cursor_payload.get("sort_by") != normalized_sort["sort_by"]
            or cursor_payload.get("sort_direction") != normalized_sort["sort_direction"]
        ):
            raise ValueError("Invalid record cursor")
        cursor_condition = _build_record_cursor_condition(sort_plan, cursor_payload)
        conditions.append(cursor_condition["condition"])
        params.extend(cursor_condition["params"])
    if conditions:
        query += f" WHERE {' AND '.join(conditions)}"
    order_parts = [f"{component['expr']} {direction}" for component in sort_plan["components"]]
    order_parts.append(f"id {direction}")
    query += f" ORDER BY {', '.join(order_parts)} LIMIT ?"
    params.append(normalized_limit + 1)

    if manager._driver.startswith("postgres"):
        placeholder = "%s"
        with manager._lock, _connection.connect_postgres(manager) as connection:
            with connection.cursor() as cursor_handle:
                cursor_handle.execute(query.replace("?", placeholder), params)
                rows = cursor_handle.fetchall()
                columns = [description[0] for description in cursor_handle.description]
        normalized_rows = [dict(zip(columns, raw_row)) for raw_row in rows]
    else:
        with manager._lock, _connection.connect_sqlite(manager) as connection:
            normalized_rows = connection.execute(query, params).fetchall()

    visible_rows = normalized_rows[:normalized_limit]
    records = [row_to_record(manager, row) for row in visible_rows]
    has_more = len(normalized_rows) > normalized_limit
    next_cursor = None
    if has_more and records:
        last_record = records[-1]
        cursor_values = {
            component["cursor_key"]: component["value_getter"](last_record)
            for component in sort_plan["components"]
        }
        next_cursor = _encode_record_cursor(
            sort_by=normalized_sort["sort_by"],
            sort_direction=normalized_sort["sort_direction"],
            sort_values=cursor_values,
            record_id=str(last_record.get("id") or ""),
        )
    return {
        "records": records,
        "has_more": has_more,
        "next_cursor": next_cursor,
    }


def list_records(
    manager: "PersistenceManager",
    record_type: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    return list_records_page(manager, record_type=record_type, limit=limit).get("records") or []


def count_records(
    manager: "PersistenceManager",
    record_type: Optional[str] = None,
    payload_filters: Optional[Dict[str, Any]] = None,
) -> int:
    query = "SELECT COUNT(*) FROM infra_records"
    params: List[Any] = []
    conditions: List[str] = []
    if record_type:
        conditions.append("record_type = ?")
        params.append(record_type)
    payload_condition_bundle = _build_payload_filter_conditions(_normalize_payload_filters(payload_filters), manager._driver)
    conditions.extend(payload_condition_bundle["conditions"])
    params.extend(payload_condition_bundle["params"])
    if conditions:
        query += f" WHERE {' AND '.join(conditions)}"
    if manager._driver.startswith("postgres"):
        placeholder = "%s"
        with manager._lock, _connection.connect_postgres(manager) as connection:
            with connection.cursor() as cursor_handle:
                cursor_handle.execute(query.replace("?", placeholder), params)
                row = cursor_handle.fetchone()
        return int(row[0] if row else 0)

    with manager._lock, _connection.connect_sqlite(manager) as connection:
        row = connection.execute(query, params).fetchone()
    return int(row[0] if row else 0)


def get_record(
    manager: "PersistenceManager",
    record_type: str,
    record_key: str,
) -> Optional[Dict[str, Any]]:
    normalized_type = str(record_type or "generic").strip() or "generic"
    normalized_key = str(record_key or "default").strip() or "default"
    query = """
        SELECT *
        FROM infra_records
        WHERE record_type = ? AND record_key = ?
        ORDER BY updated_at DESC
        LIMIT 1
    """
    params: List[Any] = [normalized_type, normalized_key]

    if manager._driver.startswith("postgres"):
        placeholder = "%s"
        with manager._lock, _connection.connect_postgres(manager) as connection:
            with connection.cursor() as cursor:
                cursor.execute(query.replace("?", placeholder), params)
                row = cursor.fetchone()
                if not row:
                    return None
                columns = [description[0] for description in cursor.description]
        raw = dict(zip(columns, row))
        payload = raw["payload"] if isinstance(raw["payload"], dict) else json.loads(raw["payload"] or "{}")
        return {
            "id": raw["id"],
            "record_type": raw["record_type"],
            "record_key": raw["record_key"],
            "payload": payload,
            "created_at": raw["created_at"].isoformat() if hasattr(raw["created_at"], "isoformat") else raw["created_at"],
            "updated_at": raw["updated_at"].isoformat() if hasattr(raw["updated_at"], "isoformat") else raw["updated_at"],
        }

    with manager._lock, _connection.connect_sqlite(manager) as connection:
        row = connection.execute(query, params).fetchone()
    if not row:
        return None
    try:
        payload = json.loads(row["payload"])
    except Exception:
        payload = {}
    return {
        "id": row["id"],
        "record_type": row["record_type"],
        "record_key": row["record_key"],
        "payload": payload,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }

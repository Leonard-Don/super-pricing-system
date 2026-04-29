"""Module-level helpers for persistence.

记录排序、cursor 编解码、payload 过滤等纯函数。从大文件 ``persistence.py``
抽离，避免 PersistenceManager 类与无状态工具混在一起。
"""

from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

MAX_RECORD_LIST_LIMIT = 1000

def _json_dumps(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, default=str)


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def _task_activity_score_from_payload(payload: Optional[Dict[str, Any]]) -> int:
    status = str((payload or {}).get("status") or "").strip().lower()
    if status == "failed":
        return 5
    if status == "running":
        return 4
    if status == "queued":
        return 3
    if status == "completed":
        return 2
    if status == "cancelled":
        return 1
    return 0


def _task_activity_sort_sql(driver: str) -> str:
    status_expr = "(payload ->> 'status')" if driver.startswith("postgres") else "json_extract(payload, '$.status')"
    return (
        f"CASE {status_expr} "
        "WHEN 'failed' THEN 5 "
        "WHEN 'running' THEN 4 "
        "WHEN 'queued' THEN 3 "
        "WHEN 'completed' THEN 2 "
        "WHEN 'cancelled' THEN 1 "
        "ELSE 0 END"
    )


def _encode_record_cursor(sort_by: str, sort_direction: str, sort_values: Dict[str, Any], record_id: str) -> str:
    payload = {
        "sort_by": str(sort_by or ""),
        "sort_direction": str(sort_direction or ""),
        "sort_values": dict(sort_values or {}),
        "id": str(record_id or ""),
    }
    raw = json.dumps(payload, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _decode_record_cursor(cursor: Optional[str]) -> Optional[Dict[str, str]]:
    token = str(cursor or "").strip()
    if not token:
        return None
    padding = "=" * (-len(token) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(f"{token}{padding}").decode("utf-8"))
    except Exception as exc:
        raise ValueError("Invalid record cursor") from exc
    sort_by = str((payload or {}).get("sort_by") or "").strip()
    sort_direction = str((payload or {}).get("sort_direction") or "").strip()
    raw_sort_values = (payload or {}).get("sort_values")
    if isinstance(raw_sort_values, dict):
        sort_values = {
            str(key or "").strip(): value
            for key, value in raw_sort_values.items()
            if str(key or "").strip() and value is not None and str(value).strip()
        }
    else:
        legacy_sort_value = (payload or {}).get("sort_value")
        sort_values = {sort_by: legacy_sort_value} if sort_by and legacy_sort_value not in {None, ""} else {}
    record_id = str((payload or {}).get("id") or "").strip()
    if not sort_by or not sort_direction or not sort_values or not record_id:
        raise ValueError("Invalid record cursor")
    return {
        "sort_by": sort_by,
        "sort_direction": sort_direction,
        "sort_values": sort_values,
        "id": record_id,
    }


def _normalize_payload_filters(payload_filters: Optional[Dict[str, Any]]) -> Dict[str, List[str]]:
    normalized: Dict[str, List[str]] = {}
    for raw_key, raw_value in (payload_filters or {}).items():
        key = str(raw_key or "").strip()
        if not key:
            continue
        if not key.replace("_", "").isalnum():
            raise ValueError("Invalid record filter")
        values = raw_value if isinstance(raw_value, (list, tuple, set)) else [raw_value]
        normalized_values = [str(item or "").strip() for item in values if str(item or "").strip()]
        if not normalized_values:
            continue
        normalized[key] = normalized_values
    return normalized


def _normalize_record_sort(sort_by: Optional[str], sort_direction: Optional[str]) -> Dict[str, str]:
    normalized_sort_by = str(sort_by or "updated_at").strip().lower()
    normalized_sort_direction = str(sort_direction or "desc").strip().lower()
    if normalized_sort_by not in {"updated_at", "created_at", "activity"}:
        raise ValueError("Invalid record sort")
    if normalized_sort_direction not in {"asc", "desc"}:
        raise ValueError("Invalid record sort direction")
    return {
        "sort_by": normalized_sort_by,
        "sort_direction": normalized_sort_direction,
    }


def _build_record_sort_plan(sort_by: str, sort_direction: str, driver: str) -> Dict[str, Any]:
    if sort_by == "activity":
        activity_expr = _task_activity_sort_sql(driver)
        return {
            "sort_by": sort_by,
            "sort_direction": sort_direction,
            "components": [
                {
                    "expr": activity_expr,
                    "cursor_key": "activity",
                    "value_getter": lambda record: _task_activity_score_from_payload(record.get("payload") or {}),
                },
                {
                    "expr": "updated_at",
                    "cursor_key": "updated_at",
                    "value_getter": lambda record: str(record.get("updated_at") or ""),
                },
            ],
        }
    return {
        "sort_by": sort_by,
        "sort_direction": sort_direction,
        "components": [
            {
                "expr": sort_by,
                "cursor_key": sort_by,
                "value_getter": lambda record: str(record.get(sort_by) or ""),
            },
        ],
    }


def _build_record_cursor_condition(sort_plan: Dict[str, Any], cursor_payload: Dict[str, Any]) -> Dict[str, Any]:
    comparator = ">" if sort_plan["sort_direction"] == "asc" else "<"
    cursor_values = cursor_payload.get("sort_values") or {}
    components = sort_plan["components"]
    for component in components:
        if component["cursor_key"] not in cursor_values:
            raise ValueError("Invalid record cursor")

    clauses: List[str] = []
    params: List[Any] = []
    for index, component in enumerate(components):
        clause_parts: List[str] = []
        clause_params: List[Any] = []
        for previous in components[:index]:
            clause_parts.append(f"{previous['expr']} = ?")
            clause_params.append(cursor_values[previous["cursor_key"]])
        clause_parts.append(f"{component['expr']} {comparator} ?")
        clause_params.append(cursor_values[component["cursor_key"]])
        clauses.append(f"({' AND '.join(clause_parts)})")
        params.extend(clause_params)

    tie_break_parts: List[str] = []
    tie_break_params: List[Any] = []
    for component in components:
        tie_break_parts.append(f"{component['expr']} = ?")
        tie_break_params.append(cursor_values[component["cursor_key"]])
    tie_break_parts.append(f"id {comparator} ?")
    tie_break_params.append(cursor_payload["id"])
    clauses.append(f"({' AND '.join(tie_break_parts)})")
    params.extend(tie_break_params)

    return {
        "condition": f"({' OR '.join(clauses)})",
        "params": params,
    }


def _build_payload_filter_conditions(normalized_filters: Dict[str, List[str]], driver: str) -> Dict[str, Any]:
    conditions: List[str] = []
    params: List[Any] = []
    for field, values in normalized_filters.items():
        extractor = f"(payload ->> '{field}')" if driver.startswith("postgres") else f"json_extract(payload, '$.{field}')"
        if len(values) == 1:
            conditions.append(f"{extractor} = ?")
            params.append(values[0])
            continue
        placeholders = ", ".join(["?"] * len(values))
        conditions.append(f"{extractor} IN ({placeholders})")
        params.extend(values)
    return {
        "conditions": conditions,
        "params": params,
    }


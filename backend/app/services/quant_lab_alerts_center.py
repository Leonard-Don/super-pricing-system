"""Alert center normalization and digest helpers for Quant Lab alerts.

Extracted from quant_lab_alerts.py — pure functions and constants only,
no dependency on QuantLabAlertOrchestrationService.
"""

from __future__ import annotations

import math
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd


def _safe_float(value: Any, default: Optional[float] = 0.0) -> Optional[float]:
    # 调用点（line 53 / 755）显式传 default=None 以便后续过滤无效数值，
    # 因此返回类型必须允许 None，否则下游 ``[v for v in xs if v is not None]``
    # 这种过滤就成了类型撒谎。
    try:
        numeric = float(value)
        if math.isnan(numeric) or math.isinf(numeric):
            return default
        return numeric
    except (TypeError, ValueError):
        return default


def _json_ready(value: Any) -> Any:
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, (pd.Series, pd.Index)):
        return [_json_ready(item) for item in value.tolist()]
    if isinstance(value, pd.DataFrame):
        return [_json_ready(item) for item in value.to_dict("records")]
    if isinstance(value, dict):
        return {str(key): _json_ready(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_ready(item) for item in value]
    return value


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _utcnow_iso() -> str:
    return _utcnow().replace(tzinfo=None).isoformat()


def _pick_metric(payload: Dict[str, Any], *keys: str) -> Optional[float]:
    for key in keys:
        if key in payload and payload.get(key) not in (None, ""):
            return _safe_float(payload.get(key), None)
    return None


def _normalize_identifier(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _first_non_none(payload: Dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in payload and payload.get(key) is not None:
            return payload.get(key)
    return None


def _normalize_alert_center_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _alert_center_timestamp(entry: Dict[str, Any]) -> str:
    value = _first_non_none(
        entry,
        "trigger_time",
        "triggerTime",
        "timestamp",
        "published_at",
        "updated_at",
        "created_at",
        "resolved_at",
        "resolvedAt",
        "acknowledged_at",
        "acknowledgedAt",
        "snoozed_until",
        "snoozedUntil",
    )
    return _normalize_alert_center_text(value)


def _alert_center_sort_key(entry: Dict[str, Any]) -> str:
    timestamp = _alert_center_timestamp(entry)
    if not timestamp:
        return ""
    try:
        parsed = pd.Timestamp(timestamp)
        if pd.isna(parsed):
            return timestamp
        if parsed.tzinfo is not None:
            parsed = parsed.tz_convert("UTC").tz_localize(None)
        return parsed.isoformat()
    except Exception:
        return timestamp


def _alert_center_source(entry: Dict[str, Any]) -> str:
    source = _first_non_none(entry, "source_module", "sourceModule", "module", "source")
    return _normalize_alert_center_text(source).lower() or "realtime"


def _alert_center_rule_name(entry: Dict[str, Any]) -> str:
    value = _first_non_none(
        entry,
        "rule_name",
        "ruleName",
        "name",
        "title",
        "condition_label",
        "conditionLabel",
        "condition_summary",
    )
    rule_name = _normalize_alert_center_text(value)
    if rule_name:
        return rule_name
    symbol = _normalize_alert_center_text(entry.get("symbol")).upper()
    return f"{symbol} alert" if symbol else "unnamed_rule"


def _alert_center_identity(entry: Dict[str, Any]) -> str:
    raw_id = _first_non_none(entry, "id", "alert_id", "alertId")
    explicit_id = _normalize_identifier(raw_id)
    if explicit_id:
        return explicit_id

    source = _alert_center_source(entry)
    symbol = _normalize_alert_center_text(entry.get("symbol")).upper() or "unknown"
    rule_name = _alert_center_rule_name(entry) or "unnamed_rule"
    timestamp = _alert_center_sort_key(entry) or "unknown_time"
    condition = (
        _normalize_alert_center_text(_first_non_none(entry, "condition", "condition_label", "conditionLabel"))
        or "unknown_condition"
    )
    return f"alert_center:{source}:{symbol}:{rule_name}:{timestamp}:{condition}"


def _normalize_alert_center_lifecycle_status(value: Any) -> str:
    status = _normalize_alert_center_text(value).lower()
    return {
        "ack": "acknowledged",
        "acknowledge": "acknowledged",
        "acknowledged": "acknowledged",
        "active": "active",
        "false_positive": "resolved",
        "closed": "resolved",
        "done": "resolved",
        "dismiss": "resolved",
        "dismissed": "resolved",
        "open": "active",
        "pending": "active",
        "resolved": "resolved",
        "snooze": "snoozed",
        "snoozed": "snoozed",
        "triggered": "active",
    }.get(status, "")


def _normalize_alert_resolution_action(value: Any) -> str:
    action = _normalize_alert_center_text(value).lower()
    return {
        "ack": "acknowledge",
        "acknowledge": "acknowledge",
        "acknowledged": "acknowledge",
        "review": "acknowledge",
        "review_alert": "acknowledge",
        "snooze": "snooze",
        "snoozed": "snooze",
        "check_snoozed_alert": "snooze",
        "resolve": "resolve",
        "resolved": "resolve",
        "close": "resolve",
        "closed": "resolve",
        "resolve_acknowledged_alert": "resolve",
        "dismiss": "dismiss",
        "dismissed": "dismiss",
        "false_positive": "dismiss",
    }.get(action, "")


def _derive_alert_center_status(entry: Dict[str, Any]) -> str:
    explicit_statuses = [
        _normalize_alert_center_lifecycle_status(value)
        for value in (
            _first_non_none(entry, "status", "state", "alert_status", "alertStatus"),
            _first_non_none(entry, "review_status", "reviewStatus"),
        )
    ]
    if "resolved" in explicit_statuses or _first_non_none(entry, "resolved_at", "resolvedAt", "closed_at"):
        return "resolved"
    if "snoozed" in explicit_statuses or _first_non_none(
        entry,
        "snoozed_until",
        "snoozedUntil",
        "snooze_until",
        "snoozeUntil",
    ):
        return "snoozed"
    if "acknowledged" in explicit_statuses or _first_non_none(
        entry,
        "acknowledged_at",
        "acknowledgedAt",
        "acked_at",
        "ackAt",
    ):
        return "acknowledged"
    return "active"


def _alert_center_actions(status: str) -> Dict[str, bool]:
    return {
        "can_acknowledge": status == "active",
        "can_snooze": status in {"active", "acknowledged"},
        "can_resolve": status in {"active", "acknowledged", "snoozed"},
        "can_dismiss": status in {"active", "acknowledged", "snoozed"},
    }


def _normalize_alert_center_entry(entry: Dict[str, Any] | None) -> Optional[Dict[str, Any]]:
    if not isinstance(entry, dict):
        return None
    status = _derive_alert_center_status(entry)
    symbol = _normalize_alert_center_text(entry.get("symbol")).upper()
    severity = _normalize_alert_center_text(_first_non_none(entry, "severity", "level", "priority")).lower() or "info"
    timestamp = _alert_center_timestamp(entry)
    normalized = {
        "id": _alert_center_identity(entry),
        "alert_id": _first_non_none(entry, "alert_id", "alertId"),
        "symbol": symbol or None,
        "rule_name": _alert_center_rule_name(entry),
        "source_module": _alert_center_source(entry),
        "severity": severity,
        "status": status,
        "actions": _alert_center_actions(status),
        "message": _normalize_alert_center_text(entry.get("message")),
        "condition": _first_non_none(entry, "condition"),
        "condition_label": _first_non_none(entry, "condition_label", "conditionLabel"),
        "condition_summary": _first_non_none(entry, "condition_summary", "conditionSummary"),
        "trigger_time": timestamp or None,
        "trigger_value": _pick_metric(entry, "trigger_value", "triggerValue"),
        "trigger_price": _pick_metric(entry, "trigger_price", "triggerPrice", "priceSnapshot"),
        "threshold": _pick_metric(entry, "threshold"),
        "review_status": _first_non_none(entry, "review_status", "reviewStatus"),
        "acknowledged_at": _first_non_none(entry, "acknowledged_at", "acknowledgedAt"),
        "snoozed_until": _first_non_none(
            entry,
            "snoozed_until",
            "snoozedUntil",
            "snooze_until",
            "snoozeUntil",
        ),
        "resolved_at": _first_non_none(entry, "resolved_at", "resolvedAt", "closed_at"),
        "dismissed_at": _first_non_none(entry, "dismissed_at", "dismissedAt"),
        "resolution_action": _first_non_none(entry, "resolution_action", "resolutionAction"),
        "resolution_note": _first_non_none(entry, "resolution_note", "resolutionNote", "note"),
        "lifecycle_events": entry.get("lifecycle_events") if isinstance(entry.get("lifecycle_events"), list) else [],
    }
    return normalized


def _sorted_counter(values: List[str]) -> Dict[str, int]:
    return dict(sorted(Counter(values).items()))


_ALERT_CENTER_SEVERITY_RANK = {
    "critical": 0,
    "error": 1,
    "warning": 2,
    "info": 3,
}
_ALERT_CENTER_STATUS_RANK = {
    "active": 0,
    "acknowledged": 1,
    "snoozed": 2,
    "resolved": 3,
}
_ALERT_CENTER_CRITICAL_SEVERITIES = {"critical", "error"}


def _alert_center_timestamp_epoch(entry: Dict[str, Any]) -> float:
    timestamp = _alert_center_timestamp(entry)
    if not timestamp:
        return float("-inf")
    try:
        parsed = pd.Timestamp(timestamp)
        if pd.isna(parsed):
            return float("-inf")
        if parsed.tzinfo is not None:
            parsed = parsed.tz_convert("UTC").tz_localize(None)
        return float(parsed.timestamp())
    except Exception:
        return float("-inf")


def _alert_center_top_counter_value(values: List[str]) -> Optional[str]:
    counts = Counter(value for value in values if value)
    if not counts:
        return None
    return sorted(counts.items(), key=lambda item: (-item[1], item[0]))[0][0]


def _alert_center_top_severity(items: List[Dict[str, Any]]) -> Optional[str]:
    severities = [item["severity"] for item in items if item.get("severity")]
    if not severities:
        return None
    return sorted(
        severities,
        key=lambda value: (_ALERT_CENTER_SEVERITY_RANK.get(value, 99), value),
    )[0]


def _alert_center_next_action(alert: Dict[str, Any], priority: int) -> Dict[str, Any]:
    status = alert.get("status") or "active"
    action_type = {
        "acknowledged": "resolve_acknowledged_alert",
        "snoozed": "check_snoozed_alert",
    }.get(status, "review_alert")
    prefix = {
        "resolve_acknowledged_alert": "关闭已确认告警",
        "check_snoozed_alert": "检查暂缓告警",
        "review_alert": f"复盘 {alert.get('severity') or 'info'} 告警",
    }[action_type]
    return {
        "id": f"{action_type}:{alert['id']}",
        "priority": priority,
        "action_type": action_type,
        "label": f"{prefix}：{alert.get('rule_name') or '未命名告警'}",
        "target_alert_id": alert["id"],
        "rule_name": alert.get("rule_name"),
        "source_module": alert.get("source_module"),
        "severity": alert.get("severity"),
        "status": status,
        "symbol": alert.get("symbol"),
        "trigger_time": alert.get("trigger_time"),
        "reason": f"{alert.get('source_module')} · {status} · {alert.get('severity')}",
    }


def _build_alert_center_digest(
    current_items: List[Dict[str, Any]],
    timeline_items: List[Dict[str, Any]],
) -> Dict[str, Any]:
    open_items = [item for item in current_items if item.get("status") != "resolved"]
    status_counts = Counter(item.get("status") or "active" for item in current_items)
    critical_open = sum(
        1
        for item in open_items
        if (item.get("severity") or "info") in _ALERT_CENTER_CRITICAL_SEVERITIES
    )
    counts = {
        "current": len(current_items),
        "open_current": len(open_items),
        "active": status_counts.get("active", 0),
        "acknowledged": status_counts.get("acknowledged", 0),
        "snoozed": status_counts.get("snoozed", 0),
        "resolved": status_counts.get("resolved", 0),
        "timeline_events": len(timeline_items),
        "critical_open": critical_open,
    }
    primary_source = _alert_center_top_counter_value(
        [item.get("source_module") or "" for item in (open_items or current_items)]
    )
    top_severity = _alert_center_top_severity(open_items or current_items)
    latest_event_id = timeline_items[0]["id"] if timeline_items else None

    if open_items:
        headline = (
            f"{len(open_items)} 个待处理告警，最高级别 {top_severity or 'info'}，"
            f"主要来源 {primary_source or 'unknown'}"
        )
    elif current_items:
        headline = f"当前无待处理告警，最近 {len(current_items)} 条已归档"
    elif timeline_items:
        headline = f"当前无待处理告警，时间线 {len(timeline_items)} 条记录"
    else:
        headline = "当前暂无告警活动"

    if critical_open:
        urgency = "critical"
    elif any((item.get("severity") or "info") == "warning" for item in open_items):
        urgency = "warning"
    elif open_items:
        urgency = "info"
    else:
        urgency = "clear"

    ranked_open_items = sorted(
        open_items,
        key=lambda item: (
            _ALERT_CENTER_STATUS_RANK.get(item.get("status") or "active", 99),
            _ALERT_CENTER_SEVERITY_RANK.get(item.get("severity") or "info", 99),
            -_alert_center_timestamp_epoch(item),
            item["id"],
        ),
    )

    return {
        "headline": headline,
        "urgency": urgency,
        "primary_source": primary_source,
        "top_severity": top_severity,
        "latest_event_id": latest_event_id,
        "counts": counts,
        "next_actions": [
            _alert_center_next_action(alert, priority=index + 1)
            for index, alert in enumerate(ranked_open_items[:5])
        ],
    }


def build_alert_center_summary(
    *,
    current_alerts: List[Dict[str, Any]] | None = None,
    history: List[Dict[str, Any]] | None = None,
) -> Dict[str, Any]:
    latest_current: Dict[str, Dict[str, Any]] = {}
    for raw_alert in current_alerts or []:
        normalized = _normalize_alert_center_entry(raw_alert)
        if not normalized:
            continue
        existing = latest_current.get(normalized["id"])
        if existing is None or (
            _alert_center_sort_key(normalized),
            normalized["id"],
        ) >= (
            _alert_center_sort_key(existing),
            existing["id"],
        ):
            latest_current[normalized["id"]] = normalized

    current_items = sorted(
        latest_current.values(),
        key=lambda item: (_alert_center_sort_key(item), item["id"]),
        reverse=True,
    )
    timeline_items = [
        normalized
        for raw_event in history or []
        if (normalized := _normalize_alert_center_entry(raw_event)) is not None
    ]
    timeline_items.sort(
        key=lambda item: (_alert_center_sort_key(item), item["id"]),
        reverse=True,
    )

    return {
        "current_alerts": current_items,
        "timeline": timeline_items,
        "counts": {
            "current": len(current_items),
            "open_current": sum(1 for item in current_items if item["status"] != "resolved"),
            "timeline_events": len(timeline_items),
            "by_severity": _sorted_counter([item["severity"] for item in current_items]),
            "by_source": _sorted_counter([item["source_module"] for item in current_items]),
            "by_status": _sorted_counter([item["status"] for item in current_items]),
        },
        "digest": _build_alert_center_digest(current_items, timeline_items),
    }

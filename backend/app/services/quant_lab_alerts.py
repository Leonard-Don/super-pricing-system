"""Alert orchestration domain service for Quant Lab."""

from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

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
        "open": "active",
        "pending": "active",
        "resolved": "resolved",
        "snooze": "snoozed",
        "snoozed": "snoozed",
        "triggered": "active",
    }.get(status, "")


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


class QuantLabAlertOrchestrationService:
    """Owns Quant Lab alert orchestration reads, writes, and cascade execution."""

    def __init__(
        self,
        *,
        lock: Any,
        profile_file: Callable[[str, Optional[str]], Path],
        read_store: Callable[[Path, Any], Any],
        write_store: Callable[[Path, Any], None],
        realtime_alerts_store: Any,
        realtime_preferences_store: Any,
        notification_service: Any,
        persistence_manager: Any,
        research_workbench_store: Any,
    ) -> None:
        self._lock = lock
        self._profile_file = profile_file
        self._read_store = read_store
        self._write_store = write_store
        self._realtime_alerts_store = realtime_alerts_store
        self._realtime_preferences_store = realtime_preferences_store
        self._notification_service = notification_service
        self._persistence_manager = persistence_manager
        self._research_workbench_store = research_workbench_store

    def get_alert_orchestration(self, profile_id: str | None = None) -> Dict[str, Any]:
        filepath = self._profile_file("alert_orchestration", profile_id)
        custom_payload = self._read_store(
            filepath,
            {"composite_rules": [], "channels": [], "history": [], "module_alerts": []},
        )
        realtime_payload = self._realtime_alerts_store.get_alerts(profile_id=profile_id)
        preferences = self._realtime_preferences_store.get_preferences(profile_id=profile_id)
        alert_history = list(realtime_payload.get("alert_hit_history") or [])
        module_alerts = list(custom_payload.get("module_alerts") or [])

        history = list(custom_payload.get("history") or [])
        merged_history = self._merge_alert_history(alert_history=alert_history, override_history=history)
        history_stats = self._build_alert_history_stats(merged_history)
        realtime_alerts = [
            {
                **alert,
                "source_module": alert.get("source_module") or alert.get("sourceModule") or "realtime",
            }
            for alert in realtime_payload.get("alerts") or []
            if isinstance(alert, dict)
        ]
        custom_alerts = [
            {
                **alert,
                "source_module": alert.get("source_module")
                or alert.get("sourceModule")
                or alert.get("module")
                or "custom",
            }
            for alert in module_alerts
            if isinstance(alert, dict)
        ]
        alert_center = build_alert_center_summary(
            current_alerts=[*realtime_alerts, *custom_alerts, *merged_history],
            history=merged_history,
        )
        hit_rate = (
            round(len(alert_history) / max(len(realtime_payload.get("alerts") or []), 1), 2)
            if realtime_payload.get("alerts")
            else 0.0
        )

        return _json_ready(
            {
                "profile_id": profile_id or "default",
                "summary": {
                    "realtime_rules": len(realtime_payload.get("alerts") or []),
                    "composite_rules": len(custom_payload.get("composite_rules") or []),
                    "watchlist_symbols": len(preferences.get("symbols") or []),
                    "alert_history_events": len(merged_history),
                    "estimated_hit_rate": hit_rate,
                    "reviewed_events": history_stats["summary"]["reviewed_events"],
                    "false_positive_rate": history_stats["summary"]["false_positive_rate"],
                    "average_response_minutes": history_stats["summary"]["average_response_minutes"],
                    "cascaded_events": history_stats["summary"]["cascaded_events"],
                    "notified_events": history_stats["summary"]["notified_events"],
                    "workbench_tasks_created": history_stats["summary"]["workbench_tasks_created"],
                    "infra_tasks_created": history_stats["summary"]["infra_tasks_created"],
                    "timeseries_points_written": history_stats["summary"]["timeseries_points_written"],
                    "config_snapshots_created": history_stats["summary"]["config_snapshots_created"],
                },
                "event_bus": {
                    "modules": [
                        {"module": "realtime", "count": len(realtime_payload.get("alerts") or [])},
                        {"module": "composite", "count": len(custom_payload.get("composite_rules") or [])},
                        {"module": "custom", "count": len(module_alerts)},
                    ],
                    "history": merged_history[:80],
                },
                "alert_center": alert_center,
                "history_stats": history_stats,
                "composite_rules": custom_payload.get("composite_rules") or [],
                "channels": custom_payload.get("channels") or [],
                "module_alerts": module_alerts,
            }
        )

    def update_alert_orchestration(self, payload: Dict[str, Any], profile_id: str | None = None) -> Dict[str, Any]:
        filepath = self._profile_file("alert_orchestration", profile_id)
        with self._lock:
            current = self._read_store(
                filepath,
                {"composite_rules": [], "channels": [], "history": [], "module_alerts": []},
            )
            for key in ("composite_rules", "channels", "module_alerts"):
                if isinstance(payload.get(key), list):
                    current[key] = payload[key]
            if isinstance(payload.get("history_entry"), dict):
                current["history"] = [payload["history_entry"], *(current.get("history") or [])][:80]
            if isinstance(payload.get("history_updates"), list) and payload.get("history_updates"):
                current["history"] = self._upsert_alert_history_entries(
                    current.get("history") or [],
                    payload.get("history_updates") or [],
                )[:80]
            self._write_store(filepath, current)
        return self.get_alert_orchestration(profile_id)

    def publish_alert_event(self, payload: Dict[str, Any], profile_id: str | None = None) -> Dict[str, Any]:
        filepath = self._profile_file("alert_orchestration", profile_id)
        persist_event_record = bool(payload.get("persist_event_record", True))
        with self._lock:
            current = self._read_store(
                filepath,
                {"composite_rules": [], "channels": [], "history": [], "module_alerts": []},
            )
            event_entry = self._normalize_alert_history_entry(
                {
                    **(payload or {}),
                    "review_status": payload.get("review_status") or "pending",
                    "trigger_time": payload.get("trigger_time") or _utcnow_iso(),
                }
            )
            if not event_entry:
                raise ValueError("invalid alert event payload")

            matched_rules = self._match_composite_rules(
                event_entry=event_entry,
                composite_rules=current.get("composite_rules") or [],
                explicit_rule_ids=payload.get("rule_ids") or [],
            )
            cascade_actions = self._collect_cascade_actions(
                payload=payload,
                matched_rules=matched_rules,
                orchestration_channels=current.get("channels") or [],
            )
        cascade_results = self._execute_cascade_actions(event_entry, cascade_actions)
        dispatched_channels = [
            result.get("channel")
            for result in cascade_results
            if result.get("action_type") == "notify_channel" and result.get("channel")
        ]
        workbench_task_ids = [
            result.get("task_id")
            for result in cascade_results
            if result.get("action_type") == "create_workbench_task" and result.get("task_id")
        ]
        infra_task_ids = [
            result.get("task_id")
            for result in cascade_results
            if result.get("action_type") == "create_infra_task" and result.get("task_id")
        ]
        timeseries_points = [
            {
                "id": result.get("timeseries_id"),
                "series_name": result.get("series_name"),
                "symbol": result.get("symbol"),
                "timestamp": result.get("timestamp"),
                "value": result.get("value"),
            }
            for result in cascade_results
            if result.get("action_type") == "persist_timeseries" and result.get("timeseries_id")
        ]
        config_snapshots = [
            {
                "record_id": result.get("record_id"),
                "config_type": result.get("config_type"),
                "config_key": result.get("config_key"),
                "owner_id": result.get("owner_id"),
                "version": result.get("version"),
            }
            for result in cascade_results
            if result.get("action_type") == "save_config_version" and result.get("record_id")
        ]
        event_entry.update(
            {
                "severity": str(payload.get("severity") or "info").lower(),
                "persist_event_record": persist_event_record,
                "condition_summary": payload.get("condition_summary") or event_entry.get("condition_summary"),
                "matched_rule_ids": [item.get("id") for item in matched_rules if item.get("id")],
                "matched_rule_names": [item.get("name") for item in matched_rules if item.get("name")],
                "cascade_actions": cascade_actions,
                "cascade_results": cascade_results,
                "dispatched_channels": dispatched_channels,
                "workbench_task_ids": workbench_task_ids,
                "infra_task_ids": infra_task_ids,
                "timeseries_points": timeseries_points,
                "config_snapshots": config_snapshots,
                "dispatch_status": self._resolve_dispatch_status(cascade_results),
                "published_at": _utcnow_iso(),
            }
        )
        if persist_event_record:
            with self._lock:
                current = self._read_store(
                    filepath,
                    {"composite_rules": [], "channels": [], "history": [], "module_alerts": []},
                )
                current["history"] = self._upsert_alert_history_entries(
                    current.get("history") or [],
                    [event_entry],
                )[:120]
                self._write_store(filepath, current)

        if persist_event_record:
            self._persistence_manager.put_record(
                record_type="alert_event",
                record_key=str(event_entry.get("id") or _utcnow().timestamp()),
                payload={
                    "profile_id": profile_id or "default",
                    "event": event_entry,
                },
            )
        return {
            "published_event": _json_ready(event_entry),
            "matched_rules": _json_ready(matched_rules),
            "cascade_results": _json_ready(cascade_results),
            "orchestration": self.get_alert_orchestration(profile_id),
        }

    def _match_composite_rules(
        self,
        *,
        event_entry: Dict[str, Any],
        composite_rules: List[Dict[str, Any]],
        explicit_rule_ids: List[str],
    ) -> List[Dict[str, Any]]:
        explicit_ids = {str(item).strip() for item in (explicit_rule_ids or []) if str(item).strip()}
        haystack = " ".join(
            str(part or "").lower()
            for part in [
                event_entry.get("rule_name"),
                event_entry.get("condition_summary"),
                event_entry.get("message"),
                event_entry.get("source_module"),
                event_entry.get("symbol"),
            ]
        )
        matched: List[Dict[str, Any]] = []
        for rule in composite_rules or []:
            if not isinstance(rule, dict):
                continue
            rule_id = str(rule.get("id") or "").strip()
            if rule_id and rule_id in explicit_ids:
                matched.append(dict(rule))
                continue
            summary = str(rule.get("condition_summary") or "").strip().lower()
            if not summary:
                continue
            tokens = [
                token.strip()
                for token in summary.replace("AND", "+").replace("and", "+").split("+")
                if token.strip()
            ]
            if tokens and all(token.lower() in haystack for token in tokens):
                matched.append(dict(rule))
        return matched

    def _collect_cascade_actions(
        self,
        *,
        payload: Dict[str, Any],
        matched_rules: List[Dict[str, Any]],
        orchestration_channels: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        actions: List[Dict[str, Any]] = []
        seen_keys: set[str] = set()

        def register(action: Dict[str, Any]) -> None:
            normalized = {
                "type": str(action.get("type") or "").strip().lower(),
                **action,
            }
            if not normalized["type"]:
                return
            key = json.dumps(
                {
                    "type": normalized.get("type"),
                    "channel": normalized.get("channel"),
                    "target": normalized.get("target"),
                    "task_type": normalized.get("task_type"),
                    "task_name": normalized.get("task_name"),
                    "backend": normalized.get("backend"),
                    "record_type": normalized.get("record_type"),
                    "series_name": normalized.get("series_name"),
                    "config_type": normalized.get("config_type"),
                    "config_key": normalized.get("config_key"),
                    "owner_id": normalized.get("owner_id"),
                },
                ensure_ascii=False,
                sort_keys=True,
            )
            if key in seen_keys:
                return
            seen_keys.add(key)
            actions.append(normalized)

        for raw_action in payload.get("cascade_actions") or []:
            if isinstance(raw_action, dict):
                register(raw_action)

        if payload.get("notify_channels"):
            for channel in payload.get("notify_channels") or []:
                register({"type": "notify_channel", "channel": channel})
        if payload.get("create_workbench_task"):
            register(
                {
                    "type": "create_workbench_task",
                    "task_type": payload.get("workbench_task_type") or "cross_market",
                    "status": payload.get("workbench_status") or "new",
                    "target": "research_workbench",
                }
            )
        if payload.get("persist_event_record", True):
            register({"type": "persist_record", "record_type": "alert_event_dispatch"})

        for rule in matched_rules:
            action_value = rule.get("action")
            if action_value and isinstance(action_value, str) and action_value.strip():
                action_text = action_value.lower()
                if "workbench" in action_text:
                    register({"type": "create_workbench_task", "task_type": "cross_market", "status": "new", "target": "research_workbench"})
                if "webhook" in action_text:
                    register({"type": "notify_channel", "channel": "webhook"})
                if "wecom" in action_text:
                    register({"type": "notify_channel", "channel": "wecom"})
                if "email" in action_text:
                    register({"type": "notify_channel", "channel": "email"})
                if "timeseries" in action_text or "时序" in action_text:
                    register(
                        {
                            "type": "persist_timeseries",
                            "series_name": f"alert_bus.{payload.get('source_module') or 'manual'}",
                        }
                    )
                if "queue" in action_text or "排队" in action_text or "异步" in action_text:
                    register(
                        {
                            "type": "create_infra_task",
                            "task_name": "quant_alert_followup",
                            "backend": "auto",
                        }
                    )
                if "config" in action_text or "版本" in action_text or "snapshot" in action_text:
                    register(
                        {
                            "type": "save_config_version",
                            "config_type": "alert_playbook",
                            "config_key": payload.get("source_module") or "manual",
                            "owner_id": "default",
                        }
                    )
            for raw_action in rule.get("cascade_actions") or []:
                if isinstance(raw_action, dict):
                    register(raw_action)

        if not any(action.get("type") == "notify_channel" for action in actions):
            for channel in orchestration_channels or []:
                if not isinstance(channel, dict):
                    continue
                if channel.get("enabled", True):
                    register({"type": "notify_channel", "channel": channel.get("id")})
        return actions

    def _execute_cascade_actions(
        self,
        event_entry: Dict[str, Any],
        cascade_actions: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        for action in cascade_actions or []:
            action_type = str(action.get("type") or "").strip().lower()
            try:
                if action_type == "notify_channel":
                    channel = str(action.get("channel") or "dry_run").strip()
                    notification_payload = {
                        "source": event_entry.get("source_module") or "alert_bus",
                        "severity": event_entry.get("severity") or "info",
                        "title": event_entry.get("rule_name") or "Quant alert event",
                        "message": event_entry.get("message") or event_entry.get("condition_summary") or "",
                        "symbol": event_entry.get("symbol"),
                        "event_id": event_entry.get("id"),
                        "rule_name": event_entry.get("rule_name"),
                    }
                    delivery = self._notification_service.send(channel, notification_payload)
                    results.append(
                        {
                            "action_type": "notify_channel",
                            "status": delivery.get("status") or "sent",
                            "channel": channel,
                            "delivery_id": delivery.get("delivery_id"),
                            "reason": delivery.get("reason"),
                        }
                    )
                elif action_type == "create_workbench_task":
                    task_type = str(action.get("task_type") or "cross_market")
                    title = (
                        str(action.get("title") or "").strip()
                        or f"[Alert] {event_entry.get('rule_name') or event_entry.get('symbol') or 'Research follow-up'}"
                    )
                    task = self._research_workbench_store.create_task(
                        {
                            "type": task_type if task_type in {"pricing", "cross_market", "macro_mispricing", "trade_thesis"} else "cross_market",
                            "title": title,
                            "status": str(action.get("status") or "new"),
                            "source": event_entry.get("source_module") or "alert_bus",
                            "symbol": event_entry.get("symbol") or "",
                            "note": event_entry.get("message") or event_entry.get("condition_summary") or "",
                            "context": {
                                "event_id": event_entry.get("id"),
                                "severity": event_entry.get("severity"),
                                "matched_rule_names": event_entry.get("matched_rule_names") or [],
                                "dispatched_channels": event_entry.get("dispatched_channels") or [],
                            },
                            "snapshot": {
                                "headline": event_entry.get("rule_name") or "Alert follow-up",
                                "summary": event_entry.get("message") or event_entry.get("condition_summary") or "",
                                "payload": {"alert_event": event_entry},
                                "saved_at": _utcnow_iso(),
                            },
                        }
                    )
                    results.append(
                        {
                            "action_type": "create_workbench_task",
                            "status": "created",
                            "task_id": task.get("id"),
                            "task_title": task.get("title"),
                        }
                    )
                elif action_type == "create_infra_task":
                    from backend.app.core.task_queue import task_queue_manager

                    raw_action_payload = action.get("payload")
                    task_payload = dict(raw_action_payload) if isinstance(raw_action_payload, dict) else {}
                    task_payload.update(
                        {
                            "task_origin": task_payload.get("task_origin") or "alert_orchestration",
                            "source_module": event_entry.get("source_module") or "alert_bus",
                            "symbol": event_entry.get("symbol") or "",
                            "severity": event_entry.get("severity") or "info",
                            "rule_name": event_entry.get("rule_name"),
                            "condition_summary": event_entry.get("condition_summary"),
                            "trigger_value": event_entry.get("trigger_value"),
                            "event_id": event_entry.get("id"),
                        }
                    )
                    if action.get("include_event_payload", True):
                        task_payload["alert_event"] = event_entry
                    task = task_queue_manager.submit(
                        name=str(action.get("task_name") or "quant_alert_followup"),
                        payload=task_payload,
                        backend=str(action.get("backend") or "auto"),
                    )
                    results.append(
                        {
                            "action_type": "create_infra_task",
                            "status": "queued",
                            "task_id": task.get("id"),
                            "task_name": task.get("name"),
                            "execution_backend": task.get("execution_backend"),
                            "broker_task_id": task.get("broker_task_id"),
                        }
                    )
                elif action_type == "persist_record":
                    record_type = str(action.get("record_type") or "alert_event_dispatch")
                    record = self._persistence_manager.put_record(
                        record_type=record_type,
                        record_key=str(event_entry.get("id") or _utcnow().timestamp()),
                        payload={"event": event_entry, "action": action},
                    )
                    results.append(
                        {
                            "action_type": "persist_record",
                            "status": "stored",
                            "record_id": record.get("id"),
                            "record_type": record.get("record_type"),
                        }
                    )
                elif action_type == "persist_timeseries":
                    point_value = _pick_metric(action, "value")
                    if point_value is None:
                        point_value = _pick_metric(event_entry, "trigger_value", "threshold")
                    point = self._persistence_manager.put_timeseries(
                        series_name=str(action.get("series_name") or f"alert_bus.{event_entry.get('source_module') or 'manual'}"),
                        symbol=str(action.get("symbol") or event_entry.get("symbol") or ""),
                        timestamp=str(action.get("timestamp") or event_entry.get("trigger_time") or event_entry.get("published_at") or _utcnow_iso()),
                        value=point_value,
                        payload={
                            "event": event_entry,
                            "action": action,
                            **(_payload if isinstance(_payload := action.get("payload"), dict) else {}),
                        },
                    )
                    results.append(
                        {
                            "action_type": "persist_timeseries",
                            "status": "stored",
                            "timeseries_id": point.get("id"),
                            "series_name": point.get("series_name"),
                            "symbol": point.get("symbol"),
                            "timestamp": point.get("timestamp"),
                            "value": point.get("value"),
                        }
                    )
                elif action_type == "save_config_version":
                    owner_id = str(action.get("owner_id") or "default")
                    config_type = str(action.get("config_type") or "alert_playbook")
                    config_key = str(action.get("config_key") or event_entry.get("source_module") or "manual")
                    record_type = f"config:{owner_id}:{config_type}:{config_key}"
                    existing = self._persistence_manager.list_records(record_type=record_type, limit=200)
                    next_version = len(existing) + 1
                    snapshot_payload = (
                        action.get("payload")
                        if isinstance(action.get("payload"), dict)
                        else {
                            "event": event_entry,
                            "matched_rule_names": event_entry.get("matched_rule_names") or [],
                            "dispatch_status": event_entry.get("dispatch_status"),
                        }
                    )
                    record = self._persistence_manager.put_record(
                        record_type=record_type,
                        record_key=f"v{next_version}",
                        record_id=f"{record_type}:v{next_version}",
                        payload={
                            "owner_id": owner_id,
                            "config_type": config_type,
                            "config_key": config_key,
                            "version": next_version,
                            "payload": snapshot_payload,
                            "created_by": "alert_bus",
                            "source_event_id": event_entry.get("id"),
                        },
                    )
                    results.append(
                        {
                            "action_type": "save_config_version",
                            "status": "stored",
                            "record_id": record.get("id"),
                            "config_type": config_type,
                            "config_key": config_key,
                            "owner_id": owner_id,
                            "version": next_version,
                        }
                    )
                else:
                    results.append(
                        {
                            "action_type": action_type or "unknown",
                            "status": "skipped",
                            "reason": "unsupported action type",
                        }
                    )
            except Exception as exc:
                results.append(
                    {
                        "action_type": action_type or "unknown",
                        "status": "failed",
                        "reason": str(exc),
                    }
                )
        return results

    def _resolve_dispatch_status(self, cascade_results: List[Dict[str, Any]]) -> str:
        if not cascade_results:
            return "no_actions"
        if any(result.get("status") in {"failed"} for result in cascade_results):
            return "degraded"
        if any(result.get("status") in {"sent", "created", "stored", "dry_run", "queued"} for result in cascade_results):
            return "dispatched"
        return "pending"

    def _merge_alert_history(
        self,
        *,
        alert_history: List[Dict[str, Any]],
        override_history: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        merged: List[Dict[str, Any]] = []
        seen_ids: set[str] = set()
        for raw_entry in [*(override_history or []), *(alert_history or [])]:
            normalized = self._normalize_alert_history_entry(raw_entry)
            if not normalized:
                continue
            entry_id = str(normalized.get("id") or "")
            if entry_id in seen_ids:
                continue
            seen_ids.add(entry_id)
            merged.append(normalized)
        merged.sort(key=lambda item: item.get("trigger_time") or "", reverse=True)
        return merged[:120]

    def _upsert_alert_history_entries(
        self,
        existing_entries: List[Dict[str, Any]],
        incoming_entries: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        merged: Dict[str, Dict[str, Any]] = {}
        for raw_entry in existing_entries or []:
            normalized = self._normalize_alert_history_entry(raw_entry)
            if normalized:
                merged[str(normalized["id"])] = normalized
        for raw_entry in incoming_entries or []:
            normalized = self._normalize_alert_history_entry(raw_entry)
            if normalized:
                merged[str(normalized["id"])] = normalized
        return sorted(merged.values(), key=lambda item: item.get("trigger_time") or "", reverse=True)

    def _normalize_alert_history_entry(self, entry: Dict[str, Any] | None) -> Optional[Dict[str, Any]]:
        if not isinstance(entry, dict):
            return None
        trigger_time = (
            entry.get("trigger_time")
            or entry.get("triggerTime")
            or entry.get("triggered_at")
            or entry.get("timestamp")
        )
        trigger_time = str(trigger_time or _utcnow_iso())
        symbol = str(entry.get("symbol") or "").strip().upper()
        entry_id = _normalize_identifier(entry.get("id"))
        if not entry_id:
            entry_id = f"alert_hist_{symbol or 'unknown'}_{trigger_time}"
        lifecycle_status = _normalize_alert_center_lifecycle_status(
            _first_non_none(entry, "status", "state", "alert_status", "alertStatus")
        )
        review_status = str(entry.get("review_status") or entry.get("reviewStatus") or "").strip().lower()
        if review_status not in {"pending", "resolved", "false_positive"}:
            review_status = "pending"
        acknowledged_at = _first_non_none(
            entry,
            "acknowledged_at",
            "acknowledgedAt",
            "resolved_at",
            "resolvedAt",
        )
        acknowledged_at = str(acknowledged_at).strip() if acknowledged_at else None
        if review_status == "pending" and lifecycle_status not in {"acknowledged", "snoozed", "resolved"}:
            acknowledged_at = None
        snoozed_until = _first_non_none(
            entry,
            "snoozed_until",
            "snoozedUntil",
            "snooze_until",
            "snoozeUntil",
        )
        snoozed_until = str(snoozed_until).strip() if snoozed_until else None
        resolved_at = _first_non_none(entry, "resolved_at", "resolvedAt", "closed_at")
        resolved_at = str(resolved_at).strip() if resolved_at else None
        source_module = str(
            entry.get("source_module")
            or entry.get("sourceModule")
            or entry.get("module")
            or ("composite" if entry.get("condition_summary") else "realtime")
        ).strip().lower() or "realtime"
        rule_name = str(
            entry.get("rule_name")
            or entry.get("ruleName")
            or entry.get("name")
            or entry.get("conditionLabel")
            or entry.get("condition_summary")
            or (f"{symbol} alert" if symbol else "unnamed_rule")
        ).strip()
        response_minutes = None
        try:
            if acknowledged_at:
                response_minutes = round(
                    (
                        pd.Timestamp(acknowledged_at).tz_localize(None)
                        - pd.Timestamp(trigger_time).tz_localize(None)
                    ).total_seconds() / 60.0,
                    2,
                )
        except Exception:
            response_minutes = None

        return {
            "id": entry_id,
            "alert_id": entry.get("alert_id") or entry.get("alertId"),
            "symbol": symbol or None,
            "rule_name": rule_name,
            "source_module": source_module,
            "severity": str(entry.get("severity") or "info").lower(),
            "condition": entry.get("condition"),
            "condition_label": entry.get("condition_label") or entry.get("conditionLabel"),
            "condition_summary": entry.get("condition_summary"),
            "message": str(entry.get("message") or "").strip(),
            "trigger_time": trigger_time,
            "trigger_value": _pick_metric(entry, "trigger_value", "triggerValue"),
            "trigger_price": _pick_metric(entry, "trigger_price", "triggerPrice", "priceSnapshot"),
            "threshold": _pick_metric(entry, "threshold"),
            "status": _first_non_none(entry, "status", "state", "alert_status", "alertStatus"),
            "review_status": review_status,
            "acknowledged_at": acknowledged_at,
            "snoozed_until": snoozed_until,
            "resolved_at": resolved_at,
            "response_minutes": response_minutes,
            "matched_rule_ids": entry.get("matched_rule_ids") or [],
            "matched_rule_names": entry.get("matched_rule_names") or [],
            "cascade_actions": entry.get("cascade_actions") or [],
            "cascade_results": entry.get("cascade_results") or [],
            "dispatched_channels": entry.get("dispatched_channels") or [],
            "workbench_task_ids": entry.get("workbench_task_ids") or [],
            "infra_task_ids": entry.get("infra_task_ids") or [],
            "timeseries_points": entry.get("timeseries_points") or [],
            "config_snapshots": entry.get("config_snapshots") or [],
            "dispatch_status": entry.get("dispatch_status") or "pending",
            "published_at": entry.get("published_at"),
        }

    def _build_alert_history_stats(self, history: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not history:
            return {
                "summary": {
                    "reviewed_events": 0,
                    "false_positive_rate": 0.0,
                    "average_response_minutes": None,
                    "pending_events": 0,
                    "cascaded_events": 0,
                    "notified_events": 0,
                    "workbench_tasks_created": 0,
                    "infra_tasks_created": 0,
                    "timeseries_points_written": 0,
                    "config_snapshots_created": 0,
                },
                "rule_stats": [],
                "module_stats": [],
                "pending_queue": [],
                "cascade_stats": [],
            }

        reviewed = [entry for entry in history if entry.get("review_status") in {"resolved", "false_positive"}]
        false_positive_count = sum(1 for entry in reviewed if entry.get("review_status") == "false_positive")
        raw_response_values = [
            _safe_float(entry.get("response_minutes"), None)
            for entry in reviewed
            if entry.get("response_minutes") not in (None, "")
        ]
        response_values: List[float] = [v for v in raw_response_values if v is not None]
        pending_queue = [entry for entry in history if entry.get("review_status") == "pending"]
        cascaded_events = [entry for entry in history if entry.get("cascade_results")]
        notified_events = sum(1 for entry in history if entry.get("dispatched_channels"))
        workbench_tasks_created = sum(len(entry.get("workbench_task_ids") or []) for entry in history)
        infra_tasks_created = sum(len(entry.get("infra_task_ids") or []) for entry in history)
        timeseries_points_written = sum(len(entry.get("timeseries_points") or []) for entry in history)
        config_snapshots_created = sum(len(entry.get("config_snapshots") or []) for entry in history)

        rule_groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        module_groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        cascade_groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for entry in history:
            rule_groups[str(entry.get("rule_name") or "unnamed_rule")].append(entry)
            module_groups[str(entry.get("source_module") or "unknown")].append(entry)
            for result in entry.get("cascade_results") or []:
                cascade_groups[str(result.get("action_type") or "unknown")].append(result)

        rule_stats = []
        for rule_name, entries in rule_groups.items():
            reviewed_entries = [entry for entry in entries if entry.get("review_status") in {"resolved", "false_positive"}]
            false_hits = sum(1 for entry in reviewed_entries if entry.get("review_status") == "false_positive")
            last_trigger = max((entry.get("trigger_time") or "" for entry in entries), default="")
            rule_stats.append(
                {
                    "rule_name": rule_name,
                    "source_module": entries[0].get("source_module"),
                    "hit_count": len(entries),
                    "reviewed_count": len(reviewed_entries),
                    "false_positive_rate": round(false_hits / max(len(reviewed_entries), 1), 4) if reviewed_entries else 0.0,
                    "last_trigger_time": last_trigger or None,
                    "sample_symbol": entries[0].get("symbol"),
                }
            )
        rule_stats.sort(key=lambda item: (item["hit_count"], item["reviewed_count"]), reverse=True)

        module_stats: List[Dict[str, Any]] = []
        for module_name, entries in module_groups.items():
            reviewed_entries = [entry for entry in entries if entry.get("review_status") in {"resolved", "false_positive"}]
            false_hits = sum(1 for entry in reviewed_entries if entry.get("review_status") == "false_positive")
            module_stats.append(
                {
                    "module": module_name,
                    "event_count": len(entries),
                    "reviewed_count": len(reviewed_entries),
                    "pending_count": sum(1 for entry in entries if entry.get("review_status") == "pending"),
                    "false_positive_rate": round(false_hits / max(len(reviewed_entries), 1), 4) if reviewed_entries else 0.0,
                }
            )
        module_stats.sort(key=lambda item: item["event_count"], reverse=True)

        cascade_stats: List[Dict[str, Any]] = []
        for action_type, results in cascade_groups.items():
            cascade_stats.append(
                {
                    "action_type": action_type,
                    "count": len(results),
                    "success_count": sum(1 for item in results if item.get("status") in {"sent", "created", "stored", "dry_run", "queued"}),
                    "failure_count": sum(1 for item in results if item.get("status") == "failed"),
                }
            )
        cascade_stats.sort(key=lambda item: item["count"], reverse=True)

        return {
            "summary": {
                "reviewed_events": len(reviewed),
                "false_positive_rate": round(false_positive_count / max(len(reviewed), 1), 4) if reviewed else 0.0,
                "average_response_minutes": round(sum(response_values) / len(response_values), 2) if response_values else None,
                "pending_events": len(pending_queue),
                "cascaded_events": len(cascaded_events),
                "notified_events": notified_events,
                "workbench_tasks_created": workbench_tasks_created,
                "infra_tasks_created": infra_tasks_created,
                "timeseries_points_written": timeseries_points_written,
                "config_snapshots_created": config_snapshots_created,
            },
            "rule_stats": rule_stats[:16],
            "module_stats": module_stats,
            "pending_queue": pending_queue[:20],
            "cascade_stats": cascade_stats,
        }

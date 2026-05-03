"""Briefing distribution helpers for ResearchWorkbenchStore.

This module is private to the research workbench — its functions take the
store instance as the first argument so the store keeps owning briefing
state while the helper logic lives outside the main class.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, time, timedelta
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

if TYPE_CHECKING:
    from src.research.workbench import ResearchWorkbenchStore

logger = logging.getLogger(__name__)

BRIEFING_WEEKDAY_INDEX = {
    "mon": 0,
    "tue": 1,
    "wed": 2,
    "thu": 3,
    "fri": 4,
    "sat": 5,
    "sun": 6,
}


def default_briefing_state(store: "ResearchWorkbenchStore") -> Dict[str, Any]:
    return {
        "distribution": {
            "enabled": False,
            "send_time": "09:00",
            "timezone": "Asia/Shanghai",
            "weekdays": ["mon", "tue", "wed", "thu", "fri"],
            "notification_channels": ["dry_run"],
            "default_preset_id": "",
            "presets": [],
            "to_recipients": "",
            "cc_recipients": "",
            "team_note": "",
            "updated_at": "",
        },
        "delivery_history": [],
    }


def normalize_briefing_preset(store: "ResearchWorkbenchStore", preset: Dict[str, Any]) -> Dict[str, Any]:
    normalized = dict(preset or {})
    return {
        "id": str(normalized.get("id") or "").strip()[:80],
        "name": str(normalized.get("name") or "").strip()[:80],
        "to_recipients": str(
            normalized.get("to_recipients")
            or normalized.get("toRecipients")
            or ""
        )[:2000],
        "cc_recipients": str(
            normalized.get("cc_recipients")
            or normalized.get("ccRecipients")
            or ""
        )[:2000],
    }


def normalize_briefing_distribution(
    store: "ResearchWorkbenchStore", distribution: Dict[str, Any]
) -> Dict[str, Any]:
    default_distribution = store._default_briefing_state()["distribution"]
    raw = dict(distribution or {})
    weekdays = raw.get("weekdays")
    if not isinstance(weekdays, list):
        weekdays = default_distribution["weekdays"]

    presets = [
        preset
        for preset in (
            store._normalize_briefing_preset(preset)
            for preset in (raw.get("presets") or [])
            if isinstance(preset, dict)
        )
        if preset.get("id")
    ][:20]

    return {
        "enabled": bool(raw.get("enabled", default_distribution["enabled"])),
        "send_time": str(raw.get("send_time") or default_distribution["send_time"])[:8],
        "timezone": str(raw.get("timezone") or default_distribution["timezone"])[:80],
        "weekdays": [str(day).strip()[:12] for day in weekdays if str(day).strip()][:7],
        "notification_channels": [
            str(channel).strip()[:80]
            for channel in (raw.get("notification_channels") or default_distribution["notification_channels"])
            if str(channel).strip()
        ][:10],
        "default_preset_id": str(raw.get("default_preset_id") or "")[:80],
        "presets": presets,
        "to_recipients": str(raw.get("to_recipients") or "")[:2000],
        "cc_recipients": str(raw.get("cc_recipients") or "")[:2000],
        "team_note": str(raw.get("team_note") or "")[:1000],
        "updated_at": str(raw.get("updated_at") or ""),
    }


def normalize_briefing_delivery_record(
    store: "ResearchWorkbenchStore", record: Dict[str, Any]
) -> Dict[str, Any]:
    raw = dict(record or {})
    return {
        "id": str(raw.get("id") or store._generate_entity_id("briefing", raw.get("subject", ""))),
        "created_at": str(raw.get("created_at") or store._now()),
        "status": str(raw.get("status") or "dry_run"),
        "channel": str(raw.get("channel") or "email")[:40],
        "dry_run": bool(raw.get("dry_run", True)),
        "subject": str(raw.get("subject") or "")[:300],
        "headline": str(raw.get("headline") or "")[:300],
        "summary": str(raw.get("summary") or "")[:2000],
        "current_view": str(raw.get("current_view") or "")[:1000],
        "to_recipients": str(raw.get("to_recipients") or "")[:2000],
        "cc_recipients": str(raw.get("cc_recipients") or "")[:2000],
        "team_note": str(raw.get("team_note") or "")[:1000],
        "task_count": int(raw.get("task_count") or 0),
        "channels": [
            str(channel).strip()[:80]
            for channel in (raw.get("channels") or [])
            if str(channel).strip()
        ][:10],
        "channel_results": [
            dict(result)
            for result in (raw.get("channel_results") or [])
            if isinstance(result, dict)
        ][:10],
        "error": str(raw.get("error") or "")[:1000],
    }


def normalize_briefing_state(
    store: "ResearchWorkbenchStore", state: Dict[str, Any]
) -> Dict[str, Any]:
    raw = dict(state or {})
    return {
        "distribution": store._normalize_briefing_distribution(raw.get("distribution") or {}),
        "delivery_history": [
            store._normalize_briefing_delivery_record(record)
            for record in (raw.get("delivery_history") or [])
            if isinstance(record, dict)
        ][:25],
    }


def compute_briefing_schedule(
    store: "ResearchWorkbenchStore",
    distribution: Dict[str, Any],
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    normalized = store._normalize_briefing_distribution(distribution)
    timezone_name = normalized.get("timezone") or "Asia/Shanghai"
    try:
        timezone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        return {
            "enabled": bool(normalized.get("enabled")),
            "status": "invalid_timezone",
            "timezone": timezone_name,
            "send_time": normalized.get("send_time") or "09:00",
            "weekdays": normalized.get("weekdays") or [],
            "next_run_at": "",
            "next_run_label": "时区无效，无法计算自动分发时间",
            "reason": f"Unknown timezone: {timezone_name}",
        }

    try:
        hour, minute = [int(part) for part in str(normalized.get("send_time") or "09:00").split(":")[:2]]
        send_clock = time(hour=hour, minute=minute)
    except Exception:
        return {
            "enabled": bool(normalized.get("enabled")),
            "status": "invalid_time",
            "timezone": timezone_name,
            "send_time": normalized.get("send_time") or "09:00",
            "weekdays": normalized.get("weekdays") or [],
            "next_run_at": "",
            "next_run_label": "发送时间无效，格式应为 HH:MM",
            "reason": f"Invalid send_time: {normalized.get('send_time')}",
        }

    weekday_indexes = [
        BRIEFING_WEEKDAY_INDEX[day]
        for day in normalized.get("weekdays") or []
        if day in BRIEFING_WEEKDAY_INDEX
    ]
    if not weekday_indexes:
        return {
            "enabled": bool(normalized.get("enabled")),
            "status": "invalid_weekdays",
            "timezone": timezone_name,
            "send_time": normalized.get("send_time") or "09:00",
            "weekdays": normalized.get("weekdays") or [],
            "next_run_at": "",
            "next_run_label": "未选择有效工作日",
            "reason": "No valid weekdays configured",
        }

    now_local = now or datetime.now(timezone)
    if now_local.tzinfo is None:
        now_local = now_local.replace(tzinfo=timezone)
    else:
        now_local = now_local.astimezone(timezone)

    base = {
        "enabled": bool(normalized.get("enabled")),
        "timezone": timezone_name,
        "send_time": normalized.get("send_time") or "09:00",
        "weekdays": normalized.get("weekdays") or [],
        "now_at": now_local.isoformat(timespec="minutes"),
    }
    if not normalized.get("enabled"):
        return {
            **base,
            "status": "disabled",
            "next_run_at": "",
            "next_run_label": "自动分发未启用",
            "reason": "",
        }

    for offset in range(8):
        candidate_date = now_local.date() + timedelta(days=offset)
        if candidate_date.weekday() not in weekday_indexes:
            continue
        candidate = datetime.combine(candidate_date, send_clock, tzinfo=timezone)
        if candidate > now_local:
            return {
                **base,
                "status": "scheduled",
                "next_run_at": candidate.isoformat(timespec="minutes"),
                "next_run_label": f"{candidate.strftime('%Y-%m-%d %H:%M')} {timezone_name}",
                "reason": "",
            }

    return {
        **base,
        "status": "unavailable",
        "next_run_at": "",
        "next_run_label": "暂未计算到下一次自动分发",
        "reason": "No candidate date found",
    }


def with_briefing_schedule(
    store: "ResearchWorkbenchStore",
    state: Dict[str, Any],
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    normalized = store._normalize_briefing_state(state)
    return {
        **normalized,
        "schedule": store._compute_briefing_schedule(normalized.get("distribution") or {}, now=now),
    }


def load_briefing_state(store: "ResearchWorkbenchStore") -> Dict[str, Any]:
    try:
        if store.briefing_state_file.exists():
            with open(store.briefing_state_file, "r", encoding="utf-8") as file:
                return store._normalize_briefing_state(json.load(file))
    except Exception as exc:
        logger.warning("Failed to load research briefing state: %s", exc)
    return store._default_briefing_state()


def persist_briefing_state(store: "ResearchWorkbenchStore", state: Dict[str, Any]) -> None:
    normalized = store._normalize_briefing_state(state)
    tmp_file = store.briefing_state_file.with_suffix(".json.tmp")
    with open(tmp_file, "w", encoding="utf-8") as file:
        json.dump(normalized, file, ensure_ascii=False, indent=2, default=str)
    tmp_file.replace(store.briefing_state_file)


def get_briefing_distribution(store: "ResearchWorkbenchStore") -> Dict[str, Any]:
    with store._lock:
        return store._with_briefing_schedule(store._load_briefing_state())


def update_briefing_distribution(
    store: "ResearchWorkbenchStore", payload: Dict[str, Any]
) -> Dict[str, Any]:
    with store._lock:
        state = store._load_briefing_state()
        distribution = store._normalize_briefing_distribution(
            {
                **(state.get("distribution") or {}),
                **dict(payload or {}),
                "updated_at": store._now(),
            }
        )
        state["distribution"] = distribution
        store._persist_briefing_state(state)
        return store._with_briefing_schedule(state)


def record_briefing_delivery(
    store: "ResearchWorkbenchStore",
    payload: Dict[str, Any],
    *,
    status: str = "dry_run",
    dry_run: bool = True,
    channel_results: Optional[List[Dict[str, Any]]] = None,
    channels: Optional[List[str]] = None,
    error: str = "",
) -> Dict[str, Any]:
    with store._lock:
        state = store._load_briefing_state()
        timestamp = store._now()
        record = store._normalize_briefing_delivery_record(
            {
                **dict(payload or {}),
                "id": store._generate_entity_id("briefing", (payload or {}).get("subject", "")),
                "created_at": timestamp,
                "status": status,
                "dry_run": dry_run,
                "channels": channels or [],
                "channel_results": channel_results or [],
                "error": error,
            }
        )
        state["delivery_history"] = [record] + list(state.get("delivery_history") or [])
        state["delivery_history"] = state["delivery_history"][:25]
        store._persist_briefing_state(state)
        return {
            "record": record,
            "distribution": state.get("distribution") or store._default_briefing_state()["distribution"],
            "delivery_history": state["delivery_history"],
            "schedule": store._compute_briefing_schedule(state.get("distribution") or {}),
        }


def record_briefing_dry_run(
    store: "ResearchWorkbenchStore", payload: Dict[str, Any]
) -> Dict[str, Any]:
    channel = str((payload or {}).get("channel") or "email").strip() or "email"
    return store.record_briefing_delivery(
        payload,
        status="dry_run",
        dry_run=True,
        channels=[channel],
        channel_results=[{"channel": channel, "status": "dry_run", "delivered": False}],
    )

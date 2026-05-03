"""Refresh-priority event helpers for ResearchWorkbenchStore.

This module is private to the research workbench — its functions take the
store instance as the first argument so the store keeps owning state while
the helper logic lives outside the main class.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, Optional

if TYPE_CHECKING:
    from src.research.workbench import ResearchWorkbenchStore

REFRESH_PRIORITY_CHANGE_LABELS = {
    "new": "首次记录",
    "escalated": "升级",
    "relaxed": "缓和",
    "updated": "更新",
}


def build_refresh_priority_event(
    store: "ResearchWorkbenchStore",
    task: Optional[Dict[str, Any]],
    priority_event: Optional[Dict[str, Any]],
    created_at: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    if not priority_event:
        return None

    payload = dict(priority_event or {})
    reason_label = str(payload.get("reason_label") or "").strip() or "自动排序"
    lead = str(payload.get("lead") or "").strip()
    detail = str(payload.get("detail") or "").strip()
    event_detail = "；".join(part for part in [lead, detail] if part)
    meta = {
        "priority_reason": payload.get("reason_key") or "",
        "reason_label": reason_label,
        "severity": payload.get("severity") or "",
        "lead": lead,
        "detail": detail,
        "urgency_score": payload.get("urgency_score"),
        "priority_weight": payload.get("priority_weight"),
        "recommendation": payload.get("recommendation") or "",
        "summary": payload.get("summary") or "",
        "synthetic": False,
    }
    compact_meta = {
        key: value
        for key, value in meta.items()
        if value not in ("", None, [], {})
    }
    change_meta = store._build_refresh_priority_change_meta(task, payload)
    compact_meta.update(change_meta)
    change_type = compact_meta.get("change_type") or "new"
    label_prefix = "系统自动重排"
    if change_type == "escalated":
        label_prefix = "系统自动重排升级"
    elif change_type == "relaxed":
        label_prefix = "系统自动重排缓和"
    elif change_type == "updated":
        label_prefix = "系统自动重排更新"
    compact_meta = {
        key: value
        for key, value in compact_meta.items()
        if value not in ("", None, [], {})
    }
    return store._build_event(
        "refresh_priority",
        f"{label_prefix}：{reason_label}",
        event_detail,
        compact_meta,
        created_at=created_at,
    )


def refresh_priority_signature_from_payload(
    store: "ResearchWorkbenchStore",
    priority_event: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    if not priority_event:
        return None

    payload = dict(priority_event or {})
    return {
        "priority_reason": str(payload.get("reason_key") or "").strip(),
        "reason_label": str(payload.get("reason_label") or "").strip() or "自动排序",
        "severity": str(payload.get("severity") or "").strip(),
        "lead": str(payload.get("lead") or "").strip(),
        "detail": str(payload.get("detail") or "").strip(),
        "urgency_score": payload.get("urgency_score"),
        "priority_weight": payload.get("priority_weight"),
        "recommendation": str(payload.get("recommendation") or "").strip(),
        "summary": str(payload.get("summary") or "").strip(),
    }


def refresh_priority_signature_from_event(
    store: "ResearchWorkbenchStore",
    event: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    if not event or event.get("type") != "refresh_priority":
        return None

    meta = event.get("meta") or {}
    return {
        "priority_reason": str(meta.get("priority_reason") or "").strip(),
        "reason_label": str(meta.get("reason_label") or "").strip() or "自动排序",
        "severity": str(meta.get("severity") or "").strip(),
        "lead": str(meta.get("lead") or "").strip(),
        "detail": str(meta.get("detail") or "").strip(),
        "urgency_score": meta.get("urgency_score"),
        "priority_weight": meta.get("priority_weight"),
        "recommendation": str(meta.get("recommendation") or "").strip(),
        "summary": str(meta.get("summary") or "").strip(),
    }


def has_duplicate_refresh_priority_event(
    store: "ResearchWorkbenchStore",
    task: Optional[Dict[str, Any]],
    priority_event: Optional[Dict[str, Any]],
) -> bool:
    next_signature = store._refresh_priority_signature_from_payload(priority_event)
    if not next_signature or not task:
        return False

    latest_refresh_priority_event = next(
        (event for event in (task.get("timeline") or []) if event.get("type") == "refresh_priority"),
        None,
    )
    latest_signature = store._refresh_priority_signature_from_event(latest_refresh_priority_event)
    return bool(latest_signature and latest_signature == next_signature)


def severity_rank(store: "ResearchWorkbenchStore", value: Any) -> int:
    return {
        "low": 1,
        "medium": 2,
        "high": 3,
    }.get(str(value or "").strip(), 0)


def build_refresh_priority_change_meta(
    store: "ResearchWorkbenchStore",
    task: Optional[Dict[str, Any]],
    priority_event: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    current_signature = store._refresh_priority_signature_from_payload(priority_event)
    if not current_signature:
        return {}

    latest_refresh_priority_event = next(
        (event for event in (task or {}).get("timeline", []) if event.get("type") == "refresh_priority"),
        None,
    )
    previous_signature = store._refresh_priority_signature_from_event(latest_refresh_priority_event)
    if not previous_signature:
        return {
            "change_type": "new",
            "change_label": REFRESH_PRIORITY_CHANGE_LABELS["new"],
        }

    urgency_score = current_signature.get("urgency_score")
    previous_urgency_score = previous_signature.get("urgency_score")
    urgency_delta = None
    if urgency_score is not None and previous_urgency_score is not None:
        urgency_delta = float(urgency_score) - float(previous_urgency_score)

    priority_weight = current_signature.get("priority_weight")
    previous_priority_weight = previous_signature.get("priority_weight")
    priority_weight_delta = None
    if priority_weight is not None and previous_priority_weight is not None:
        priority_weight_delta = float(priority_weight) - float(previous_priority_weight)

    severity_delta = (
        store._severity_rank(current_signature.get("severity"))
        - store._severity_rank(previous_signature.get("severity"))
    )
    reason_changed = current_signature.get("priority_reason") != previous_signature.get("priority_reason")

    if severity_delta > 0 or (urgency_delta is not None and urgency_delta > 0.25) or (
        priority_weight_delta is not None and priority_weight_delta > 0.25
    ):
        change_type = "escalated"
    elif severity_delta < 0 or (urgency_delta is not None and urgency_delta < -0.25) or (
        priority_weight_delta is not None and priority_weight_delta < -0.25
    ):
        change_type = "relaxed"
    else:
        change_type = "updated"

    return {
        "change_type": change_type,
        "change_label": REFRESH_PRIORITY_CHANGE_LABELS[change_type],
        "reason_changed": reason_changed,
        "previous_priority_reason": previous_signature.get("priority_reason") or "",
        "previous_reason_label": previous_signature.get("reason_label") or "",
        "previous_severity": previous_signature.get("severity") or "",
        "urgency_delta": urgency_delta,
        "priority_weight_delta": priority_weight_delta,
        "severity_delta": severity_delta,
    }

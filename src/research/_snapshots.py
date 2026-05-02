"""Snapshot helpers for ResearchWorkbenchStore.

This module is private to the research workbench — its functions take the
store instance as the first argument so the store keeps owning task state
while the helper logic lives outside the main class.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from src.research.workbench import ResearchWorkbenchStore


def normalize_snapshot(
    store: "ResearchWorkbenchStore", snapshot: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    snapshot = dict(snapshot or {})
    snapshot["headline"] = snapshot.get("headline", "")
    snapshot["summary"] = snapshot.get("summary", "")
    snapshot["highlights"] = snapshot.get("highlights") or []
    snapshot["payload"] = snapshot.get("payload") or {}
    snapshot["saved_at"] = snapshot.get("saved_at") or ""
    return snapshot


def append_snapshot_history(
    store: "ResearchWorkbenchStore",
    task: Dict[str, Any],
    snapshot: Dict[str, Any],
    timestamp: Optional[str] = None,
) -> Dict[str, Any]:
    saved_at = timestamp or store._now()
    normalized_snapshot = store._normalize_snapshot(
        {**snapshot, "saved_at": snapshot.get("saved_at") or saved_at}
    )
    history = [normalized_snapshot] + [
        existing
        for existing in (task.get("snapshot_history") or [])
        if existing.get("saved_at") != normalized_snapshot.get("saved_at")
        or existing.get("headline") != normalized_snapshot.get("headline")
    ]
    task["snapshot"] = normalized_snapshot
    task["snapshot_history"] = history
    return normalized_snapshot


def extract_snapshot_view_context(
    store: "ResearchWorkbenchStore", snapshot: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    payload = (snapshot or {}).get("payload") or {}
    view_context = payload.get("view_context") or payload.get("workbench_view_context") or {}
    return view_context if isinstance(view_context, dict) else {}


def build_snapshot_saved_detail(
    store: "ResearchWorkbenchStore", snapshot: Optional[Dict[str, Any]], fallback: str
) -> str:
    detail = str((snapshot or {}).get("headline") or fallback or "").strip() or fallback
    view_context = store._extract_snapshot_view_context(snapshot)
    summary = str(view_context.get("summary") or "").strip()
    if summary:
        return f"{detail} · 视图 {summary}"
    return detail


def build_snapshot_saved_meta(
    store: "ResearchWorkbenchStore", snapshot: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    view_context = store._extract_snapshot_view_context(snapshot)
    return {
        "saved_at": (snapshot or {}).get("saved_at"),
        "view_context_summary": str(view_context.get("summary") or "").strip(),
        "view_context_fingerprint": str(view_context.get("view_fingerprint") or "").strip(),
        "view_context_scoped_task_label": str(view_context.get("scoped_task_label") or "").strip(),
        "view_context_note": str(view_context.get("note") or "").strip(),
    }


def build_snapshot_view_queue_stats(
    store: "ResearchWorkbenchStore", limit: int = 8
) -> List[Dict[str, Any]]:
    buckets: Dict[str, Dict[str, Any]] = {}

    for task in store.tasks:
        view_context = store._extract_snapshot_view_context(task.get("snapshot"))
        summary = str(view_context.get("summary") or "").strip()
        fingerprint = str(view_context.get("view_fingerprint") or "").strip()
        bucket_key = fingerprint or summary
        if not bucket_key:
            continue

        current = buckets.get(bucket_key)
        if current is None:
            current = {
                "value": summary or fingerprint,
                "label": summary or fingerprint,
                "fingerprint": fingerprint,
                "count": 0,
                "scoped_count": 0,
                "latest_at": "",
                "type_counts": {},
            }
            buckets[bucket_key] = current

        current["count"] += 1
        if str(view_context.get("scoped_task_label") or "").strip():
            current["scoped_count"] += 1

        task_type = str(task.get("type") or "").strip() or "unknown"
        type_counts = current["type_counts"]
        type_counts[task_type] = int(type_counts.get(task_type) or 0) + 1

        latest_at = str(
            task.get("snapshot", {}).get("saved_at")
            or task.get("updated_at")
            or task.get("created_at")
            or ""
        )
        if latest_at and latest_at > str(current.get("latest_at") or ""):
            current["latest_at"] = latest_at

    ranked = sorted(
        buckets.values(),
        key=lambda item: (
            int(item.get("count") or 0),
            int(item.get("scoped_count") or 0),
            str(item.get("latest_at") or ""),
        ),
        reverse=True,
    )
    return ranked[:limit]

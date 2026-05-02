"""Disk persistence helpers for ResearchWorkbenchStore.

This module is private to the research workbench — its functions take the
store instance as the first argument so the store keeps owning task list
and dirty/deleted bookkeeping while the helper logic lives outside the
main class.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.research.workbench import ResearchWorkbenchStore

logger = logging.getLogger(__name__)


def connect_db(store: "ResearchWorkbenchStore") -> sqlite3.Connection:
    return sqlite3.connect(store.db_file, check_same_thread=False)


def init_db(store: "ResearchWorkbenchStore") -> None:
    with store._connect_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS research_tasks (
                id TEXT PRIMARY KEY,
                updated_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                status TEXT NOT NULL,
                type TEXT NOT NULL,
                source TEXT NOT NULL,
                board_order INTEGER NOT NULL,
                payload TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_research_tasks_updated_at ON research_tasks(updated_at DESC)"
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_research_tasks_status ON research_tasks(status)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_research_tasks_type ON research_tasks(type)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_research_tasks_source ON research_tasks(source)")
        conn.commit()


def load_tasks(store: "ResearchWorkbenchStore") -> None:
    store._init_db()
    try:
        with store._connect_db() as conn:
            rows = conn.execute(
                "SELECT payload FROM research_tasks ORDER BY updated_at DESC"
            ).fetchall()
        if rows:
            store.tasks = [store._normalize_record(json.loads(row[0])) for row in rows]
            return
    except Exception as exc:
        logger.warning("Failed to load research workbench tasks from sqlite: %s", exc)
        store.tasks = []

    try:
        if store.tasks_file.exists():
            with open(store.tasks_file, "r", encoding="utf-8") as file:
                data = json.load(file)
                store.tasks = data if isinstance(data, list) else []
                store.tasks = [store._normalize_record(task) for task in store.tasks]
                store._dirty_task_ids = {task["id"] for task in store.tasks if task.get("id")}
                store._persist(force=True)
                return
    except Exception as exc:
        logger.warning("Failed to load research workbench tasks from legacy json: %s", exc)
        store.tasks = []


def persist_to_disk(store: "ResearchWorkbenchStore") -> None:
    try:
        task_lookup = {task.get("id"): task for task in store.tasks if task.get("id")}
        with store._connect_db() as conn:
            if store._deleted_task_ids:
                conn.executemany(
                    "DELETE FROM research_tasks WHERE id = ?",
                    [(task_id,) for task_id in store._deleted_task_ids],
                )
            for task_id in store._dirty_task_ids:
                task = task_lookup.get(task_id)
                if not task:
                    continue
                conn.execute(
                    """
                    INSERT INTO research_tasks (
                        id,
                        updated_at,
                        created_at,
                        status,
                        type,
                        source,
                        board_order,
                        payload
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        updated_at = excluded.updated_at,
                        created_at = excluded.created_at,
                        status = excluded.status,
                        type = excluded.type,
                        source = excluded.source,
                        board_order = excluded.board_order,
                        payload = excluded.payload
                    """,
                    (
                        task["id"],
                        task.get("updated_at") or "",
                        task.get("created_at") or "",
                        task.get("status") or "new",
                        task.get("type") or "pricing",
                        task.get("source") or "",
                        int(task.get("board_order") or 0),
                        json.dumps(task, ensure_ascii=False, default=str),
                    ),
                )
            conn.commit()
        store._dirty_task_ids.clear()
        store._deleted_task_ids.clear()
    except Exception as exc:
        logger.error("Failed to persist research workbench tasks: %s", exc)


def cancel_persist_timer_locked(store: "ResearchWorkbenchStore") -> None:
    if store._persist_timer:
        store._persist_timer.cancel()
        store._persist_timer = None


def flush_locked(store: "ResearchWorkbenchStore") -> None:
    store._cancel_persist_timer_locked()
    if not store._persist_dirty:
        return
    store._persist_to_disk()
    store._persist_dirty = False


def persist(store: "ResearchWorkbenchStore", force: bool = False) -> None:
    with store._lock:
        store._persist_dirty = True
        if force or store.persist_immediately or store._persist_debounce_seconds <= 0:
            store._flush_locked()
            return

        store._cancel_persist_timer_locked()
        timer = threading.Timer(store._persist_debounce_seconds, store.flush)
        timer.daemon = True
        store._persist_timer = timer
        timer.start()


def flush(store: "ResearchWorkbenchStore") -> None:
    with store._lock:
        store._flush_locked()


def close(store: "ResearchWorkbenchStore") -> None:
    store.flush()

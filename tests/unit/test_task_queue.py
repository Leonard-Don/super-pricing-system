from backend.app.core.persistence import PersistenceManager
from backend.app.core import task_queue as task_queue_module
from backend.app.core.task_queue import TaskQueueManager


class FakePersistenceManager:
    def __init__(self):
        self.get_calls = []
        self.put_calls = []

    def get_record(self, record_type, record_key):
        self.get_calls.append((record_type, record_key))
        if record_type != "infra_task" or record_key != "task_cached":
            return None
        return {
            "id": "infra_task:task_cached",
            "record_type": "infra_task",
            "record_key": "task_cached",
            "payload": {
                "id": "task_cached",
                "name": "quant_strategy_optimizer",
                "status": "queued",
                "progress": 0.1,
            },
            "created_at": "2026-04-21T10:00:00",
            "updated_at": "2026-04-21T10:01:00",
        }

    def put_record(self, record_type, record_key, payload, record_id=None):
        self.put_calls.append((record_type, record_key, dict(payload), record_id))
        return {
            "id": record_id or f"{record_type}:{record_key}",
            "record_type": record_type,
            "record_key": record_key,
            "payload": dict(payload),
            "created_at": payload.get("created_at", "2026-04-21T10:00:00"),
            "updated_at": "2026-04-21T10:02:00",
        }

    def list_records(self, record_type=None, limit=50):
        raise AssertionError("task queue should not scan persisted records for single-task lookup")

    def list_records_page(self, record_type=None, limit=50, cursor=None, payload_filters=None, sort_by=None, sort_direction=None):
        raise AssertionError("task queue should not page persisted records for single-task lookup")

    def count_records(self, record_type=None, payload_filters=None):
        return 1


def test_task_queue_loads_single_task_via_direct_lookup(monkeypatch):
    fake_persistence = FakePersistenceManager()
    monkeypatch.setattr(task_queue_module, "persistence_manager", fake_persistence)

    manager = TaskQueueManager()

    persisted = manager.get_task("task_cached")

    assert persisted["id"] == "task_cached"
    assert persisted["status"] == "queued"
    assert persisted["progress"] == 0.1
    assert fake_persistence.get_calls == [("infra_task", "task_cached")]

    updated = manager._attach_runtime_task("task_cached", {"status": "running", "progress": 0.4})

    assert updated["status"] == "running"
    assert updated["progress"] == 0.4
    assert fake_persistence.put_calls


def test_task_queue_list_and_health_include_more_than_two_hundred_persisted_tasks(monkeypatch, tmp_path):
    persistence = PersistenceManager(sqlite_path=tmp_path / "task_queue.sqlite3")
    for index in range(300):
        task_id = f"task_{index:03d}"
        persistence.put_record(
            "infra_task",
            task_id,
            payload={
                "id": task_id,
                "name": "quant_strategy_optimizer",
                "status": "completed",
                "progress": 1.0,
                "execution_backend": "local",
            },
            record_id=f"infra_task:{task_id}",
        )

    monkeypatch.setattr(task_queue_module, "persistence_manager", persistence)
    manager = TaskQueueManager()

    tasks = manager.list_tasks(limit=300)
    health = manager.health()

    assert len(tasks) == 300
    assert health["persisted_tasks"] == 300


def test_task_queue_lists_tasks_with_cursor_pagination(monkeypatch, tmp_path):
    persistence = PersistenceManager(sqlite_path=tmp_path / "task_queue_paged.sqlite3")
    for index in range(25):
        task_id = f"task_{index:03d}"
        persistence.put_record(
            "infra_task",
            task_id,
            payload={
                "id": task_id,
                "name": "quant_strategy_optimizer",
                "status": "completed",
                "progress": 1.0,
                "execution_backend": "local",
            },
            record_id=f"infra_task:{task_id}",
        )

    with persistence._connect_sqlite() as connection:
        for index in range(25):
            task_id = f"task_{index:03d}"
            timestamp = f"2026-04-21T10:{index:02d}:00"
            connection.execute(
                "UPDATE infra_records SET created_at = ?, updated_at = ? WHERE id = ?",
                (timestamp, timestamp, f"infra_task:{task_id}"),
            )
        connection.commit()

    monkeypatch.setattr(task_queue_module, "persistence_manager", persistence)
    manager = TaskQueueManager()

    first_page = manager.list_tasks_page(limit=10)
    second_page = manager.list_tasks_page(limit=10, cursor=first_page["next_cursor"])
    third_page = manager.list_tasks_page(limit=10, cursor=second_page["next_cursor"])

    assert [task["id"] for task in first_page["tasks"]] == [f"task_{index:03d}" for index in range(24, 14, -1)]
    assert first_page["has_more"] is True
    assert first_page["next_cursor"]
    assert first_page["total"] == 25

    assert [task["id"] for task in second_page["tasks"]] == [f"task_{index:03d}" for index in range(14, 4, -1)]
    assert second_page["has_more"] is True
    assert second_page["next_cursor"]

    assert [task["id"] for task in third_page["tasks"]] == [f"task_{index:03d}" for index in range(4, -1, -1)]
    assert third_page["has_more"] is False
    assert third_page["next_cursor"] is None


def test_task_queue_filters_tasks_by_status_and_backend(monkeypatch, tmp_path):
    persistence = PersistenceManager(sqlite_path=tmp_path / "task_queue_filtered.sqlite3")
    records = [
        ("task_completed_local", "completed", "local", "2026-04-21T10:00:00"),
        ("task_running_local", "running", "local", "2026-04-21T10:01:00"),
        ("task_completed_celery", "completed", "celery", "2026-04-21T10:02:00"),
        ("task_failed_celery", "failed", "celery", "2026-04-21T10:03:00"),
    ]
    for task_id, status, backend, timestamp in records:
        persistence.put_record(
            "infra_task",
            task_id,
            payload={
                "id": task_id,
                "name": "quant_strategy_optimizer",
                "status": status,
                "progress": 1.0 if status == "completed" else 0.5,
                "execution_backend": backend,
            },
            record_id=f"infra_task:{task_id}",
        )
        with persistence._connect_sqlite() as connection:
            connection.execute(
                "UPDATE infra_records SET created_at = ?, updated_at = ? WHERE id = ?",
                (timestamp, timestamp, f"infra_task:{task_id}"),
            )
            connection.commit()

    monkeypatch.setattr(task_queue_module, "persistence_manager", persistence)
    manager = TaskQueueManager()

    filtered = manager.list_tasks_page(limit=10, status="completed", execution_backend="celery")

    assert filtered["total"] == 1
    assert filtered["has_more"] is False
    assert [task["id"] for task in filtered["tasks"]] == ["task_completed_celery"]
    assert filtered["filters"] == {
        "status": "completed",
        "execution_backend": "celery",
        "task_view": "all",
        "sort_by": "updated_at",
        "sort_direction": "desc",
    }


def test_task_queue_active_view_prioritizes_actionable_statuses(monkeypatch, tmp_path):
    persistence = PersistenceManager(sqlite_path=tmp_path / "task_queue_active.sqlite3")
    records = [
        ("task_completed", "completed", "local", "2026-04-21T10:00:00", "2026-04-21T10:05:00"),
        ("task_failed", "failed", "celery", "2026-04-21T10:01:00", "2026-04-21T10:06:00"),
        ("task_running", "running", "local", "2026-04-21T10:02:00", "2026-04-21T10:07:00"),
        ("task_queued", "queued", "local", "2026-04-21T10:03:00", "2026-04-21T10:08:00"),
    ]
    for task_id, status, backend, created_at, updated_at in records:
        persistence.put_record(
            "infra_task",
            task_id,
            payload={
                "id": task_id,
                "name": "quant_strategy_optimizer",
                "status": status,
                "progress": 0.5,
                "execution_backend": backend,
            },
            record_id=f"infra_task:{task_id}",
        )
        with persistence._connect_sqlite() as connection:
            connection.execute(
                "UPDATE infra_records SET created_at = ?, updated_at = ? WHERE id = ?",
                (created_at, updated_at, f"infra_task:{task_id}"),
            )
            connection.commit()

    monkeypatch.setattr(task_queue_module, "persistence_manager", persistence)
    manager = TaskQueueManager()

    active_page = manager.list_tasks_page(limit=2, task_view="active")
    next_page = manager.list_tasks_page(limit=2, task_view="active", cursor=active_page["next_cursor"])

    assert active_page["total"] == 3
    assert [task["id"] for task in active_page["tasks"]] == [
        "task_failed",
        "task_running",
    ]
    assert active_page["has_more"] is True
    assert active_page["next_cursor"]
    assert [task["id"] for task in next_page["tasks"]] == ["task_queued"]
    assert next_page["has_more"] is False
    assert next_page["next_cursor"] is None
    assert active_page["filters"] == {
        "status": None,
        "execution_backend": None,
        "task_view": "active",
        "sort_by": "activity",
        "sort_direction": "desc",
    }
    assert next_page["filters"] == {
        "status": None,
        "execution_backend": None,
        "task_view": "active",
        "sort_by": "activity",
        "sort_direction": "desc",
    }


def test_task_queue_supports_created_at_sorting(monkeypatch, tmp_path):
    persistence = PersistenceManager(sqlite_path=tmp_path / "task_queue_sort.sqlite3")
    records = [
        ("task_latest_created", "completed", "local", "2026-04-21T10:03:00", "2026-04-21T10:05:00"),
        ("task_oldest_created", "completed", "local", "2026-04-21T10:01:00", "2026-04-21T10:07:00"),
        ("task_middle_created", "completed", "local", "2026-04-21T10:02:00", "2026-04-21T10:06:00"),
    ]
    for task_id, status, backend, created_at, updated_at in records:
        persistence.put_record(
            "infra_task",
            task_id,
            payload={
                "id": task_id,
                "name": "quant_strategy_optimizer",
                "status": status,
                "progress": 1.0,
                "execution_backend": backend,
            },
            record_id=f"infra_task:{task_id}",
        )
        with persistence._connect_sqlite() as connection:
            connection.execute(
                "UPDATE infra_records SET created_at = ?, updated_at = ? WHERE id = ?",
                (created_at, updated_at, f"infra_task:{task_id}"),
            )
            connection.commit()

    monkeypatch.setattr(task_queue_module, "persistence_manager", persistence)
    manager = TaskQueueManager()

    sorted_page = manager.list_tasks_page(limit=10, sort_by="created_at", sort_direction="asc")

    assert [task["id"] for task in sorted_page["tasks"]] == [
        "task_oldest_created",
        "task_middle_created",
        "task_latest_created",
    ]
    assert sorted_page["filters"] == {
        "status": None,
        "execution_backend": None,
        "task_view": "all",
        "sort_by": "created_at",
        "sort_direction": "asc",
    }

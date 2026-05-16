"""Unit tests for Phase C Celery beat wiring.

Covers:
- Each ``refresh_<provider>`` callable imports cleanly.
- ``register_alt_data_tasks`` registers all 5 tasks and a 5-entry beat
  schedule on a stub Celery app.
- ``AltDataScheduler.start()`` defers to Celery beat when
  ``ALT_DATA_USE_CELERY_BEAT=1`` or ``CELERY_BROKER_URL`` is set.
- ``AltDataScheduler.start()`` still registers APScheduler jobs in local-dev
  mode (no env, no broker), preserving the pre-Phase-C behaviour.
- The beat schedule emitted by ``build_beat_schedule`` is a 5-element
  ``timedelta``-keyed map matching ``DEFAULT_INTERVALS_MINUTES``.

We do **not** start Celery beat or a worker process; everything is import +
introspection against an in-memory Celery app and a stub app.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any, Callable, Dict

import pytest

from backend.app.core import alt_data_tasks
from src.data.alternative import governance


# ---------------------------------------------------------------------------
# Stub Celery app
# ---------------------------------------------------------------------------


class _StubConf(dict):
    """``celery_app.conf`` accepts both attribute and item access."""

    def __getattr__(self, key: str) -> Any:  # noqa: D401 - dict adapter
        try:
            return self[key]
        except KeyError as exc:
            raise AttributeError(key) from exc

    def __setattr__(self, key: str, value: Any) -> None:  # noqa: D401
        self[key] = value


class _StubCeleryApp:
    """Minimal stand-in for a Celery app: enough surface for our registration."""

    def __init__(self, name: str = "stub") -> None:
        self.main = name
        self.conf = _StubConf()
        self.registered_tasks: Dict[str, Callable[..., Any]] = {}
        self.task_kwargs: Dict[str, Dict[str, Any]] = {}

    def task(self, *args: Any, **kwargs: Any) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        # Match the real Celery API: ``@app.task(name=...)`` returns a decorator.
        def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
            name = kwargs.get("name") or fn.__name__
            self.registered_tasks[name] = fn
            self.task_kwargs[name] = dict(kwargs)
            return fn

        return decorator


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_provider_intervals_match_governance_defaults() -> None:
    """The Celery task module mirrors AltDataScheduler intervals exactly."""

    assert (
        alt_data_tasks.ALT_DATA_PROVIDER_INTERVALS_MINUTES
        == governance.AltDataScheduler.DEFAULT_INTERVALS_MINUTES
    )


def test_refresh_callables_exist_for_all_five_providers() -> None:
    """Every provider has a top-level refresh callable importable by name."""

    expected = {
        "policy_radar": alt_data_tasks.refresh_policy_radar,
        "supply_chain": alt_data_tasks.refresh_supply_chain,
        "macro_hf": alt_data_tasks.refresh_macro_hf,
        "people_layer": alt_data_tasks.refresh_people_layer,
        "policy_execution": alt_data_tasks.refresh_policy_execution,
    }
    assert alt_data_tasks.ALT_DATA_REFRESH_CALLABLES == expected
    for fn in expected.values():
        assert callable(fn)


def test_task_names_are_namespaced() -> None:
    """Task names live under ``alt_data.refresh.*`` to avoid collisions."""

    for provider, task_name in alt_data_tasks.ALT_DATA_TASK_NAMES.items():
        assert task_name == f"alt_data.refresh.{provider}"


def test_build_beat_schedule_has_five_entries_with_correct_intervals() -> None:
    """``build_beat_schedule`` emits exactly the 5 expected entries."""

    schedule = alt_data_tasks.build_beat_schedule()
    assert set(schedule.keys()) == {
        "alt-data-refresh-policy_radar",
        "alt-data-refresh-supply_chain",
        "alt-data-refresh-macro_hf",
        "alt-data-refresh-people_layer",
        "alt-data-refresh-policy_execution",
    }
    expected_intervals = {
        "alt-data-refresh-policy_radar": 60,
        "alt-data-refresh-supply_chain": 360,
        "alt-data-refresh-macro_hf": 180,
        "alt-data-refresh-people_layer": 360,
        "alt-data-refresh-policy_execution": 120,
    }
    for entry_name, minutes in expected_intervals.items():
        entry = schedule[entry_name]
        assert entry["task"].startswith("alt_data.refresh.")
        assert isinstance(entry["schedule"], timedelta)
        assert entry["schedule"] == timedelta(minutes=minutes)


def test_register_alt_data_tasks_returns_five_tasks_on_stub_app() -> None:
    """Registering against a stub app installs 5 tasks + beat entries."""

    app = _StubCeleryApp()
    tasks, beat_schedule = alt_data_tasks.register_alt_data_tasks(app)

    assert set(tasks.keys()) == set(alt_data_tasks.ALT_DATA_PROVIDER_INTERVALS_MINUTES.keys())
    for provider, task_name in alt_data_tasks.ALT_DATA_TASK_NAMES.items():
        assert task_name in app.registered_tasks
        # Each task should be the corresponding refresh callable.
        assert app.registered_tasks[task_name] is alt_data_tasks.ALT_DATA_REFRESH_CALLABLES[provider]
        # Soft / hard timeouts must be set so a stuck refresh doesn't wedge beat.
        kwargs = app.task_kwargs[task_name]
        assert kwargs["soft_time_limit"] == alt_data_tasks.ALT_DATA_TASK_SOFT_TIME_LIMIT_SECONDS
        assert kwargs["time_limit"] == alt_data_tasks.ALT_DATA_TASK_TIME_LIMIT_SECONDS
        assert kwargs["acks_late"] is True

    assert len(beat_schedule) == 5
    assert app.conf["beat_schedule"] == beat_schedule
    # Worker prefetch should be clamped to prevent overlapping runs.
    assert app.conf["worker_prefetch_multiplier"] == 1


def test_register_alt_data_tasks_noops_on_none_app() -> None:
    """Passing ``None`` (local-dev) is a safe no-op."""

    tasks, beat_schedule = alt_data_tasks.register_alt_data_tasks(None)
    assert tasks == {}
    assert beat_schedule == {}


# ---------------------------------------------------------------------------
# Scheduler delegation behavior
# ---------------------------------------------------------------------------


class _ManagerStub:
    """Minimal AltDataManager stand-in for AltDataScheduler tests."""

    def __init__(self) -> None:
        self.refresh_calls: list[str] = []

    def refresh_provider(self, name: str, force: bool = False) -> Dict[str, Any]:  # noqa: ARG002
        self.refresh_calls.append(name)
        return {"provider": name}

    def build_dashboard_snapshot(self) -> Dict[str, Any]:
        return {"snapshot_timestamp": "stub"}

    @property
    def snapshot_store(self) -> Any:
        class _Store:
            def save_dashboard_snapshot(self, _payload: Dict[str, Any]) -> None:
                return None

        return _Store()


def _scheduler() -> governance.AltDataScheduler:
    return governance.AltDataScheduler(_ManagerStub())


def test_scheduler_delegates_to_celery_beat_when_env_var_set(monkeypatch: pytest.MonkeyPatch) -> None:
    """ALT_DATA_USE_CELERY_BEAT=1 disables the in-process APScheduler."""

    monkeypatch.setenv("ALT_DATA_USE_CELERY_BEAT", "1")
    monkeypatch.delenv("CELERY_BROKER_URL", raising=False)

    scheduler = _scheduler()
    scheduler.start()

    status = scheduler.get_status()
    assert status["delegated_to_celery_beat"] is True
    assert status["running"] is False
    # No APScheduler jobs should be registered.
    if scheduler._scheduler is not None:  # type: ignore[attr-defined]
        assert scheduler._scheduler.get_jobs() == []  # type: ignore[attr-defined]


def test_scheduler_delegates_to_celery_beat_when_broker_url_set(monkeypatch: pytest.MonkeyPatch) -> None:
    """A configured broker is enough to trigger delegation (no explicit opt-in)."""

    monkeypatch.delenv("ALT_DATA_USE_CELERY_BEAT", raising=False)
    monkeypatch.setenv("CELERY_BROKER_URL", "redis://localhost:6379/0")

    scheduler = _scheduler()
    scheduler.start()

    assert scheduler.get_status()["delegated_to_celery_beat"] is True


def test_scheduler_runs_in_process_when_env_explicitly_off(monkeypatch: pytest.MonkeyPatch) -> None:
    """ALT_DATA_USE_CELERY_BEAT=0 forces the legacy in-process path even with a broker."""

    monkeypatch.setenv("ALT_DATA_USE_CELERY_BEAT", "0")
    monkeypatch.setenv("CELERY_BROKER_URL", "redis://localhost:6379/0")

    scheduler = _scheduler()
    try:
        scheduler.start()
        status = scheduler.get_status()
        assert status["delegated_to_celery_beat"] is False
        if scheduler._available:  # type: ignore[attr-defined]
            assert status["running"] is True
            assert len(status["jobs"]) == 5
    finally:
        scheduler.stop()


def test_scheduler_runs_in_process_when_no_env_and_no_broker(monkeypatch: pytest.MonkeyPatch) -> None:
    """Local-dev (no broker, no env) preserves the existing APScheduler path."""

    monkeypatch.delenv("ALT_DATA_USE_CELERY_BEAT", raising=False)
    monkeypatch.delenv("CELERY_BROKER_URL", raising=False)

    scheduler = _scheduler()
    try:
        scheduler.start()
        status = scheduler.get_status()
        assert status["delegated_to_celery_beat"] is False
        if scheduler._available:  # type: ignore[attr-defined]
            assert status["running"] is True
            # All 5 provider jobs registered.
            job_ids = sorted(job["id"] for job in status["jobs"])
            assert job_ids == sorted(
                f"alt-data-{provider}"
                for provider in governance.AltDataScheduler.DEFAULT_INTERVALS_MINUTES
            )
    finally:
        scheduler.stop()


# ---------------------------------------------------------------------------
# Real Celery app registration (smoke)
# ---------------------------------------------------------------------------


def test_register_alt_data_tasks_against_real_celery_app() -> None:
    """If Celery is installed, registering against a real app works end-to-end."""

    pytest.importorskip("celery")
    from celery import Celery

    # Use the eager backend so we never touch a broker even if a real one
    # exists in the environment.
    app = Celery("test_alt_data_beat", broker="memory://", backend="cache+memory://")
    tasks, beat_schedule = alt_data_tasks.register_alt_data_tasks(app)

    assert set(tasks.keys()) == set(alt_data_tasks.ALT_DATA_PROVIDER_INTERVALS_MINUTES.keys())
    for task_name in alt_data_tasks.ALT_DATA_TASK_NAMES.values():
        # Real Celery exposes registered tasks via ``app.tasks``.
        assert task_name in app.tasks
    # ``conf.beat_schedule`` should be set to a superset of our schedule.
    merged = dict(app.conf.beat_schedule or {})
    for entry_name in beat_schedule:
        assert entry_name in merged

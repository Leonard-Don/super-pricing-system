"""Unit tests for Phase C Celery beat wiring.

Covers:
- Each ``refresh_<provider>`` callable imports cleanly.
- ``register_alt_data_tasks`` registers provider tasks and a matching beat
  schedule on a stub Celery app.
- ``AltDataScheduler.start()`` defers to Celery beat when
  ``ALT_DATA_USE_CELERY_BEAT=1`` or ``CELERY_BROKER_URL`` is set.
- ``AltDataScheduler.start()`` still registers APScheduler jobs in local-dev
  mode (no env, no broker), preserving the pre-Phase-C behaviour.
- The beat schedule emitted by ``build_beat_schedule`` is a provider refresh
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


def test_refresh_callables_exist_for_all_providers() -> None:
    """Every provider has a top-level refresh callable importable by name.

    Current pipeline: 8 providers (5 original + fund_holdings + northbound + block_trades).
    """

    expected = {
        "policy_radar": alt_data_tasks.refresh_policy_radar,
        "supply_chain": alt_data_tasks.refresh_supply_chain,
        "macro_hf": alt_data_tasks.refresh_macro_hf,
        "people_layer": alt_data_tasks.refresh_people_layer,
        "policy_execution": alt_data_tasks.refresh_policy_execution,
        "fund_holdings": alt_data_tasks.refresh_fund_holdings,
        "northbound": alt_data_tasks.refresh_northbound,
        "block_trades": alt_data_tasks.refresh_block_trades,
    }
    assert alt_data_tasks.ALT_DATA_REFRESH_CALLABLES == expected
    for fn in expected.values():
        assert callable(fn)


def test_task_names_are_namespaced() -> None:
    """Task names live under ``alt_data.refresh.*`` to avoid collisions."""

    for provider, task_name in alt_data_tasks.ALT_DATA_TASK_NAMES.items():
        assert task_name == f"alt_data.refresh.{provider}"


def test_build_beat_schedule_has_expected_entries_with_correct_intervals() -> None:
    """``build_beat_schedule`` emits the provider refresh entries + the public-summary export.

    Current pipeline: 8 provider entries plus the F1 public-summary export task.
    """

    schedule = alt_data_tasks.build_beat_schedule()
    assert set(schedule.keys()) == {
        "alt-data-refresh-policy_radar",
        "alt-data-refresh-supply_chain",
        "alt-data-refresh-macro_hf",
        "alt-data-refresh-people_layer",
        "alt-data-refresh-policy_execution",
        "alt-data-refresh-fund_holdings",
        "alt-data-refresh-northbound",
        "alt-data-refresh-block_trades",
        "alt-data-export-public-summary",
    }
    expected_intervals = {
        "alt-data-refresh-policy_radar": 60,
        "alt-data-refresh-supply_chain": 360,
        "alt-data-refresh-macro_hf": 180,
        "alt-data-refresh-people_layer": 360,
        "alt-data-refresh-policy_execution": 120,
        # Phase F2: weekly (10080 min) — quarterly disclosure cadence makes
        # anything faster than weekly pure noise.
        "alt-data-refresh-fund_holdings": 60 * 24 * 7,
        # Phase F3: twice daily (720 min = 12 h) — HSGT publishes T+1
        # morning so 12 h cadence keeps macro engine current.
        "alt-data-refresh-northbound": 60 * 12,
        "alt-data-refresh-block_trades": 60 * 12,
    }
    for entry_name, minutes in expected_intervals.items():
        entry = schedule[entry_name]
        assert entry["task"].startswith("alt_data.refresh.")
        assert isinstance(entry["schedule"], timedelta)
        assert entry["schedule"] == timedelta(minutes=minutes)

    # Phase F1 public-summary export: 30-minute cadence, namespaced task name.
    export_entry = schedule["alt-data-export-public-summary"]
    assert export_entry["task"] == alt_data_tasks.EXPORT_PUBLIC_SUMMARY_TASK_NAME
    assert export_entry["task"] == "alt_data.export_public_summary"
    assert isinstance(export_entry["schedule"], timedelta)
    assert export_entry["schedule"] == timedelta(
        minutes=alt_data_tasks.EXPORT_PUBLIC_SUMMARY_INTERVAL_MINUTES
    )
    assert alt_data_tasks.EXPORT_PUBLIC_SUMMARY_INTERVAL_MINUTES == 30


def test_register_alt_data_tasks_returns_all_tasks_on_stub_app() -> None:
    """Registering against a stub app installs all alt-data tasks + beat entries.

    Current pipeline: 8 refresh callables + 1 export_public_summary callable
    + 9 beat-schedule entries.
    """

    app = _StubCeleryApp()
    tasks, beat_schedule = alt_data_tasks.register_alt_data_tasks(app)

    expected_provider_keys = set(
        alt_data_tasks.ALT_DATA_PROVIDER_INTERVALS_MINUTES.keys()
    )
    assert expected_provider_keys.issubset(tasks.keys())
    for provider, task_name in alt_data_tasks.ALT_DATA_TASK_NAMES.items():
        assert task_name in app.registered_tasks
        # Each task should be the corresponding refresh callable.
        assert app.registered_tasks[task_name] is alt_data_tasks.ALT_DATA_REFRESH_CALLABLES[provider]
        # Soft / hard timeouts must be set so a stuck refresh doesn't wedge beat.
        kwargs = app.task_kwargs[task_name]
        assert kwargs["soft_time_limit"] == alt_data_tasks.ALT_DATA_TASK_SOFT_TIME_LIMIT_SECONDS
        assert kwargs["time_limit"] == alt_data_tasks.ALT_DATA_TASK_TIME_LIMIT_SECONDS
        assert kwargs["acks_late"] is True

    # Phase F1 export task is registered with a tight timeout (pure I/O on
    # cached JSON, no network).
    export_task_name = alt_data_tasks.EXPORT_PUBLIC_SUMMARY_TASK_NAME
    assert export_task_name in app.registered_tasks
    assert app.registered_tasks[export_task_name] is alt_data_tasks.export_public_summary
    export_kwargs = app.task_kwargs[export_task_name]
    assert export_kwargs["soft_time_limit"] == 45
    assert export_kwargs["time_limit"] == 60
    assert export_kwargs["acks_late"] is True

    assert len(beat_schedule) == 9  # 8 provider refresh + 1 public summary export
    assert "alt-data-export-public-summary" in beat_schedule
    assert "alt-data-refresh-fund_holdings" in beat_schedule
    assert "alt-data-refresh-northbound" in beat_schedule
    assert "alt-data-refresh-block_trades" in beat_schedule
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
            assert len(status["jobs"]) == len(governance.AltDataScheduler.DEFAULT_INTERVALS_MINUTES)
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
            # All provider jobs registered.
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

    # Current pipeline: provider refresh tasks + 1 export_public_summary task.
    assert set(tasks.keys()) == set(alt_data_tasks.ALT_DATA_PROVIDER_INTERVALS_MINUTES.keys()) | {
        "export_public_summary"
    }
    for task_name in alt_data_tasks.ALT_DATA_TASK_NAMES.values():
        # Real Celery exposes registered tasks via ``app.tasks``.
        assert task_name in app.tasks
    assert alt_data_tasks.EXPORT_PUBLIC_SUMMARY_TASK_NAME in app.tasks
    # ``conf.beat_schedule`` should be set to a superset of our schedule.
    merged = dict(app.conf.beat_schedule or {})
    for entry_name in beat_schedule:
        assert entry_name in merged


# ---------------------------------------------------------------------------
# Public summary export task (Phase F1)
# ---------------------------------------------------------------------------


def test_export_public_summary_task_invokes_script_helper(monkeypatch: pytest.MonkeyPatch) -> None:
    """The Celery task body delegates to ``scripts/export_public_summary``.

    We monkeypatch ``importlib.util.spec_from_file_location`` to feed in a
    stub module so the test doesn't touch the real on-disk cache.
    """

    import importlib.util
    import types as _types

    captured: Dict[str, Any] = {}

    stub_module = _types.ModuleType("_stub_export_summary")

    def _stub_export() -> Dict[str, Any]:
        captured["called"] = True
        return {
            "schema_version": 1,
            "generated_at": "2026-05-17T00:00:00+00:00",
            "providers": {"policy_radar": {}, "macro_hf": {}},
        }

    stub_module.export_public_summary = _stub_export  # type: ignore[attr-defined]
    from pathlib import Path as _Path

    stub_module.DEFAULT_OUTPUT_PATH = _Path("/tmp/fake/data/public/alt_data_summary.json")  # type: ignore[attr-defined]

    real_spec_from_file_location = importlib.util.spec_from_file_location

    class _StubSpec:
        loader = _types.SimpleNamespace(exec_module=lambda module: None)

    def _stub_spec(name: str, _location: Any) -> Any:
        return _StubSpec()

    def _stub_module_from_spec(_spec: Any) -> Any:
        return stub_module

    monkeypatch.setattr(importlib.util, "spec_from_file_location", _stub_spec)
    monkeypatch.setattr(importlib.util, "module_from_spec", _stub_module_from_spec)
    try:
        result = alt_data_tasks.export_public_summary()
    finally:
        # Defensive: restore even on failure (monkeypatch undoes too but
        # keep this explicit for readers).
        importlib.util.spec_from_file_location = real_spec_from_file_location  # type: ignore[assignment]

    assert captured.get("called") is True
    assert result["status"] == "success"
    assert result["schema_version"] == 1
    assert result["provider_count"] == 2
    assert result["generated_at"] == "2026-05-17T00:00:00+00:00"
    assert "alt_data_summary.json" in result["output_path"]

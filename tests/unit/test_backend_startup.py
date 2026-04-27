import asyncio
import inspect

from backend import main as backend_main


async def _noop():
    return None


def _build_task_recorder(recorded_names):
    def _record_task(coroutine, *, name):
        recorded_names.append(name)
        if inspect.iscoroutine(coroutine):
            coroutine.close()
        return asyncio.create_task(_noop(), name=name)

    return _record_task


def test_should_run_noncritical_startup_tasks_defaults_to_enabled(monkeypatch):
    monkeypatch.delenv("DISABLE_NONCRITICAL_STARTUP_TASKS", raising=False)

    assert backend_main.should_run_noncritical_startup_tasks() is True


def test_should_run_noncritical_startup_tasks_honors_disable_flag(monkeypatch):
    monkeypatch.setenv("DISABLE_NONCRITICAL_STARTUP_TASKS", "true")

    assert backend_main.should_run_noncritical_startup_tasks() is False


def test_lifespan_skips_noncritical_startup_tasks_when_disabled(monkeypatch):
    scheduled = []

    monkeypatch.setenv("DISABLE_NONCRITICAL_STARTUP_TASKS", "true")
    monkeypatch.setattr(backend_main, "start_background_task", _build_task_recorder(scheduled))
    monkeypatch.setattr(backend_main.realtime_manager, "start_real_time_updates", _noop)
    monkeypatch.setattr(backend_main.realtime_manager, "stop_real_time_updates", lambda: None)
    monkeypatch.setattr(backend_main, "stop_alt_data_scheduler", lambda: None)

    async def _run():
        async with backend_main.lifespan(backend_main.app):
            pass

    asyncio.run(_run())

    assert scheduled == ["realtime-manager"]


def test_lifespan_schedules_noncritical_startup_tasks_when_enabled(monkeypatch):
    scheduled = []

    monkeypatch.delenv("DISABLE_NONCRITICAL_STARTUP_TASKS", raising=False)
    monkeypatch.setattr(backend_main, "start_background_task", _build_task_recorder(scheduled))
    monkeypatch.setattr(backend_main.realtime_manager, "start_real_time_updates", _noop)
    monkeypatch.setattr(backend_main.realtime_manager, "stop_real_time_updates", lambda: None)
    monkeypatch.setattr(backend_main, "stop_alt_data_scheduler", lambda: None)

    async def _run():
        async with backend_main.lifespan(backend_main.app):
            pass

    asyncio.run(_run())

    assert scheduled == [
        "realtime-manager",
        "alt-data-startup",
        "cache-warmup",
    ]

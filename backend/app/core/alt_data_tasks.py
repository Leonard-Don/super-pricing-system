"""Celery task definitions and beat schedule for alt-data refresh.

This module registers periodic refresh tasks on the Celery app exposed by
``backend.app.core.task_queue.celery_app``. Five tasks (one per provider) are
registered at the same intervals previously enforced by the in-process
APScheduler in ``src.data.alternative.governance.AltDataScheduler``.

Both refresh paths must coexist:

- **Local-dev (no broker)** -- ``celery_app`` is ``None`` because
  ``CELERY_BROKER_URL`` is not configured. This module's import has no side
  effects on the Celery app, and ``AltDataScheduler`` continues to drive
  refresh in-process via APScheduler.
- **Full stack (Celery beat)** -- when a broker is configured AND
  ``ALT_DATA_USE_CELERY_BEAT=1`` (or the broker env is set, see
  ``governance.py``), beat runs these tasks on a schedule and the in-process
  APScheduler stays disabled to avoid double-refresh.

The provider list and intervals mirror ``AltDataScheduler.DEFAULT_INTERVALS_MINUTES``
so the two paths stay in sync.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any, Callable, Dict, Tuple

from backend.app.core.task_queue import task_queue_manager

logger = logging.getLogger(__name__)


# Provider -> refresh interval in minutes. Mirrors
# ``AltDataScheduler.DEFAULT_INTERVALS_MINUTES``. Kept here so the Celery
# import path does not require the APScheduler module at registration time.
ALT_DATA_PROVIDER_INTERVALS_MINUTES: Dict[str, int] = {
    "policy_radar": 60,
    "supply_chain": 360,
    "macro_hf": 180,
    "people_layer": 360,
    "policy_execution": 120,
}

# Celery task names. Namespaced under ``alt_data.refresh.*`` so they don't
# clash with the existing ``quant.infrastructure.execute_task`` registration.
ALT_DATA_TASK_NAMES: Dict[str, str] = {
    provider: f"alt_data.refresh.{provider}"
    for provider in ALT_DATA_PROVIDER_INTERVALS_MINUTES
}

# Per-task soft/hard timeout in seconds. Refresh has historically completed in
# well under a minute per provider, but the policy_radar NLP path may stall on
# RSS / HTML fetches -- 5 minutes gives generous head-room while preventing a
# stuck job from wedging beat.
ALT_DATA_TASK_SOFT_TIME_LIMIT_SECONDS = 240
ALT_DATA_TASK_TIME_LIMIT_SECONDS = 300


def _refresh_one_provider(provider: str) -> Dict[str, Any]:
    """Refresh a single alt-data provider and rebuild the dashboard snapshot.

    Mirrors the side effects of
    ``AltDataScheduler._refresh_job`` so the two refresh paths produce
    identical on-disk state. Imports the runtime lazily to keep this module
    importable on machines that don't have the heavier alt-data dependency
    chain loaded yet.
    """

    from src.data.alternative.runtime import get_alt_data_manager

    manager = get_alt_data_manager()
    signal = manager.refresh_provider(provider, force=True)
    dashboard_snapshot = manager.build_dashboard_snapshot()
    manager.snapshot_store.save_dashboard_snapshot(dashboard_snapshot)
    return {
        "provider": provider,
        "status": (signal or {}).get("error") and "error" or "success",
        "signal_strength": float((signal or {}).get("strength", 0.0) or 0.0),
        "confidence": float((signal or {}).get("confidence", 0.0) or 0.0),
        "record_count": int((signal or {}).get("record_count", 0) or 0),
        "snapshot_timestamp": dashboard_snapshot.get("snapshot_timestamp"),
    }


# ---------------------------------------------------------------------------
# Public callables (importable even when Celery is disabled).
#
# Each ``refresh_<provider>`` callable is the *body* of the corresponding Celery
# task. Registering them as plain functions first lets unit tests assert
# importability without bringing up a broker, and lets the local-dev path call
# them directly if it wants to.
# ---------------------------------------------------------------------------


def refresh_policy_radar() -> Dict[str, Any]:
    """Refresh the policy_radar provider snapshot."""

    return _refresh_one_provider("policy_radar")


def refresh_supply_chain() -> Dict[str, Any]:
    """Refresh the supply_chain provider snapshot."""

    return _refresh_one_provider("supply_chain")


def refresh_macro_hf() -> Dict[str, Any]:
    """Refresh the macro_hf provider snapshot."""

    return _refresh_one_provider("macro_hf")


def refresh_people_layer() -> Dict[str, Any]:
    """Refresh the people_layer provider snapshot."""

    return _refresh_one_provider("people_layer")


def refresh_policy_execution() -> Dict[str, Any]:
    """Refresh the policy_execution provider snapshot."""

    return _refresh_one_provider("policy_execution")


ALT_DATA_REFRESH_CALLABLES: Dict[str, Callable[[], Dict[str, Any]]] = {
    "policy_radar": refresh_policy_radar,
    "supply_chain": refresh_supply_chain,
    "macro_hf": refresh_macro_hf,
    "people_layer": refresh_people_layer,
    "policy_execution": refresh_policy_execution,
}


def build_beat_schedule() -> Dict[str, Dict[str, Any]]:
    """Build the Celery beat schedule entry-dict for the 5 alt-data tasks.

    The shape matches Celery's ``beat_schedule`` config (one entry per
    scheduled task, with ``task`` + ``schedule`` keys).
    """

    return {
        f"alt-data-refresh-{provider}": {
            "task": ALT_DATA_TASK_NAMES[provider],
            "schedule": timedelta(minutes=minutes),
            # ``relative=True`` is the safer default for beat at startup: it
            # waits one interval before the first fire instead of trying to
            # back-fill from an arbitrary epoch. The initial refresh on
            # backend boot is already covered by the ``delayed_background_start``
            # call in ``backend/main.py``.
            "options": {
                "expires": int(timedelta(minutes=minutes).total_seconds()),
            },
        }
        for provider, minutes in ALT_DATA_PROVIDER_INTERVALS_MINUTES.items()
    }


def register_alt_data_tasks(celery_app: Any) -> Tuple[Dict[str, Any], Dict[str, Dict[str, Any]]]:
    """Register the 5 alt-data tasks + beat schedule on the given Celery app.

    Returns ``(tasks, beat_schedule)`` -- ``tasks`` keyed by provider name
    holds the Celery task object, ``beat_schedule`` is the dict that was
    merged into ``celery_app.conf.beat_schedule``.

    Safe to call more than once: Celery's ``app.task`` decorator with an
    explicit ``name=`` will replace the existing registration.
    """

    if celery_app is None:
        return {}, {}

    registered: Dict[str, Any] = {}
    for provider, callable_fn in ALT_DATA_REFRESH_CALLABLES.items():
        task_name = ALT_DATA_TASK_NAMES[provider]
        registered[provider] = celery_app.task(
            name=task_name,
            bind=False,
            acks_late=True,
            ignore_result=False,
            soft_time_limit=ALT_DATA_TASK_SOFT_TIME_LIMIT_SECONDS,
            time_limit=ALT_DATA_TASK_TIME_LIMIT_SECONDS,
        )(callable_fn)

    beat_schedule = build_beat_schedule()
    existing_schedule: Dict[str, Dict[str, Any]] = dict(
        celery_app.conf.get("beat_schedule") or {}
    )
    existing_schedule.update(beat_schedule)
    celery_app.conf.beat_schedule = existing_schedule
    # Beat singleton-style protection: ``task_default_rate_limit`` and
    # ``worker_prefetch_multiplier`` are conservative defaults so a slow
    # provider refresh doesn't queue overlapping runs.
    celery_app.conf.setdefault("worker_prefetch_multiplier", 1)
    return registered, beat_schedule


# Eagerly register on import if the Celery app is configured. This is what
# allows the Celery worker / beat processes to find the tasks via the
# standard ``-A backend.app.core.task_queue:celery_app`` discovery path --
# the ``backend.app.core`` package is imported during Celery's app
# bootstrap and importing ``task_queue`` triggers our app construction.
_celery_app = task_queue_manager.celery_app
_registered_tasks, _registered_beat_schedule = register_alt_data_tasks(_celery_app)
if _celery_app is not None and _registered_tasks:
    logger.info(
        "Registered %d alt-data Celery tasks on app %s with beat schedule entries: %s",
        len(_registered_tasks),
        getattr(_celery_app, "main", "celery"),
        sorted(_registered_beat_schedule.keys()),
    )


def alt_data_celery_tasks() -> Dict[str, Any]:
    """Return the currently-registered alt-data Celery task objects."""

    return dict(_registered_tasks)


def alt_data_beat_schedule() -> Dict[str, Dict[str, Any]]:
    """Return the alt-data portion of the Celery beat schedule."""

    return dict(_registered_beat_schedule)


__all__ = [
    "ALT_DATA_PROVIDER_INTERVALS_MINUTES",
    "ALT_DATA_TASK_NAMES",
    "ALT_DATA_TASK_SOFT_TIME_LIMIT_SECONDS",
    "ALT_DATA_TASK_TIME_LIMIT_SECONDS",
    "ALT_DATA_REFRESH_CALLABLES",
    "refresh_policy_radar",
    "refresh_supply_chain",
    "refresh_macro_hf",
    "refresh_people_layer",
    "refresh_policy_execution",
    "build_beat_schedule",
    "register_alt_data_tasks",
    "alt_data_celery_tasks",
    "alt_data_beat_schedule",
]

"""Periodic auto-fire scheduler for proactive mispricing alerts (PR-2).

Mirrors the AltDataScheduler / governance.py pattern: BackgroundScheduler +
IntervalTrigger, module-level singleton, start_/stop_ functions wired into
main.py lifespan.

The JOB (run every MISPRICING_ALERT_INTERVAL_MINUTES, default 15):
  for each enabled profile:
    rule     = store.get_rule(profile)
    readings = build_readings(profile)
    fires    = evaluate_mispricing_alerts(rule, readings, last_fired, now_utc)
    for fire in fires:
        for channel in rule["channels"]:
            notification_service.send(channel, {fire + context})
        store.record_fire(fire, now_iso, profile)

Per-profile errors are caught so one bad profile never kills the job.
APScheduler unavailability (ImportError) is handled gracefully like governance.py.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

try:
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.interval import IntervalTrigger
except ImportError:  # pragma: no cover — graceful fallback when APScheduler absent
    BackgroundScheduler = None  # type: ignore[assignment,misc]
    IntervalTrigger = None  # type: ignore[assignment,misc]

_DEFAULT_INTERVAL_MINUTES = 15
_ENV_INTERVAL_KEY = "MISPRICING_ALERT_INTERVAL_MINUTES"


def _interval_minutes() -> int:
    raw = os.environ.get(_ENV_INTERVAL_KEY, "")
    try:
        val = int(raw)
        return max(1, val)
    except (ValueError, TypeError):
        return _DEFAULT_INTERVAL_MINUTES


class MispricingAlertScheduler:
    """Background scheduler that periodically evaluates and fires mispricing alerts."""

    def __init__(self) -> None:
        self._available: bool = BackgroundScheduler is not None and IntervalTrigger is not None
        self._scheduler: Optional[Any] = BackgroundScheduler() if self._available else None
        self._job_registered: bool = False
        self._started_at: Optional[str] = None
        self._stopped_at: Optional[str] = None
        self._last_error: Optional[str] = None

    # ------------------------------------------------------------------
    # Public lifecycle
    # ------------------------------------------------------------------

    def start(self) -> None:
        if not self._available:
            self._last_error = "APScheduler not installed"
            logger.warning("MispricingAlertScheduler unavailable: %s", self._last_error)
            return
        if self._scheduler.running:
            return
        if not self._job_registered:
            minutes = _interval_minutes()
            self._scheduler.add_job(
                _run_alert_job,
                IntervalTrigger(minutes=minutes),
                id="mispricing-alert-scan",
                replace_existing=True,
            )
            self._job_registered = True
            logger.info(
                "MispricingAlertScheduler registered job (interval=%d min)", minutes
            )
        self._scheduler.start()
        self._started_at = datetime.utcnow().isoformat()
        self._stopped_at = None
        logger.info("MispricingAlertScheduler started.")

    def stop(self) -> None:
        if self._scheduler and self._scheduler.running:
            self._scheduler.shutdown(wait=False)
        self._stopped_at = datetime.utcnow().isoformat()
        logger.info("MispricingAlertScheduler stopped.")

    def get_status(self) -> Dict[str, Any]:
        jobs: List[Dict[str, Any]] = []
        if self._scheduler and self._scheduler.running:
            for job in self._scheduler.get_jobs():
                jobs.append({
                    "id": job.id,
                    "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None,
                })
        return {
            "available": self._available,
            "running": bool(self._scheduler and self._scheduler.running),
            "started_at": self._started_at,
            "stopped_at": self._stopped_at,
            "last_error": self._last_error,
            "interval_minutes": _interval_minutes(),
            "jobs": jobs,
        }


# ---------------------------------------------------------------------------
# The actual job function — a plain callable so tests can call it directly
# without a live APScheduler instance.
# ---------------------------------------------------------------------------

def _run_alert_job() -> None:
    """Evaluate all enabled profiles and send+record any fires.

    Imported lazily inside the function so the scheduler module itself can be
    imported at startup without triggering heavy service initialisation.
    """
    from backend.app.services.mispricing_alert_store import mispricing_alert_store as _store
    from backend.app.services.mispricing_alert_readings import build_readings
    from backend.app.services.mispricing_alert_evaluator import evaluate_mispricing_alerts
    from backend.app.services.notification_service import notification_service

    profiles = _store.list_enabled_rule_profiles()
    logger.debug("MispricingAlertScheduler: scanning %d enabled profile(s)", len(profiles))

    now = datetime.utcnow()
    now_iso = now.isoformat()

    for profile in profiles:
        try:
            rule = _store.get_rule(profile)

            # Double-check enabled (list_enabled_rule_profiles already filtered,
            # but rule could have been disabled between the scan and here).
            if not rule.get("enabled"):
                continue

            readings = build_readings(profile)
            if not readings:
                logger.debug("MispricingAlertScheduler: empty readings for profile %s", profile)
                continue

            last_fired = _store.get_last_fired(profile)
            fires = evaluate_mispricing_alerts(rule, readings, last_fired, now)

            channels: List[str] = rule.get("channels") or []

            for fire in fires:
                symbol = fire["symbol"]
                gap_pct = fire["gap_pct"]
                direction = fire["direction"]
                message = (
                    f"[Mispricing Alert] {symbol} is {direction} by {gap_pct:+.1f}% "
                    f"(confidence={fire['confidence']:.2%}, profile={profile})"
                )
                payload: Dict[str, Any] = {
                    **fire,
                    "profile": profile,
                    "message": message,
                    "title": f"Mispricing Alert: {symbol}",
                    "source": "mispricing_scheduler",
                    "severity": "warning",
                }
                for channel in channels:
                    try:
                        notification_service.send(channel, payload)
                    except Exception as send_exc:
                        logger.error(
                            "MispricingAlertScheduler: send failed channel=%s profile=%s symbol=%s: %s",
                            channel, profile, symbol, send_exc,
                        )
                _store.record_fire(fire, now_iso, profile)
                logger.info(
                    "MispricingAlertScheduler: fired %s %s %.1f%% profile=%s channels=%s",
                    direction, symbol, gap_pct, profile, channels,
                )

        except Exception as exc:
            # One bad profile must NOT kill the job — log and continue.
            logger.error(
                "MispricingAlertScheduler: error processing profile %s: %s",
                profile, exc, exc_info=True,
            )


# ---------------------------------------------------------------------------
# Module-level singleton + public start/stop helpers (wired in main.py)
# ---------------------------------------------------------------------------

_scheduler_instance: Optional[MispricingAlertScheduler] = None


def _get_scheduler() -> MispricingAlertScheduler:
    global _scheduler_instance
    if _scheduler_instance is None:
        _scheduler_instance = MispricingAlertScheduler()
    return _scheduler_instance


def start_mispricing_alert_scheduler() -> None:
    _get_scheduler().start()


def stop_mispricing_alert_scheduler() -> None:
    _get_scheduler().stop()

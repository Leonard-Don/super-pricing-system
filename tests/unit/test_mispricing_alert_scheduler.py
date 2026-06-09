"""Tests for the mispricing alert scheduler (PR-2).

Strategy: call the job function _run_alert_job() directly (no live APScheduler).
Monkeypatch the three seams it imports lazily:
  - mispricing_alert_store  (via the module attribute)
  - build_readings           (via the readings module)
  - notification_service     (via its module attribute)

Covers:
  - enabled profile fires → send per channel + record_fire
  - disabled profile skipped entirely
  - cooldown respected (evaluator returns empty fires)
  - one failing profile does NOT abort processing of subsequent profiles
  - list_enabled_rule_profiles returns only enabled profiles
  - MispricingAlertScheduler.get_status() without APScheduler
"""
from __future__ import annotations

import threading
from datetime import datetime
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock, call, patch

import pytest

from backend.app.services.mispricing_alert_scheduler import (
    MispricingAlertScheduler,
    _run_alert_job,
)
from backend.app.services.mispricing_alert_store import MispricingAlertStore


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _make_store(tmp_path) -> MispricingAlertStore:
    return MispricingAlertStore(storage_path=tmp_path / "alerts")


def _rule(enabled: bool = True, channels: Optional[List[str]] = None, cooldown_hours: float = 0.0) -> Dict[str, Any]:
    return {
        "enabled": enabled,
        "threshold_pct": 20.0,
        "direction": "both",
        "min_confidence": 0.3,
        "cooldown_hours": cooldown_hours,
        "channels": channels if channels is not None else ["email"],
    }


def _readings_for(symbols: List[str]) -> List[Dict[str, Any]]:
    """All symbols with a 60% overvaluation gap and sufficient confidence."""
    return [{"symbol": s, "gap_pct": 60.0, "confidence": 0.8} for s in symbols]


# ─────────────────────────────────────────────────────────────────────────────
# list_enabled_rule_profiles
# ─────────────────────────────────────────────────────────────────────────────

class TestListEnabledRuleProfiles:
    def test_empty_dir_returns_empty(self, tmp_path):
        store = _make_store(tmp_path)
        assert store.list_enabled_rule_profiles() == []

    def test_returns_only_enabled_profiles(self, tmp_path):
        store = _make_store(tmp_path)
        store.set_rule({**_rule(enabled=True)}, "alice")
        store.set_rule({**_rule(enabled=False)}, "bob")
        store.set_rule({**_rule(enabled=True)}, "carol")
        result = store.list_enabled_rule_profiles()
        assert sorted(result) == ["alice", "carol"]

    def test_all_disabled_returns_empty(self, tmp_path):
        store = _make_store(tmp_path)
        store.set_rule({**_rule(enabled=False)}, "zara")
        assert store.list_enabled_rule_profiles() == []

    def test_default_profile_included_when_enabled(self, tmp_path):
        store = _make_store(tmp_path)
        store.set_rule({**_rule(enabled=True)})  # profile_id=None → "default"
        assert "default" in store.list_enabled_rule_profiles()


# ─────────────────────────────────────────────────────────────────────────────
# _run_alert_job
# ─────────────────────────────────────────────────────────────────────────────

class _FakeNotificationService:
    def __init__(self):
        self.calls: List[tuple] = []

    def send(self, channel: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        self.calls.append((channel, payload))
        return {"status": "ok", "delivered": True}


def _patch_job(
    store: MispricingAlertStore,
    readings: List[Dict[str, Any]],
    notification_svc: Optional[_FakeNotificationService] = None,
):
    """Context-manager stack that patches all three lazy imports inside _run_alert_job."""
    if notification_svc is None:
        notification_svc = _FakeNotificationService()
    patches = [
        patch(
            "backend.app.services.mispricing_alert_scheduler.MispricingAlertStore",
            new=lambda *a, **kw: store,
        ),
        patch(
            "backend.app.services.mispricing_alert_scheduler._run_alert_job.__globals__",
            # We patch at import level inside the function — use sys.modules approach below.
        ),
    ]
    # The cleanest approach: patch the module-level names the function resolves at call time.
    return (
        patch("backend.app.services.mispricing_alert_store.mispricing_alert_store", store),
        patch(
            "backend.app.services.mispricing_alert_readings.build_readings",
            side_effect=lambda pid: readings,
        ),
        patch(
            "backend.app.services.notification_service.notification_service",
            notification_svc,
        ),
        notification_svc,
    )


def _run_job_patched(store, readings, notif=None):
    """Run _run_alert_job with store / readings / notification seams patched."""
    if notif is None:
        notif = _FakeNotificationService()
    with (
        patch(
            "backend.app.services.mispricing_alert_scheduler._run_alert_job.__globals__",
        ) if False else _noop_ctx(),
        patch(
            "backend.app.services.mispricing_alert_store.mispricing_alert_store",
            store,
        ),
        patch(
            "backend.app.services.mispricing_alert_readings.build_readings",
            side_effect=lambda pid: readings,
        ) as mock_readings,
        patch(
            "backend.app.services.notification_service.notification_service",
            notif,
        ),
    ):
        # The job imports lazily; redirect the module-level singletons it will find.
        import backend.app.services.mispricing_alert_store as _store_mod
        import backend.app.services.mispricing_alert_readings as _readings_mod
        import backend.app.services.notification_service as _notif_mod

        original_store = _store_mod.mispricing_alert_store
        original_notif = _notif_mod.notification_service
        _store_mod.mispricing_alert_store = store
        _notif_mod.notification_service = notif

        original_build = _readings_mod.build_readings

        def _fake_build(pid):
            return readings

        _readings_mod.build_readings = _fake_build

        try:
            _run_alert_job()
        finally:
            _store_mod.mispricing_alert_store = original_store
            _notif_mod.notification_service = original_notif
            _readings_mod.build_readings = original_build

    return notif


from contextlib import contextmanager


@contextmanager
def _noop_ctx():
    yield


class TestRunAlertJob:
    def test_enabled_profile_fires_send_per_channel_and_recorded(self, tmp_path):
        store = _make_store(tmp_path)
        store.set_rule({**_rule(enabled=True, channels=["email", "webhook"])}, "alice")
        readings = _readings_for(["AAPL"])
        notif = _run_job_patched(store, readings)

        # One fire × 2 channels = 2 send calls
        assert len(notif.calls) == 2
        channels_called = {c for c, _ in notif.calls}
        assert channels_called == {"email", "webhook"}

        # Payload carries the right symbol
        for channel, payload in notif.calls:
            assert payload["symbol"] == "AAPL"
            assert payload["profile"] == "alice"
            assert "message" in payload

        # Fire recorded in store
        history = store.get_history("alice")
        assert len(history) == 1
        assert history[0]["symbol"] == "AAPL"

    def test_disabled_profile_not_sent_or_recorded(self, tmp_path):
        store = _make_store(tmp_path)
        # Save as enabled first so the file exists, then disable
        store.set_rule({**_rule(enabled=True)}, "bob")
        store.set_rule({**_rule(enabled=False)}, "bob")
        readings = _readings_for(["TSLA"])
        notif = _run_job_patched(store, readings)

        assert notif.calls == []
        assert store.get_history("bob") == []

    def test_cooldown_respected_no_duplicate_send(self, tmp_path):
        store = _make_store(tmp_path)
        store.set_rule({**_rule(enabled=True, channels=["email"], cooldown_hours=24.0)}, "carol")
        # Simulate a recent fire that is still within the cooldown window.
        # Use a timestamp that is only 1 second in the past — well within 24h.
        recent_ts = datetime.utcnow().replace(microsecond=0).isoformat()
        store.record_fire({"symbol": "MSFT", "gap_pct": 60.0, "direction": "overvalued"}, recent_ts, "carol")

        readings = [{"symbol": "MSFT", "gap_pct": 60.0, "confidence": 0.9}]
        notif = _run_job_patched(store, readings)

        # Cooldown should suppress the re-fire
        assert notif.calls == []

    def test_failing_profile_does_not_abort_other_profiles(self, tmp_path):
        store = _make_store(tmp_path)
        store.set_rule({**_rule(enabled=True, channels=["email"])}, "bad")
        store.set_rule({**_rule(enabled=True, channels=["email"])}, "good")

        notif = _FakeNotificationService()

        # Monkeypatching approach: make build_readings raise for "bad", work for "good"
        def _selective_build(pid):
            if pid == "bad":
                raise RuntimeError("simulated data failure")
            return _readings_for(["AAPL"])

        import backend.app.services.mispricing_alert_store as _store_mod
        import backend.app.services.mispricing_alert_readings as _readings_mod
        import backend.app.services.notification_service as _notif_mod

        original_store = _store_mod.mispricing_alert_store
        original_notif = _notif_mod.notification_service
        original_build = _readings_mod.build_readings

        _store_mod.mispricing_alert_store = store
        _notif_mod.notification_service = notif
        _readings_mod.build_readings = _selective_build

        try:
            _run_alert_job()
        finally:
            _store_mod.mispricing_alert_store = original_store
            _notif_mod.notification_service = original_notif
            _readings_mod.build_readings = original_build

        # "good" profile still fired
        assert len(notif.calls) == 1
        assert notif.calls[0][1]["profile"] == "good"

    def test_no_channels_sends_nothing_but_records(self, tmp_path):
        """A rule with no channels configured should not send but still records fires."""
        store = _make_store(tmp_path)
        store.set_rule({**_rule(enabled=True, channels=[])}, "silent")
        readings = _readings_for(["NVDA"])
        notif = _run_job_patched(store, readings)

        assert notif.calls == []
        # No channels → record_fire is still called (the fire happened, even if unsent)
        # Actually: channels loop is empty, so record_fire IS still called.
        history = store.get_history("silent")
        assert len(history) == 1 and history[0]["symbol"] == "NVDA"

    def test_empty_readings_nothing_sent(self, tmp_path):
        store = _make_store(tmp_path)
        store.set_rule({**_rule(enabled=True, channels=["email"])}, "nobody")
        notif = _run_job_patched(store, [])  # empty readings

        assert notif.calls == []
        assert store.get_history("nobody") == []

    def test_multiple_symbols_all_fire(self, tmp_path):
        store = _make_store(tmp_path)
        store.set_rule({**_rule(enabled=True, channels=["webhook"])}, "multi")
        readings = _readings_for(["AAA", "BBB", "CCC"])
        notif = _run_job_patched(store, readings)

        sent_symbols = [payload["symbol"] for _, payload in notif.calls]
        assert sorted(sent_symbols) == ["AAA", "BBB", "CCC"]
        assert len(store.get_history("multi")) == 3


# ─────────────────────────────────────────────────────────────────────────────
# MispricingAlertScheduler.get_status — no APScheduler required
# ─────────────────────────────────────────────────────────────────────────────

class TestSchedulerStatus:
    def test_status_not_running_when_never_started(self):
        sched = MispricingAlertScheduler()
        status = sched.get_status()
        assert isinstance(status, dict)
        assert "running" in status
        assert "available" in status
        assert "interval_minutes" in status

    def test_status_interval_env_override(self, monkeypatch):
        monkeypatch.setenv("MISPRICING_ALERT_INTERVAL_MINUTES", "30")
        sched = MispricingAlertScheduler()
        assert sched.get_status()["interval_minutes"] == 30

"""MispricingAlertStore — rule normalization, persistence, fire history, concurrency."""
import threading

from backend.app.services.mispricing_alert_store import MispricingAlertStore


def test_rule_default_disabled(tmp_path):
    s = MispricingAlertStore(tmp_path / "a")
    assert s.get_rule()["enabled"] is False  # safety: off by default


def test_set_rule_normalizes_and_persists(tmp_path):
    s = MispricingAlertStore(tmp_path / "a")
    s.set_rule({
        "enabled": True, "threshold_pct": -30, "direction": "bogus",
        "min_confidence": 2, "cooldown_hours": -1, "channels": ["email", ""],
    })
    r = s.get_rule()
    assert r["threshold_pct"] == 30.0      # abs
    assert r["direction"] == "both"        # invalid → both
    assert r["min_confidence"] == 1.0      # clamped to [0,1]
    assert r["cooldown_hours"] == 0.0      # clamped to >= 0
    assert r["channels"] == ["email"]      # empties dropped
    assert MispricingAlertStore(tmp_path / "a").get_rule()["direction"] == "both"  # persisted


def test_record_fire_updates_last_fired_and_history(tmp_path):
    s = MispricingAlertStore(tmp_path / "a")
    s.record_fire({"symbol": "AAPL", "gap_pct": 60.0, "direction": "overvalued"}, "2026-06-08T00:00:00")
    assert s.get_last_fired()["AAPL"] == "2026-06-08T00:00:00"
    assert s.get_history()[-1]["symbol"] == "AAPL"


def test_concurrent_set_rule_no_corruption(tmp_path):
    s = MispricingAlertStore(tmp_path / "a")

    def worker(i):
        s.set_rule({"enabled": True, "threshold_pct": float(i)})

    ts = [threading.Thread(target=worker, args=(i,)) for i in range(20)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert s.get_rule()["enabled"] is True  # readable & valid after concurrent writes

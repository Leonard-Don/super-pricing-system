"""Mispricing-alert endpoints — rule round-trip, dry-run never sends, sync-def guard."""
import inspect

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import alerts
from backend.app.services.mispricing_alert_store import MispricingAlertStore


def _client(monkeypatch, tmp_path):
    app = FastAPI()
    app.include_router(alerts.router, prefix="/alerts")
    store = MispricingAlertStore(storage_path=tmp_path / "alerts")
    monkeypatch.setattr(alerts, "_get_store", lambda: store)
    monkeypatch.setattr(alerts, "_get_watchlist", lambda pid=None: ["AAPL", "MSFT"])

    class FakeAnalyzer:
        def analyze(self, symbol):
            gaps = {"AAPL": 60.0, "MSFT": 5.0}
            return {
                "gap_analysis": {"gap_pct": gaps.get(symbol, 0.0)},
                "valuation": {"confidence_interval": {"low": 100.0, "high": 110.0}},
            }

    monkeypatch.setattr(alerts, "_get_analyzer", lambda: FakeAnalyzer())
    return TestClient(app), store


def test_rule_roundtrip_defaults_disabled(monkeypatch, tmp_path):
    client, _ = _client(monkeypatch, tmp_path)
    assert client.get("/alerts/mispricing/rule").json()["enabled"] is False
    body = client.put("/alerts/mispricing/rule", json={
        "enabled": True, "threshold_pct": 20, "direction": "over",
        "min_confidence": 0.4, "cooldown_hours": 12, "channels": ["email"],
    }).json()
    assert body["enabled"] is True and body["direction"] == "over"
    assert client.get("/alerts/mispricing/rule").json()["direction"] == "over"  # persisted


def test_evaluate_dryrun_returns_would_fire_without_sending(monkeypatch, tmp_path):
    client, store = _client(monkeypatch, tmp_path)
    client.put("/alerts/mispricing/rule", json={
        "enabled": False, "threshold_pct": 20, "direction": "both",
        "min_confidence": 0.3, "cooldown_hours": 24, "channels": [],
    })
    body = client.post("/alerts/mispricing/evaluate").json()
    assert body["status"] == "ok"
    assert [f["symbol"] for f in body["would_fire"]] == ["AAPL"]  # 60% fires; MSFT 5% < 20
    assert body["would_fire"][0]["direction"] == "overvalued"
    assert store.get_history() == []  # DRY-RUN never records / sends


def test_evaluate_empty_watchlist(monkeypatch, tmp_path):
    client, _ = _client(monkeypatch, tmp_path)
    monkeypatch.setattr(alerts, "_get_watchlist", lambda pid=None: [])
    assert client.post("/alerts/mispricing/evaluate").json()["status"] == "empty_watchlist"


def test_alerts_endpoints_are_sync_def():
    for fn in (alerts.get_mispricing_rule, alerts.set_mispricing_rule,
               alerts.get_mispricing_history, alerts.evaluate_mispricing):
        assert not inspect.iscoroutinefunction(fn)

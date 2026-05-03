"""
实时行情 REST / WS 契约测试
"""

import time
from datetime import datetime
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import realtime as realtime_endpoint
from backend.app.websocket.connection_manager import manager
from backend.app.services.realtime_journal import realtime_journal_store
from backend.main import app
from src.data.realtime_manager import realtime_manager
from src.utils.cache import cache_manager


FAKE_QUOTE = {
    "symbol": "AAPL",
    "price": 189.25,
    "change": 1.5,
    "change_percent": 0.8,
    "volume": 123456,
    "high": 190.1,
    "low": 187.9,
    "open": 188.0,
    "previous_close": 187.75,
    "bid": 189.2,
    "ask": 189.3,
    "timestamp": datetime.now().isoformat(),
    "source": "test",
}


@pytest.fixture(autouse=True)
def reset_ws_manager():
    manager.active_connections.clear()
    manager.subscriptions.clear()
    manager.loop = None
    realtime_manager.quote_history.clear()
    realtime_manager._quotes_bundle_cache.clear()
    cache_manager.clear()
    yield
    manager.active_connections.clear()
    manager.subscriptions.clear()
    manager.loop = None
    realtime_manager.quote_history.clear()
    realtime_manager._quotes_bundle_cache.clear()
    cache_manager.clear()


@pytest.fixture
def client():
    return TestClient(app)


def test_realtime_replay_falls_back_to_synthetic_frame_when_provider_is_empty(client):
    with patch.object(realtime_endpoint.data_manager, "get_historical_data", return_value=None):
        response = client.get("/realtime/replay/NVDA?period=5d&interval=1d&limit=60")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["symbol"] == "NVDA"
    assert payload["data"]["degraded"] is True
    assert payload["data"]["is_synthetic"] is True
    assert payload["data"]["source"] == "synthetic_replay_fallback"
    assert payload["data"]["bar_count"] >= 30


def test_realtime_orderbook_times_out_to_synthetic_depth(client, monkeypatch):
    class SlowDepthFactory:
        def get_market_depth_capabilities(self, symbol, levels=10):
            time.sleep(0.05)
            return {}

    monkeypatch.setattr(realtime_endpoint, "ORDERBOOK_DEPTH_TIMEOUT_SECONDS", 0.01)
    monkeypatch.setattr(realtime_manager, "provider_factory", SlowDepthFactory())

    response = client.get("/realtime/orderbook/AAPL?levels=5")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["symbol"] == "AAPL"
    assert payload["data"]["is_synthetic"] is True
    assert payload["data"]["source"] == "synthetic_quote_proxy"
    assert len(payload["data"]["bids"]) == 5
    assert "timed out" in payload["data"]["diagnostics"]["message"]


def test_realtime_journal_endpoint_accepts_profile_id_query_param(client):
    with patch.object(
        realtime_journal_store,
        "get_journal",
        return_value={"review_snapshots": [], "timeline_events": []},
    ) as get_journal:
        response = client.get("/realtime/journal?profile_id=query-profile")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    get_journal.assert_called_once_with(profile_id="query-profile")


def test_realtime_journal_endpoint_prefers_profile_header_over_query_param(client):
    with patch.object(
        realtime_journal_store,
        "get_journal",
        return_value={"review_snapshots": [], "timeline_events": []},
    ) as get_journal:
        response = client.get(
            "/realtime/journal?profile_id=query-profile",
            headers={"X-Realtime-Profile": "header-profile"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    get_journal.assert_called_once_with(profile_id="header-profile")


def test_websocket_duplicate_subscribe_only_fetches_initial_snapshot_once(client):
    snapshot_calls = []

    def fake_get_quotes(symbols, use_cache=True):
        snapshot_calls.append((tuple(symbols), use_cache))
        return {"AAPL": FAKE_QUOTE}

    with patch.object(realtime_manager, "get_quotes_dict", side_effect=fake_get_quotes), \
         patch.object(realtime_manager, "subscribe_symbol", return_value=True), \
         patch.object(realtime_manager, "unsubscribe_symbol", return_value=True):
        with client.websocket_connect("/ws/quotes") as websocket:
            websocket.send_json({"action": "subscribe", "symbol": "AAPL"})
            ack = websocket.receive_json()
            snapshot = websocket.receive_json()

            websocket.send_json({"action": "subscribe", "symbol": "AAPL"})
            duplicate_ack = websocket.receive_json()

            assert ack["type"] == "subscription"
            assert ack["action"] == "subscribed"
            assert ack["duplicate"] is False

            assert snapshot["type"] == "snapshot"
            assert snapshot["origin"] == "subscribe"
            assert snapshot["symbols"] == ["AAPL"]
            assert snapshot["data"]["AAPL"]["previous_close"] == FAKE_QUOTE["previous_close"]

            assert duplicate_ack["type"] == "subscription"
            assert duplicate_ack["action"] == "subscribed"
            assert duplicate_ack["duplicate"] is True

    assert snapshot_calls == [(("AAPL",), True)]


def test_websocket_manual_snapshot_reuses_cached_quote_contract(client):
    snapshot_calls = []

    def fake_get_quotes(symbols, use_cache=True):
        snapshot_calls.append((tuple(symbols), use_cache))
        return {"AAPL": FAKE_QUOTE}

    with patch.object(realtime_manager, "get_quotes_dict", side_effect=fake_get_quotes), \
         patch.object(realtime_manager, "subscribe_symbol", return_value=True), \
         patch.object(realtime_manager, "unsubscribe_symbol", return_value=True):
        with client.websocket_connect("/ws/quotes") as websocket:
            websocket.send_json({"action": "subscribe", "symbol": "AAPL"})
            websocket.receive_json()  # subscription ack
            websocket.receive_json()  # initial snapshot

            websocket.send_json({"action": "snapshot", "symbol": "AAPL"})
            snapshot = websocket.receive_json()

            assert snapshot["type"] == "snapshot"
            assert snapshot["origin"] == "manual_refresh"
            assert snapshot["symbols"] == ["AAPL"]
            assert snapshot["data"]["AAPL"]["symbol"] == "AAPL"

    assert snapshot_calls == [(("AAPL",), True), (("AAPL",), True)]

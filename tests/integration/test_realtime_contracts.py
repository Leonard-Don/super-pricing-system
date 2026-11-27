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

import asyncio
from unittest.mock import Mock

from backend.app.websocket.connection_manager import ConnectionManager
from backend.app.websocket.trade_connection_manager import TradeConnectionManager
from src.data.realtime_manager import realtime_manager


class BlockingWebSocket:
    def __init__(self, gate: asyncio.Event, all_started: asyncio.Event, tracker: dict, expected: int):
        self.gate = gate
        self.all_started = all_started
        self.tracker = tracker
        self.expected = expected

    async def send_json(self, payload):
        self.tracker["started"] += 1
        if self.tracker["started"] >= self.expected:
            self.all_started.set()
        await self.gate.wait()
        self.tracker["payloads"].append(payload)


class FailingWebSocket:
    async def send_json(self, payload):
        raise RuntimeError("socket closed")


def test_connection_manager_broadcast_quote_sends_to_subscribers_concurrently():
    async def run_test():
        gate = asyncio.Event()
        all_started = asyncio.Event()
        tracker = {"started": 0, "payloads": []}
        manager = ConnectionManager()
        first = BlockingWebSocket(gate, all_started, tracker, expected=2)
        second = BlockingWebSocket(gate, all_started, tracker, expected=2)
        manager.active_connections["AAPL"] = {first, second}

        task = asyncio.create_task(manager.broadcast_quote("AAPL", {"price": 189.2}))
        await asyncio.wait_for(all_started.wait(), timeout=0.1)
        gate.set()
        await asyncio.wait_for(task, timeout=0.1)

        assert tracker["started"] == 2
        assert len(tracker["payloads"]) == 2
        assert all(item["symbol"] == "AAPL" for item in tracker["payloads"])

    asyncio.run(run_test())


def test_trade_connection_manager_broadcast_sends_to_all_connections_concurrently():
    async def run_test():
        gate = asyncio.Event()
        all_started = asyncio.Event()
        tracker = {"started": 0, "payloads": []}
        manager = TradeConnectionManager()
        first = BlockingWebSocket(gate, all_started, tracker, expected=2)
        second = BlockingWebSocket(gate, all_started, tracker, expected=2)
        manager.active_connections = {first, second}

        task = asyncio.create_task(manager.broadcast({"type": "trade", "message": "filled"}))
        await asyncio.wait_for(all_started.wait(), timeout=0.1)
        gate.set()
        await asyncio.wait_for(task, timeout=0.1)

        assert tracker["started"] == 2
        assert len(tracker["payloads"]) == 2
        assert all(item["type"] == "trade" for item in tracker["payloads"])
        assert all("timestamp" in item for item in tracker["payloads"])

    asyncio.run(run_test())


def test_connection_manager_send_personal_message_disconnects_failed_socket():
    async def run_test():
        manager = ConnectionManager()
        websocket = FailingWebSocket()
        unsubscribe_symbol = Mock()
        original = realtime_manager.unsubscribe_symbol
        realtime_manager.unsubscribe_symbol = unsubscribe_symbol
        try:
            manager.active_connections["AAPL"] = {websocket}
            manager.subscriptions[websocket] = {"AAPL"}

            await manager.send_personal_message(websocket, {"type": "pong"})

            assert websocket not in manager.subscriptions
            assert "AAPL" not in manager.active_connections
            unsubscribe_symbol.assert_called_once_with("AAPL", manager._handle_realtime_update)
        finally:
            realtime_manager.unsubscribe_symbol = original

    asyncio.run(run_test())


def test_trade_connection_manager_send_personal_message_disconnects_failed_socket():
    async def run_test():
        manager = TradeConnectionManager()
        websocket = FailingWebSocket()
        manager.active_connections = {websocket}

        await manager.send_personal_message(websocket, {"type": "pong"})

        assert websocket not in manager.active_connections

    asyncio.run(run_test())

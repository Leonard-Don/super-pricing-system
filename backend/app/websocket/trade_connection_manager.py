"""
交易通知 WebSocket 连接管理器
"""

import logging
from datetime import datetime
from typing import Any, Dict, Set

from fastapi import WebSocket
from backend.app.websocket.send_utils import broadcast_json, send_json_message

logger = logging.getLogger(__name__)


class TradeConnectionManager:
    """管理交易通知频道的 WebSocket 连接。"""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(
            "Trade WebSocket connected. total_connections=%s",
            len(self.active_connections),
        )

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info(
            "Trade WebSocket disconnected. remaining_connections=%s",
            len(self.active_connections),
        )

    async def send_personal_message(self, websocket: WebSocket, message: Dict[str, Any]):
        await send_json_message(
            websocket,
            message,
            logger=logger,
            error_context="Failed to send trade websocket message",
            on_failure=self.disconnect,
        )

    async def broadcast(self, message: Dict[str, Any]):
        if not self.active_connections:
            return

        payload = {
            **message,
            "timestamp": message.get("timestamp") or datetime.now().isoformat(),
        }

        disconnected = await broadcast_json(
            self.active_connections,
            payload,
            logger=logger,
            error_context="Failed to broadcast trade websocket message",
        )

        for websocket in disconnected:
            self.disconnect(websocket)


trade_ws_manager = TradeConnectionManager()

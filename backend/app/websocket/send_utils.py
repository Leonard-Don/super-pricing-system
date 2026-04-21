"""
WebSocket message delivery helpers shared by realtime and trade channels.
"""

import asyncio
import logging
from typing import Any, Callable, Iterable, Protocol


class JsonWritable(Protocol):
    async def send_json(self, payload: dict[str, Any]) -> None:
        ...


def _log_send_failure(logger: logging.Logger, error_context: str, exc: Exception) -> None:
    logger.warning("%s: %s", error_context, exc)


async def send_json_message(
    websocket: JsonWritable,
    payload: dict[str, Any],
    *,
    logger: logging.Logger,
    error_context: str,
    on_failure: Callable[[JsonWritable], None] | None = None,
) -> bool:
    try:
        await websocket.send_json(payload)
        return True
    except Exception as exc:  # pragma: no cover - covered via manager behavior tests
        _log_send_failure(logger, error_context, exc)
        if on_failure is not None:
            on_failure(websocket)
        return False


async def broadcast_json(
    websockets: Iterable[JsonWritable],
    payload: dict[str, Any],
    *,
    logger: logging.Logger,
    error_context: str,
) -> list[JsonWritable]:
    targets = list(websockets)
    if not targets:
        return []

    results = await asyncio.gather(
        *(websocket.send_json(payload) for websocket in targets),
        return_exceptions=True,
    )
    disconnected: list[JsonWritable] = []
    for websocket, result in zip(targets, results):
        if isinstance(result, Exception):
            _log_send_failure(logger, error_context, result)
            disconnected.append(websocket)
    return disconnected

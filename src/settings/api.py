"""
应用与前后端通信配置。

CORS 解析顺序：
1. 若设置 ``CORS_ORIGINS`` 环境变量，按 JSON 数组或逗号分隔字符串解析为白名单（完全替换默认值）。
2. 否则使用基于 ``ENVIRONMENT`` 推导的合理默认：
   - ``development`` / ``test``：包含 ``FRONTEND_URL`` + 常见 localhost 来源（CRA 3000、本项目 3100）。
   - ``production``：仅包含 ``FRONTEND_URL``（不含任何 localhost）。
3. ``CORS_EXTRA_ORIGINS`` 在两种模式下均会被合并进白名单，便于生产逐步加放。

任何模式下 ``"*"`` 通配都会被拒绝，因为 ``allow_credentials=True`` 与通配组合是 CORS 规范明确禁止的。
"""

from __future__ import annotations

import json
import logging
import os
from typing import List

logger = logging.getLogger(__name__)


API_HOST = os.getenv("API_HOST", "127.0.0.1")
API_PORT = int(os.getenv("API_PORT", "8100"))
API_RELOAD = os.getenv("API_RELOAD", "True").lower() == "true"

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://127.0.0.1:3100")

ENVIRONMENT = os.getenv("ENVIRONMENT", "development").strip().lower() or "development"

_LOCALHOST_ORIGINS: List[str] = [
    "http://127.0.0.1:3100",
    "http://localhost:3100",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
]


def _parse_origin_list(raw: str) -> List[str]:
    """把 ``CORS_ORIGINS`` / ``CORS_EXTRA_ORIGINS`` 的字符串解析为列表。

    既支持 JSON 数组（``["https://a.com","https://b.com"]``），
    也支持普通逗号分隔（``https://a.com,https://b.com``）。
    """
    raw = (raw or "").strip()
    if not raw:
        return []

    if raw.startswith("["):
        try:
            value = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning(
                "CORS env value looks like JSON but failed to parse; falling back to comma split: %r",
                raw,
            )
            value = None
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]

    return [piece.strip() for piece in raw.split(",") if piece.strip()]


def _validate_origins(origins: List[str]) -> List[str]:
    """剔除非法/危险来源（如 ``*`` 通配），同时去重保序。"""
    cleaned: List[str] = []
    seen = set()
    for origin in origins:
        if not origin:
            continue
        if origin == "*":
            logger.error(
                "Rejecting CORS wildcard '*' because allow_credentials=True is incompatible with it; "
                "please configure explicit origins."
            )
            continue
        if origin in seen:
            continue
        seen.add(origin)
        cleaned.append(origin)
    return cleaned


def _build_default_origins() -> List[str]:
    """基于 ``ENVIRONMENT`` 推断默认白名单。"""
    if ENVIRONMENT in {"production", "prod"}:
        return [FRONTEND_URL]
    # development / test / staging 一律允许 localhost 同源调试
    return [FRONTEND_URL, *_LOCALHOST_ORIGINS]


def _resolve_cors_origins() -> List[str]:
    explicit = _parse_origin_list(os.getenv("CORS_ORIGINS", ""))
    if explicit:
        base = explicit
    else:
        base = _build_default_origins()

    extras = _parse_origin_list(os.getenv("CORS_EXTRA_ORIGINS", ""))
    return _validate_origins([*base, *extras])


CORS_ORIGINS: List[str] = _resolve_cors_origins()

if not CORS_ORIGINS:
    logger.warning(
        "CORS_ORIGINS resolved to an empty list; the API will reject all browser origins. "
        "Set FRONTEND_URL or CORS_ORIGINS to fix this."
    )

API_TIMEOUT = int(os.getenv("API_TIMEOUT", "30"))
HEALTH_CHECK_TIMEOUT = int(os.getenv("HEALTH_CHECK_TIMEOUT", "5"))
BACKEND_WAIT_TIMEOUT = int(os.getenv("BACKEND_WAIT_TIMEOUT", "30"))

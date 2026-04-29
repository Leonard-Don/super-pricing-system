"""auth 包内的加密 / 密码 / token 编解码 / env helpers / policy loader。

无状态工具函数。所有上层模块（``_users_tokens``、``_oauth``）通过此模块访问 JWT 密钥与密码哈希。
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
from typing import Any, Dict, List, Optional

from backend.app.core.persistence import persistence_manager

from ._constants import AUTH_POLICY_RECORD_TYPE

logger = logging.getLogger(__name__)

_DEV_AUTH_SECRET_FALLBACK = "dev-only-change-me"
_AUTH_SECRET_WARNED = False


def _b64url_encode(payload: bytes) -> str:
    return base64.urlsafe_b64encode(payload).rstrip(b"=").decode("ascii")


def _b64url_decode(payload: str) -> bytes:
    padding = "=" * (-len(payload) % 4)
    return base64.urlsafe_b64decode((payload + padding).encode("ascii"))


def _auth_secret() -> bytes:
    global _AUTH_SECRET_WARNED

    secret = os.getenv("AUTH_SECRET")
    environment = os.getenv("ENVIRONMENT", "development").strip().lower()

    if not secret:
        if environment in {"production", "prod"}:
            raise RuntimeError(
                "AUTH_SECRET environment variable is required in production but is missing; "
                "refusing to sign JWTs with the development fallback."
            )
        if not _AUTH_SECRET_WARNED:
            logger.warning(
                "AUTH_SECRET is not set; using insecure development fallback. "
                "Set AUTH_SECRET in your environment before deploying."
            )
            _AUTH_SECRET_WARNED = True
        secret = _DEV_AUTH_SECRET_FALLBACK

    return secret.encode("utf-8")


def _env_auth_required() -> bool:
    return os.getenv("AUTH_REQUIRED", "false").lower() == "true"


def _hash_password(password: str, iterations: int = 200_000) -> str:
    if not password:
        raise ValueError("password is required")
    salt = os.urandom(16).hex()
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), iterations).hex()
    return f"pbkdf2_sha256${iterations}${salt}${digest}"


def _verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt, expected = str(encoded or "").split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            str(password or "").encode("utf-8"),
            bytes.fromhex(salt),
            int(iterations),
        ).hex()
        return hmac.compare_digest(digest, expected)
    except (ValueError, TypeError) as exc:
        # 仅吃掉"凭据格式错误"这一类预期异常；其余真正的 bug 不应被静默。
        logger.debug(
            "Password verification rejected due to malformed credential payload: %s", exc
        )
        return False


def _load_policy() -> Dict[str, Any]:
    records = persistence_manager.list_records(record_type=AUTH_POLICY_RECORD_TYPE, limit=1)
    payload = (records[0].get("payload") or {}) if records else {}
    required = bool(payload.get("required", _env_auth_required()))
    return {
        "required": required,
        "mode": "local_jwt",
        "updated_at": payload.get("updated_at") or (records[0].get("updated_at") if records else None),
        "updated_by": payload.get("updated_by"),
        "note": (
            "Authentication is required for protected API calls"
            if required
            else "Authentication is optional; anonymous research access is allowed"
        ),
    }


def _hash_token(token: str) -> str:
    return hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()


def _default_access_ttl() -> int:
    return max(300, min(int(os.getenv("AUTH_ACCESS_TOKEN_TTL", "86400")), 60 * 60 * 24 * 30))


def _default_refresh_ttl() -> int:
    return max(3600, min(int(os.getenv("AUTH_REFRESH_TOKEN_TTL", str(60 * 60 * 24 * 30))), 60 * 60 * 24 * 180))


def _normalize_scope_items(scopes: Optional[List[str] | str]) -> List[str]:
    if isinstance(scopes, str):
        raw_items = scopes.replace(",", " ").split()
    else:
        raw_items = list(scopes or [])
    return [str(item).strip() for item in raw_items if str(item).strip()]


def _env_flag(name: str, default: bool = True) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() not in {"0", "false", "no", "off", ""}

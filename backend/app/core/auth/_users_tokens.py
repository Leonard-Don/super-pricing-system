"""auth 包：本地用户 / refresh session / JWT token 生命周期。

包含：
- get_auth_policy / update_auth_policy
- 用户记录 CRUD: _find_user_record, _sanitize_user, list_local_users, upsert_local_user
- refresh session: _find_refresh_session, _sanitize_refresh_session, list_refresh_sessions, _persist_refresh_session, revoke_refresh_session
- 本地认证: authenticate_local_user, auth_status
- JWT: create_access_token, create_refresh_token, verify_access_token, refresh_access_token

依赖：``_secrets`` 提供加密 / hash / scope norm / policy loader；``_constants`` 提供
RECORD_TYPE 与 token type 字符串。
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import secrets
import time
import uuid
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status

from backend.app.core.persistence import persistence_manager

from ._constants import (
    ACCESS_TOKEN_TYPE,
    AUTH_POLICY_RECORD_TYPE,
    AUTH_REFRESH_RECORD_TYPE,
    AUTH_USER_RECORD_TYPE,
    REFRESH_TOKEN_TYPE,
)
from ._secrets import (
    _auth_secret,
    _b64url_decode,
    _b64url_encode,
    _default_access_ttl,
    _default_refresh_ttl,
    _env_auth_required,
    _env_flag,
    _hash_password,
    _hash_token,
    _load_policy,
    _normalize_scope_items,
    _verify_password,
)

logger = logging.getLogger(__name__)


def get_auth_policy() -> Dict[str, Any]:
    return _load_policy()


def update_auth_policy(required: bool, updated_by: str = "system") -> Dict[str, Any]:
    payload = {
        "required": bool(required),
        "updated_by": updated_by,
        "updated_at": int(time.time()),
    }
    persistence_manager.put_record(
        record_type=AUTH_POLICY_RECORD_TYPE,
        record_key="default",
        payload=payload,
        record_id=f"{AUTH_POLICY_RECORD_TYPE}:default",
    )
    return get_auth_policy()


def _find_user_record(subject: str) -> Optional[Dict[str, Any]]:
    normalized = str(subject or "").strip()
    if not normalized:
        return None
    for record in persistence_manager.list_records(record_type=AUTH_USER_RECORD_TYPE, limit=500):
        if str(record.get("record_key") or "").strip() == normalized:
            return record
    return None


def _sanitize_user(record: Dict[str, Any]) -> Dict[str, Any]:
    payload = record.get("payload") or {}
    return {
        "id": record.get("id"),
        "subject": payload.get("subject") or record.get("record_key"),
        "display_name": payload.get("display_name") or payload.get("subject") or record.get("record_key"),
        "role": payload.get("role") or "researcher",
        "enabled": payload.get("enabled", True),
        "scopes": payload.get("scopes") or [],
        "metadata": payload.get("metadata") or {},
        "last_login_at": payload.get("last_login_at"),
        "login_count": int(payload.get("login_count") or 0),
        "created_at": record.get("created_at"),
        "updated_at": record.get("updated_at"),
    }


def _find_refresh_session(session_id: str) -> Optional[Dict[str, Any]]:
    normalized = str(session_id or "").strip()
    if not normalized:
        return None
    for record in persistence_manager.list_records(record_type=AUTH_REFRESH_RECORD_TYPE, limit=1000):
        if str(record.get("record_key") or "").strip() == normalized:
            return record
    return None


def _sanitize_refresh_session(record: Dict[str, Any]) -> Dict[str, Any]:
    payload = record.get("payload") or {}
    return {
        "id": record.get("id"),
        "session_id": payload.get("session_id") or record.get("record_key"),
        "subject": payload.get("subject"),
        "role": payload.get("role"),
        "scope": payload.get("scope") or "",
        "issued_at": payload.get("issued_at"),
        "expires_at": payload.get("expires_at"),
        "last_used_at": payload.get("last_used_at"),
        "revoked_at": payload.get("revoked_at"),
        "grant_type": payload.get("grant_type") or "password",
        "metadata": payload.get("metadata") or {},
    }


def list_refresh_sessions(subject: Optional[str] = None, limit: int = 200) -> List[Dict[str, Any]]:
    sessions = []
    for record in persistence_manager.list_records(record_type=AUTH_REFRESH_RECORD_TYPE, limit=limit):
        session = _sanitize_refresh_session(record)
        if subject and session.get("subject") != subject:
            continue
        sessions.append(session)
    return sorted(sessions, key=lambda item: int(item.get("issued_at") or 0), reverse=True)


def list_local_users() -> List[Dict[str, Any]]:
    records = persistence_manager.list_records(record_type=AUTH_USER_RECORD_TYPE, limit=500)
    users = [_sanitize_user(record) for record in records]
    return sorted(users, key=lambda item: (item.get("role") != "admin", item.get("subject") or ""))


def upsert_local_user(
    subject: str,
    role: str = "researcher",
    password: Optional[str] = None,
    enabled: bool = True,
    display_name: Optional[str] = None,
    scopes: Optional[List[str]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    updated_by: str = "system",
) -> Dict[str, Any]:
    normalized_subject = str(subject or "").strip()
    if not normalized_subject:
        raise ValueError("subject is required")
    existing = _find_user_record(normalized_subject)
    existing_payload = (existing or {}).get("payload") or {}
    password_hash = existing_payload.get("password_hash")
    if password:
        password_hash = _hash_password(password)
    if not password_hash:
        raise ValueError("password is required when creating a new user")
    normalized_scopes = [
        str(item).strip()
        for item in (scopes if scopes is not None else existing_payload.get("scopes") or [])
        if str(item).strip()
    ]
    payload = {
        **existing_payload,
        "subject": normalized_subject,
        "display_name": str(display_name or existing_payload.get("display_name") or normalized_subject).strip() or normalized_subject,
        "role": str(role or existing_payload.get("role") or "researcher"),
        "enabled": bool(enabled),
        "scopes": normalized_scopes,
        "metadata": metadata if metadata is not None else existing_payload.get("metadata") or {},
        "password_hash": password_hash,
        "updated_by": updated_by,
    }
    record = persistence_manager.put_record(
        record_type=AUTH_USER_RECORD_TYPE,
        record_key=normalized_subject,
        payload=payload,
        record_id=f"{AUTH_USER_RECORD_TYPE}:{normalized_subject}",
    )
    return _sanitize_user(record)


def authenticate_local_user(
    subject: str,
    password: str,
    expires_in_seconds: int = 86_400,
    refresh_expires_in_seconds: Optional[int] = None,
) -> Dict[str, Any]:
    record = _find_user_record(subject)
    if not record:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown user")
    payload = record.get("payload") or {}
    if not payload.get("enabled", True):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is disabled")
    if not _verify_password(password, payload.get("password_hash", "")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid password")
    updated_payload = {
        **payload,
        "last_login_at": int(time.time()),
        "login_count": int(payload.get("login_count") or 0) + 1,
    }
    saved = persistence_manager.put_record(
        record_type=AUTH_USER_RECORD_TYPE,
        record_key=str(payload.get("subject") or subject),
        payload=updated_payload,
        record_id=record.get("id"),
    )
    user = _sanitize_user(saved)
    return _issue_token_bundle(
        user,
        access_expires_in_seconds=expires_in_seconds,
        refresh_expires_in_seconds=refresh_expires_in_seconds,
        grant_type="password",
        metadata={
            "login_subject": subject,
        },
    )


def auth_status() -> Dict[str, Any]:
    # 延迟 import：``_oauth`` 反向依赖本模块的 token / user helpers，模块顶端
    # import 会形成循环。``auth_status`` 调用次数低，运行期 import 性能可忽略。
    from ._oauth import _env_oauth_provider_specs, list_oauth_providers

    users = list_local_users()
    policy = get_auth_policy()
    sessions = list_refresh_sessions(limit=500)
    oauth_providers = list_oauth_providers()
    env_oauth_candidates = _env_oauth_provider_specs()
    active_sessions = [
        item for item in sessions
        if not item.get("revoked_at") and int(item.get("expires_at") or 0) >= int(time.time())
    ]
    return {
        "required": policy["required"],
        "api_key_configured": bool(os.getenv("API_KEY")),
        "jwt_secret_configured": bool(os.getenv("AUTH_SECRET")),
        "supported": ["Local user + password", "OAuth2 password grant", "OAuth2 authorization code + PKCE", "Bearer HS256 token", "Refresh token rotation", "X-API-Key"],
        "local_user_count": len(users),
        "enabled_users": sum(1 for item in users if item.get("enabled")),
        "oauth_provider_count": len(oauth_providers),
        "oauth_enabled_providers": sum(1 for item in oauth_providers if item.get("enabled")),
        "oauth_env_candidates": len(env_oauth_candidates),
        "bootstrap_required": not any(item.get("enabled") for item in users),
        "active_refresh_sessions": len(active_sessions),
        "policy": policy,
    }


def create_access_token(
    subject: str,
    role: str = "researcher",
    expires_in_seconds: int = 86400,
    extra_claims: Optional[Dict[str, Any]] = None,
) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    body = {
        "sub": str(subject or "researcher"),
        "role": str(role or "researcher"),
        "typ": ACCESS_TOKEN_TYPE,
        "iat": now,
        "exp": now + max(60, min(int(expires_in_seconds or 86400), 60 * 60 * 24 * 30)),
    }
    if extra_claims:
        body.update(extra_claims)
    signing_input = f"{_b64url_encode(json.dumps(header, separators=(',', ':')).encode())}.{_b64url_encode(json.dumps(body, separators=(',', ':')).encode())}"
    signature = hmac.new(_auth_secret(), signing_input.encode("ascii"), hashlib.sha256).digest()
    return f"{signing_input}.{_b64url_encode(signature)}"


def create_refresh_token(
    subject: str,
    role: str = "researcher",
    session_id: Optional[str] = None,
    expires_in_seconds: Optional[int] = None,
    extra_claims: Optional[Dict[str, Any]] = None,
) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    normalized_session = str(session_id or uuid.uuid4().hex)
    body = {
        "sub": str(subject or "researcher"),
        "role": str(role or "researcher"),
        "typ": REFRESH_TOKEN_TYPE,
        "jti": normalized_session,
        "iat": now,
        "exp": now + max(3600, min(int(expires_in_seconds or _default_refresh_ttl()), 60 * 60 * 24 * 180)),
    }
    if extra_claims:
        body.update(extra_claims)
    signing_input = f"{_b64url_encode(json.dumps(header, separators=(',', ':')).encode())}.{_b64url_encode(json.dumps(body, separators=(',', ':')).encode())}"
    signature = hmac.new(_auth_secret(), signing_input.encode("ascii"), hashlib.sha256).digest()
    return f"{signing_input}.{_b64url_encode(signature)}"


def verify_access_token(token: str) -> Dict[str, Any]:
    try:
        header_raw, payload_raw, signature_raw = token.split(".", 2)
        signing_input = f"{header_raw}.{payload_raw}"
        expected = _b64url_encode(hmac.new(_auth_secret(), signing_input.encode("ascii"), hashlib.sha256).digest())
        if not hmac.compare_digest(expected, signature_raw):
            raise ValueError("invalid token signature")
        header = json.loads(_b64url_decode(header_raw))
        payload = json.loads(_b64url_decode(payload_raw))
        if header.get("alg") != "HS256":
            raise ValueError("unsupported token algorithm")
        if int(payload.get("exp", 0)) < int(time.time()):
            raise ValueError("token expired")
        return payload
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {exc}") from exc


def refresh_access_token(
    refresh_token: str,
    expires_in_seconds: Optional[int] = None,
    refresh_expires_in_seconds: Optional[int] = None,
) -> Dict[str, Any]:
    payload = verify_access_token(refresh_token)
    if payload.get("typ") != REFRESH_TOKEN_TYPE:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token required")

    session_id = str(payload.get("jti") or "").strip()
    record = _find_refresh_session(session_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh session not found")

    session_payload = record.get("payload") or {}
    if session_payload.get("revoked_at"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh session has been revoked")
    if int(session_payload.get("expires_at") or 0) < int(time.time()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh session expired")
    if session_payload.get("token_hash") != _hash_token(refresh_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token mismatch")

    user_record = _find_user_record(str(payload.get("sub") or ""))
    if not user_record:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    user_payload = user_record.get("payload") or {}
    if not user_payload.get("enabled", True):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is disabled")

    user = _sanitize_user(user_record)
    revoke_refresh_session(session_id, revoked_by=user.get("subject") or "system")
    refreshed = _issue_token_bundle(
        user,
        access_expires_in_seconds=expires_in_seconds,
        refresh_expires_in_seconds=refresh_expires_in_seconds,
        grant_type="refresh_token",
        metadata={
            "rotated_from": session_id,
        },
    )
    return {
        **refreshed,
        "rotated_session_id": session_id,
    }


def _persist_refresh_session(
    *,
    session_id: str,
    refresh_token: str,
    user: Dict[str, Any],
    grant_type: str,
    expires_at: int,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    payload = {
        "session_id": session_id,
        "subject": user.get("subject"),
        "role": user.get("role"),
        "scope": " ".join(user.get("scopes") or []),
        "scopes": user.get("scopes") or [],
        "display_name": user.get("display_name"),
        "token_hash": _hash_token(refresh_token),
        "grant_type": grant_type,
        "issued_at": int(time.time()),
        "expires_at": int(expires_at),
        "last_used_at": None,
        "revoked_at": None,
        "metadata": metadata or {},
    }
    return persistence_manager.put_record(
        record_type=AUTH_REFRESH_RECORD_TYPE,
        record_key=session_id,
        payload=payload,
        record_id=f"{AUTH_REFRESH_RECORD_TYPE}:{session_id}",
    )


def revoke_refresh_session(session_id: str, revoked_by: str = "system") -> Optional[Dict[str, Any]]:
    record = _find_refresh_session(session_id)
    if not record:
        return None
    payload = record.get("payload") or {}
    saved = persistence_manager.put_record(
        record_type=AUTH_REFRESH_RECORD_TYPE,
        record_key=str(payload.get("session_id") or session_id),
        payload={
            **payload,
            "revoked_at": int(time.time()),
            "revoked_by": revoked_by,
        },
        record_id=record.get("id"),
    )
    return _sanitize_refresh_session(saved)


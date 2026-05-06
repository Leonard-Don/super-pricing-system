"""Auth / OAuth 路由 — infrastructure 包内最大的子簇（16 个 handler）。

涵盖 ``/auth/*`` 与 ``/oauth/token``：本地登录 / 令牌签发 / 刷新 token / OAuth
provider 配置 / 授权链接 / code exchange / callback / session 撤销 / 用户与
策略管理。

模型类与 ``_exchange_oauth_code_async`` wrapper 都只服务这一簇，因此与 handler
共置；shared 的 ``_require_admin_or_bootstrap`` 在 ``_helpers.py`` 中维护。
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from backend.app.core.auth import (
    authenticate_local_user,
    auth_status,
    begin_oauth_authorization,
    create_access_token,
    diagnose_oauth_provider,
    exchange_oauth_authorization_code,
    get_auth_policy,
    get_current_user_optional,
    list_local_users,
    list_oauth_providers,
    list_refresh_sessions,
    refresh_access_token,
    revoke_refresh_session,
    sync_env_oauth_providers,
    update_auth_policy,
    upsert_oauth_provider,
    upsert_local_user,
)

from ._helpers import _require_admin_or_bootstrap

router = APIRouter()


class TokenRequest(BaseModel):
    subject: str = "researcher"
    role: str = "researcher"
    expires_in_seconds: int = Field(default=86400, ge=60, le=60 * 60 * 24 * 30)
    refresh_expires_in_seconds: int = Field(default=60 * 60 * 24 * 30, ge=3600, le=60 * 60 * 24 * 180)


class LoginRequest(BaseModel):
    subject: str
    password: str
    expires_in_seconds: int = Field(default=86400, ge=60, le=60 * 60 * 24 * 30)
    refresh_expires_in_seconds: int = Field(default=60 * 60 * 24 * 30, ge=3600, le=60 * 60 * 24 * 180)


class RefreshRequest(BaseModel):
    refresh_token: str
    expires_in_seconds: int = Field(default=86400, ge=60, le=60 * 60 * 24 * 30)
    refresh_expires_in_seconds: int = Field(default=60 * 60 * 24 * 30, ge=3600, le=60 * 60 * 24 * 180)


class AuthUserRequest(BaseModel):
    subject: str
    password: Optional[str] = None
    role: str = "researcher"
    display_name: str = ""
    enabled: bool = True
    scopes: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AuthPolicyRequest(BaseModel):
    required: bool = False


class OAuthProviderRequest(BaseModel):
    provider_id: str
    label: str = ""
    provider_type: str = "generic"
    enabled: bool = True
    client_id: str
    client_secret: Optional[str] = None
    auth_url: Optional[str] = None
    token_url: Optional[str] = None
    userinfo_url: Optional[str] = None
    redirect_uri: str = ""
    frontend_origin: str = ""
    scopes: List[str] = Field(default_factory=list)
    auto_create_user: bool = True
    default_role: str = "researcher"
    default_scopes: List[str] = Field(default_factory=list)
    subject_field: str = ""
    display_name_field: str = ""
    email_field: str = ""
    extra_params: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class OAuthAuthorizationRequest(BaseModel):
    frontend_origin: str = ""
    redirect_uri: str = ""


class OAuthExchangeRequest(BaseModel):
    code: str
    state: str
    redirect_uri: str = ""
    expires_in_seconds: int = Field(default=86400, ge=60, le=60 * 60 * 24 * 30)
    refresh_expires_in_seconds: int = Field(default=60 * 60 * 24 * 30, ge=3600, le=60 * 60 * 24 * 180)


async def _exchange_oauth_code_async(
    provider_id: str,
    *,
    code: str,
    state: str,
    redirect_uri: Optional[str] = None,
    expires_in_seconds: Optional[int] = None,
    refresh_expires_in_seconds: Optional[int] = None,
) -> Dict[str, Any]:
    return await asyncio.to_thread(
        exchange_oauth_authorization_code,
        provider_id,
        code=code,
        state=state,
        redirect_uri=redirect_uri,
        expires_in_seconds=expires_in_seconds,
        refresh_expires_in_seconds=refresh_expires_in_seconds,
    )


@router.post("/auth/token", summary="签发本地研究令牌")
async def create_auth_token(request: TokenRequest):
    token = create_access_token(
        subject=request.subject,
        role=request.role,
        expires_in_seconds=request.expires_in_seconds,
    )
    return {
        "access_token": token,
        "token_type": "Bearer",
        "expires_in_seconds": request.expires_in_seconds,
    }


@router.post("/auth/login", summary="本地用户密码登录")
async def login_auth_user(request: LoginRequest):
    return authenticate_local_user(
        subject=request.subject,
        password=request.password,
        expires_in_seconds=request.expires_in_seconds,
        refresh_expires_in_seconds=request.refresh_expires_in_seconds,
    )


@router.post("/auth/refresh", summary="使用 refresh token 刷新访问令牌")
async def refresh_auth_user(request: RefreshRequest):
    return refresh_access_token(
        refresh_token=request.refresh_token,
        expires_in_seconds=request.expires_in_seconds,
        refresh_expires_in_seconds=request.refresh_expires_in_seconds,
    )


@router.post("/oauth/token", summary="OAuth2 Password / Refresh Token 交换")
async def issue_oauth_token(
    grant_type: str = Form(default="password"),
    username: Optional[str] = Form(default=None),
    password: Optional[str] = Form(default=None),
    refresh_token: Optional[str] = Form(default=None),
    scope: str = Form(default=""),
):
    normalized_grant = str(grant_type or "password").strip().lower()
    if normalized_grant == "password":
        if not username or not password:
            raise HTTPException(status_code=400, detail="username and password are required for password grant")
        return authenticate_local_user(
            subject=username,
            password=password,
            expires_in_seconds=86400,
        )
    if normalized_grant == "refresh_token":
        if not refresh_token:
            raise HTTPException(status_code=400, detail="refresh_token is required for refresh_token grant")
        return refresh_access_token(refresh_token=refresh_token, expires_in_seconds=86400)
    raise HTTPException(status_code=400, detail=f"Unsupported grant_type: {grant_type}")


@router.get("/auth/users", summary="查看本地用户目录")
async def get_auth_users():
    return {
        "users": list_local_users(),
        "sessions": list_refresh_sessions(limit=100),
        "policy": get_auth_policy(),
        "providers": list_oauth_providers(),
    }


@router.get("/auth/oauth/providers", summary="查看 OAuth Provider 配置")
async def get_oauth_providers():
    return {
        "providers": list_oauth_providers(),
        "status": auth_status(),
    }


@router.post("/auth/oauth/providers", summary="创建或更新 OAuth Provider")
async def save_oauth_provider(request: OAuthProviderRequest, user: Dict[str, Any] = Depends(get_current_user_optional)):
    _require_admin_or_bootstrap(user)
    try:
        provider = upsert_oauth_provider(
            provider_id=request.provider_id,
            label=request.label,
            provider_type=request.provider_type,
            enabled=request.enabled,
            client_id=request.client_id,
            client_secret=request.client_secret,
            auth_url=request.auth_url,
            token_url=request.token_url,
            userinfo_url=request.userinfo_url,
            redirect_uri=request.redirect_uri,
            frontend_origin=request.frontend_origin,
            scopes=request.scopes,
            auto_create_user=request.auto_create_user,
            default_role=request.default_role,
            default_scopes=request.default_scopes,
            subject_field=request.subject_field,
            display_name_field=request.display_name_field,
            email_field=request.email_field,
            extra_params=request.extra_params,
            metadata=request.metadata,
            updated_by=user.get("sub") or "system",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "saved_by": user.get("sub"),
        "provider": provider,
        "providers": list_oauth_providers(),
    }


@router.post("/auth/oauth/providers/sync-env", summary="从环境变量同步 OAuth Provider")
async def sync_oauth_providers_from_env(user: Dict[str, Any] = Depends(get_current_user_optional)):
    _require_admin_or_bootstrap(user)
    providers = sync_env_oauth_providers(updated_by=user.get("sub") or "env_sync")
    return {
        "synced_count": len(providers),
        "providers": providers,
        "status": auth_status(),
    }


@router.get("/auth/oauth/providers/{provider_id}/diagnostics", summary="诊断 OAuth Provider 配置")
async def get_oauth_provider_diagnostics(provider_id: str):
    return diagnose_oauth_provider(provider_id)


@router.post("/auth/oauth/providers/{provider_id}/authorize", summary="生成 OAuth 授权链接")
async def authorize_oauth_provider(provider_id: str, request: OAuthAuthorizationRequest, http_request: Request):
    callback_base = str(http_request.base_url).rstrip("/")
    callback_uri = request.redirect_uri or f"{callback_base}/infrastructure/auth/oauth/providers/{provider_id}/callback"
    authorization = begin_oauth_authorization(
        provider_id,
        redirect_uri=callback_uri,
        frontend_origin=request.frontend_origin or http_request.headers.get("origin") or "",
    )
    return authorization


@router.post("/auth/oauth/providers/{provider_id}/exchange", summary="交换 OAuth 授权码")
async def exchange_oauth_provider_code(provider_id: str, request: OAuthExchangeRequest, http_request: Request):
    callback_base = str(http_request.base_url).rstrip("/")
    callback_uri = request.redirect_uri or f"{callback_base}/infrastructure/auth/oauth/providers/{provider_id}/callback"
    return await _exchange_oauth_code_async(
        provider_id,
        code=request.code,
        state=request.state,
        redirect_uri=callback_uri,
        expires_in_seconds=request.expires_in_seconds,
        refresh_expires_in_seconds=request.refresh_expires_in_seconds,
    )


@router.get("/auth/oauth/providers/{provider_id}/callback", response_class=HTMLResponse, summary="OAuth 登录回调")
async def oauth_provider_callback(
    provider_id: str,
    request: Request,
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
):
    callback_base = str(request.base_url).rstrip("/")
    callback_uri = f"{callback_base}/infrastructure/auth/oauth/providers/{provider_id}/callback"
    target_origin = request.headers.get("origin") or "*"
    payload: Dict[str, Any]
    if error:
        payload = {"success": False, "provider_id": provider_id, "error": error}
    elif not code or not state:
        payload = {"success": False, "provider_id": provider_id, "error": "missing code/state"}
    else:
        try:
            exchanged = await _exchange_oauth_code_async(
                provider_id,
                code=code,
                state=state,
                redirect_uri=callback_uri,
            )
            target_origin = exchanged.get("frontend_origin") or target_origin
            payload = {"success": True, "provider_id": provider_id, "payload": exchanged}
        except HTTPException as exc:
            payload = {"success": False, "provider_id": provider_id, "error": exc.detail}
        except Exception as exc:
            payload = {"success": False, "provider_id": provider_id, "error": str(exc)}
    script_payload = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
    script_target_origin = json.dumps(target_origin or "*", ensure_ascii=False)
    return HTMLResponse(
        content=f"""<!doctype html>
<html>
  <head><meta charset="utf-8"><title>OAuth Callback</title></head>
  <body style="font-family: sans-serif; padding: 24px;">
    <h3>Quant Lab OAuth 回调</h3>
    <p id="status">正在把登录结果回传到主窗口…</p>
    <script>
      (function() {{
        const payload = {script_payload};
        const targetOrigin = {script_target_origin};
        try {{
          if (window.opener && typeof window.opener.postMessage === 'function') {{
            window.opener.postMessage({{ type: 'quant-oauth-callback', ...payload }}, targetOrigin || '*');
          }}
          document.getElementById('status').textContent = payload.success ? '登录完成，窗口将自动关闭。' : ('登录失败: ' + (payload.error || 'unknown error'));
        }} catch (error) {{
          document.getElementById('status').textContent = '回传结果失败: ' + String(error);
        }}
        setTimeout(function() {{ window.close(); }}, payload.success ? 800 : 2000);
      }})();
    </script>
  </body>
</html>""",
    )


@router.post("/auth/sessions/{session_id}/revoke", summary="撤销 refresh session")
async def revoke_auth_session(session_id: str, user: Dict[str, Any] = Depends(get_current_user_optional)):
    _require_admin_or_bootstrap(user)
    session = revoke_refresh_session(session_id, revoked_by=user.get("sub") or "system")
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "revoked_by": user.get("sub"),
        "session": session,
    }


@router.post("/auth/users", summary="创建或更新本地用户")
async def save_auth_user(request: AuthUserRequest, user: Dict[str, Any] = Depends(get_current_user_optional)):
    _require_admin_or_bootstrap(user)
    try:
        saved = upsert_local_user(
            subject=request.subject,
            password=request.password,
            role=request.role,
            display_name=request.display_name,
            enabled=request.enabled,
            scopes=request.scopes,
            metadata=request.metadata,
            updated_by=user.get("sub") or "system",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "saved_by": user.get("sub"),
        "user": saved,
        "policy": get_auth_policy(),
    }


@router.post("/auth/policy", summary="更新认证策略")
async def save_auth_policy(request: AuthPolicyRequest, user: Dict[str, Any] = Depends(get_current_user_optional)):
    _require_admin_or_bootstrap(user)
    current_auth = auth_status()
    if request.required and current_auth.get("enabled_users", 0) <= 0:
        raise HTTPException(status_code=400, detail="Enable at least one local user before requiring authentication")
    policy = update_auth_policy(required=request.required, updated_by=user.get("sub") or "system")
    return {
        "updated_by": user.get("sub"),
        "policy": policy,
        "status": auth_status(),
    }

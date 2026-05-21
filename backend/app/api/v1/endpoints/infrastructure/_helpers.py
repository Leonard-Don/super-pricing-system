"""Infrastructure 包内的共享 helper。"""

from typing import Any, Dict

from fastapi import HTTPException, Request

from backend.app.core.auth import auth_status

_LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost"}


def _is_loopback_request(request: Request) -> bool:
    """请求是否来自本机回环。

    只判断 TCP 对端地址，不信任可被伪造的 ``X-Forwarded-For`` / ``X-Real-IP``
    转发头 —— 这些头不能用于放行鉴权例外。"""
    client = request.client
    return client is not None and str(client.host).strip().lower() in _LOOPBACK_HOSTS


def _require_admin(user: Dict[str, Any]) -> None:
    """要求当前用户是 admin（无 bootstrap 例外）。

    用于 OAuth provider 配置、会话撤销、认证策略、持久化迁移等敏感管理操作。"""
    if str(user.get("role") or "") != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")


def _require_admin_or_bootstrap(user: Dict[str, Any], request: Request) -> None:
    """要求当前用户是 admin，或系统处于 bootstrap 状态且请求来自本机回环。

    bootstrap 例外只服务首次安装的初始建账 / 持久化初始化，且被收窄到回环
    来源：在尚未建立管理员账号的窗口期，远程匿名调用方无法借此自助注册管理员。"""
    if str(user.get("role") or "") == "admin":
        return
    if auth_status().get("bootstrap_required") and _is_loopback_request(request):
        return
    raise HTTPException(status_code=403, detail="Admin role required")

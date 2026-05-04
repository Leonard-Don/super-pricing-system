"""Infrastructure 包内的共享 helper。"""

from typing import Any, Dict

from fastapi import HTTPException

from backend.app.core.auth import auth_status


def _require_admin_or_bootstrap(user: Dict[str, Any]) -> None:
    """要求当前用户是 admin，或者系统处于 bootstrap 状态（首次安装尚未建账）。

    auth_routes 中的 admin-only 操作和 routes 中的 persistence bootstrap 都用到。"""
    current_auth = auth_status()
    if current_auth.get("bootstrap_required"):
        return
    if str(user.get("role") or "") != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")

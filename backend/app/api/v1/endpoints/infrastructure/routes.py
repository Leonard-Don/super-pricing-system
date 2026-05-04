"""Infrastructure endpoints (status / tasks / rate-limit / persistence /
config-versions / notifications). Auth & OAuth handlers live in ``auth_routes``."""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from backend.app.core.auth import auth_status, get_current_user_optional
from backend.app.core.persistence import persistence_manager
from backend.app.core.rate_limit_state import rate_limiter
from backend.app.core.task_queue import task_queue_manager
from backend.app.services.notification_service import notification_service

from ._helpers import _require_admin_or_bootstrap

router = APIRouter()


class TaskRequest(BaseModel):
    name: str = "manual_task"
    payload: Dict[str, Any] = Field(default_factory=dict)
    execution_backend: str = "auto"


class RecordRequest(BaseModel):
    record_type: str = "research"
    record_key: str = "default"
    payload: Dict[str, Any] = Field(default_factory=dict)
    record_id: Optional[str] = None


class TimeSeriesRequest(BaseModel):
    series_name: str
    symbol: str
    timestamp: str
    value: Optional[float] = None
    payload: Dict[str, Any] = Field(default_factory=dict)


class PersistenceBootstrapRequest(BaseModel):
    enable_timescale_schema: bool = True


class PersistenceMigrationRequest(BaseModel):
    sqlite_path: Optional[str] = None
    dry_run: bool = True
    include_records: bool = True
    include_timeseries: bool = True
    dedupe_timeseries: bool = True
    record_limit: Optional[int] = Field(default=None, ge=1, le=100_000)
    timeseries_limit: Optional[int] = Field(default=None, ge=1, le=100_000)


class NotificationRequest(BaseModel):
    channel: str = "dry_run"
    payload: Dict[str, Any] = Field(default_factory=dict)


class NotificationChannelRequest(BaseModel):
    id: str
    type: str = "webhook"
    label: str = ""
    enabled: bool = True
    settings: Dict[str, Any] = Field(default_factory=dict)


class ConfigVersionRequest(BaseModel):
    config_type: str
    config_key: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    owner_id: str = "default"


class ConfigRestoreRequest(BaseModel):
    config_type: str
    config_key: str
    version: int = Field(..., ge=1)
    owner_id: str = "default"


class RateLimitRuleRequest(BaseModel):
    id: Optional[str] = None
    pattern: str
    requests_per_minute: int = Field(..., ge=1, le=10_000)
    burst_size: int = Field(..., ge=1, le=10_000)
    enabled: bool = True


class RateLimitUpdateRequest(BaseModel):
    default_requests_per_minute: int = Field(..., ge=1, le=10_000)
    default_burst_size: int = Field(..., ge=1, le=10_000)
    rules: List[RateLimitRuleRequest] = Field(default_factory=list)


def _config_record_type(owner_id: str, config_type: str, config_key: str) -> str:
    return f"config:{owner_id}:{config_type}:{config_key}"


def _list_config_records(owner_id: str, config_type: str, config_key: str, limit: int = 200) -> List[Dict[str, Any]]:
    return persistence_manager.list_records(
        record_type=_config_record_type(owner_id, config_type, config_key),
        limit=limit,
    )


def _find_config_record(owner_id: str, config_type: str, config_key: str, version: int) -> Optional[Dict[str, Any]]:
    for record in _list_config_records(owner_id, config_type, config_key, limit=200):
        payload = record.get("payload") or {}
        if int(payload.get("version") or 0) == int(version):
            return record
    return None


def _diff_payloads(left: Any, right: Any, path: str = "") -> List[Dict[str, Any]]:
    if isinstance(left, dict) and isinstance(right, dict):
        changes: List[Dict[str, Any]] = []
        keys = sorted(set(left.keys()) | set(right.keys()))
        for key in keys:
            child_path = f"{path}.{key}" if path else str(key)
            if key not in left:
                changes.append({"path": child_path, "change": "added", "before": None, "after": right.get(key)})
            elif key not in right:
                changes.append({"path": child_path, "change": "removed", "before": left.get(key), "after": None})
            else:
                changes.extend(_diff_payloads(left.get(key), right.get(key), child_path))
        return changes

    if isinstance(left, list) and isinstance(right, list):
        if left == right:
            return []
        return [{
            "path": path or "$",
            "change": "modified",
            "before": left,
            "after": right,
            "before_length": len(left),
            "after_length": len(right),
        }]

    if left == right:
        return []
    return [{"path": path or "$", "change": "modified", "before": left, "after": right}]


@router.get("/status", summary="基础设施状态")
async def get_infrastructure_status(user: Dict[str, Any] = Depends(get_current_user_optional)):
    return {
        "user": user,
        "auth": auth_status(),
        "persistence": persistence_manager.health(),
        "task_queue": task_queue_manager.health(),
        "notifications": notification_service.status(),
        "rate_limits": rate_limiter.status(),
    }




@router.post("/tasks", summary="提交异步任务")
async def create_task(request: TaskRequest, user: Dict[str, Any] = Depends(get_current_user_optional)):
    payload = {**request.payload, "submitted_by": user.get("sub")}
    return task_queue_manager.submit(
        name=request.name,
        payload=payload,
        backend=request.execution_backend,
    )


@router.get("/tasks", summary="查看任务队列")
async def list_tasks(
    limit: int = Query(default=50, ge=1, le=500),
    cursor: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    execution_backend: Optional[str] = Query(default=None),
    task_view: Optional[str] = Query(default=None),
    sort_by: Optional[str] = Query(default=None),
    sort_direction: Optional[str] = Query(default=None),
):
    try:
        return task_queue_manager.list_tasks_page(
            limit=limit,
            cursor=cursor,
            status=status,
            execution_backend=execution_backend,
            task_view=task_view,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/tasks/{task_id}", summary="查看任务状态")
async def get_task(task_id: str):
    task = task_queue_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/tasks/{task_id}/cancel", summary="取消异步任务")
async def cancel_task(task_id: str, user: Dict[str, Any] = Depends(get_current_user_optional)):
    task = task_queue_manager.cancel(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return {
        "cancelled_by": user.get("sub"),
        "task": task,
    }


@router.post("/rate-limits", summary="更新按用户 / 按端点限流规则")
async def update_rate_limits(
    request: RateLimitUpdateRequest,
    user: Dict[str, Any] = Depends(get_current_user_optional),
):
    rate_limiter.configure_defaults(
        requests_per_minute=request.default_requests_per_minute,
        burst_size=request.default_burst_size,
    )
    configured = rate_limiter.configure_endpoint_rules([item.model_dump() for item in request.rules])
    return {
        "updated_by": user.get("sub"),
        "default_rule": {
            "requests_per_minute": request.default_requests_per_minute,
            "burst_size": request.default_burst_size,
        },
        "rules": configured,
        "status": rate_limiter.status(),
    }


@router.post("/persistence/records", summary="写入持久化记录")
async def put_record(request: RecordRequest, user: Dict[str, Any] = Depends(get_current_user_optional)):
    payload = {**request.payload, "_meta": {**(request.payload.get("_meta") or {}), "updated_by": user.get("sub")}}
    return persistence_manager.put_record(
        record_type=request.record_type,
        record_key=request.record_key,
        payload=payload,
        record_id=request.record_id,
    )


@router.get("/persistence/records", summary="读取持久化记录")
async def list_records(
    record_type: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    return {"records": persistence_manager.list_records(record_type=record_type, limit=limit)}


@router.get("/persistence/diagnostics", summary="查看数据库 / TimescaleDB 接入诊断")
async def get_persistence_diagnostics():
    return persistence_manager.persistence_diagnostics()


@router.post("/persistence/bootstrap", summary="初始化 PostgreSQL / TimescaleDB 持久化结构")
async def bootstrap_persistence(
    request: PersistenceBootstrapRequest,
    user: Dict[str, Any] = Depends(get_current_user_optional),
):
    _require_admin_or_bootstrap(user)
    try:
        result = persistence_manager.bootstrap_postgres(enable_timescale_schema=request.enable_timescale_schema)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "bootstrapped_by": user.get("sub"),
        **result,
    }


@router.get("/persistence/migration/preview", summary="预览 SQLite fallback -> PostgreSQL 迁移")
async def preview_persistence_migration(sqlite_path: Optional[str] = Query(default=None)):
    return persistence_manager.preview_sqlite_fallback_migration(sqlite_path=sqlite_path)


@router.post("/persistence/migration/run", summary="执行 SQLite fallback -> PostgreSQL 迁移")
async def run_persistence_migration(
    request: PersistenceMigrationRequest,
    user: Dict[str, Any] = Depends(get_current_user_optional),
):
    _require_admin_or_bootstrap(user)
    if not request.include_records and not request.include_timeseries:
        raise HTTPException(status_code=400, detail="At least one of include_records or include_timeseries must be true")
    result = persistence_manager.migrate_sqlite_fallback_to_postgres(
        sqlite_path=request.sqlite_path,
        dry_run=request.dry_run,
        include_records=request.include_records,
        include_timeseries=request.include_timeseries,
        dedupe_timeseries=request.dedupe_timeseries,
        record_limit=request.record_limit,
        timeseries_limit=request.timeseries_limit,
    )
    return {
        "triggered_by": user.get("sub"),
        **result,
    }


@router.post("/persistence/timeseries", summary="写入时序记录")
async def put_timeseries(request: TimeSeriesRequest):
    return persistence_manager.put_timeseries(
        series_name=request.series_name,
        symbol=request.symbol,
        timestamp=request.timestamp,
        value=request.value,
        payload=request.payload,
    )


@router.get("/persistence/timeseries", summary="读取时序记录")
async def list_timeseries(
    series_name: Optional[str] = Query(default=None),
    symbol: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
):
    return {
        "timeseries": persistence_manager.list_timeseries(
            series_name=series_name,
            symbol=symbol,
            limit=limit,
        )
    }


@router.post("/config-versions", summary="保存配置版本")
async def save_config_version(request: ConfigVersionRequest, user: Dict[str, Any] = Depends(get_current_user_optional)):
    existing = _list_config_records(request.owner_id, request.config_type, request.config_key, limit=200)
    next_version = len(existing) + 1
    record_type = _config_record_type(request.owner_id, request.config_type, request.config_key)
    record_id = f"{record_type}:v{next_version}"
    return persistence_manager.put_record(
        record_type=record_type,
        record_key=f"v{next_version}",
        record_id=record_id,
        payload={
            "owner_id": request.owner_id,
            "config_type": request.config_type,
            "config_key": request.config_key,
            "version": next_version,
            "payload": request.payload,
            "created_by": user.get("sub"),
        },
    )


@router.get("/config-versions", summary="读取配置版本")
async def list_config_versions(
    config_type: str = Query(...),
    config_key: str = Query(...),
    owner_id: str = Query(default="default"),
    limit: int = Query(default=20, ge=1, le=200),
):
    record_type = _config_record_type(owner_id, config_type, config_key)
    return {"versions": persistence_manager.list_records(record_type=record_type, limit=limit)}


@router.get("/config-versions/diff", summary="对比配置版本")
async def diff_config_versions(
    config_type: str = Query(...),
    config_key: str = Query(...),
    from_version: int = Query(..., ge=1),
    to_version: int = Query(..., ge=1),
    owner_id: str = Query(default="default"),
):
    left = _find_config_record(owner_id, config_type, config_key, from_version)
    right = _find_config_record(owner_id, config_type, config_key, to_version)
    if not left or not right:
        raise HTTPException(status_code=404, detail="Config version not found")

    left_payload = (left.get("payload") or {}).get("payload") or {}
    right_payload = (right.get("payload") or {}).get("payload") or {}
    changes = _diff_payloads(left_payload, right_payload)
    return {
        "config_type": config_type,
        "config_key": config_key,
        "owner_id": owner_id,
        "from_version": from_version,
        "to_version": to_version,
        "change_count": len(changes),
        "changes": changes,
    }


@router.post("/config-versions/restore", summary="从历史配置恢复为新版本")
async def restore_config_version(request: ConfigRestoreRequest, user: Dict[str, Any] = Depends(get_current_user_optional)):
    source_record = _find_config_record(
        request.owner_id,
        request.config_type,
        request.config_key,
        request.version,
    )
    if not source_record:
        raise HTTPException(status_code=404, detail="Config version not found")

    existing = _list_config_records(request.owner_id, request.config_type, request.config_key, limit=200)
    next_version = len(existing) + 1
    record_type = _config_record_type(request.owner_id, request.config_type, request.config_key)
    record_id = f"{record_type}:v{next_version}"
    source_payload = source_record.get("payload") or {}
    return persistence_manager.put_record(
        record_type=record_type,
        record_key=f"v{next_version}",
        record_id=record_id,
        payload={
            "owner_id": request.owner_id,
            "config_type": request.config_type,
            "config_key": request.config_key,
            "version": next_version,
            "payload": source_payload.get("payload") or {},
            "created_by": user.get("sub"),
            "restored_from": request.version,
        },
    )


@router.post("/notifications/test", summary="测试通知通道")
async def test_notification(request: NotificationRequest, user: Dict[str, Any] = Depends(get_current_user_optional)):
    payload = {
        "source": "infrastructure_test",
        "title": request.payload.get("title") or "Quant notification test",
        "message": request.payload.get("message") or f"Triggered by {user.get('sub')}",
        **request.payload,
    }
    return await asyncio.to_thread(notification_service.send, request.channel, payload)


@router.post("/notifications/channels", summary="保存通知渠道")
async def save_notification_channel(request: NotificationChannelRequest):
    try:
        return notification_service.save_channel(request.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/notifications/channels/{channel_id}", summary="删除通知渠道")
async def delete_notification_channel(channel_id: str):
    return notification_service.delete_channel(channel_id)

"""持久化记录 / 时序 / 迁移路由（``/persistence/*``，8 个 handler）。

涵盖 record CRUD、TimescaleDB 时序读写、PostgreSQL bootstrap 与
SQLite-fallback → PostgreSQL 迁移。所有 handler 都直接调用
``persistence_manager`` 顶层方法。
"""

from __future__ import annotations
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from backend.app.core.auth import get_current_user_optional
from backend.app.core.persistence import persistence_manager

from ._helpers import _require_admin, _require_admin_or_bootstrap

router = APIRouter()


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


@router.post("/persistence/records", summary="写入持久化记录")
async def put_record(request: RecordRequest, user: Dict[str, Any] = Depends(get_current_user_optional)):
    _require_admin(user)
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
    http_request: Request,
    user: Dict[str, Any] = Depends(get_current_user_optional),
):
    _require_admin_or_bootstrap(user, http_request)
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
    _require_admin(user)
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
async def put_timeseries(
    request: TimeSeriesRequest,
    user: Dict[str, Any] = Depends(get_current_user_optional),
):
    _require_admin(user)
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

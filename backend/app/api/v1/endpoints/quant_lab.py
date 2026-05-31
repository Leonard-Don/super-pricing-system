"""Quant Lab endpoints for advanced research extensions."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from backend.app.core.task_queue import task_queue_manager
from backend.app.services.quant_lab import quant_lab_service
from backend.app.core.error_handler import PUBLIC_INTERNAL_ERROR_DETAIL

router = APIRouter()
logger = logging.getLogger(__name__)


class TradingJournalUpdateRequest(BaseModel):
    notes: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    strategy_lifecycle: List[Dict[str, Any]] = Field(default_factory=list)


class AlertOrchestrationUpdateRequest(BaseModel):
    composite_rules: List[Dict[str, Any]] = Field(default_factory=list)
    channels: List[Dict[str, Any]] = Field(default_factory=list)
    module_alerts: List[Dict[str, Any]] = Field(default_factory=list)
    history_entry: Optional[Dict[str, Any]] = None
    history_updates: List[Dict[str, Any]] = Field(default_factory=list)


class AlertEventPublishRequest(BaseModel):
    source_module: str = "manual"
    rule_name: str
    symbol: str = ""
    severity: str = "info"
    message: str = ""
    condition_summary: str = ""
    condition: Optional[str] = None
    trigger_value: Optional[float] = None
    threshold: Optional[float] = None
    rule_ids: List[str] = Field(default_factory=list)
    notify_channels: List[str] = Field(default_factory=list)
    create_workbench_task: bool = False
    workbench_task_type: str = "cross_market"
    workbench_status: str = "new"
    persist_event_record: bool = True
    cascade_actions: List[Dict[str, Any]] = Field(default_factory=list)


class AlertActionResolutionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    alert_id: Any = Field(
        default=None,
        validation_alias=AliasChoices("alert_id", "target_alert_id", "targetAlertId", "id"),
    )
    action: str = Field(
        validation_alias=AliasChoices("action", "action_type", "actionType", "resolution_action", "resolutionAction"),
    )
    note: Optional[str] = None
    snoozed_until: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("snoozed_until", "snoozedUntil", "snooze_until", "snoozeUntil"),
    )
    source_action_id: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("source_action_id", "sourceActionId", "next_action_id", "nextActionId"),
    )


class ValuationLabRequest(BaseModel):
    symbol: str
    period: str = "1y"
    peer_symbols: List[str] = Field(default_factory=list)
    peer_limit: int = Field(default=6, ge=2, le=12)


class FactorExpressionRequest(BaseModel):
    symbol: str
    expression: str = "rank(close / sma(close, 20)) + rank(volume / sma(volume, 20))"
    period: str = "1y"
    preview_rows: int = Field(default=30, ge=5, le=120)


def _raise_500(label: str, exc: Exception) -> None:
    logger.error("%s failed: %s", label, exc, exc_info=True)
    raise HTTPException(status_code=500, detail=PUBLIC_INTERNAL_ERROR_DETAIL) from exc


async def _run_quant_lab_service(
    label: str,
    func: Callable[..., Dict[str, Any]],
    *args: Any,
    value_error_status: Optional[int] = None,
) -> Dict[str, Any]:
    try:
        return await asyncio.to_thread(func, *args)
    except ValueError as exc:
        if value_error_status is None:
            _raise_500(label, exc)
        raise HTTPException(status_code=value_error_status, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - safety net
        _raise_500(label, exc)


def _submit_async_quant_task(task_name: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    task = task_queue_manager.submit(
        name=task_name,
        payload={
            **payload,
            "task_origin": "quant_lab",
        },
        backend="auto",
    )
    return {
        "task": task,
        "execution_backend": task.get("execution_backend"),
        "message": "quant task queued",
    }


@router.get("/trading-journal", summary="交易日志与绩效追踪")
async def get_trading_journal(profile_id: Optional[str] = Query(default=None)):
    return await _run_quant_lab_service(
        "trading journal",
        quant_lab_service.get_trading_journal,
        profile_id,
    )


@router.put("/trading-journal", summary="更新交易日志扩展信息")
async def update_trading_journal(
    payload: TradingJournalUpdateRequest,
    profile_id: Optional[str] = Query(default=None),
):
    return await _run_quant_lab_service(
        "update trading journal",
        quant_lab_service.update_trading_journal,
        payload.model_dump(),
        profile_id,
    )


@router.get("/alerts", summary="智能告警编排中心")
async def get_alert_orchestration(profile_id: Optional[str] = Query(default=None)):
    return await _run_quant_lab_service(
        "alert orchestration",
        quant_lab_service.get_alert_orchestration,
        profile_id,
    )


@router.put("/alerts", summary="更新智能告警编排")
async def update_alert_orchestration(
    payload: AlertOrchestrationUpdateRequest,
    profile_id: Optional[str] = Query(default=None),
):
    return await _run_quant_lab_service(
        "update alert orchestration",
        quant_lab_service.update_alert_orchestration,
        payload.model_dump(exclude_unset=True),
        profile_id,
    )


@router.post("/alerts/action", summary="确认、暂缓或关闭告警动作")
async def apply_alert_action(
    payload: AlertActionResolutionRequest,
    profile_id: Optional[str] = Query(default=None),
):
    return await _run_quant_lab_service(
        "apply alert action",
        quant_lab_service.apply_alert_action,
        payload.model_dump(),
        profile_id,
        value_error_status=400,
    )


@router.post("/alerts/publish", summary="发布统一告警事件并执行级联动作")
async def publish_alert_event(
    payload: AlertEventPublishRequest,
    profile_id: Optional[str] = Query(default=None),
):
    return await _run_quant_lab_service(
        "publish alert event",
        quant_lab_service.publish_alert_event,
        payload.model_dump(),
        profile_id,
        value_error_status=400,
    )


@router.get("/data-quality", summary="数据质量可观测平台")
async def get_data_quality():
    return await _run_quant_lab_service(
        "data quality",
        quant_lab_service.get_data_quality,
    )


@router.post("/valuation-lab", summary="估值历史与多模型集成")
async def run_valuation_lab(request: ValuationLabRequest):
    return await _run_quant_lab_service(
        "valuation lab",
        quant_lab_service.analyze_valuation_lab,
        request.model_dump(),
        value_error_status=400,
    )


@router.post("/valuation-lab/async", summary="异步提交估值实验任务")
async def queue_valuation_lab(request: ValuationLabRequest):
    try:
        return _submit_async_quant_task("quant_valuation_lab", request.model_dump())
    except Exception as exc:  # pragma: no cover - safety net
        _raise_500("queue valuation lab", exc)


@router.post("/factor-expression", summary="自定义因子表达式")
async def evaluate_factor_expression(request: FactorExpressionRequest):
    return await _run_quant_lab_service(
        "factor expression",
        quant_lab_service.evaluate_factor_expression,
        request.model_dump(),
        value_error_status=400,
    )


@router.post("/factor-expression/async", summary="异步提交自定义因子表达式任务")
async def queue_factor_expression(request: FactorExpressionRequest):
    try:
        return _submit_async_quant_task("quant_factor_expression", request.model_dump())
    except Exception as exc:  # pragma: no cover - safety net
        _raise_500("queue factor expression", exc)

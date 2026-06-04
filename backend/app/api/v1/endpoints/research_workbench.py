from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Query

from backend.app.schemas.research_workbench import (
    AltDataCandidateActionResponse,
    AltDataCandidateConvertResponse,
    AltDataCandidateListResponse,
    AltDataCandidateRefreshResponse,
    AltDataCandidateSnoozeRequest,
    ResearchBriefingDistributionRequest,
    ResearchBriefingDryRunRequest,
    ResearchBriefingSendRequest,
    ResearchTaskBulkUpdateRequest,
    ResearchTaskCommentCreateRequest,
    ResearchTaskCreateRequest,
    ResearchTaskFromScreenerRequest,
    ResearchWorkbenchReorderRequest,
    ResearchTaskSnapshotCreateRequest,
    ResearchTaskUpdateRequest,
)
from backend.app.core.error_handler import PUBLIC_INTERNAL_ERROR_DETAIL
from backend.app.services.notification_service import notification_service
from src.data.alternative import get_alt_data_manager
from src.research.alt_data_candidates import (
    VALID_CANDIDATE_STATES,
    candidate_to_task_payload,
    generate_candidates_from_alt_data,
    get_candidate_store,
)
from src.research.workbench import research_workbench_store
from .research_workbench_support import (
    deleted_response,
    ensure_comment_deleted,
    ensure_task,
    success_response,
    validate_reorder_items,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _get_research_workbench():
    return research_workbench_store


def _run_workbench_action(label: str, action):
    try:
        return action()
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to %s: %s", label, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=PUBLIC_INTERNAL_ERROR_DETAIL) from exc


@router.get("/tasks", summary="获取研究工作台任务")
async def list_research_tasks(
    limit: int = Query(default=50, ge=1, le=200),
    type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    source: str | None = Query(default=None),
    view: str | None = Query(default=None),
):
    def _list_action():
        tasks = _get_research_workbench().list_tasks(limit=limit, task_type=type, status=status, source=source, view=view)
        return success_response(tasks, total=len(tasks))

    return _run_workbench_action("list research tasks", _list_action)


@router.post("/tasks", summary="创建研究工作台任务")
async def create_research_task(request: ResearchTaskCreateRequest):
    return _run_workbench_action(
        "create research task",
        lambda: success_response(_get_research_workbench().create_task(request.model_dump())),
    )


@router.post("/tasks/bulk-update", summary="批量更新研究工作台任务")
async def bulk_update_research_tasks(request: ResearchTaskBulkUpdateRequest):
    def _bulk_update_action():
        tasks = _get_research_workbench().bulk_update_tasks(
            request.task_ids,
            status=request.status,
            comment=request.comment,
            author=request.author,
        )
        return success_response(tasks, total=len(tasks))

    return _run_workbench_action("bulk update research tasks", _bulk_update_action)


@router.post("/tasks/from-screener", summary="从定价筛选器候选创建研究任务")
async def create_research_tasks_from_screener(request: ResearchTaskFromScreenerRequest):
    def _create_from_screener_action():
        screener_filters: dict | None = None
        if request.filters is not None:
            dumped = request.filters.model_dump(exclude_none=True)
            screener_filters = {key: value for key, value in dumped.items() if value != ""}
            if not screener_filters:
                screener_filters = None
        tasks = []
        for candidate in request.candidates:
            context = candidate.model_dump(exclude_none=True)
            if screener_filters is not None:
                context["screener_filters"] = screener_filters
            symbol = candidate.symbol.strip().upper()
            company_name = candidate.company_name.strip()
            view = candidate.primary_view.strip()
            title_parts = [symbol]
            if company_name:
                title_parts.append(company_name)
            if view:
                title_parts.append(view)
            task_payload = {
                "type": "pricing",
                "title": "[Pricing] " + " · ".join(title_parts) + " screener review",
                "source": request.source,
                "symbol": symbol,
                "context": context,
                "snapshot": {
                    "headline": f"{symbol} pricing screener candidate",
                    "summary": view or company_name or "Pricing screener candidate",
                    "payload": context,
                },
            }
            tasks.append(_get_research_workbench().create_task(task_payload))
        return success_response(tasks, total=len(tasks))

    return _run_workbench_action("create research tasks from screener", _create_from_screener_action)


@router.get("/tasks/{task_id}", summary="获取研究工作台任务详情")
async def get_research_task(task_id: str):
    task = ensure_task(_get_research_workbench().get_task(task_id), task_id)
    return success_response(task)


@router.get("/tasks/{task_id}/timeline", summary="获取研究任务时间线")
async def get_research_task_timeline(task_id: str):
    timeline = _get_research_workbench().get_timeline(task_id)
    if timeline is None:
        raise HTTPException(status_code=404, detail=f"Research task not found: {task_id}")
    return success_response(timeline)


@router.put("/tasks/{task_id}", summary="更新研究工作台任务")
async def update_research_task(task_id: str, request: ResearchTaskUpdateRequest):
    task = ensure_task(
        _get_research_workbench().update_task(task_id, request.model_dump(exclude_unset=True)),
        task_id,
    )
    return success_response(task)


@router.post("/tasks/{task_id}/comments", summary="为研究任务添加评论")
async def add_research_task_comment(task_id: str, request: ResearchTaskCommentCreateRequest):
    comment = ensure_task(
        _get_research_workbench().add_comment(task_id, body=request.body, author=request.author),
        task_id,
    )
    return success_response(comment)


@router.delete("/tasks/{task_id}/comments/{comment_id}", summary="删除研究任务评论")
async def delete_research_task_comment(task_id: str, comment_id: str):
    ensure_task(_get_research_workbench().get_task(task_id), task_id)

    deleted = _get_research_workbench().delete_comment(task_id, comment_id)
    ensure_comment_deleted(deleted, comment_id)
    return deleted_response(comment_id)


@router.post("/tasks/{task_id}/snapshot", summary="追加研究任务快照")
async def add_research_task_snapshot(task_id: str, request: ResearchTaskSnapshotCreateRequest):
    refresh_priority_event = (
        request.refresh_priority_event.model_dump()
        if request.refresh_priority_event
        else None
    )
    task = ensure_task(
        _get_research_workbench().add_snapshot(
            task_id,
            request.snapshot.model_dump(),
            refresh_priority_event=refresh_priority_event,
        ),
        task_id,
    )
    return success_response(task)


@router.post("/board/reorder", summary="批量更新研究工作台看板顺序")
async def reorder_research_board(request: ResearchWorkbenchReorderRequest):
    validate_reorder_items(request.items)

    tasks = _get_research_workbench().reorder_board([item.model_dump() for item in request.items])
    return success_response(tasks)


@router.get("/briefing/distribution", summary="获取每日简报分发配置")
async def get_research_briefing_distribution():
    return _run_workbench_action(
        "load research briefing distribution",
        lambda: success_response(_get_research_workbench().get_briefing_distribution()),
    )


@router.put("/briefing/distribution", summary="保存每日简报分发配置")
async def update_research_briefing_distribution(request: ResearchBriefingDistributionRequest):
    return _run_workbench_action(
        "update research briefing distribution",
        lambda: success_response(_get_research_workbench().update_briefing_distribution(request.model_dump())),
    )


@router.post("/briefing/dry-run", summary="记录每日简报 dry-run 分发")
async def run_research_briefing_dry_run(request: ResearchBriefingDryRunRequest):
    return _run_workbench_action(
        "record research briefing dry-run",
        lambda: success_response(_get_research_workbench().record_briefing_dry_run(request.model_dump())),
    )


@router.post("/briefing/send", summary="发送每日简报到通知通道")
async def send_research_briefing(request: ResearchBriefingSendRequest):
    payload = request.model_dump()
    configured_state = _get_research_workbench().get_briefing_distribution()
    configured_channels = (
        (configured_state.get("distribution") or {}).get("notification_channels")
        or []
    )
    channels = [
        str(channel or "").strip()
        for channel in (request.channels or configured_channels or ["dry_run"])
        if str(channel or "").strip()
    ]
    if not channels:
        channels = ["dry_run"]

    async def _send_channel(channel: str) -> dict:
        notification_payload = {
            "source": "research_workbench_daily_briefing",
            "severity": "info",
            "title": request.subject or request.headline or "Research Workbench Daily Briefing",
            "message": request.body or request.summary or request.headline,
            "to": request.to_recipients,
            "cc": request.cc_recipients,
            "briefing": {
                "headline": request.headline,
                "summary": request.summary,
                "current_view": request.current_view,
                "team_note": request.team_note,
                "task_count": request.task_count,
            },
        }
        try:
            result = await asyncio.to_thread(notification_service.send, channel, notification_payload)
            return {"channel": channel, **(result if isinstance(result, dict) else {"status": "unknown", "result": result})}
        except Exception as exc:
            logger.error("Failed to send research briefing via %s: %s", channel, exc, exc_info=True)
            return {"channel": channel, "status": "failed", "delivered": False, "reason": str(exc)}

    channel_results = await asyncio.gather(*(_send_channel(channel) for channel in channels))
    delivered_count = sum(1 for result in channel_results if result.get("delivered"))
    failed_count = sum(1 for result in channel_results if result.get("status") == "failed")
    dry_run_count = sum(1 for result in channel_results if result.get("status") == "dry_run")
    if delivered_count == len(channel_results):
        status = "sent"
    elif delivered_count:
        status = "partial"
    elif failed_count:
        status = "failed"
    elif dry_run_count == len(channel_results):
        status = "dry_run"
    else:
        status = "skipped"

    recorded = _get_research_workbench().record_briefing_delivery(
        payload,
        status=status,
        dry_run=status == "dry_run",
        channel_results=channel_results,
        channels=channels,
        error="; ".join(str(result.get("reason") or "") for result in channel_results if result.get("reason")),
    )
    return success_response(recorded)


@router.delete("/tasks/{task_id}", summary="删除研究工作台任务")
async def delete_research_task(task_id: str):
    deleted = _get_research_workbench().delete_task(task_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Research task not found: {task_id}")
    return deleted_response(task_id)


@router.get("/stats", summary="获取研究工作台统计")
async def get_research_task_stats():
    return _run_workbench_action(
        "load research task stats",
        lambda: success_response(_get_research_workbench().get_stats()),
    )


# ---------------------------------------------------------------------------
# Alt-data candidate task queue (Phase E3)
# ---------------------------------------------------------------------------


def _candidate_payload(candidate) -> dict:
    return candidate.to_dict()


def _ensure_candidate(candidate, candidate_id: str):
    if candidate is None:
        raise HTTPException(
            status_code=404,
            detail=f"Alt-data candidate not found: {candidate_id}",
        )
    return candidate


def _ensure_pending_candidate_action(candidate, *, action: str):
    """Lifecycle actions from the pending queue must not rewrite terminal rows."""
    if candidate.state != "pending":
        raise HTTPException(
            status_code=409,
            detail=(
                f"Only pending alt-data candidates can be {action}; "
                f"candidate is {candidate.state}."
            ),
        )
    return candidate


@router.get(
    "/alt-data-candidates",
    summary="列出另类数据候选研究任务",
    response_model=AltDataCandidateListResponse,
)
async def list_alt_data_candidates(
    state: str | None = Query(default=None),
):
    def _list_action():
        if state is not None and state not in VALID_CANDIDATE_STATES:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Invalid candidate state '{state}'. "
                    f"Expected one of {sorted(VALID_CANDIDATE_STATES)}."
                ),
            )
        store = get_candidate_store()
        candidates = store.list_candidates(state=state)
        data = [_candidate_payload(candidate) for candidate in candidates]
        return success_response(data, total=len(data))

    return _run_workbench_action("list alt-data candidates", _list_action)


@router.post(
    "/alt-data-candidates/refresh",
    summary="基于最新另类数据信号刷新候选队列",
    response_model=AltDataCandidateRefreshResponse,
)
async def refresh_alt_data_candidates():
    def _refresh_action():
        manager = get_alt_data_manager()
        store = get_candidate_store()
        new_candidates = generate_candidates_from_alt_data(manager)
        stats = store.reconcile(new_candidates)
        pending = store.list_candidates(state="pending")
        return success_response(
            {
                "stats": stats,
                "pending": [_candidate_payload(candidate) for candidate in pending],
            },
            total=len(pending),
        )

    return _run_workbench_action("refresh alt-data candidates", _refresh_action)


@router.post(
    "/alt-data-candidates/{candidate_id}/convert",
    summary="将另类数据候选转换为研究工作台任务",
    response_model=AltDataCandidateConvertResponse,
)
async def convert_alt_data_candidate(candidate_id: str):
    def _convert_action():
        store = get_candidate_store()
        candidate = _ensure_candidate(store.get_candidate(candidate_id), candidate_id)
        if candidate.state == "converted" and candidate.converted_task_id:
            existing = _get_research_workbench().get_task(candidate.converted_task_id)
            if existing is not None:
                return success_response(
                    {
                        "candidate": _candidate_payload(candidate),
                        "task": existing,
                        "task_id": candidate.converted_task_id,
                        "duplicate": True,
                    }
                )
        if candidate.state != "pending":
            raise HTTPException(
                status_code=409,
                detail=(
                    "Only pending alt-data candidates can be converted; "
                    f"candidate is {candidate.state}."
                ),
            )
        task_payload = candidate_to_task_payload(candidate)
        task = _get_research_workbench().create_task(task_payload)
        task_id = task.get("id", "")
        updated = store.mark_converted(candidate_id, task_id)
        return success_response(
            {
                "candidate": _candidate_payload(updated or candidate),
                "task": task,
                "task_id": task_id,
                "duplicate": False,
            }
        )

    return _run_workbench_action("convert alt-data candidate", _convert_action)


@router.post(
    "/alt-data-candidates/{candidate_id}/dismiss",
    summary="忽略一条另类数据候选",
    response_model=AltDataCandidateActionResponse,
)
async def dismiss_alt_data_candidate(candidate_id: str):
    def _dismiss_action():
        store = get_candidate_store()
        candidate = _ensure_candidate(store.get_candidate(candidate_id), candidate_id)
        _ensure_pending_candidate_action(candidate, action="dismissed")
        candidate = _ensure_candidate(store.dismiss(candidate_id), candidate_id)
        return success_response(_candidate_payload(candidate))

    return _run_workbench_action("dismiss alt-data candidate", _dismiss_action)


@router.post(
    "/alt-data-candidates/{candidate_id}/snooze",
    summary="暂时延后一条另类数据候选",
    response_model=AltDataCandidateActionResponse,
)
async def snooze_alt_data_candidate(
    candidate_id: str,
    request: AltDataCandidateSnoozeRequest,
):
    def _snooze_action():
        store = get_candidate_store()
        existing = _ensure_candidate(store.get_candidate(candidate_id), candidate_id)
        _ensure_pending_candidate_action(existing, action="snoozed")
        try:
            candidate = store.snooze(candidate_id, hours=request.hours)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        candidate = _ensure_candidate(candidate, candidate_id)
        return success_response(_candidate_payload(candidate))

    return _run_workbench_action("snooze alt-data candidate", _snooze_action)

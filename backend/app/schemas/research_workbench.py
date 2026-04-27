"""Schemas for research workbench tasks."""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, model_validator


ResearchTaskStatus = Literal["new", "in_progress", "blocked", "complete", "archived"]
ResearchTaskType = Literal["pricing", "cross_market", "macro_mispricing", "trade_thesis"]


class ResearchTaskSnapshot(BaseModel):
    headline: str = ""
    summary: str = ""
    highlights: List[str] = Field(default_factory=list)
    payload: Dict[str, Any] = Field(default_factory=dict)
    saved_at: str = ""


class ResearchTaskComment(BaseModel):
    id: str
    created_at: str
    author: str = "local"
    body: str


class ResearchTaskTimelineEvent(BaseModel):
    id: str
    created_at: str
    type: str
    label: str
    detail: str = ""
    meta: Dict[str, Any] = Field(default_factory=dict)


class ResearchTaskRefreshPriorityEvent(BaseModel):
    reason_key: str = ""
    reason_label: str = ""
    severity: str = ""
    lead: str = ""
    detail: str = ""
    urgency_score: Optional[float] = None
    priority_weight: Optional[float] = None
    recommendation: str = ""
    summary: str = ""


class ResearchTask(BaseModel):
    id: str
    created_at: str
    updated_at: str
    status: ResearchTaskStatus
    type: ResearchTaskType
    title: str
    source: str = ""
    symbol: str = ""
    template: str = ""
    note: str = ""
    board_order: int = 0
    context: Dict[str, Any] = Field(default_factory=dict)
    snapshot: ResearchTaskSnapshot = Field(default_factory=ResearchTaskSnapshot)
    comments: List[ResearchTaskComment] = Field(default_factory=list)
    timeline: List[ResearchTaskTimelineEvent] = Field(default_factory=list)
    snapshot_history: List[ResearchTaskSnapshot] = Field(default_factory=list)


class ResearchTaskCreateRequest(BaseModel):
    type: ResearchTaskType
    title: str
    status: ResearchTaskStatus = "new"
    source: str = ""
    symbol: str = ""
    template: str = ""
    note: str = ""
    board_order: Optional[int] = None
    context: Dict[str, Any] = Field(default_factory=dict)
    snapshot: Optional[ResearchTaskSnapshot] = None
    refresh_priority_event: Optional[ResearchTaskRefreshPriorityEvent] = None


class ResearchTaskUpdateRequest(BaseModel):
    status: Optional[ResearchTaskStatus] = None
    title: Optional[str] = None
    note: Optional[str] = None
    board_order: Optional[int] = None
    context: Optional[Dict[str, Any]] = None
    snapshot: Optional[ResearchTaskSnapshot] = None
    refresh_priority_event: Optional[ResearchTaskRefreshPriorityEvent] = None


class ResearchTaskCommentCreateRequest(BaseModel):
    author: str = Field(default="local", max_length=100)
    body: str = Field(min_length=1, max_length=5000)


class ResearchTaskSnapshotCreateRequest(BaseModel):
    snapshot: ResearchTaskSnapshot
    refresh_priority_event: Optional[ResearchTaskRefreshPriorityEvent] = None


class ResearchTaskBulkUpdateRequest(BaseModel):
    task_ids: List[str] = Field(default_factory=list, min_length=1, max_length=100)
    status: Optional[ResearchTaskStatus] = None
    comment: str = Field(default="", max_length=5000)
    author: str = Field(default="local", max_length=100)

    @model_validator(mode="after")
    def validate_has_action(self):
        if not self.status and not str(self.comment or "").strip():
            raise ValueError("At least one bulk action is required")
        return self


class ResearchTaskReorderItem(BaseModel):
    task_id: str
    status: ResearchTaskStatus
    board_order: int = Field(ge=0)
    refresh_priority_event: Optional[ResearchTaskRefreshPriorityEvent] = None


class ResearchWorkbenchReorderRequest(BaseModel):
    items: List[ResearchTaskReorderItem] = Field(default_factory=list)


class ResearchBriefingEmailPreset(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(default="", max_length=80)
    to_recipients: str = Field(default="", max_length=2000)
    cc_recipients: str = Field(default="", max_length=2000)


class ResearchBriefingDistributionRequest(BaseModel):
    enabled: bool = False
    send_time: str = Field(default="09:00", max_length=8)
    timezone: str = Field(default="Asia/Shanghai", max_length=80)
    weekdays: List[str] = Field(default_factory=lambda: ["mon", "tue", "wed", "thu", "fri"])
    notification_channels: List[str] = Field(default_factory=lambda: ["dry_run"], max_length=10)
    default_preset_id: str = Field(default="", max_length=80)
    presets: List[ResearchBriefingEmailPreset] = Field(default_factory=list, max_length=20)
    to_recipients: str = Field(default="", max_length=2000)
    cc_recipients: str = Field(default="", max_length=2000)
    team_note: str = Field(default="", max_length=1000)


class ResearchBriefingDryRunRequest(BaseModel):
    subject: str = Field(default="", max_length=300)
    body: str = Field(default="", max_length=20000)
    current_view: str = Field(default="", max_length=1000)
    headline: str = Field(default="", max_length=300)
    summary: str = Field(default="", max_length=2000)
    to_recipients: str = Field(default="", max_length=2000)
    cc_recipients: str = Field(default="", max_length=2000)
    team_note: str = Field(default="", max_length=1000)
    task_count: int = Field(default=0, ge=0)
    channel: str = Field(default="email", max_length=40)


class ResearchBriefingSendRequest(ResearchBriefingDryRunRequest):
    channels: List[str] = Field(default_factory=list, max_length=10)


class ResearchTaskListResponse(BaseModel):
    success: bool
    data: List[ResearchTask] = Field(default_factory=list)
    total: int = 0
    error: Optional[str] = None

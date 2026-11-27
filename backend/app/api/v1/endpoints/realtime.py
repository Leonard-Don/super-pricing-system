"""Realtime preference storage kept for the watchlist report."""

from typing import List

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from backend.app.services.realtime_preferences import realtime_preferences_store

router = APIRouter()


class RealtimePreferencesRequest(BaseModel):
    symbols: List[str] = Field(default_factory=list)
    active_tab: str = "index"
    symbol_categories: dict[str, str] = Field(default_factory=dict)
    watch_groups: List[dict] = Field(default_factory=list)


def _resolve_realtime_profile(request: Request) -> str:
    header_profile = request.headers.get("X-Realtime-Profile")
    if header_profile:
        return header_profile

    query_profile = request.query_params.get("profile_id")
    if query_profile:
        return query_profile

    return "default"


@router.get("/preferences", summary="获取实时行情偏好配置")
async def get_preferences(request: Request):
    profile_id = _resolve_realtime_profile(request)
    return {"success": True, "data": realtime_preferences_store.get_preferences(profile_id=profile_id)}


@router.put("/preferences", summary="更新实时行情偏好配置")
async def update_preferences(payload: RealtimePreferencesRequest, request: Request):
    profile_id = _resolve_realtime_profile(request)
    data = realtime_preferences_store.update_preferences(payload.model_dump(), profile_id=profile_id)
    warnings = data.pop("_warnings", None)
    result = {"success": True, "data": data}
    if warnings:
        result["warnings"] = warnings
    return result

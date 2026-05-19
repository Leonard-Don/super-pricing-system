"""
另类数据 API 端点。
"""

from __future__ import annotations

import logging
import math
import time
from copy import deepcopy
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional

from fastapi import APIRouter, HTTPException, Query

from fastapi import Response

from backend.app.core.bounded_cache import BoundedTTLCache
from src.data.alternative import get_alt_data_manager, get_alt_data_scheduler
from src.data.alternative.health_manifest import (
    refresh_runtime_state,
    summarize_manifest,
)
from src.data.alternative.composite_signal import (
    ARCHIVE_DEFAULT_DAYS_WINDOW as COMPOSITE_ARCHIVE_DEFAULT_DAYS_WINDOW,
    ARCHIVE_MAX_DAYS_WINDOW as COMPOSITE_ARCHIVE_MAX_DAYS_WINDOW,
    composite_signals_to_public_summary,
    detect_composite_signals,
    get_composite_signal_archive,
)
from src.data.alternative.cross_archive_themes import (
    CONVICTION_RANK as CROSS_ARCHIVE_CONVICTION_RANK,
    DEFAULT_DAYS_WINDOW as CROSS_ARCHIVE_DEFAULT_DAYS_WINDOW,
    MAX_DAYS_WINDOW as CROSS_ARCHIVE_MAX_DAYS_WINDOW,
    detect_themes as detect_cross_archive_themes,
    themes_to_public_summary as cross_archive_themes_to_public_summary,
)
from src.data.alternative.macro_briefing import (
    ARCHIVE_DEFAULT_DAYS_WINDOW as MACRO_BRIEFING_ARCHIVE_DEFAULT_DAYS_WINDOW,
    ARCHIVE_MAX_DAYS_WINDOW as MACRO_BRIEFING_ARCHIVE_MAX_DAYS_WINDOW,
    DEFAULT_TIME_WINDOW_DAYS as MACRO_BRIEFING_DEFAULT_WINDOW_DAYS,
    MacroBriefing,
    compose_macro_briefing,
    get_macro_briefing_archive,
)
from src.data.alternative.macro_briefing_delta import (
    compute_macro_briefing_delta,
)
from src.data.alternative.narrative import (
    ARCHIVE_DEFAULT_DAYS_WINDOW,
    ARCHIVE_MAX_DAYS_WINDOW,
    build_alt_data_narrative,
    get_narrative_archive,
)
from src.data.alternative.provider_correlation import (
    DEFAULT_DAYS_WINDOW as PROVIDER_CORRELATION_DEFAULT_DAYS_WINDOW,
    MAX_DAYS_WINDOW as PROVIDER_CORRELATION_MAX_DAYS_WINDOW,
    compute_provider_correlation_matrix,
    correlation_matrix_to_public_summary,
)

# Repo-relative URL for the audit doc -- referenced in the /health payload so
# consumers can dig deeper than the manifest's structured fields.
_ALT_DATA_AUDIT_DOC_URL = "docs/alt_data_audit.md"

logger = logging.getLogger(__name__)
router = APIRouter()
_ENDPOINT_CACHE_TTL_SECONDS = 10 * 60
_ENDPOINT_CACHE_HARD_TTL_SECONDS = 6 * _ENDPOINT_CACHE_TTL_SECONDS
_ENDPOINT_CACHE_MAX_ITEMS = 64
_endpoint_cache: BoundedTTLCache[str, Dict[str, Any]] = BoundedTTLCache(
    maxsize=_ENDPOINT_CACHE_MAX_ITEMS,
    max_age_seconds=_ENDPOINT_CACHE_HARD_TTL_SECONDS,
    timestamp_getter=lambda entry: float((entry or {}).get("ts") or 0),
)


def _get_manager():
    return get_alt_data_manager()


def _get_scheduler():
    return get_alt_data_scheduler()


def _get_narrative_archive():
    """Indirection so tests can monkey-patch the archive used by the endpoint."""

    return get_narrative_archive()


def _get_composite_signal_archive():
    """Indirection so tests can monkey-patch the composite-signal archive."""

    return get_composite_signal_archive()


def _get_macro_briefing_archive():
    """Indirection so tests can monkey-patch the macro briefing archive."""

    return get_macro_briefing_archive()


def _compose_today_briefing(manager: Any) -> MacroBriefing:
    """Indirection so tests can stub the live composer output.

    Used by ``GET /alt-data/macro-briefing-delta``. The live path calls
    :func:`compose_macro_briefing` against the registered alt-data
    manager; tests monkey-patch this helper directly to feed canned
    briefings without booting the provider chain.
    """

    return compose_macro_briefing(manager)


def _compose_yesterday_briefing(
    manager: Any, target_date: Optional[str]
) -> Optional[MacroBriefing]:
    """Reconstruct yesterday's macro briefing for the day-over-day diff.

    Phase F5.2 wired this helper up to read from the
    :class:`MacroBriefingArchive` populated each time
    ``GET /alt-data/macro-briefing`` is called. The reconstruction is
    purely "find the most-recent archived row whose UTC date matches
    yesterday and materialise it back into a :class:`MacroBriefing` DTO".

    Parameters
    ----------
    manager
        Reserved for future enrichment paths; the current implementation
        only reads the archive.
    target_date
        ISO-8601 ``YYYY-MM-DD`` string the caller supplied via the
        ``date`` query knob. Defaults to today (UTC) when absent. The
        archive lookup is anchored to ``target_date - 1 day`` so the
        diff baseline is always one day earlier than the today anchor.

    Returns
    -------
    Optional[MacroBriefing]
        The reconstructed yesterday briefing, or ``None`` when no
        archived row matches (cold-start path). The delta endpoint
        surfaces the ``None`` case as ``has_baseline=False``.

    Tests monkey-patch this helper directly to inject a synthetic
    yesterday briefing without waiting for archive rotation.
    """

    _ = manager  # Reserved for future enrichment paths.
    try:
        archive = _get_macro_briefing_archive()
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "Failed to load macro briefing archive: %s", exc, exc_info=True
        )
        return None
    if archive is None:
        return None

    # Anchor the "today" reference. ``target_date`` is a strict
    # ``YYYY-MM-DD`` per the endpoint's FastAPI validator.
    if target_date:
        try:
            today_anchor = datetime.strptime(target_date, "%Y-%m-%d").replace(
                tzinfo=timezone.utc
            )
        except ValueError:
            return None
    else:
        today_anchor = datetime.now(tz=timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
    yesterday_anchor = today_anchor - timedelta(days=1)

    archived = archive.find_for_date(target_date=yesterday_anchor)
    if archived is None:
        return None
    try:
        return archived.to_macro_briefing()
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "Failed to materialise archived macro briefing: %s",
            exc,
            exc_info=True,
        )
        return None


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
        if number != number:
            return default
        return number
    except (TypeError, ValueError):
        return default


def _parse_timestamp(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _record_payload(record: Any) -> Dict[str, Any]:
    if hasattr(record, "to_dict"):
        return record.to_dict()
    if isinstance(record, dict):
        return record
    return {}


def _record_outcome(payload: Dict[str, Any]) -> Optional[bool]:
    metadata_raw = payload.get("metadata")
    metadata: Dict[str, Any] = metadata_raw if isinstance(metadata_raw, dict) else {}
    raw_value_raw = payload.get("raw_value")
    raw_value: Dict[str, Any] = raw_value_raw if isinstance(raw_value_raw, dict) else {}
    candidates = [
        payload.get("outcome"),
        payload.get("hit"),
        metadata.get("outcome"),
        metadata.get("hit"),
        raw_value.get("outcome"),
        raw_value.get("hit"),
    ]
    for candidate in candidates:
        if isinstance(candidate, bool):
            return candidate
        text = str(candidate).strip().lower()
        if text in {"hit", "success", "true", "true_positive", "win", "correct"}:
            return True
        if text in {"miss", "failed", "false", "false_positive", "loss", "wrong"}:
            return False

    realized_return = (
        payload.get("realized_return")
        if payload.get("realized_return") is not None
        else metadata.get("realized_return", raw_value.get("realized_return"))
    )
    if realized_return is not None:
        signal = _safe_float(payload.get("normalized_score"), 0.0)
        return signal * _safe_float(realized_return, 0.0) > 0
    return None


def _proxy_outcome(payload: Dict[str, Any]) -> bool:
    strength = abs(_safe_float(payload.get("normalized_score"), 0.0))
    confidence = _safe_float(payload.get("confidence"), 0.0)
    return strength * confidence >= 0.18


def _get_cached_payload(cache_key: str, *, allow_stale: bool = False) -> Optional[Dict[str, Any]]:
    entry = _endpoint_cache.get(cache_key)
    if not entry:
        return None
    age_seconds = max(time.time() - float(entry.get("ts") or 0), 0.0)
    if not allow_stale and age_seconds > _ENDPOINT_CACHE_TTL_SECONDS:
        return None
    payload = deepcopy(entry.get("data") or {})
    if isinstance(payload, dict):
        payload["execution"] = {
            **(payload.get("execution") or {}),
            "cache_status": "stale" if age_seconds > _ENDPOINT_CACHE_TTL_SECONDS else "fresh",
            "cache_age_seconds": round(age_seconds, 1),
        }
    return payload


def _set_cached_payload(cache_key: str, payload: Dict[str, Any]) -> None:
    _endpoint_cache[cache_key] = {
        "data": deepcopy(payload),
        "ts": time.time(),
    }


def _summarize_signal_group(rows: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    items = list(rows)
    if not items:
        return {
            "count": 0,
            "avg_strength": 0.0,
            "avg_abs_strength": 0.0,
            "avg_confidence": 0.0,
            "hit_rate": None,
            "hit_rate_type": "none",
        }

    realized = [item["outcome"] for item in items if item.get("outcome") is not None]
    hit_values = realized if realized else [item["proxy_outcome"] for item in items]
    hit_rate_type = "realized" if realized else "proxy"
    avg_strength = sum(item["strength"] for item in items) / len(items)
    avg_abs_strength = sum(abs(item["strength"]) for item in items) / len(items)
    avg_confidence = sum(item["confidence"] for item in items) / len(items)

    return {
        "count": len(items),
        "avg_strength": round(avg_strength, 4),
        "avg_abs_strength": round(avg_abs_strength, 4),
        "avg_confidence": round(avg_confidence, 4),
        "hit_rate": round(sum(1 for hit in hit_values if hit) / len(hit_values), 4) if hit_values else None,
        "hit_rate_type": hit_rate_type,
    }


@router.get("/snapshot", summary="另类数据作战快照")
async def get_alt_data_snapshot(refresh: bool = Query(default=False)):
    try:
        return _get_manager().get_dashboard_snapshot(refresh=refresh)
    except Exception as exc:
        logger.error("Failed to load alt-data snapshot: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/signals", summary="另类数据统一信号", deprecated=True)
async def get_alt_signals(
    category: Optional[str] = Query(default=None),
    timeframe: str = Query(default="7d"),
    refresh: bool = Query(default=False),
):
    try:
        manager = _get_manager()
        if refresh:
            manager.refresh_all(force=True)
        return manager.get_alt_signals(
            category=category,
            timeframe=timeframe,
            refresh_if_empty=True,
        )
    except Exception as exc:
        logger.error("Failed to load alt-data signals: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/providers", summary="另类数据提供器状态", deprecated=True)
async def get_alt_providers():
    try:
        manager = _get_manager()
        return {
            "providers": manager.get_provider_status(),
            "refresh_status": manager.get_refresh_status_dict(),
            "provider_health": manager._build_provider_health(),
        }
    except Exception as exc:
        logger.error("Failed to load alt-data providers: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/status", summary="另类数据治理状态")
async def get_alt_data_status():
    try:
        manager = _get_manager()
        return manager.get_status(scheduler_status=_get_scheduler().get_status())
    except Exception as exc:
        logger.error("Failed to load alt-data status: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/refresh", summary="手动刷新另类数据")
async def refresh_alt_data(provider: str = Query(default="all")):
    try:
        manager = _get_manager()
        if provider == "all":
            return manager.refresh_all(force=True)
        if provider not in manager.providers:
            raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")
        signal = manager.refresh_provider(provider, force=True)
        status = manager.refresh_status[provider].to_dict()
        snapshot = manager.get_dashboard_snapshot(refresh=False)
        return {
            "requested_provider": provider,
            "status": "success" if status["status"] == "success" else "partial",
            "ok": status["status"] == "success",
            "signals": {provider: signal},
            "refresh_status": {provider: status},
            "snapshot_timestamp": snapshot.get("snapshot_timestamp"),
            "completed_at": snapshot.get("snapshot_timestamp"),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to refresh alt-data: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/history", summary="另类数据历史记录")
async def get_alt_data_history(
    category: Optional[str] = Query(default=None),
    timeframe: str = Query(default="30d"),
    limit: int = Query(default=50, ge=1, le=500),
):
    try:
        manager = _get_manager()
        category_value = category.strip() if isinstance(category, str) and category.strip() else None
        records = manager.get_records(category=category_value, timeframe=timeframe, limit=limit)
        history_analysis = manager.analyze_history(records)
        snapshot = manager.get_dashboard_snapshot(refresh=False)
        return {
            "records": [record.to_dict() for record in records],
            "count": len(records),
            "category": category_value,
            "timeframe": timeframe,
            "snapshot_timestamp": snapshot.get("snapshot_timestamp"),
            "category_series": history_analysis.get("category_series", {}),
            "category_trends": history_analysis.get("category_trends", {}),
            "overall_trend": history_analysis.get("overall_trend", {}),
            "evidence_summary": manager.build_evidence_summary(records, limit=8),
        }
    except Exception as exc:
        logger.error("Failed to load alt-data history: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/diagnostics/signals", summary="另类数据信号命中率与衰减诊断")
async def get_alt_signal_diagnostics(
    category: Optional[str] = Query(default=None),
    timeframe: str = Query(default="90d"),
    limit: int = Query(default=300, ge=1, le=1000),
    half_life_days: float = Query(default=14.0, gt=0.1, le=365),
):
    cache_key = f"alt_signal_diagnostics:v1:{category or ''}:{timeframe}:{limit}:{half_life_days}"
    cached = _get_cached_payload(cache_key)
    if cached is not None:
        return cached
    try:
        manager = _get_manager()
        category_value = category.strip() if isinstance(category, str) and category.strip() else None
        records = manager.get_records(category=category_value, timeframe=timeframe, limit=limit)
        now = datetime.now()
        normalized_rows: List[Dict[str, Any]] = []

        for record in records:
            payload = _record_payload(record)
            timestamp = _parse_timestamp(payload.get("timestamp")) or now
            age_days = max((now - timestamp).total_seconds() / 86400.0, 0.0)
            strength = _safe_float(payload.get("normalized_score"), 0.0)
            confidence = _safe_float(payload.get("confidence"), 0.0)
            outcome = _record_outcome(payload)
            decay_weight = math.exp(-math.log(2) * age_days / half_life_days)
            normalized_rows.append({
                "record_id": payload.get("record_id") or f"record_{len(normalized_rows)}",
                "timestamp": timestamp.isoformat(),
                "source": payload.get("source") or payload.get("provider") or "unknown",
                "category": payload.get("category") or "unknown",
                "strength": strength,
                "confidence": confidence,
                "age_days": round(age_days, 2),
                "decay_weight": round(decay_weight, 4),
                "decayed_strength": round(strength * confidence * decay_weight, 6),
                "outcome": outcome,
                "proxy_outcome": _proxy_outcome(payload),
                "tags": payload.get("tags") or [],
            })

        by_provider: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        by_category: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for row in normalized_rows:
            by_provider[row["source"]].append(row)
            by_category[row["category"]].append(row)

        provider_rows = [
            {
                "provider": provider,
                **_summarize_signal_group(rows),
            }
            for provider, rows in sorted(by_provider.items())
        ]
        category_rows = [
            {
                "category": category_name,
                **_summarize_signal_group(rows),
            }
            for category_name, rows in sorted(by_category.items())
        ]

        decay_curve = []
        max_age = max([row["age_days"] for row in normalized_rows], default=0.0)
        for day in range(0, int(max(half_life_days * 3, max_age)) + 1, max(1, int(half_life_days // 3) or 1)):
            weight = math.exp(-math.log(2) * day / half_life_days)
            weighted_strengths = [
                abs(row["strength"]) * row["confidence"] * weight
                for row in normalized_rows
            ]
            decay_curve.append({
                "age_days": day,
                "decay_weight": round(weight, 4),
                "avg_decayed_signal": round(sum(weighted_strengths) / len(weighted_strengths), 6) if weighted_strengths else 0.0,
            })

        realized_count = sum(1 for row in normalized_rows if row.get("outcome") is not None)
        snapshot = manager.get_dashboard_snapshot(refresh=False)
        payload = {
            "status": "ok" if normalized_rows else "empty",
            "category": category_value,
            "timeframe": timeframe,
            "limit": limit,
            "half_life_days": half_life_days,
            "record_count": len(normalized_rows),
            "realized_outcome_count": realized_count,
            "hit_rate_note": (
                "存在已实现 outcome/realized_return 字段时使用真实命中率；否则使用 strength*confidence 阈值作为 proxy hit rate。"
            ),
            "overall": _summarize_signal_group(normalized_rows),
            "providers": provider_rows,
            "categories": category_rows,
            "decay_curve": decay_curve,
            "recent_records": normalized_rows[:20],
            "snapshot_timestamp": snapshot.get("snapshot_timestamp"),
        }
        _set_cached_payload(cache_key, payload)
        return payload
    except Exception as exc:
        logger.error("Failed to load alt-data signal diagnostics: %s", exc, exc_info=True)
        stale = _get_cached_payload(cache_key, allow_stale=True)
        if stale is not None:
            return stale
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/health", summary="另类数据组件健康清单")
async def get_alt_data_health():
    """Return the structured per-component verdict manifest at runtime.

    This is the machine-readable mirror of the per-component verdict table
    in ``docs/alt_data_audit.md`` § 2, overlaid with the actual
    ``last_refresh_at`` mtime of each provider's snapshot file. Consumers
    can use this to answer *"which alt-data components are currently
    PRODUCTION / WORKING-PROTOTYPE, and when did each last refresh"* without
    parsing markdown.
    """

    try:
        manager = _get_manager()
        manifest = refresh_runtime_state(manager)
        summary = summarize_manifest(manifest)
        return {
            "manifest": [component.to_dict() for component in manifest],
            "generated_at": datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat(),
            "audit_doc_url": _ALT_DATA_AUDIT_DOC_URL,
            **summary,
        }
    except Exception as exc:
        logger.error("Failed to load alt-data health manifest: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/narrative", summary="另类数据 2-3 句要点摘要")
async def get_alt_data_narrative(
    response: Response,
    industry: Optional[str] = Query(
        None,
        description=(
            "Optional industry label (e.g. ``新能源汽车``). When supplied, "
            "policy_radar signals are filtered to that industry and "
            "macro_hf inventory is filtered to commodities relevant to "
            "it. Industries without coverage return the degraded "
            "\"本行业暂无显著另类数据信号\" copy."
        ),
        max_length=64,
    ),
):
    """Return a deterministic 2-3 sentence narrative over the current alt-data layer.

    Synthesis is strictly deterministic (no LLM call) and is driven by
    the manager's ``latest_signals`` plus per-component snapshot mtime.
    The response carries ``Cache-Control: max-age=300`` to mirror the
    5-minute freshness budget; consumers polling more often than that
    should expect the same payload back.

    ``industry`` is the Phase E2.1 extension that lets the Pricing Gap
    page surface industry-scoped narrative alongside CAPM/FF3/DCF.

    Documented in ``docs/alt_data_audit.md`` § 11 (Phase E2).
    """

    try:
        manager = _get_manager()
        ticker_industry = (industry or "").strip() or None
        narrative = build_alt_data_narrative(
            manager,
            ticker_industry=ticker_industry,
        )
        # Phase E4: persist every endpoint-driven generation to the
        # JSONL archive so the frontend timeline view can render the
        # evolution of alt-data picture over the last 14 days.
        try:
            archive = _get_narrative_archive()
            if archive is not None:
                archive.append(narrative, industry=ticker_industry)
        except Exception as archive_exc:  # pragma: no cover - defensive
            logger.warning(
                "Failed to archive alt-data narrative: %s",
                archive_exc,
                exc_info=True,
            )
        response.headers["Cache-Control"] = "max-age=300"
        payload = narrative.to_dict()
        payload["audit_doc_url"] = _ALT_DATA_AUDIT_DOC_URL
        payload["industry_scope"] = ticker_industry
        return payload
    except Exception as exc:
        logger.error("Failed to build alt-data narrative: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get(
    "/narrative/history",
    summary="另类数据要点摘要历史归档（最近 N 天）",
)
async def get_alt_data_narrative_history(
    days: int = Query(
        default=ARCHIVE_DEFAULT_DAYS_WINDOW,
        ge=1,
        le=ARCHIVE_MAX_DAYS_WINDOW,
        description=(
            "Lookback window in days. Clamped to "
            f"[1, {ARCHIVE_MAX_DAYS_WINDOW}]; default {ARCHIVE_DEFAULT_DAYS_WINDOW}."
        ),
    ),
    industry: Optional[str] = Query(
        None,
        description=(
            "Optional industry label. When supplied, filters archived "
            "narratives to those originally generated with this "
            "``industry`` scope. Empty / null matches every row."
        ),
        max_length=64,
    ),
):
    """Return archived alt-data narratives over the last ``days`` days.

    Backs the frontend "narrative trend" mini-view (see
    ``AltDataNarrativeTile`` > 查看历史 drawer). Reads from the JSONL
    archive populated each time ``GET /alt-data/narrative`` is called
    or a scheduled refresh runs. Sorted newest-first.

    Documented in ``docs/alt_data_audit.md`` § 13 (Phase E4).
    """

    try:
        archive = _get_narrative_archive()
        industry_scope = (industry or "").strip() or None
        if archive is None:
            archives_payload: List[Dict[str, Any]] = []
        else:
            entries = archive.recent(days=days, industry=industry_scope)
            archives_payload = [entry.to_dict() for entry in entries]
        return {
            "archives": archives_payload,
            "total": len(archives_payload),
            "days_window": days,
            "industry_scope": industry_scope,
            "audit_doc_url": _ALT_DATA_AUDIT_DOC_URL,
        }
    except Exception as exc:
        logger.error(
            "Failed to load alt-data narrative history: %s", exc, exc_info=True
        )
        raise HTTPException(status_code=500, detail=str(exc))


_CONVICTION_TIER_RANK = {"high": 3, "medium": 2, "low": 1}


@router.get(
    "/composite-signals",
    summary="跨组件高置信复合信号",
)
async def get_composite_signals(
    response: Response,
    min_conviction: str = Query(
        default="medium",
        description=(
            "Minimum conviction tier to return. ``high`` returns only the "
            "4+ strong-component composites; ``medium`` returns 3+ "
            "component agreements; ``low`` includes informational 2-"
            "component agreements."
        ),
        pattern="^(high|medium|low)$",
    ),
    direction: Optional[str] = Query(
        default=None,
        description=(
            "Optional direction filter (``bullish`` or ``bearish``). When "
            "absent, both directions are returned."
        ),
        pattern="^(bullish|bearish)$",
    ),
    limit: int = Query(default=20, ge=1, le=100),
):
    """Return cross-component composite signals over the current alt-data layer.

    Synthesizes per-industry composite signals when 3+ of the 9 alt-data
    providers agree on a direction. Output is deterministic for a given
    snapshot — the detector itself is idempotent — and is sorted by
    ``conviction`` desc then ``aggregate_strength`` desc.

    Documented in ``docs/alt_data_audit.md`` § 17 (Phase F4).
    """

    try:
        manager = _get_manager()
        include_low = min_conviction == "low"
        composites = detect_composite_signals(manager, include_low=include_low)
        # Phase F4.1: persist every detected composite to the JSONL
        # archive so the frontend can render the historical timeline.
        # We persist BEFORE filtering so the archive faithfully reflects
        # what the detector emitted on this snapshot regardless of the
        # caller's ``min_conviction`` / ``direction`` filter knobs.
        # Empty result sets are skipped at the ``append_many`` level so
        # "no composite this refresh" runs never inflate the log.
        try:
            archive = _get_composite_signal_archive()
            if archive is not None and composites:
                archive.append_many(composites)
        except Exception as archive_exc:  # pragma: no cover - defensive
            logger.warning(
                "Failed to archive composite signals: %s",
                archive_exc,
                exc_info=True,
            )
        min_rank = _CONVICTION_TIER_RANK.get(min_conviction, 2)
        filtered = [
            c
            for c in composites
            if _CONVICTION_TIER_RANK.get(c.conviction, 0) >= min_rank
            and (direction is None or c.direction == direction)
        ]
        filtered = filtered[:limit]
        snapshot = manager.get_dashboard_snapshot(refresh=False)
        response.headers["Cache-Control"] = "max-age=300"
        return {
            "composite_signals": [c.to_dict() for c in filtered],
            "total": len(filtered),
            "min_conviction": min_conviction,
            "direction_filter": direction,
            "snapshot_timestamp": snapshot.get("snapshot_timestamp"),
            "audit_doc_url": _ALT_DATA_AUDIT_DOC_URL,
            "tier_summary": {
                "high": sum(1 for c in composites if c.conviction == "high"),
                "medium": sum(1 for c in composites if c.conviction == "medium"),
                "low": sum(1 for c in composites if c.conviction == "low"),
            },
            "public_summary": composite_signals_to_public_summary(composites),
        }
    except Exception as exc:
        logger.error("Failed to detect composite signals: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get(
    "/composite-signals/history",
    summary="跨组件复合信号时间序列归档（最近 N 天）",
)
async def get_composite_signals_history(
    days: int = Query(
        default=COMPOSITE_ARCHIVE_DEFAULT_DAYS_WINDOW,
        ge=1,
        le=COMPOSITE_ARCHIVE_MAX_DAYS_WINDOW,
        description=(
            "Lookback window in days. Clamped to "
            f"[1, {COMPOSITE_ARCHIVE_MAX_DAYS_WINDOW}]; "
            f"default {COMPOSITE_ARCHIVE_DEFAULT_DAYS_WINDOW}."
        ),
    ),
    industry: Optional[str] = Query(
        None,
        description=(
            "Optional industry label (exact-match against ``target`` when "
            "``target_kind == industry``). Empty / null matches every row."
        ),
        max_length=64,
    ),
    min_conviction: Optional[str] = Query(
        None,
        description=(
            "Optional minimum conviction tier (``high`` / ``medium`` / "
            "``low``). When supplied, only archived signals at or above "
            "this tier are returned."
        ),
        pattern="^(high|medium|low)$",
    ),
):
    """Return archived cross-component composite signals over the last ``days`` days.

    Backs the frontend "composite signal trend" mini-view (see
    ``CompositeSignalTile`` > 查看历史 drawer). Reads from the JSONL
    archive populated each time ``GET /alt-data/composite-signals`` is
    called. Sorted newest-first.

    Documented in ``docs/alt_data_audit.md`` § 18 (Phase F4.1).
    """

    try:
        archive = _get_composite_signal_archive()
        industry_scope = (industry or "").strip() or None
        conviction_scope = (min_conviction or "").strip().lower() or None
        if archive is None:
            archives_payload: List[Dict[str, Any]] = []
        else:
            entries = archive.recent(
                days=days,
                industry=industry_scope,
                min_conviction=conviction_scope,
            )
            archives_payload = [entry.to_dict() for entry in entries]
        return {
            "archives": archives_payload,
            "total": len(archives_payload),
            "days_window": days,
            "industry_scope": industry_scope,
            "min_conviction": conviction_scope,
            "audit_doc_url": _ALT_DATA_AUDIT_DOC_URL,
        }
    except Exception as exc:
        logger.error(
            "Failed to load composite signal history: %s", exc, exc_info=True
        )
        raise HTTPException(status_code=500, detail=str(exc))


@router.get(
    "/macro-briefing",
    summary="alt-data 宏观日报合成（5 段式 1 页摘要）",
)
async def get_alt_data_macro_briefing(
    response: Response,
    time_window_days: int = Query(
        default=MACRO_BRIEFING_DEFAULT_WINDOW_DAYS,
        ge=1,
        le=30,
        description=(
            "Lookback window for the brief's '本周' framing. Clamped to "
            "[1, 30]; defaults to 7. Currently informational — per-provider"
            " signals already carry the latest aggregated view."
        ),
    ),
):
    """Compose a deterministic 5-section macro daily briefing.

    Synthesises a 1-page macro brief from **all 10 alt-data providers** plus
    the composite signal detector. Unlike ``/alt-data/narrative`` (which
    only covers policy_radar + macro_hf), this endpoint reads every
    component and produces five sections: policy / capital_flow /
    commodity / governance / composite.

    Synthesis is strictly deterministic (no LLM call) and side-effect
    free; the response carries ``Cache-Control: max-age=300``.

    Documented in ``docs/alt_data_audit.md`` § 19 (Phase F5).
    """

    try:
        manager = _get_manager()
        briefing = compose_macro_briefing(
            manager, time_window_days=time_window_days
        )
        # Phase F5.2: persist every endpoint-driven generation to the
        # JSONL archive so the F5.1 day-over-day delta endpoint can
        # reconstruct yesterday's briefing, and so the frontend can
        # render the historical timeline. The append is a no-op when
        # every section came back empty (mirrors the E4 narrative
        # archive's "skip empty" policy) so a cold-start dashboard
        # poll cannot inflate the log with no-signal rows.
        try:
            archive = _get_macro_briefing_archive()
            if archive is not None:
                archive.append(briefing)
        except Exception as archive_exc:  # pragma: no cover - defensive
            logger.warning(
                "Failed to archive macro briefing: %s",
                archive_exc,
                exc_info=True,
            )
        response.headers["Cache-Control"] = "max-age=300"
        payload = briefing.to_dict()
        payload["audit_doc_url"] = _ALT_DATA_AUDIT_DOC_URL
        return payload
    except Exception as exc:
        logger.error("Failed to compose macro briefing: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get(
    "/macro-briefing/history",
    summary="另类数据宏观日报时间序列归档（最近 N 天）",
)
async def get_alt_data_macro_briefing_history(
    days: int = Query(
        default=MACRO_BRIEFING_ARCHIVE_DEFAULT_DAYS_WINDOW,
        ge=1,
        le=MACRO_BRIEFING_ARCHIVE_MAX_DAYS_WINDOW,
        description=(
            "Lookback window in days. Clamped to "
            f"[1, {MACRO_BRIEFING_ARCHIVE_MAX_DAYS_WINDOW}]; "
            f"default {MACRO_BRIEFING_ARCHIVE_DEFAULT_DAYS_WINDOW}."
        ),
    ),
    time_window_days: Optional[int] = Query(
        None,
        ge=1,
        le=30,
        description=(
            "Optional filter on the composer's stored ``time_window_days`` "
            "field. When supplied, only archived briefings generated with "
            "that exact window are returned. Empty / null matches every row."
        ),
    ),
):
    """Return archived macro briefings over the last ``days`` days.

    Backs the frontend "macro briefing history" mini-view (see
    ``MacroBriefingTile`` > 查看本周历史 drawer). Reads from the JSONL
    archive populated each time ``GET /alt-data/macro-briefing`` is
    called. Sorted newest-first.

    Documented in ``docs/alt_data_audit.md`` § 21 (Phase F5.2).
    """

    try:
        archive = _get_macro_briefing_archive()
        if archive is None:
            archives_payload: List[Dict[str, Any]] = []
        else:
            entries = archive.recent(
                days=days,
                time_window_days=time_window_days,
            )
            archives_payload = [entry.to_dict() for entry in entries]
        return {
            "archives": archives_payload,
            "total": len(archives_payload),
            "days_window": days,
            "time_window_days_filter": time_window_days,
            "audit_doc_url": _ALT_DATA_AUDIT_DOC_URL,
        }
    except Exception as exc:
        logger.error(
            "Failed to load macro briefing history: %s", exc, exc_info=True
        )
        raise HTTPException(status_code=500, detail=str(exc))


@router.get(
    "/macro-briefing-delta",
    summary="另类数据宏观日报今日 vs 昨日变化 (Phase F5.1)",
)
async def get_alt_data_macro_briefing_delta(
    response: Response,
    date: Optional[str] = Query(
        default=None,
        description=(
            "Reference date in ISO-8601 (YYYY-MM-DD). Defaults to today. "
            "Treats the value as the 'today' anchor — the diff baseline "
            "is the briefing one day earlier."
        ),
        max_length=10,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
    ),
):
    """Compute the day-over-day delta on top of the macro daily briefing.

    Composes today's briefing via the same deterministic pipeline as
    ``GET /alt-data/macro-briefing``, then attempts to reconstruct
    yesterday's briefing from the archives. Returns a
    :class:`MacroBriefingDelta` whose sections highlight what
    intensified, reversed, appeared, or dropped vs the prior day.

    When the prior day's briefing cannot be reconstructed the response
    carries ``has_baseline=False`` and an :data:`EMPTY_DELTA_NOTE`
    summary -- the empty-deltas surface intentionally degrades quietly
    so the frontend can render a "no comparison available" tab.

    Synthesis is strictly deterministic and side-effect free; the
    response carries ``Cache-Control: max-age=300``.

    Documented in ``docs/alt_data_audit.md`` § 20 (Phase F5.1).
    """

    try:
        manager = _get_manager()
        today_briefing = _compose_today_briefing(manager)
        yesterday_briefing = _compose_yesterday_briefing(manager, date)
        delta = compute_macro_briefing_delta(
            manager,
            today_briefing=today_briefing,
            yesterday_briefing=yesterday_briefing,
        )
        response.headers["Cache-Control"] = "max-age=300"
        payload = delta.to_dict()
        payload["audit_doc_url"] = _ALT_DATA_AUDIT_DOC_URL
        return payload
    except Exception as exc:
        logger.error(
            "Failed to compute macro briefing delta: %s", exc, exc_info=True
        )
        raise HTTPException(status_code=500, detail=str(exc))


@router.get(
    "/cross-archive-themes",
    summary="跨归档高置信长期叙事主题（Phase F6）",
)
async def get_cross_archive_themes(
    response: Response,
    days_window: int = Query(
        default=CROSS_ARCHIVE_DEFAULT_DAYS_WINDOW,
        ge=1,
        le=CROSS_ARCHIVE_MAX_DAYS_WINDOW,
        description=(
            "Lookback window in days for the cross-archive scan. Clamped "
            f"to [1, {CROSS_ARCHIVE_MAX_DAYS_WINDOW}]; default "
            f"{CROSS_ARCHIVE_DEFAULT_DAYS_WINDOW}."
        ),
    ),
    min_conviction: str = Query(
        default="medium",
        description=(
            "Minimum conviction tier to return. ``high`` returns themes that"
            " appear across all 3 archives with ≥3 days each; ``medium``"
            " additionally returns 2-archive agreements with ≥3 days each;"
            " ``low`` additionally returns single-archive persistent"
            " industries with ≥5 days."
        ),
        pattern="^(high|medium|low)$",
    ),
):
    """Detect cross-archive high-conviction long-running narratives.

    Synthesises themes that appear in MULTIPLE alt-data time-series
    archives (E4 narrative, F4.1 composite signals, F5.2 macro
    briefing) over MULTIPLE days. When the same industry surfaces on
    all three archives for ≥3 days each, the conviction is HIGH --
    materially stronger than any single archive alone.

    Synthesis is strictly deterministic (no LLM call, no network I/O,
    archive-only reads) and idempotent; the response carries
    ``Cache-Control: max-age=300``.

    Documented in ``docs/alt_data_audit.md`` § 22 (Phase F6).
    """

    try:
        themes = detect_cross_archive_themes(days_window=days_window)
        min_rank = CROSS_ARCHIVE_CONVICTION_RANK.get(min_conviction, 2)
        filtered = [
            t
            for t in themes
            if CROSS_ARCHIVE_CONVICTION_RANK.get(t.conviction, 0) >= min_rank
        ]
        response.headers["Cache-Control"] = "max-age=300"
        return {
            "themes": [t.to_dict() for t in filtered],
            "total": len(filtered),
            "days_window": days_window,
            "min_conviction": min_conviction,
            "tier_summary": {
                "high": sum(1 for t in themes if t.conviction == "high"),
                "medium": sum(1 for t in themes if t.conviction == "medium"),
                "low": sum(1 for t in themes if t.conviction == "low"),
            },
            "public_summary": cross_archive_themes_to_public_summary(themes),
            "audit_doc_url": _ALT_DATA_AUDIT_DOC_URL,
        }
    except Exception as exc:
        logger.error(
            "Failed to detect cross-archive themes: %s", exc, exc_info=True
        )
        raise HTTPException(status_code=500, detail=str(exc))


@router.get(
    "/provider-correlation",
    summary="跨 provider 信号相关性分析 (Phase F7)",
)
async def get_provider_correlation(
    response: Response,
    days_window: int = Query(
        default=PROVIDER_CORRELATION_DEFAULT_DAYS_WINDOW,
        ge=1,
        le=PROVIDER_CORRELATION_MAX_DAYS_WINDOW,
        description=(
            "Lookback window in days for the per-provider (industry, day) "
            f"vector extraction. Clamped to "
            f"[1, {PROVIDER_CORRELATION_MAX_DAYS_WINDOW}]; default "
            f"{PROVIDER_CORRELATION_DEFAULT_DAYS_WINDOW}."
        ),
    ),
):
    """Compute pairwise Pearson + Spearman correlations across alt-data providers.

    Answers the question: of the 10 advertised providers, how many
    actually carry **independent** information? Providers whose signals
    move in lockstep (|r_pearson| > 0.85) collapse into one
    "redundancy cluster" so the effective independent provider count
    is the cluster count, not the headline 10.

    Pairs with fewer than 5 aligned ``(industry, utc-day)``
    observations emit ``NaN`` rather than a noisy correlation. The
    response always carries the structurally-valid matrix shape so the
    consumer doesn't need a fallback branch for sparse data.

    Synthesis is strictly deterministic (numpy + scipy-style ranking
    only, no network I/O); response carries
    ``Cache-Control: max-age=300``.

    Documented in ``docs/alt_data_audit.md`` § 23.
    """

    try:
        matrix = compute_provider_correlation_matrix(days_window=days_window)
        response.headers["Cache-Control"] = "max-age=300"
        return {
            **matrix.to_dict(),
            "days_window": days_window,
            "public_summary": correlation_matrix_to_public_summary(matrix),
            "audit_doc_url": _ALT_DATA_AUDIT_DOC_URL,
        }
    except Exception as exc:
        logger.error(
            "Failed to compute provider correlation matrix: %s",
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail=str(exc))

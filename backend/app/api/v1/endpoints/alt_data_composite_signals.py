"""另类数据复合信号 API 端点（从 ``alt_data.py`` 拆出的 composite-signals 主题）。

历史上 ``alt_data.py`` 是仓库最大的单文件（~1463 行）。本模块抽走其中
内聚的「跨组件复合信号」主题——4 个路由 handler：

- ``GET /alt-data/composite-signals``                  — 跨组件高置信复合信号
- ``GET /alt-data/composite-signals/history``          — 复合信号时间序列归档
- ``GET /alt-data/composite-signals-cluster-aware``    — cluster-aware 复合信号 (Phase F8)
- ``GET /alt-data/composite-signal-comparison``        — legacy vs cluster-aware 对比 (Phase F8)

以及它们专用的 ``_CONVICTION_TIER_RANK`` 常量。

零行为变更搬迁：每个 handler 的路径 / 请求 / 响应 schema 完全不变。
``alt_data.router`` 通过 ``include_router`` 把本模块的子 router 合并回去，
对外 OpenAPI surface 不受影响。复合信号归档访问走
``alt_data._get_composite_signal_archive`` —— 测试在 ``alt_data`` 命名空间下
monkey-patch 该 helper，故此处保持从 ``alt_data`` 模块按属性引用。
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query

from fastapi import Response

from backend.app.api.v1.endpoints import alt_data as _alt_data
from backend.app.core.error_handler import PUBLIC_INTERNAL_ERROR_DETAIL
from src.data.alternative.composite_signal import (
    DEFAULT_CLUSTER_THRESHOLD as COMPOSITE_DEFAULT_CLUSTER_THRESHOLD,
    cluster_aware_composite_signals_to_public_summary,
    compare_composite_signal_tiers,
    composite_signals_to_public_summary,
    detect_composite_signals,
    detect_composite_signals_cluster_aware,
)
from src.data.alternative.composite_signal_archive import (
    ARCHIVE_DEFAULT_DAYS_WINDOW as COMPOSITE_ARCHIVE_DEFAULT_DAYS_WINDOW,
    ARCHIVE_MAX_DAYS_WINDOW as COMPOSITE_ARCHIVE_MAX_DAYS_WINDOW,
)

# Repo-relative URL for the audit doc -- referenced in payloads so consumers
# can dig deeper than the structured fields.
_ALT_DATA_AUDIT_DOC_URL = "docs/alt_data_audit.md"

logger = logging.getLogger(__name__)
router = APIRouter()


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
        manager = _alt_data._get_manager()
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
            archive = _alt_data._get_composite_signal_archive()
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
        raise HTTPException(status_code=500, detail=PUBLIC_INTERNAL_ERROR_DETAIL) from exc


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
        archive = _alt_data._get_composite_signal_archive()
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
        raise HTTPException(status_code=500, detail=PUBLIC_INTERNAL_ERROR_DETAIL) from exc


@router.get(
    "/composite-signals-cluster-aware",
    summary="cluster-aware 跨组件复合信号 (Phase F8)",
)
async def get_composite_signals_cluster_aware(
    response: Response,
    days_window: int = Query(
        default=14,
        ge=1,
        le=90,
        description=(
            "Lookback window in days passed through to the correlation "
            "analyzer when it's invoked to build cluster membership. "
            "Clamped to [1, 90]; default 14."
        ),
    ),
    min_conviction: str = Query(
        default="medium",
        description=(
            "Minimum conviction tier under the cluster-aware ruleset. "
            "``high`` returns only 3+ cluster-vote composites; "
            "``medium`` returns 2+ cluster-vote agreements; ``low`` "
            "includes single-cluster signals (potentially many redundant "
            "providers from one derivation chain)."
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
    cluster_threshold: float = Query(
        default=COMPOSITE_DEFAULT_CLUSTER_THRESHOLD,
        ge=0.5,
        le=0.99,
        description=(
            "|r_pearson| floor above which two providers are collapsed "
            "into the same cluster. Defaults to 0.85, the analyzer's "
            "canonical redundancy threshold."
        ),
    ),
    limit: int = Query(default=20, ge=1, le=100),
):
    """Return cluster-aware composite signals over the current alt-data layer.

    Re-counts agreements per redundancy cluster rather than per
    provider, so a "HIGH conviction" emission genuinely means
    "multiple independent information sources agree" rather than
    "many redundant providers from the same derivation chain fired".

    Cluster membership is sourced from the cross-provider correlation
    analyzer (commit 4427016); when the analyzer can't build a matrix
    (sparse archives / numpy unavailable) every provider falls into
    its own singleton cluster, which collapses the cluster-aware tier
    back to the legacy provider-vote tier — the "no evidence of
    redundancy → treat as independent" fallback.

    Documented in ``docs/alt_data_audit.md`` § 24 (Phase F8).
    """

    try:
        manager = _alt_data._get_manager()
        include_low = min_conviction == "low"
        composites = detect_composite_signals_cluster_aware(
            manager,
            cluster_threshold=cluster_threshold,
            days_window=days_window,
            include_low=include_low,
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
            "cluster_threshold": cluster_threshold,
            "days_window": days_window,
            "snapshot_timestamp": snapshot.get("snapshot_timestamp"),
            "audit_doc_url": _ALT_DATA_AUDIT_DOC_URL,
            "tier_summary": {
                "high": sum(1 for c in composites if c.conviction == "high"),
                "medium": sum(1 for c in composites if c.conviction == "medium"),
                "low": sum(1 for c in composites if c.conviction == "low"),
            },
            "public_summary": cluster_aware_composite_signals_to_public_summary(
                composites
            ),
        }
    except Exception as exc:
        logger.error(
            "Failed to detect cluster-aware composite signals: %s",
            exc,
            exc_info=True,
        )
        logger.error("Unhandled server error", exc_info=True)
        raise HTTPException(status_code=500, detail=PUBLIC_INTERNAL_ERROR_DETAIL) from exc


@router.get(
    "/composite-signal-comparison",
    summary="legacy vs cluster-aware 复合信号对比 (Phase F8)",
)
async def get_composite_signal_comparison(
    response: Response,
    days_window: int = Query(
        default=14,
        ge=1,
        le=90,
        description=(
            "Lookback window in days passed through to the correlation "
            "analyzer when building cluster membership."
        ),
    ),
    cluster_threshold: float = Query(
        default=COMPOSITE_DEFAULT_CLUSTER_THRESHOLD,
        ge=0.5,
        le=0.99,
        description=(
            "|r_pearson| floor for collapsing providers into one cluster."
        ),
    ),
):
    """Side-by-side comparison of legacy vs cluster-aware conviction tiers.

    The most useful diagnostic surface: shows where the legacy
    provider-vote logic over-counts redundant providers. Each row
    surfaces both tiers for the same ``(industry, direction)`` pair;
    ``tier_changes`` is the filtered subset where the tier actually
    moved (downgrades surface first, sorted by largest demotion).

    Documented in ``docs/alt_data_audit.md`` § 24 (Phase F8).
    """

    try:
        manager = _alt_data._get_manager()
        comparison = compare_composite_signal_tiers(
            manager,
            cluster_threshold=cluster_threshold,
            days_window=days_window,
            include_low=True,
        )
        snapshot = manager.get_dashboard_snapshot(refresh=False)
        response.headers["Cache-Control"] = "max-age=300"
        return {
            **comparison,
            "days_window": days_window,
            "snapshot_timestamp": snapshot.get("snapshot_timestamp"),
            "audit_doc_url": _ALT_DATA_AUDIT_DOC_URL,
        }
    except Exception as exc:
        logger.error(
            "Failed to compare composite signal tiers: %s",
            exc,
            exc_info=True,
        )
        logger.error("Unhandled server error", exc_info=True)
        raise HTTPException(status_code=500, detail=PUBLIC_INTERNAL_ERROR_DETAIL) from exc

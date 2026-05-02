"""Heatmap / intelligence / network services.

Owns business logic for:
- ``/industries/heatmap`` and ``/industries/heatmap/history``
- ``/industries/intelligence``
- ``/industries/network``

Heavy helpers (history persistence, lifecycle classification, ETF mapping,
cosine similarity, intelligence/network result builders) live here. The
shared module-level state (``_heatmap_history``, ``_heatmap_history_lock``,
``INDUSTRY_ETF_MAP`` and friends) stays in ``_helpers`` so that tests which
patch / introspect those singletons keep working unchanged. We access them
through ``_helpers`` attribute lookup so monkey-patches and updates remain
authoritative.
"""

import json
import logging
import math
from copy import deepcopy
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from backend.app.schemas.industry import (
    HeatmapDataItem,
    HeatmapHistoryItem,
    HeatmapHistoryResponse,
    HeatmapResponse,
    IndustryRotationResponse,
)

from . import _helpers


logger = logging.getLogger(__name__)


# =============================================================================
# ETF / lifecycle / events / similarity
# =============================================================================

def _map_industry_etfs(industry_name: str) -> List[Dict[str, str]]:
    normalized = str(industry_name or "")
    matches: List[Dict[str, str]] = []
    for keyword, etfs in _helpers.INDUSTRY_ETF_MAP.items():
        if keyword in normalized:
            matches.extend(etfs)
    if not matches:
        matches = [{"symbol": "SPY", "market": "US"}, {"symbol": "510300.SS", "market": "CN"}]
    seen = set()
    result = []
    for item in matches:
        key = item["symbol"]
        if key in seen:
            continue
        seen.add(key)
        result.append({**item, "reason": f"{industry_name} ETF proxy"})
    return result


def _classify_industry_lifecycle(row: Dict[str, Any]) -> Dict[str, Any]:
    score = float(row.get("score") or row.get("total_score") or 0)
    momentum = float(row.get("momentum") or 0)
    change_pct = float(row.get("change_pct") or 0)
    flow = float(row.get("money_flow") or row.get("flow_strength") or 0)
    volatility = abs(float(row.get("industry_volatility") or 0))

    if score >= 75 and momentum > 0 and flow >= 0:
        stage = "成长期"
        confidence = min(0.95, 0.55 + score / 200)
    elif score >= 60 and abs(momentum) <= 8 and volatility < 8:
        stage = "成熟期"
        confidence = min(0.9, 0.5 + score / 220)
    elif change_pct < -3 or momentum < -8:
        stage = "衰退期"
        confidence = min(0.9, 0.55 + abs(momentum) / 50)
    else:
        stage = "导入期"
        confidence = 0.55

    return {
        "stage": stage,
        "confidence": round(float(confidence), 3),
        "drivers": {
            "score": round(score, 3),
            "momentum": round(momentum, 3),
            "change_pct": round(change_pct, 3),
            "money_flow": round(flow, 3),
            "volatility": round(volatility, 3),
        },
    }


def _build_industry_events(industry_name: str) -> List[Dict[str, Any]]:
    now = datetime.now()
    base_events = [
        {"name": "财报密集披露窗口", "offset_days": 14, "type": "earnings", "impact": "fundamental"},
        {"name": "月度宏观/行业数据窗口", "offset_days": 20, "type": "macro_data", "impact": "demand"},
        {"name": "政策/监管观察窗口", "offset_days": 35, "type": "policy", "impact": "valuation"},
    ]
    if any(keyword in industry_name for keyword in ("新能源", "光伏", "电池", "汽车")):
        base_events.append({"name": "新能源产业链价格与装机数据", "offset_days": 10, "type": "industry_data", "impact": "margin"})
    if any(keyword in industry_name for keyword in ("半导体", "芯片", "人工智能", "软件")):
        base_events.append({"name": "科技产品发布/供应链景气跟踪", "offset_days": 21, "type": "product_cycle", "impact": "growth"})
    return [
        {
            "date": (now + timedelta(days=item["offset_days"])).strftime("%Y-%m-%d"),
            "title": item["name"],
            "event_type": item["type"],
            "expected_impact": item["impact"],
            "industry_name": industry_name,
        }
        for item in base_events
    ]


def _cosine_similarity(left: List[float], right: List[float]) -> float:
    numerator = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return numerator / (left_norm * right_norm)


# =============================================================================
# Heatmap history persistence
# =============================================================================

def _trim_heatmap_history_payload(payload: list[dict]) -> list[dict]:
    trimmed = list(payload[: _helpers._HEATMAP_HISTORY_MAX_ITEMS])
    while trimmed:
        encoded = json.dumps(trimmed, ensure_ascii=False, indent=2).encode("utf-8")
        if len(encoded) <= _helpers._HEATMAP_HISTORY_MAX_FILE_BYTES:
            break
        trimmed = trimmed[:-1]
    return trimmed


def _load_heatmap_history_from_disk() -> None:
    with _helpers._heatmap_history_lock:
        if _helpers._heatmap_history_loaded:
            return
        try:
            if _helpers._HEATMAP_HISTORY_FILE.exists():
                file_size = _helpers._HEATMAP_HISTORY_FILE.stat().st_size
                with open(_helpers._HEATMAP_HISTORY_FILE, "r", encoding="utf-8") as file:
                    payload = json.load(file)
                    if isinstance(payload, list):
                        _helpers._heatmap_history[:] = _trim_heatmap_history_payload(payload)
                logger.info(
                    "Loaded heatmap history snapshots from disk (%s, snapshots=%s)",
                    _helpers._format_storage_size(file_size),
                    len(_helpers._heatmap_history),
                )
        except Exception as exc:
            logger.warning("Failed to load heatmap history from disk: %s", exc)
        _helpers._heatmap_history_loaded = True


def _persist_heatmap_history_to_disk() -> None:
    try:
        _helpers._HEATMAP_HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
        payload = _trim_heatmap_history_payload(_helpers._heatmap_history)
        _helpers._heatmap_history[:] = payload
        serialized = json.dumps(payload, ensure_ascii=False, indent=2)
        with open(_helpers._HEATMAP_HISTORY_FILE, "w", encoding="utf-8") as file:
            file.write(serialized)
        logger.info(
            "Persisted heatmap history snapshots (%s, snapshots=%s)",
            _helpers._format_storage_size(len(serialized.encode('utf-8'))),
            len(payload),
        )
    except Exception as exc:
        logger.warning("Failed to persist heatmap history: %s", exc)


def _append_heatmap_history(days: int, result: HeatmapResponse):
    if not result or not getattr(result, "industries", None):
        return
    _load_heatmap_history_from_disk()

    entry = {
        "snapshot_id": f"{days}:{result.update_time}",
        "days": days,
        "captured_at": datetime.now().isoformat(),
        "update_time": result.update_time,
        "max_value": result.max_value,
        "min_value": result.min_value,
        "industries": [_helpers._model_to_dict(item) for item in result.industries],
    }

    with _helpers._heatmap_history_lock:
        existing_index = next(
            (
                index for index, item in enumerate(_helpers._heatmap_history)
                if item.get("days") == days and item.get("update_time") == result.update_time
            ),
            -1,
        )
        if existing_index >= 0:
            _helpers._heatmap_history[existing_index] = entry
        else:
            _helpers._heatmap_history.insert(0, entry)
            del _helpers._heatmap_history[_helpers._HEATMAP_HISTORY_MAX_ITEMS:]
        _persist_heatmap_history_to_disk()


# =============================================================================
# Intelligence / network row builders
# =============================================================================

def _build_rows_from_heatmap_history(top_n: int, lookback_days: int) -> tuple[list[dict], dict]:
    _load_heatmap_history_from_disk()
    with _helpers._heatmap_history_lock:
        items = list(_helpers._heatmap_history)

    preferred = next(
        (
            item for item in items
            if int(item.get("days", 0) or 0) == int(lookback_days) and item.get("industries")
        ),
        None,
    )
    if preferred is None:
        preferred = next((item for item in items if item.get("industries")), None)
    if preferred is None:
        return [], {}

    rows: list[dict] = []
    for rank, item in enumerate((preferred.get("industries") or [])[:top_n], 1):
        industry_name = str(item.get("name") or "").strip()
        if not industry_name:
            continue
        change_pct = float(item.get("leadingStockChange") or 0)
        rows.append(
            {
                "rank": rank,
                "industry_name": industry_name,
                "score": float(item.get("total_score") or item.get("value") or 0),
                "total_score": float(item.get("total_score") or item.get("value") or 0),
                "momentum": change_pct,
                "change_pct": change_pct,
                "money_flow": float(item.get("moneyFlow") or 0),
                "flow_strength": float(item.get("netInflowRatio") or 0),
                "industry_volatility": float(item.get("industryVolatility") or 0),
            }
        )
    return rows, {
        "snapshot_days": preferred.get("days"),
        "snapshot_timestamp": preferred.get("update_time") or preferred.get("captured_at"),
    }


def _build_curated_fallback_rows(top_n: int) -> list[dict]:
    rows: list[dict] = []
    seen = set()
    for keyword in _helpers.INDUSTRY_ETF_MAP:
        if keyword in seen:
            continue
        seen.add(keyword)
        rows.append(
            {
                "rank": len(rows) + 1,
                "industry_name": keyword,
                "score": max(58.0, 88.0 - len(rows) * 2.4),
                "total_score": max(58.0, 88.0 - len(rows) * 2.4),
                "momentum": max(-2.0, 7.5 - len(rows) * 0.55),
                "change_pct": max(-2.0, 7.5 - len(rows) * 0.55),
                "money_flow": max(8_000_000.0, 120_000_000.0 - len(rows) * 6_500_000.0),
                "flow_strength": max(0.2, 3.6 - len(rows) * 0.12),
                "industry_volatility": 2.4 + len(rows) * 0.08,
            }
        )
        if len(rows) >= top_n:
            break
    return rows


def _resolve_intelligence_rows_from_fallback(top_n: int, lookback_days: int) -> tuple[list[dict], dict]:
    rows, snapshot_meta = _build_rows_from_heatmap_history(top_n=top_n, lookback_days=lookback_days)
    if rows:
        return rows, _helpers._build_execution_metadata(
            source="heatmap_history",
            degraded=True,
            cache_status="miss",
            fallback_reason="live_rank_skipped",
            snapshot_days=snapshot_meta.get("snapshot_days"),
            snapshot_timestamp=snapshot_meta.get("snapshot_timestamp"),
        )

    rows = _build_curated_fallback_rows(top_n=top_n)
    if rows:
        return rows, _helpers._build_execution_metadata(
            source="curated_defaults",
            degraded=True,
            cache_status="miss",
            fallback_reason="heatmap_history_unavailable",
        )

    return [], {}


def _build_industry_intelligence_result(rows: list[dict], lookback_days: int, execution: Optional[dict] = None) -> dict:
    industries = []
    for row in rows:
        industry_name = row.get("industry_name", "")
        industries.append(
            {
                "industry_name": industry_name,
                "rank": row.get("rank", 0),
                "score": row.get("score", row.get("total_score", 0)),
                "change_pct": row.get("change_pct", 0),
                "money_flow": row.get("money_flow", 0),
                "lifecycle": _classify_industry_lifecycle(row),
                "etf_mapping": _map_industry_etfs(industry_name),
                "event_calendar": _build_industry_events(industry_name),
            }
        )

    payload = {
        "success": True,
        "data": {
            "lookback_days": lookback_days,
            "industries": industries,
            "generated_at": datetime.now().isoformat(),
        },
    }
    if execution:
        payload["data"]["execution"] = execution
    return payload


def _build_industry_network_result(
    rows: list[dict],
    *,
    top_n: int,
    lookback_days: int,
    min_similarity: float,
    execution: Optional[dict] = None,
) -> dict:
    nodes = []
    vectors = {}
    for row in rows:
        name = row.get("industry_name", "")
        score = float(row.get("score", row.get("total_score", 0)) or 0)
        momentum = float(row.get("momentum", 0) or 0)
        change_pct = float(row.get("change_pct", 0) or 0)
        flow = float(row.get("money_flow", row.get("flow_strength", 0)) or 0)
        volatility = float(row.get("industry_volatility", 0) or 0)
        vectors[name] = [
            score / 100,
            momentum / 100,
            change_pct / 20,
            flow / max(abs(flow), 1_000_000_000),
            volatility / 20,
        ]
        nodes.append(
            {
                "id": name,
                "label": name,
                "score": round(score, 3),
                "stage": _classify_industry_lifecycle(row)["stage"],
                "etfs": _map_industry_etfs(name)[:2],
            }
        )

    edges = []
    names = list(vectors.keys())
    for left_index, left_name in enumerate(names):
        for right_name in names[left_index + 1:]:
            similarity = _cosine_similarity(vectors[left_name], vectors[right_name])
            if similarity >= min_similarity:
                edges.append(
                    {
                        "source": left_name,
                        "target": right_name,
                        "weight": round(float(similarity), 4),
                        "relationship": "factor_similarity",
                    }
                )
    edges.sort(key=lambda item: item["weight"], reverse=True)

    payload = {
        "success": True,
        "data": {
            "nodes": nodes,
            "edges": edges[:120],
            "metadata": {
                "top_n": top_n,
                "lookback_days": lookback_days,
                "min_similarity": min_similarity,
                "generated_at": datetime.now().isoformat(),
            },
        },
    }
    if execution:
        payload["data"]["execution"] = execution
    return payload


# =============================================================================
# Endpoint services
# =============================================================================

def get_industry_heatmap(days: int) -> HeatmapResponse:
    cache_key = f"heatmap:v2:{days}"
    try:
        cached = _helpers._get_endpoint_cache(cache_key)
        if cached is not None:
            return cached

        analyzer = _helpers.get_industry_analyzer()
        heatmap_data = analyzer.get_industry_heatmap_data(days=days)

        result = HeatmapResponse(
            industries=[
                HeatmapDataItem(
                    name=ind.get("name", ""),
                    value=ind.get("value", 0),
                    total_score=ind.get("total_score", 0),
                    size=ind.get("size", 0),
                    stockCount=ind.get("stockCount", 0),
                    moneyFlow=ind.get("moneyFlow", 0),
                    turnoverRate=ind.get("turnoverRate", 0),
                    industryVolatility=ind.get("industryVolatility", 0),
                    industryVolatilitySource=ind.get("industryVolatilitySource", "unavailable"),
                    netInflowRatio=ind.get("netInflowRatio", 0),
                    leadingStock=str(ind["leadingStock"]) if ind.get("leadingStock") and ind["leadingStock"] != 0 else None,
                    sizeSource=ind.get("sizeSource", "estimated"),
                    marketCapSource=ind.get("marketCapSource", "unknown"),
                    marketCapSnapshotAgeHours=ind.get("marketCapSnapshotAgeHours"),
                    marketCapSnapshotIsStale=ind.get("marketCapSnapshotIsStale", False),
                    valuationSource=ind.get("valuationSource", "unavailable"),
                    valuationQuality=ind.get("valuationQuality", "unavailable"),
                    dataSources=ind.get("dataSources", []),
                    industryIndex=ind.get("industryIndex", 0),
                    totalInflow=ind.get("totalInflow", 0),
                    totalOutflow=ind.get("totalOutflow", 0),
                    leadingStockChange=ind.get("leadingStockChange", 0),
                    leadingStockPrice=ind.get("leadingStockPrice", 0),
                    pe_ttm=ind.get("pe_ttm"),
                    pb=ind.get("pb"),
                    dividend_yield=ind.get("dividend_yield"),
                )
                for ind in heatmap_data.get("industries", [])
            ],
            max_value=heatmap_data.get("max_value", 0),
            min_value=heatmap_data.get("min_value", 0),
            update_time=heatmap_data.get("update_time", ""),
        )
        if result.industries:
            _helpers._set_endpoint_cache(cache_key, result)
            _append_heatmap_history(days, result)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting industry heatmap: {e}")
        stale = _helpers._get_stale_endpoint_cache(cache_key)
        if stale is not None:
            logger.warning(f"Using stale cache for heatmap: {cache_key}")
            return stale
        raise HTTPException(status_code=500, detail=str(e))


def get_industry_heatmap_history(limit: int, days: Optional[int]) -> HeatmapHistoryResponse:
    _load_heatmap_history_from_disk()
    with _helpers._heatmap_history_lock:
        items = list(_helpers._heatmap_history)

    if days is not None:
        items = [item for item in items if int(item.get("days", 0) or 0) == days]

    history_items = [
        HeatmapHistoryItem(
            snapshot_id=item.get("snapshot_id", ""),
            days=item.get("days", 0),
            captured_at=item.get("captured_at", ""),
            update_time=item.get("update_time", ""),
            max_value=item.get("max_value", 0),
            min_value=item.get("min_value", 0),
            industries=[
                HeatmapDataItem(**industry_item)
                for industry_item in item.get("industries", [])
            ],
        )
        for item in items[:limit]
    ]
    return HeatmapHistoryResponse(items=history_items)


def get_industry_intelligence(top_n: int, lookback_days: int, mode: str) -> Any:
    cache_key = f"industry_intelligence:v2:{top_n}:{lookback_days}:live"
    fast_cache_key = f"industry_intelligence:v2:{top_n}:{lookback_days}:fast"
    cached = _helpers._get_endpoint_cache(cache_key)
    if cached is not None:
        return _helpers._attach_execution_metadata(cached, {"cache_status": "fresh"})
    cached_fast = _helpers._get_endpoint_cache(fast_cache_key)
    if mode == "fast" and cached_fast is not None:
        return _helpers._attach_execution_metadata(cached_fast, {"cache_status": "fresh"})

    if mode == "fast":
        stale = _helpers._get_stale_endpoint_cache(cache_key)
        if stale is not None:
            return _helpers._attach_execution_metadata(stale, {"cache_status": "stale", "degraded": True})
        stale_fast = _helpers._get_stale_endpoint_cache(fast_cache_key)
        if stale_fast is not None:
            return _helpers._attach_execution_metadata(stale_fast, {"cache_status": "stale", "degraded": True})

        fallback_rows, execution = _resolve_intelligence_rows_from_fallback(top_n=top_n, lookback_days=lookback_days)
        if fallback_rows:
            result = _build_industry_intelligence_result(fallback_rows, lookback_days=lookback_days, execution=execution)
            _helpers._set_endpoint_cache(fast_cache_key, result)
            return result
    try:
        analyzer = _helpers.get_industry_analyzer()
        rows = analyzer.rank_industries(
            top_n=top_n,
            sort_by="total_score",
            ascending=False,
            lookback_days=lookback_days,
        )
        result = _build_industry_intelligence_result(
            rows,
            lookback_days=lookback_days,
            execution=_helpers._build_execution_metadata(source="live_rank", degraded=False),
        )
        _helpers._set_endpoint_cache(cache_key, result)
        return result
    except Exception as e:
        logger.error(f"Error building industry intelligence: {e}", exc_info=True)
        stale = _helpers._get_stale_endpoint_cache(cache_key)
        if stale is not None:
            return _helpers._attach_execution_metadata(stale, {"cache_status": "stale", "degraded": True})
        fallback_rows, execution = _resolve_intelligence_rows_from_fallback(top_n=top_n, lookback_days=lookback_days)
        if fallback_rows:
            result = _build_industry_intelligence_result(fallback_rows, lookback_days=lookback_days, execution=execution)
            _helpers._set_endpoint_cache(fast_cache_key, result)
            return result
        raise HTTPException(status_code=500, detail=str(e))


def get_industry_network(top_n: int, lookback_days: int, min_similarity: float, mode: str) -> Any:
    cache_key = f"industry_network:v2:{top_n}:{lookback_days}:{min_similarity}:live"
    fast_cache_key = f"industry_network:v2:{top_n}:{lookback_days}:{min_similarity}:fast"
    cached = _helpers._get_endpoint_cache(cache_key)
    if cached is not None:
        return _helpers._attach_execution_metadata(cached, {"cache_status": "fresh"})
    cached_fast = _helpers._get_endpoint_cache(fast_cache_key)
    if mode == "fast" and cached_fast is not None:
        return _helpers._attach_execution_metadata(cached_fast, {"cache_status": "fresh"})

    if mode == "fast":
        stale = _helpers._get_stale_endpoint_cache(cache_key)
        if stale is not None:
            return _helpers._attach_execution_metadata(stale, {"cache_status": "stale", "degraded": True})
        stale_fast = _helpers._get_stale_endpoint_cache(fast_cache_key)
        if stale_fast is not None:
            return _helpers._attach_execution_metadata(stale_fast, {"cache_status": "stale", "degraded": True})

        fallback_rows, execution = _resolve_intelligence_rows_from_fallback(top_n=top_n, lookback_days=lookback_days)
        if fallback_rows:
            result = _build_industry_network_result(
                fallback_rows,
                top_n=top_n,
                lookback_days=lookback_days,
                min_similarity=min_similarity,
                execution=execution,
            )
            _helpers._set_endpoint_cache(fast_cache_key, result)
            return result
    try:
        analyzer = _helpers.get_industry_analyzer()
        rows = analyzer.rank_industries(
            top_n=top_n,
            sort_by="total_score",
            ascending=False,
            lookback_days=lookback_days,
        )
        result = _build_industry_network_result(
            rows,
            top_n=top_n,
            lookback_days=lookback_days,
            min_similarity=min_similarity,
            execution=_helpers._build_execution_metadata(source="live_rank", degraded=False),
        )
        _helpers._set_endpoint_cache(cache_key, result)
        return result
    except Exception as e:
        logger.error(f"Error building industry network: {e}", exc_info=True)
        stale = _helpers._get_stale_endpoint_cache(cache_key)
        if stale is not None:
            return _helpers._attach_execution_metadata(stale, {"cache_status": "stale", "degraded": True})
        fallback_rows, execution = _resolve_intelligence_rows_from_fallback(top_n=top_n, lookback_days=lookback_days)
        if fallback_rows:
            result = _build_industry_network_result(
                fallback_rows,
                top_n=top_n,
                lookback_days=lookback_days,
                min_similarity=min_similarity,
                execution=execution,
            )
            _helpers._set_endpoint_cache(fast_cache_key, result)
            return result
        raise HTTPException(status_code=500, detail=str(e))

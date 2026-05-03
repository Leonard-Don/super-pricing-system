import asyncio
from datetime import datetime, timedelta
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
import numpy as np
import pandas as pd
from pydantic import BaseModel, Field

from backend.app.services.realtime_alerts import realtime_alerts_store
from backend.app.services.realtime_journal import realtime_journal_store
from backend.app.services.realtime_preferences import realtime_preferences_store
from backend.app.services.quant_lab import quant_lab_service
from src.data.data_manager import DataManager
from src.data.market_depth import build_synthetic_orderbook, normalize_orderbook_payload
from src.data.realtime_manager import realtime_manager


router = APIRouter()
data_manager = DataManager()

ORDERBOOK_DEPTH_TIMEOUT_SECONDS = 8.0


class RealtimePreferencesRequest(BaseModel):
    symbols: List[str] = Field(default_factory=list)
    active_tab: str = "index"
    symbol_categories: dict[str, str] = Field(default_factory=dict)
    watch_groups: List[dict] = Field(default_factory=list)


class RealtimeAlertsRequest(BaseModel):
    alerts: List[dict] = Field(default_factory=list)
    alert_hit_history: List[dict] = Field(default_factory=list)


class RealtimeAlertHitRequest(BaseModel):
    entry: dict = Field(default_factory=dict)
    notify_channels: List[str] = Field(default_factory=list)
    create_workbench_task: bool = False
    persist_event_record: bool = True
    severity: str = "warning"


class RealtimeJournalRequest(BaseModel):
    review_snapshots: List[dict] = Field(default_factory=list)
    timeline_events: List[dict] = Field(default_factory=list)


def _number_or_none(value: Any) -> Optional[float]:
    try:
        numeric = float(value)
        if numeric != numeric:
            return None
        return numeric
    except (TypeError, ValueError):
        return None


def _synthetic_quote_for_orderbook(symbol: str) -> dict:
    seed = sum((index + 1) * ord(char) for index, char in enumerate(str(symbol or "SYNTH")))
    price = 75.0 + float(seed % 180)
    return {
        "symbol": symbol,
        "price": round(price, 4),
        "last": round(price, 4),
        "close": round(price, 4),
        "volume": int(1_000_000 + (seed % 400_000)),
        "source": "synthetic_quote_proxy",
    }


def _build_synthetic_orderbook_result(symbol: str, levels: int, reason: str) -> dict:
    synthetic = build_synthetic_orderbook(
        symbol,
        _synthetic_quote_for_orderbook(symbol),
        levels=levels,
    )
    result = normalize_orderbook_payload(
        symbol,
        synthetic,
        levels=levels,
        source="synthetic_quote_proxy",
        mode="synthetic_quote_proxy",
    )
    metrics = result.get("metrics") or {}
    result["diagnostics"] = {
        "message": reason,
        "is_synthetic": True,
        "provider_candidates": [],
        "provider_count": 0,
        "best_provider": "synthetic_quote_proxy",
        "spread_bps": metrics.get("spread_bps"),
        "depth_imbalance": metrics.get("depth_imbalance"),
        "levels_loaded": metrics.get("levels_loaded"),
    }
    return result


def _build_synthetic_replay_frame(symbol: str, *, limit: int = 240) -> pd.DataFrame:
    safe_limit = max(30, min(int(limit or 240), 240))
    seed = sum(ord(char) for char in str(symbol or "SYNTHETIC"))
    base_price = 80.0 + float(seed % 120)
    drift = np.linspace(0.0, safe_limit * 0.12, safe_limit)
    seasonal = np.sin(np.linspace(0.0, 3.14, safe_limit)) * max(base_price * 0.015, 1.0)
    close = base_price + drift + seasonal
    open_price = close * 0.998
    high = np.maximum(open_price, close) * 1.006
    low = np.minimum(open_price, close) * 0.994
    volume = np.linspace(900_000 + seed * 10, 1_150_000 + seed * 10, safe_limit)
    frame = pd.DataFrame(
        {
            "open": open_price,
            "high": high,
            "low": low,
            "close": close,
            "volume": volume,
        },
        index=pd.date_range(end=datetime.now(), periods=safe_limit, freq="D"),
    )
    frame.attrs["source"] = "synthetic_replay_fallback"
    frame.attrs["degraded"] = True
    frame.attrs["degraded_reason"] = "historical provider returned no replay data"
    return frame


def _load_replay_frame(
    symbol: str,
    *,
    period: str = "3mo",
    interval: str = "1d",
    limit: int = 240,
) -> pd.DataFrame:
    normalized = realtime_manager._normalize_symbol(symbol)
    safe_limit = max(30, min(int(limit or 240), 2000))
    allowed_intervals = {"1m", "5m", "15m", "30m", "1h", "1d", "1wk", "1mo"}
    if interval not in allowed_intervals:
        raise HTTPException(status_code=400, detail=f"Unsupported interval: {interval}")

    if period:
        data = data_manager.get_historical_data(
            symbol=normalized,
            interval=interval,
            period=period,
        )
    else:
        end_date = datetime.now()
        data = data_manager.get_historical_data(
            symbol=normalized,
            start_date=end_date - timedelta(days=120),
            end_date=end_date,
            interval=interval,
        )

    if data is None or data.empty:
        data = _build_synthetic_replay_frame(normalized, limit=safe_limit)

    replay_attrs = dict(getattr(data, "attrs", {}) or {})
    frame = data.tail(safe_limit).copy()
    frame.attrs.update(replay_attrs)
    if not frame.attrs.get("source"):
        frame.attrs["source"] = "historical_provider"
        frame.attrs["degraded"] = False
    frame.columns = [str(column).lower().replace(" ", "_") for column in frame.columns]
    close_series = frame["close"] if "close" in frame.columns else frame.get("adj_close")
    frame["close"] = pd.to_numeric(close_series, errors="coerce")
    if "volume" in frame.columns:
        frame["volume"] = pd.to_numeric(frame["volume"], errors="coerce").fillna(0.0)
    else:
        frame["volume"] = 0.0
    frame = frame.replace([np.inf, -np.inf], np.nan).dropna(subset=["close"])
    return frame


def _compute_realtime_anomaly_diagnostics(
    frame: pd.DataFrame,
    *,
    z_window: int = 20,
    return_z_threshold: float = 2.0,
    volume_z_threshold: float = 2.0,
    cusum_threshold_sigma: float = 2.5,
    pattern_lookback: int = 5,
    pattern_matches: int = 5,
) -> dict:
    if frame.empty or len(frame) < 30:
        return {
            "status": "insufficient_data",
            "sample_size": int(len(frame)),
            "recent_anomalies": [],
            "pattern_matches": [],
        }

    data = frame.copy()
    data.index = pd.to_datetime(data.index, utc=True, errors="coerce")
    data = data[~data.index.isna()].copy()
    data["return"] = data["close"].pct_change().replace([np.inf, -np.inf], np.nan).fillna(0.0)
    data["log_volume"] = np.log1p(data["volume"].clip(lower=0.0))

    effective_window = min(max(int(z_window or 20), 10), max(len(data) - 2, 10))
    rolling_return_mean = data["return"].rolling(effective_window, min_periods=max(5, effective_window // 2)).mean()
    rolling_return_std = data["return"].rolling(effective_window, min_periods=max(5, effective_window // 2)).std()
    rolling_volume_mean = data["log_volume"].rolling(effective_window, min_periods=max(5, effective_window // 2)).mean()
    rolling_volume_std = data["log_volume"].rolling(effective_window, min_periods=max(5, effective_window // 2)).std()

    data["return_zscore"] = ((data["return"] - rolling_return_mean) / rolling_return_std.replace(0, np.nan)).replace([np.inf, -np.inf], np.nan).fillna(0.0)
    data["volume_zscore"] = ((data["log_volume"] - rolling_volume_mean) / rolling_volume_std.replace(0, np.nan)).replace([np.inf, -np.inf], np.nan).fillna(0.0)
    data["rolling_volatility"] = rolling_return_std.fillna(method="bfill").fillna(0.0)

    cusum_sigma = data["rolling_volatility"].replace(0, np.nan).fillna(float(data["return"].std() or 0.01))
    drift = rolling_return_mean.fillna(0.0)
    positive_cusum = 0.0
    negative_cusum = 0.0
    pos_scores = []
    neg_scores = []
    cusum_flags = []

    for ret, mu, sigma in zip(data["return"], drift, cusum_sigma):
        sigma = float(max(sigma, 1e-6))
        positive_cusum = max(0.0, positive_cusum + float(ret - mu))
        negative_cusum = min(0.0, negative_cusum + float(ret - mu))
        threshold = float(cusum_threshold_sigma or 2.5) * sigma
        positive_flag = positive_cusum > threshold
        negative_flag = abs(negative_cusum) > threshold
        pos_scores.append(positive_cusum / sigma)
        neg_scores.append(abs(negative_cusum) / sigma)
        cusum_flags.append(positive_flag or negative_flag)
        if positive_flag:
            positive_cusum = 0.0
        if negative_flag:
            negative_cusum = 0.0

    data["cusum_positive_score"] = pos_scores
    data["cusum_negative_score"] = neg_scores
    data["cusum_flag"] = cusum_flags

    anomaly_mask = (
        data["return_zscore"].abs().ge(float(return_z_threshold or 2.0))
        | data["volume_zscore"].abs().ge(float(volume_z_threshold or 2.0))
        | data["cusum_flag"]
    )
    anomaly_points = data.loc[anomaly_mask].copy()

    def _anomaly_types(row: pd.Series) -> str:
        tags = []
        if abs(float(row["return_zscore"])) >= float(return_z_threshold or 2.0):
            tags.append("price_zscore")
        if abs(float(row["volume_zscore"])) >= float(volume_z_threshold or 2.0):
            tags.append("volume_zscore")
        if bool(row["cusum_flag"]):
            tags.append("cusum_break")
        return ", ".join(tags) or "normal"

    anomaly_points["anomaly_type"] = anomaly_points.apply(_anomaly_types, axis=1)
    anomaly_points["severity"] = (
        anomaly_points["return_zscore"].abs()
        + anomaly_points["volume_zscore"].abs()
        + anomaly_points["cusum_positive_score"].clip(lower=0)
        + anomaly_points["cusum_negative_score"].clip(lower=0)
    )

    latest = data.iloc[-1]
    current_anchor = anomaly_points.iloc[-1] if not anomaly_points.empty else latest
    anchor_position = data.index.get_loc(current_anchor.name)
    lookback = min(max(int(pattern_lookback or 5), 3), 15)
    start = max(0, anchor_position - lookback + 1)
    anchor_slice = data.iloc[start:anchor_position + 1]
    anchor_vector = np.array(
        [
            float(anchor_slice["return_zscore"].mean()),
            float(anchor_slice["volume_zscore"].mean()),
            float(anchor_slice["return"].sum()),
        ],
        dtype=float,
    )

    pattern_candidates = []
    for index in range(lookback - 1, max(anchor_position - 5, lookback - 1)):
        candidate_slice = data.iloc[index - lookback + 1:index + 1]
        if len(candidate_slice) < lookback:
            continue
        candidate_vector = np.array(
            [
                float(candidate_slice["return_zscore"].mean()),
                float(candidate_slice["volume_zscore"].mean()),
                float(candidate_slice["return"].sum()),
            ],
            dtype=float,
        )
        distance = float(np.linalg.norm(anchor_vector - candidate_vector))
        next_1 = float(data["return"].iloc[index + 1]) if index + 1 < len(data) else 0.0
        next_5 = float(data["return"].iloc[index + 1:index + 6].sum()) if index + 1 < len(data) else 0.0
        pattern_candidates.append(
            {
                "timestamp": candidate_slice.index[-1].isoformat(),
                "similarity_score": round(float(1 / (1 + distance)), 4),
                "distance": round(distance, 4),
                "return_zscore": round(float(candidate_slice["return_zscore"].iloc[-1]), 4),
                "volume_zscore": round(float(candidate_slice["volume_zscore"].iloc[-1]), 4),
                "next_1_bar_return": round(next_1, 6),
                "next_5_bar_return": round(next_5, 6),
            }
        )

    pattern_candidates.sort(key=lambda item: item["distance"])
    recent_anomalies = []
    for timestamp, row in anomaly_points.tail(12).iterrows():
        recent_anomalies.append(
            {
                "timestamp": timestamp.isoformat(),
                "close": round(float(row["close"]), 4),
                "return": round(float(row["return"]), 6),
                "return_zscore": round(float(row["return_zscore"]), 4),
                "volume_zscore": round(float(row["volume_zscore"]), 4),
                "cusum_positive_score": round(float(row["cusum_positive_score"]), 4),
                "cusum_negative_score": round(float(row["cusum_negative_score"]), 4),
                "anomaly_type": row["anomaly_type"],
                "severity": round(float(row["severity"]), 4),
            }
        )

    return {
        "status": "ok",
        "sample_size": int(len(data)),
        "window": effective_window,
        "thresholds": {
            "return_zscore": float(return_z_threshold or 2.0),
            "volume_zscore": float(volume_z_threshold or 2.0),
            "cusum_sigma": float(cusum_threshold_sigma or 2.5),
        },
        "latest_signal": {
            "timestamp": data.index[-1].isoformat(),
            "close": round(float(latest["close"]), 4),
            "return": round(float(latest["return"]), 6),
            "return_zscore": round(float(latest["return_zscore"]), 4),
            "volume_zscore": round(float(latest["volume_zscore"]), 4),
            "cusum_positive_score": round(float(latest["cusum_positive_score"]), 4),
            "cusum_negative_score": round(float(latest["cusum_negative_score"]), 4),
            "rolling_volatility": round(float(latest["rolling_volatility"]), 6),
            "is_anomaly": bool(anomaly_mask.iloc[-1]),
        },
        "summary": {
            "anomaly_count": int(anomaly_mask.sum()),
            "recent_anomaly_rate": round(float(anomaly_mask.tail(min(20, len(data))).mean()), 4),
            "max_return_zscore": round(float(data["return_zscore"].abs().max()), 4),
            "max_volume_zscore": round(float(data["volume_zscore"].abs().max()), 4),
        },
        "recent_anomalies": recent_anomalies,
        "pattern_matches": pattern_candidates[: max(1, min(int(pattern_matches or 5), 10))],
    }


@router.get("/replay/{symbol}", summary="个股行情回放帧")
async def get_symbol_replay(
    symbol: str,
    period: str = "5d",
    interval: str = "1d",
    limit: int = 240,
):
    normalized = realtime_manager._normalize_symbol(symbol)
    frame = await run_in_threadpool(
        lambda: _load_replay_frame(
            normalized,
            period=period,
            interval=interval,
            limit=limit,
        )
    )
    bars = []
    for index, row in frame.iterrows():
        bars.append({
            "timestamp": index.isoformat() if hasattr(index, "isoformat") else str(index),
            "open": _number_or_none(row.get("open")),
            "high": _number_or_none(row.get("high")),
            "low": _number_or_none(row.get("low")),
            "close": _number_or_none(row.get("close") or row.get("adj_close")),
            "volume": _number_or_none(row.get("volume")),
        })
    return {
        "success": True,
        "data": {
            "symbol": normalized,
            "period": period,
            "interval": interval,
            "bar_count": len(bars),
            "source": frame.attrs.get("source", "historical_provider"),
            "degraded": bool(frame.attrs.get("degraded", False)),
            "is_synthetic": bool(frame.attrs.get("degraded", False)),
            "diagnostics": {
                "reason": frame.attrs.get("degraded_reason", ""),
            },
            "bars": bars,
            "replay_controls": {
                "default_speed": 1,
                "supported_speeds": [0.5, 1, 2, 5, 10],
                "can_pause": True,
                "can_step": True,
            },
        },
    }


@router.get("/anomaly-diagnostics/{symbol}", summary="统计异常波动诊断")
async def get_realtime_anomaly_diagnostics(
    symbol: str,
    period: str = "3mo",
    interval: str = "1d",
    limit: int = 240,
    z_window: int = 20,
    return_z_threshold: float = 2.0,
    volume_z_threshold: float = 2.0,
    cusum_threshold_sigma: float = 2.5,
    pattern_lookback: int = 5,
    pattern_matches: int = 5,
):
    normalized = realtime_manager._normalize_symbol(symbol)
    diagnostics = await run_in_threadpool(
        lambda: _compute_realtime_anomaly_diagnostics(
            _load_replay_frame(
                normalized,
                period=period,
                interval=interval,
                limit=limit,
            ),
            z_window=z_window,
            return_z_threshold=return_z_threshold,
            volume_z_threshold=volume_z_threshold,
            cusum_threshold_sigma=cusum_threshold_sigma,
            pattern_lookback=pattern_lookback,
            pattern_matches=pattern_matches,
        )
    )
    return {
        "success": True,
        "data": {
            "symbol": normalized,
            "period": period,
            "interval": interval,
            **diagnostics,
        },
    }


@router.get("/orderbook/{symbol}", summary="Level 2 订单簿能力探测")
async def get_orderbook(symbol: str, levels: int = 10):
    normalized = realtime_manager._normalize_symbol(symbol)
    safe_levels = max(1, min(int(levels or 10), 50))
    provider_factory = getattr(realtime_manager, "provider_factory", None)

    def _load_orderbook():
        if provider_factory is None:
            quote = realtime_manager.get_quote_dict(normalized, use_cache=True) or {}
            return {
                "symbol": normalized,
                "source": quote.get("source") or "synthetic_quote_proxy",
                "mode": "synthetic_quote_proxy",
                "level2_supported": False,
                "bids": [],
                "asks": [],
                "metrics": {},
                "diagnostics": {
                    "message": "Provider factory unavailable; depth diagnostics skipped.",
                    "is_synthetic": True,
                    "provider_candidates": [],
                },
            }
        return provider_factory.get_market_depth_capabilities(normalized, levels=safe_levels)

    try:
        result = await asyncio.wait_for(
            run_in_threadpool(_load_orderbook),
            timeout=ORDERBOOK_DEPTH_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        result = _build_synthetic_orderbook_result(
            normalized,
            safe_levels,
            "Provider depth probe timed out; returned synthetic quote-derived depth for continuity.",
        )
    except Exception as exc:
        result = _build_synthetic_orderbook_result(
            normalized,
            safe_levels,
            f"Provider depth probe failed: {str(exc)[:120]}",
        )
    return {
        "success": True,
        "data": {
            "symbol": normalized,
            "requested_levels": safe_levels,
            "level2_supported": result.get("level2_supported", False),
            "is_synthetic": result.get("mode") != "provider_level2",
            "source": result.get("source", "unknown"),
            "mode": result.get("mode"),
            "bids": (result.get("bids") or [])[:safe_levels],
            "asks": (result.get("asks") or [])[:safe_levels],
            "metrics": result.get("metrics") or {},
            "diagnostics": result.get("diagnostics") or {},
        },
    }


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


@router.get("/alerts", summary="获取实时提醒规则")
async def get_alerts(request: Request):
    profile_id = _resolve_realtime_profile(request)
    return {"success": True, "data": realtime_alerts_store.get_alerts(profile_id=profile_id)}


@router.put("/alerts", summary="更新实时提醒规则")
async def update_alerts(payload: RealtimeAlertsRequest, request: Request):
    profile_id = _resolve_realtime_profile(request)
    data = realtime_alerts_store.update_alerts(payload.model_dump(), profile_id=profile_id)
    warnings = data.pop("_warnings", None)
    result = {"success": True, "data": data}
    if warnings:
        result["warnings"] = warnings
    return result


@router.post("/alerts/hits", summary="记录实时提醒命中并发布到统一告警总线")
async def record_alert_hit(payload: RealtimeAlertHitRequest, request: Request):
    profile_id = _resolve_realtime_profile(request)
    try:
        stored = realtime_alerts_store.record_alert_hit(payload.entry, profile_id=profile_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    entry = stored.get("entry") or {}
    event_payload = {
        "source_module": "realtime",
        "rule_name": entry.get("conditionLabel") or entry.get("condition") or "Realtime alert",
        "symbol": entry.get("symbol"),
        "severity": str(payload.severity or "warning").lower(),
        "message": entry.get("message") or f"{entry.get('symbol') or 'symbol'} alert triggered",
        "condition_summary": entry.get("conditionLabel") or entry.get("condition") or "Realtime alert triggered",
        "condition": entry.get("condition"),
        "trigger_value": entry.get("triggerValue"),
        "threshold": entry.get("threshold"),
        "trigger_time": entry.get("triggerTime"),
        "notify_channels": payload.notify_channels,
        "create_workbench_task": payload.create_workbench_task,
        "persist_event_record": payload.persist_event_record,
        "cascade_actions": [
            {"type": "persist_record", "record_type": "realtime_alert_hit"},
        ],
    }
    published = await run_in_threadpool(
        quant_lab_service.publish_alert_event,
        event_payload,
        profile_id,
    )
    return {
        "success": True,
        "data": {
            "entry": stored.get("entry"),
            "alert_hit_history": stored.get("alert_hit_history"),
            "bus_event": published.get("published_event"),
            "cascade_results": published.get("cascade_results"),
            "orchestration_summary": (published.get("orchestration") or {}).get("summary") or {},
        },
    }


@router.get("/journal", summary="获取实时行情复盘与时间线")
async def get_journal(request: Request):
    profile_id = _resolve_realtime_profile(request)
    return {"success": True, "data": realtime_journal_store.get_journal(profile_id=profile_id)}


@router.put("/journal", summary="更新实时行情复盘与时间线")
async def update_journal(payload: RealtimeJournalRequest, request: Request):
    profile_id = _resolve_realtime_profile(request)
    data = realtime_journal_store.update_journal(payload.model_dump(), profile_id=profile_id)
    warnings = data.pop("_warnings", None)
    result = {"success": True, "data": data}
    if warnings:
        result["warnings"] = warnings
    return result



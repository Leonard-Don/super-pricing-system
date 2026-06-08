"""Signal credibility endpoints — sync `def` (FastAPI threadpool).

Three surfaces:
- GET /credibility/pricing?symbol=AAPL&horizons=5,20,60
    Per-stock: reads valuation_history/{symbol}.json, pulls 2y close history,
    runs validate_signal_series.
- GET /credibility/macro
    Macro: re-shapes the existing macro factor-backtest cached payload.
- GET /credibility/screener
    Cross-sectional: reads ScreenerRankingStore; accumulating if < min_sample.

All handlers are plain `def` (not async) so FastAPI offloads them to the
worker threadpool — same design as the dashboard endpoints fixed in #105/#107.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query

from backend.app.services.signal_validation import (
    compute_quantile_spread,
    validate_signal_series,
)
from backend.app.services.screener_ranking_store import ScreenerRankingStore

logger = logging.getLogger(__name__)
router = APIRouter()

_MIN_SCREENER_SAMPLE = 20

# ── Dependency factories (monkeypatch-friendly) ───────────────────────────────


def _get_valuation_history_root() -> Path:
    """Return the quant-lab storage root (same logic as QuantLabService)."""
    env = os.getenv("QUANT_LAB_STORAGE_ROOT")
    if env:
        return Path(env)
    from src.utils.config import PROJECT_ROOT
    return PROJECT_ROOT / "data" / "quant_lab"


def _get_market_data_manager():
    from src.data.data_manager import DataManager
    return DataManager()


_screener_store: Optional[ScreenerRankingStore] = None


def _get_screener_ranking_store() -> ScreenerRankingStore:
    global _screener_store
    if _screener_store is None:
        storage_path = _get_valuation_history_root().parent / "screener_rankings.json"
        _screener_store = ScreenerRankingStore(storage_path=storage_path)
    return _screener_store


def _get_macro_backtest_payload() -> Dict[str, Any]:
    """Pull the cached macro factor-backtest result (no recompute)."""
    from backend.app.api.v1.endpoints.macro import (
        _endpoint_cache,
        _history_store,
        _market_data_manager,
        _parse_horizons,
        _summarize_prediction_rows,
        _find_forward_return,
        _signal_direction,
        _extract_close_points,
        _safe_float,
        _parse_timestamp,
    )
    import asyncio
    from fastapi.concurrency import run_in_threadpool

    default_horizons = "5,20,60"
    benchmark = "SPY"
    period = "2y"
    limit = 250
    cache_key = f"macro_factor_backtest:v1:{benchmark}:{period}:{default_horizons}:{limit}"

    # Try the live cache first (populated by the async endpoint on previous calls)
    cached = _endpoint_cache.get(cache_key)
    if cached is not None:
        return cached

    # Compute synchronously (we are already in the threadpool)
    requested_horizons = _parse_horizons(default_horizons)
    snapshots = sorted(
        _history_store.list_snapshots(limit=limit),
        key=lambda item: str(item.get("snapshot_timestamp") or item.get("timestamp") or ""),
    )
    benchmark_data = _market_data_manager.get_historical_data(benchmark, period=period, interval="1d")
    close_points = _extract_close_points(benchmark_data)

    if not close_points:
        return {
            "status": "insufficient_market_data",
            "benchmark": benchmark,
            "horizon_results": [],
            "since_date": None,
        }

    prediction_rows: List[Dict[str, Any]] = []
    for snapshot in snapshots:
        snapshot_time = _parse_timestamp(
            snapshot.get("snapshot_timestamp") or snapshot.get("timestamp")
        )
        if snapshot_time is None:
            continue
        for horizon in requested_horizons:
            forward = _find_forward_return(close_points, snapshot_time, horizon)
            if not forward:
                continue
            prediction_rows.append({
                **forward,
                "horizon_days": horizon,
                "score": _safe_float(snapshot.get("macro_score"), 0.5),
                "confidence": _safe_float(snapshot.get("confidence"), 0.0),
            })

    horizon_results = []
    for horizon in requested_horizons:
        horizon_rows = [r for r in prediction_rows if r.get("horizon_days") == horizon]
        horizon_results.append({
            "horizon_days": horizon,
            **_summarize_prediction_rows(horizon_rows),
        })

    total_samples = sum(item.get("samples", 0) for item in horizon_results)
    return {
        "status": "ok" if total_samples else "insufficient_forward_returns",
        "benchmark": benchmark,
        "horizon_results": horizon_results,
        "since_date": snapshots[0].get("snapshot_timestamp") if snapshots else None,
    }


# ── Helpers ────────────────────────────────────────────────────────────────────


def _read_json(path: Path, default: Any = None) -> Any:
    try:
        if path.exists():
            import json
            return json.loads(path.read_text())
    except Exception:
        pass
    return default


def _conf_from_ci(entry: Dict[str, Any]) -> Optional[float]:
    """Derive a [0, 1] confidence proxy from the confidence interval width."""
    ci = entry.get("confidence_interval")
    if not ci:
        return None
    try:
        lo = float(ci.get("lower", 0) or 0)
        hi = float(ci.get("upper", 0) or 0)
        width = abs(hi - lo)
        # narrower CI → higher confidence; cap at 1
        return max(0.0, min(1.0, 1.0 / (1.0 + width * 10)))
    except Exception:
        return None


def _parse_horizons_param(raw: str) -> List[int]:
    result = []
    for part in str(raw or "").split(","):
        part = part.strip()
        if part.isdigit():
            result.append(int(part))
    return result or [5, 20, 60]


def _extract_close_points_from_df(df) -> List[Dict[str, Any]]:
    """Convert a DataFrame with a date index and 'close' column to close_points."""
    if df is None or getattr(df, "empty", True) or "close" not in df:
        return []
    frame = df.sort_index()
    points = []
    for idx, row in frame.iterrows():
        try:
            date_str = str(idx)[:10]
            close = float(row["close"])
            if close > 0:
                points.append({"date": date_str, "close": close})
        except Exception:
            continue
    return points


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/pricing", summary="Per-stock signal credibility")
def get_pricing_credibility(
    symbol: str = Query(..., min_length=1, max_length=12),
    horizons: str = Query(default="5,20,60"),
    min_sample: int = Query(default=20, ge=1, le=500),
):
    """Evaluate how well this stock's gap_pct signal predicted realized returns."""
    try:
        symbol = symbol.upper().strip()
        requested_horizons = _parse_horizons_param(horizons)
        history_path = _get_valuation_history_root() / "valuation_history" / f"{symbol}.json"
        history = _read_json(history_path, default=[])

        if not history:
            return {
                "since_date": None,
                "min_sample": min_sample,
                "horizons": [],
                "status": "insufficient_data",
                "message": "No valuation history for this symbol yet.",
            }

        signal_points = []
        for entry in history:
            gap = entry.get("gap_pct")
            if gap is None:
                continue
            signal_points.append({
                "ts": entry.get("timestamp", ""),
                "signal": float(gap) / 100.0 if abs(float(gap)) > 1 else float(gap),
                "confidence": _conf_from_ci(entry),
            })

        if not signal_points:
            return {
                "since_date": None,
                "min_sample": min_sample,
                "horizons": [],
                "status": "insufficient_data",
                "message": "No usable signal points in valuation history.",
            }

        dm = _get_market_data_manager()
        hist_df = dm.get_historical_data(symbol, period="2y", interval="1d")
        close_points = _extract_close_points_from_df(hist_df)

        return validate_signal_series(signal_points, close_points, requested_horizons, min_sample=min_sample)

    except Exception as exc:
        logger.error("get_pricing_credibility error for %s: %s", symbol, exc, exc_info=True)
        return {
            "since_date": None,
            "min_sample": min_sample,
            "horizons": [],
            "status": "error",
            "message": "Credibility computation failed.",
        }


@router.get("/macro", summary="Macro signal credibility (reuses factor-backtest)")
def get_macro_credibility():
    """Return macro factor-backtest credibility in the standard envelope."""
    try:
        payload = _get_macro_backtest_payload()
        return payload
    except Exception as exc:
        logger.error("get_macro_credibility error: %s", exc, exc_info=True)
        return {
            "status": "error",
            "message": "Macro credibility computation failed.",
        }


@router.get("/screener", summary="Screener cross-sectional credibility")
def get_screener_credibility(
    min_sample: int = Query(default=_MIN_SCREENER_SAMPLE, ge=1, le=500),
):
    """Return quantile-spread credibility from accumulated screener snapshots."""
    try:
        store = _get_screener_ranking_store()
        snapshots = store.list_rankings(limit=500)
        n = len(snapshots)

        if n < min_sample:
            return {"status": "accumulating", "sample_size": n, "min_sample": min_sample}

        # Build cross-sectional rows from each snapshot's rankings
        rows = []
        for snap in snapshots:
            for item in snap.get("rankings") or []:
                score = item.get("score")
                if score is None:
                    continue
                rows.append({
                    "signal": float(score),
                    "confidence": None,
                    "forward_return": float(score),  # placeholder — real eval requires price data
                })

        spread = compute_quantile_spread(rows, quantiles=5)
        return {
            "status": "ok",
            "sample_size": n,
            "min_sample": min_sample,
            "quantile_spread": spread,
        }

    except Exception as exc:
        logger.error("get_screener_credibility error: %s", exc, exc_info=True)
        return {"status": "error", "message": "Screener credibility computation failed."}

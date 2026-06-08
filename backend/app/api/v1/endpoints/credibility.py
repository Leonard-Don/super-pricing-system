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

from backend.app.services.signal_validation import validate_signal_series
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


def _get_macro_snapshots(limit: int = 250) -> List[Dict[str, Any]]:
    """Point-in-time macro score snapshots from the macro history store."""
    from backend.app.api.v1.endpoints.macro import _history_store
    return _history_store.list_snapshots(limit=limit)


def _get_benchmark_closes(benchmark: str = "SPY", period: str = "2y") -> List[Dict[str, Any]]:
    """Benchmark close series as [{date, close}] (reuses the credibility data path)."""
    df = _get_market_data_manager().get_historical_data(benchmark, period=period, interval="1d")
    return _extract_close_points_from_df(df)


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
        # producer stores {"low","high"} (fair-value band in price units); keep
        # lower/upper as a defensive fallback.
        lo = float(ci.get("low", ci.get("lower", 0)) or 0)
        hi = float(ci.get("high", ci.get("upper", 0)) or 0)
        mid = (hi + lo) / 2.0
        if hi <= lo or mid <= 0:
            return None
        # scale-free: a narrower band RELATIVE to the fair value → higher confidence.
        # (raw dollar width is dimensionless-wrong — a $65 band on a $130 stock is wide.)
        rel_width = (hi - lo) / mid
        return max(0.0, min(1.0, 1.0 / (1.0 + rel_width)))
    except Exception:
        return None


def _gap_to_signal(gap_pct: Any) -> float:
    """gap_pct is in PERCENT and positive = OVERVALUED (price above fair value) → expect a
    NEGATIVE forward return (mean reversion). Negate + /100 so a positive signal means
    undervalued, matching the validation layer's hit convention sign(signal)*ret>0."""
    return -float(gap_pct) / 100.0


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
                "signal": _gap_to_signal(gap),
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


@router.get("/macro", summary="Macro signal credibility")
def get_macro_credibility(
    horizons: str = Query(default="5,20,60"),
    min_sample: int = Query(default=20, ge=1, le=500),
):
    """Validate the macro mispricing score against SPY forward returns — same
    envelope and same audited metrics as the per-stock endpoint (no separate math)."""
    try:
        signal_points = []
        for snap in _get_macro_snapshots():
            ts = snap.get("snapshot_timestamp") or snap.get("timestamp")
            if not ts:
                continue
            signal_points.append({
                "ts": ts,
                "signal": float(snap.get("macro_score") or 0.0),
                "confidence": snap.get("confidence"),
            })
        closes = _get_benchmark_closes()
        env = validate_signal_series(
            signal_points, closes, _parse_horizons_param(horizons), min_sample=min_sample
        )
        env["benchmark"] = "SPY"
        return env
    except Exception as exc:
        logger.error("get_macro_credibility error: %s", exc, exc_info=True)
        return {
            "since_date": None,
            "min_sample": min_sample,
            "horizons": [],
            "status": "error",
            "message": "Macro credibility computation failed.",
        }


@router.get("/screener", summary="Screener cross-sectional credibility")
def get_screener_credibility(
    min_sample: int = Query(default=_MIN_SCREENER_SAMPLE, ge=1, le=500),
):
    """Cross-sectional (top-vs-bottom decile) validation requires each ranking to be
    aligned to its per-symbol forward return — not yet implemented. We HONESTLY report
    capture progress only and never fabricate a spread (e.g. score-as-return). The
    rankings are persisted point-in-time so real validation can activate later."""
    try:
        n = len(_get_screener_ranking_store().list_rankings(limit=500))
        return {
            "status": "accumulating",
            "sample_size": n,
            "min_sample": min_sample,
            "note": "排名已 point-in-time 记录;横截面远期收益验证待接入(不臆造指标)。",
        }
    except Exception as exc:
        logger.error("get_screener_credibility error: %s", exc, exc_info=True)
        return {"status": "error", "message": "Screener credibility computation failed."}

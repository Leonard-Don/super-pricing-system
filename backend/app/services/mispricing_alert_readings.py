"""Shared readings builder for mispricing alert evaluation.

Extracts the watchlist + per-symbol analyzer logic that was previously inline
in the alerts.py endpoint so BOTH the endpoint (dry-run) and the scheduler
(auto-fire) can call it without importing endpoint internals into a service.

Public API
----------
build_readings(profile_id) -> list[dict]
    Returns [{symbol, gap_pct, confidence}] for every symbol in the profile's
    watchlist.  Symbols that fail to analyse are silently skipped (same
    behaviour as the original endpoint helper).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def _get_watchlist(profile_id: Optional[str]) -> List[str]:
    from backend.app.services.realtime_preferences import realtime_preferences_store
    return list(
        (realtime_preferences_store.get_preferences(profile_id) or {}).get("symbols") or []
    )


def _get_analyzer():
    from backend.app.api.v1.endpoints.pricing import _get_gap_analyzer
    return _get_gap_analyzer()


def _confidence_from_valuation(valuation: Dict[str, Any]) -> Optional[float]:
    """Scale-free confidence proxy from the fair-value band.

    Narrower relative band → higher confidence.  Returns None when the
    confidence interval is missing or degenerate (prevents low-conf alerts).
    """
    ci = (valuation or {}).get("confidence_interval")
    if not ci:
        return None
    try:
        lo = float(ci.get("low", ci.get("lower", 0)) or 0)
        hi = float(ci.get("high", ci.get("upper", 0)) or 0)
        mid = (hi + lo) / 2.0
        if hi <= lo or mid <= 0:
            return None
        return max(0.0, min(1.0, 1.0 / (1.0 + (hi - lo) / mid)))
    except Exception:
        return None


def _reading_for_symbol(analyzer: Any, symbol: str) -> Optional[Dict[str, Any]]:
    """Analyse one symbol and return {symbol, gap_pct, confidence} or None on failure."""
    try:
        result = analyzer.analyze(symbol)
        gap = (result.get("gap_analysis") or {}).get("gap_pct")
        if gap is None:
            return None
        return {
            "symbol": symbol,
            "gap_pct": float(gap),
            "confidence": _confidence_from_valuation(result.get("valuation") or {}),
        }
    except Exception as exc:
        logger.warning("mispricing reading failed for %s: %s", symbol, exc)
        return None


def build_readings(profile_id: Optional[str]) -> List[Dict[str, Any]]:
    """Return mispricing readings for every symbol in *profile_id*'s watchlist.

    Symbols that cannot be analysed are silently dropped so one bad ticker
    never aborts the evaluation of the remaining watchlist.
    """
    symbols = _get_watchlist(profile_id)
    if not symbols:
        return []
    analyzer = _get_analyzer()
    return [r for r in (_reading_for_symbol(analyzer, s) for s in symbols) if r is not None]

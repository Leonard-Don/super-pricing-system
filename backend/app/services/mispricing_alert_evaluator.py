"""Pure mispricing-alert evaluation.

Given a rule, the current mispricing readings of the watched symbols, and when each
symbol last fired, decide which symbols should fire NOW. No I/O, no globals — the
threshold/direction/confidence/cooldown logic is a pure function so it's exhaustively
testable and the scheduler + dry-run endpoint share exactly one definition.

Convention: `gap_pct` is in PERCENT and positive = OVERVALUED (price above fair value);
negative = UNDERVALUED. (Same as PricingGapAnalyzer.)
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional


def _parse_iso(value: Any) -> Optional[datetime]:
    try:
        # Normalize to naive so cooldown math never mixes aware/naive datetimes.
        return datetime.fromisoformat(str(value)).replace(tzinfo=None)
    except (TypeError, ValueError):
        return None


def evaluate_mispricing_alerts(
    rule: Dict[str, Any],
    readings: List[Dict[str, Any]],
    last_fired: Dict[str, Any],
    now: datetime,
) -> List[Dict[str, Any]]:
    """Return the list of symbols that should fire given the rule.

    rule: {threshold_pct, direction: 'under'|'over'|'both', min_confidence, cooldown_hours}
          (NOTE: `enabled` is NOT checked here — callers gate on it; dry-run evaluates
           regardless so users can test thresholds.)
    readings: [{symbol, gap_pct, confidence}] (gap_pct percent, +=overvalued; confidence 0..1 or None)
    last_fired: {symbol: iso_timestamp}
    """
    threshold = abs(float(rule.get("threshold_pct", 0) or 0))
    direction = str(rule.get("direction", "both") or "both")
    min_conf = float(rule.get("min_confidence", 0) or 0)
    cooldown_h = float(rule.get("cooldown_hours", 0) or 0)

    fires: List[Dict[str, Any]] = []
    for reading in readings:
        symbol = reading.get("symbol")
        gap = reading.get("gap_pct")
        conf = reading.get("confidence")
        if symbol is None or gap is None:
            continue
        gap = float(gap)

        # direction + threshold
        if direction == "under":
            if gap > -threshold:
                continue
            label = "undervalued"
        elif direction == "over":
            if gap < threshold:
                continue
            label = "overvalued"
        else:  # both
            if abs(gap) < threshold:
                continue
            label = "overvalued" if gap > 0 else "undervalued"

        # confidence gate — None = insufficient → never fire (honest: no low-conf noise)
        if conf is None or float(conf) < min_conf:
            continue

        # cooldown — suppress re-fires within the window
        if cooldown_h > 0:
            last_dt = _parse_iso(last_fired.get(symbol))
            if last_dt is not None and (now - last_dt).total_seconds() < cooldown_h * 3600:
                continue

        fires.append({
            "symbol": symbol,
            "gap_pct": round(gap, 2),
            "confidence": round(float(conf), 4),
            "direction": label,
        })
    return fires

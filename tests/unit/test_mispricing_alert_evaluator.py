"""Pure mispricing-alert evaluator — threshold / direction / confidence / cooldown."""
from datetime import datetime, timedelta

from backend.app.services.mispricing_alert_evaluator import evaluate_mispricing_alerts

NOW = datetime(2026, 6, 8, 12, 0, 0)
RULE = {"threshold_pct": 20, "direction": "both", "min_confidence": 0.5, "cooldown_hours": 24}


def _read(symbol, gap, conf=0.8):
    return {"symbol": symbol, "gap_pct": gap, "confidence": conf}


def test_both_fires_above_threshold_either_direction():
    fires = evaluate_mispricing_alerts(RULE, [_read("A", 25), _read("B", -30), _read("C", 10)], {}, NOW)
    syms = {f["symbol"]: f["direction"] for f in fires}
    assert syms == {"A": "overvalued", "B": "undervalued"}  # C (10 < 20) excluded


def test_under_only_fires_undervalued():
    rule = {**RULE, "direction": "under"}
    fires = evaluate_mispricing_alerts(rule, [_read("A", 25), _read("B", -25)], {}, NOW)
    assert [f["symbol"] for f in fires] == ["B"] and fires[0]["direction"] == "undervalued"


def test_over_only_fires_overvalued():
    rule = {**RULE, "direction": "over"}
    fires = evaluate_mispricing_alerts(rule, [_read("A", 25), _read("B", -25)], {}, NOW)
    assert [f["symbol"] for f in fires] == ["A"] and fires[0]["direction"] == "overvalued"


def test_confidence_gate_excludes_low_and_none():
    fires = evaluate_mispricing_alerts(
        RULE, [_read("A", 25, conf=0.3), _read("B", 25, conf=None), _read("C", 25, conf=0.9)], {}, NOW
    )
    assert [f["symbol"] for f in fires] == ["C"]


def test_cooldown_suppresses_recent_fire():
    last = {"A": (NOW - timedelta(hours=2)).isoformat()}   # 2h ago, cooldown 24h → suppressed
    assert evaluate_mispricing_alerts(RULE, [_read("A", 25)], last, NOW) == []


def test_cooldown_allows_after_window():
    last = {"A": (NOW - timedelta(hours=25)).isoformat()}  # 25h ago, cooldown 24h → fires
    fires = evaluate_mispricing_alerts(RULE, [_read("A", 25)], last, NOW)
    assert [f["symbol"] for f in fires] == ["A"]


def test_missing_gap_is_skipped():
    fires = evaluate_mispricing_alerts(RULE, [{"symbol": "A", "gap_pct": None, "confidence": 0.9}], {}, NOW)
    assert fires == []

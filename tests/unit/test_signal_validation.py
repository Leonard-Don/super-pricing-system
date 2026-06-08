"""Tests for signal_validation pure functions — TDD, no I/O."""
from __future__ import annotations

from backend.app.services.signal_validation import (
    find_forward_return,
    build_evaluated_rows,
)

CLOSES = [
    {"date": "2026-01-01", "close": 100.0},
    {"date": "2026-01-02", "close": 101.0},
    {"date": "2026-01-03", "close": 99.0},
    {"date": "2026-01-04", "close": 110.0},
]


def test_find_forward_return_uses_first_close_on_or_after_anchor():
    # anchor 2026-01-01, horizon 2 -> close[0]=100 -> close[2]=99 -> -1%
    assert round(find_forward_return(CLOSES, "2026-01-01", 2), 4) == round(99.0 / 100.0 - 1.0, 4)


def test_find_forward_return_none_when_horizon_exceeds_series():
    assert find_forward_return(CLOSES, "2026-01-03", 5) is None


def test_build_evaluated_rows_aligns_signal_to_forward_return_no_lookahead():
    signals = [{"ts": "2026-01-01T00:00:00", "signal": 0.05, "confidence": 0.8}]
    rows = build_evaluated_rows(signals, CLOSES, horizon=2)
    assert len(rows) == 1
    assert rows[0]["signal"] == 0.05
    assert round(rows[0]["forward_return"], 4) == round(99.0 / 100.0 - 1.0, 4)


def test_build_evaluated_rows_drops_points_without_forward_window():
    signals = [{"ts": "2026-01-04T00:00:00", "signal": 0.05, "confidence": None}]
    assert build_evaluated_rows(signals, CLOSES, horizon=2) == []

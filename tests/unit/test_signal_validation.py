"""Tests for signal_validation pure functions — TDD, no I/O."""
from __future__ import annotations

from backend.app.services.signal_validation import (
    find_forward_return,
    build_evaluated_rows,
    compute_hit_rate,
    compute_directional_returns,
    compute_ic,
    compute_calibration,
    compute_quantile_spread,
    validate_signal_series,
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


# ── Task 2: hit_rate + directional_returns ────────────────────────────────────

ROWS = [
    {"signal": 0.05, "confidence": 0.8, "forward_return": 0.02},   # long, hit
    {"signal": 0.03, "confidence": 0.6, "forward_return": -0.01},  # long, miss
    {"signal": -0.04, "confidence": 0.7, "forward_return": -0.02}, # short, hit
    {"signal": 0.0, "confidence": 0.5, "forward_return": 0.05},    # flat, excluded
]


def test_compute_hit_rate_excludes_flat_signals():
    r = compute_hit_rate(ROWS)
    assert r["sample_size"] == 3
    assert round(r["value"], 4) == round(2 / 3, 4)  # 2 of 3 directional hits


def test_compute_directional_returns_long_short():
    r = compute_directional_returns(ROWS)
    assert round(r["long"], 4) == round((0.02 + -0.01) / 2, 4)
    assert round(r["short"], 4) == round(-0.02, 4)
    assert round(r["long_short_edge"], 4) == round(((0.02 - 0.01) / 2) - (-0.02), 4)


def test_compute_hit_rate_empty():
    assert compute_hit_rate([]) == {"value": None, "sample_size": 0}


# ── Task 3: compute_ic (Spearman, manual) ─────────────────────────────────────


def test_compute_ic_perfect_monotonic_is_one():
    rows = [{"signal": s, "confidence": None, "forward_return": s} for s in (-0.02, -0.01, 0.01, 0.03)]
    assert round(compute_ic(rows)["value"], 6) == 1.0


def test_compute_ic_inverse_is_minus_one():
    rows = [{"signal": s, "confidence": None, "forward_return": -s} for s in (-0.02, -0.01, 0.01, 0.03)]
    assert round(compute_ic(rows)["value"], 6) == -1.0


def test_compute_ic_too_few_points():
    assert compute_ic([{"signal": 0.1, "confidence": None, "forward_return": 0.1}])["value"] is None


# ── Task 4: compute_calibration ───────────────────────────────────────────────


def test_compute_calibration_buckets_confidence_vs_hit_rate():
    rows = [
        {"signal": 0.05, "confidence": 0.9, "forward_return": 0.02},   # high conf, hit
        {"signal": 0.05, "confidence": 0.9, "forward_return": 0.01},   # high conf, hit
        {"signal": 0.05, "confidence": 0.2, "forward_return": -0.01},  # low conf, miss
        {"signal": -0.05, "confidence": 0.2, "forward_return": 0.01},  # low conf, miss
    ]
    out = compute_calibration(rows, buckets=2)
    hi = [b for b in out["buckets"] if b["sample_size"] and b["predicted"] >= 0.5][0]
    lo = [b for b in out["buckets"] if b["sample_size"] and b["predicted"] < 0.5][0]
    assert hi["realized_hit_rate"] == 1.0
    assert lo["realized_hit_rate"] == 0.0


def test_compute_calibration_skips_rows_without_confidence():
    rows = [{"signal": 0.05, "confidence": None, "forward_return": 0.02}]
    assert compute_calibration(rows, buckets=2)["sample_size"] == 0


# ── Task 5: compute_quantile_spread ───────────────────────────────────────────


def test_compute_quantile_spread_top_minus_bottom():
    # signal correlates with return: top decile avg return > bottom decile
    rows = [{"signal": i / 10.0, "confidence": None, "forward_return": i / 100.0} for i in range(10)]
    out = compute_quantile_spread(rows, quantiles=2)
    assert out["sample_size"] == 10
    assert out["value"] > 0  # top half outperforms bottom half


def test_compute_quantile_spread_insufficient():
    assert compute_quantile_spread([{"signal": 1, "confidence": None, "forward_return": 1}], quantiles=10)["value"] is None


# ── Task 6: validate_signal_series orchestrator + sample gating + look-ahead guard ──


def _series(n):
    closes = [{"date": f"2026-{1 + i // 28:02d}-{1 + i % 28:02d}", "close": 100.0 + i} for i in range(n + 70)]
    signals = [{"ts": f"2026-{1 + i // 28:02d}-{1 + i % 28:02d}T00:00:00", "signal": 0.01 * (i % 5 - 2), "confidence": 0.6}
               for i in range(n)]
    return signals, closes


def test_validate_signal_series_reports_status_ok_when_enough_samples():
    signals, closes = _series(40)
    out = validate_signal_series(signals, closes, horizons=[5], min_sample=20)
    h = out["horizons"][0]
    assert h["horizon"] == 5
    assert h["status"] == "ok"
    assert h["sample_size"] >= 20
    assert "since_date" in out


def test_validate_signal_series_insufficient_data_status():
    signals, closes = _series(5)
    out = validate_signal_series(signals, closes, horizons=[5], min_sample=20)
    assert out["horizons"][0]["status"] == "insufficient_data"


def test_validate_signal_series_no_lookahead_signal_after_prices():
    # signal dated AFTER the price series end -> no forward window -> 0 samples
    closes = [{"date": "2026-01-01", "close": 100.0}, {"date": "2026-01-02", "close": 101.0}]
    signals = [{"ts": "2026-06-01T00:00:00", "signal": 0.05, "confidence": 0.9}]
    out = validate_signal_series(signals, closes, horizons=[1], min_sample=1)
    assert out["horizons"][0]["sample_size"] == 0
    assert out["horizons"][0]["status"] == "insufficient_data"

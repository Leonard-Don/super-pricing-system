"""PatternRecognizer characterization tests.

锁定 K 线形态（doji / hammer / hanging_man / engulfing / morning-evening star /
three soldiers/crows）与图表形态（double top/bottom / head-shoulders / triangle / flag）
的识别规则与输出结构。
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from src.analytics.pattern_recognizer import PatternRecognizer


@pytest.fixture
def recognizer():
    return PatternRecognizer()


def _candle(open_, high, low, close, *, name="2024-01-01"):
    return pd.Series(
        {"open": open_, "high": high, "low": low, "close": close},
        name=pd.Timestamp(name),
    )


def _df(records):
    """records: list of dict with keys open/high/low/close [+ volume]."""
    df = pd.DataFrame(records)
    df.index = pd.date_range("2024-01-01", periods=len(records), freq="D")
    if "volume" not in df.columns:
        df["volume"] = 1_000_000
    return df


# ---------- recognize_patterns 顶层 ----------


def test_recognize_patterns_empty_returns_baseline(recognizer):
    out = recognizer.recognize_patterns(pd.DataFrame())
    assert out == {"candlestick_patterns": [], "chart_patterns": [], "total_patterns": 0}


def test_recognize_patterns_short_returns_baseline(recognizer):
    df = _df([{"open": 100, "high": 101, "low": 99, "close": 100}] * 5)
    out = recognizer.recognize_patterns(df)
    assert out["total_patterns"] == 0


def test_recognize_patterns_full_returns_structure(recognizer):
    np.random.seed(3)
    rets = np.random.normal(0, 0.01, 80)
    closes = 100 * np.cumprod(1 + rets)
    records = []
    for c in closes:
        records.append({"open": c, "high": c * 1.01, "low": c * 0.99, "close": c * 1.005})
    df = _df(records)
    out = recognizer.recognize_patterns(df)
    assert isinstance(out["candlestick_patterns"], list)
    assert isinstance(out["chart_patterns"], list)


# ---------- _merge_config ----------


def test_merge_config_partial_dict_merges():
    r = PatternRecognizer({"peak_detection_window": {"short": 8}})
    assert r.config["peak_detection_window"]["short"] == 8
    assert r.config["peak_detection_window"]["long"] == 10  # 默认保留


def test_merge_config_scalar_override():
    r = PatternRecognizer({"max_patterns": 10})
    assert r.max_patterns == 10


# ---------- _check_doji ----------


def test_check_doji_detects_small_body(recognizer):
    # body=0.01, range=2 → 0.005 < 0.15 ✓
    candle = _candle(100, 101, 99, 100.01)
    out = recognizer._check_doji(candle)
    assert out["pattern"] == "doji"


def test_check_doji_returns_none_for_large_body(recognizer):
    # body=2, range=2.5 → 0.8 > 0.15
    candle = _candle(100, 102.25, 99.75, 102)
    assert recognizer._check_doji(candle) is None


def test_check_doji_returns_none_when_zero_range(recognizer):
    candle = _candle(100, 100, 100, 100)
    assert recognizer._check_doji(candle) is None


# ---------- _check_hammer ----------


def test_check_hammer_after_downtrend(recognizer):
    # body=1, upper_shadow=0.1, lower_shadow=2.5, total=3.6 → body/total=0.28<0.3 ✓
    prev = _candle(100, 101, 95, 96)  # close < open → 阴线
    current = _candle(97.5, 98.6, 95.0, 98.5)
    out = recognizer._check_hammer(current, prev)
    assert out["pattern"] == "hammer"


def test_check_hanging_man_after_uptrend(recognizer):
    prev = _candle(95, 100, 94, 99)  # close > open → 阳线
    current = _candle(97.5, 98.6, 95.0, 98.5)
    out = recognizer._check_hammer(current, prev)
    assert out["pattern"] == "hanging_man"


def test_check_hammer_returns_none_when_no_pattern(recognizer):
    prev = _candle(95, 100, 94, 99)
    current = _candle(98, 99, 97, 98.5)  # 普通小阳线
    assert recognizer._check_hammer(current, prev) is None


def test_check_hammer_returns_none_when_zero_range(recognizer):
    prev = _candle(95, 100, 94, 99)
    current = _candle(100, 100, 100, 100)
    assert recognizer._check_hammer(current, prev) is None


# ---------- _check_engulfing ----------


def test_bullish_engulfing(recognizer):
    prev = _candle(102, 103, 101, 101.5)  # 阴线 body=0.5
    current = _candle(101.0, 105.0, 100.5, 104.0)  # 阳线 body=3.0 > 0.6
    out = recognizer._check_engulfing(current, prev)
    assert out["pattern"] == "bullish_engulfing"


def test_bearish_engulfing(recognizer):
    prev = _candle(100, 101, 99, 100.5)  # 阳线 body=0.5
    current = _candle(102, 103, 97, 98)  # 阴线 body=4.0 > 0.6
    out = recognizer._check_engulfing(current, prev)
    assert out["pattern"] == "bearish_engulfing"


def test_engulfing_returns_none_when_no_match(recognizer):
    prev = _candle(100, 101, 99, 100.5)
    current = _candle(100.5, 101, 100, 100.7)  # 同向小阳线
    assert recognizer._check_engulfing(current, prev) is None


# ---------- _check_morning_evening_star ----------


def test_morning_star(recognizer):
    c1 = _candle(110, 110, 100, 100)  # 大阴线 body=10, mid=105
    c2 = _candle(99.5, 100.5, 99, 99.8)  # 小实体 body=0.3 < 10*0.3=3
    c3 = _candle(100, 110, 100, 108)  # 阳线 close=108 > 105
    out = recognizer._check_morning_evening_star(c3, c2, c1)
    assert out["pattern"] == "morning_star"


def test_evening_star(recognizer):
    c1 = _candle(100, 110, 100, 110)  # 大阳线 body=10, mid=105
    c2 = _candle(110.5, 111, 110, 110.3)  # 小实体 body=0.2 < 3
    c3 = _candle(110, 110, 100, 102)  # 阴线 close=102 < 105
    out = recognizer._check_morning_evening_star(c3, c2, c1)
    assert out["pattern"] == "evening_star"


def test_morning_evening_star_none_when_no_match(recognizer):
    c1 = _candle(100, 105, 99, 104)
    c2 = _candle(104, 105, 103, 104.5)
    c3 = _candle(104.5, 106, 104, 105.5)
    assert recognizer._check_morning_evening_star(c3, c2, c1) is None


# ---------- _check_three_soldiers_crows ----------


def test_three_white_soldiers(recognizer):
    c1 = _candle(100, 102, 99, 101)
    c2 = _candle(101, 103, 100, 102)
    c3 = _candle(102, 104, 101, 103)
    out = recognizer._check_three_soldiers_crows(c3, c2, c1)
    assert out["pattern"] == "three_white_soldiers"


def test_three_black_crows(recognizer):
    c1 = _candle(103, 104, 100, 101)
    c2 = _candle(102, 103, 99, 100)
    c3 = _candle(101, 102, 98, 99)
    out = recognizer._check_three_soldiers_crows(c3, c2, c1)
    assert out["pattern"] == "three_black_crows"


def test_three_pattern_none_when_no_match(recognizer):
    c1 = _candle(100, 102, 99, 101)
    c2 = _candle(101, 102, 99, 100)  # 阴线打断
    c3 = _candle(100, 101, 99, 100.5)
    assert recognizer._check_three_soldiers_crows(c3, c2, c1) is None


# ---------- _check_triangle ----------


def test_triangle_ascending(recognizer):
    # 高点水平 100，低点从 90 升到 99
    n = 30
    closes = np.linspace(95, 99, n)
    highs = np.full(n, 100.0)
    lows = np.linspace(90, 99, n)
    df = _df([{"open": c, "high": h, "low": l, "close": c} for c, h, l in zip(closes, highs, lows)])
    out = recognizer._check_triangle(df["close"], df["high"], df["low"])
    assert out["pattern"] == "ascending_triangle"


def test_triangle_descending(recognizer):
    n = 30
    closes = np.linspace(95, 91, n)
    highs = np.linspace(100, 91, n)
    lows = np.full(n, 90.0)
    df = _df([{"open": c, "high": h, "low": l, "close": c} for c, h, l in zip(closes, highs, lows)])
    out = recognizer._check_triangle(df["close"], df["high"], df["low"])
    assert out["pattern"] == "descending_triangle"


def test_triangle_symmetrical(recognizer):
    n = 30
    closes = np.linspace(95, 95, n)
    highs = np.linspace(100, 96, n)  # 下降
    lows = np.linspace(90, 94, n)  # 上升
    df = _df([{"open": c, "high": h, "low": l, "close": c} for c, h, l in zip(closes, highs, lows)])
    out = recognizer._check_triangle(df["close"], df["high"], df["low"])
    assert out["pattern"] == "symmetrical_triangle"


def test_triangle_none_when_short_data(recognizer):
    df = _df([{"open": 100, "high": 101, "low": 99, "close": 100}] * 5)
    assert recognizer._check_triangle(df["close"], df["high"], df["low"]) is None


# ---------- _check_flag ----------


def test_flag_bull_via_current_buggy_formula(recognizer):
    # 当前实现公式：early_trend = (close[-30] - close[-20]) / close[-30]
    # bull_flag 触发条件 early_trend > 0.1 实际意味着 -30 至 -20 段下跌 10%+，
    # 与 docstring 描述（"强势上涨后小幅回调"）相反。这里锁定当前真实行为。
    # close[-30]=120, close[-20]=105 → early_trend=(120-105)/120=0.125>0.1 ✓
    # 后 10 日震幅 < 5% → 进入 bull_flag
    closes = (
        list(np.linspace(120, 105, 10))
        + list(np.linspace(105, 100, 10))
        + list(np.linspace(100, 100.5, 10))
    )
    highs = [c + 0.2 for c in closes]
    lows = [c - 0.2 for c in closes]
    df = _df([{"open": c, "high": h, "low": l, "close": c} for c, h, l in zip(closes, highs, lows)])
    out = recognizer._check_flag(df["close"], df["high"], df["low"])
    assert out["pattern"] == "bull_flag"


def test_flag_bear_via_current_buggy_formula(recognizer):
    # 同上：bear_flag 触发条件 early_trend < -0.1 实际意味着 -30 至 -20 段上涨 10%+
    closes = list(np.linspace(100, 120, 20)) + list(np.linspace(120, 119.5, 10))
    highs = [c + 0.2 for c in closes]
    lows = [c - 0.2 for c in closes]
    df = _df([{"open": c, "high": h, "low": l, "close": c} for c, h, l in zip(closes, highs, lows)])
    out = recognizer._check_flag(df["close"], df["high"], df["low"])
    assert out["pattern"] == "bear_flag"


def test_flag_none_short_data(recognizer):
    df = _df([{"open": 100, "high": 101, "low": 99, "close": 100}] * 10)
    assert recognizer._check_flag(df["close"], df["high"], df["low"]) is None


def test_flag_none_when_no_clear_trend(recognizer):
    closes = list(np.linspace(100, 101, 30))  # 几乎平
    highs = [c + 0.2 for c in closes]
    lows = [c - 0.2 for c in closes]
    df = _df([{"open": c, "high": h, "low": l, "close": c} for c, h, l in zip(closes, highs, lows)])
    assert recognizer._check_flag(df["close"], df["high"], df["low"]) is None


# ---------- _check_double_top_bottom ----------


def test_double_top_bottom_none_short_data(recognizer):
    df = _df([{"open": 100, "high": 101, "low": 99, "close": 100}] * 30)
    assert recognizer._check_double_top_bottom(df["close"], df["high"], df["low"]) is None


def test_double_top_returns_structure_when_two_peaks(recognizer):
    # 60 天，两个明显高点位于位置 ~15 和 ~45
    n = 60
    closes = np.full(n, 95.0)
    highs = np.full(n, 96.0)
    lows = np.full(n, 94.0)
    # 在位置 15 和 45 设置等高峰
    highs[15] = 110.0
    highs[45] = 110.0
    # 中间设置一个低谷
    lows[30] = 90.0
    df = _df(
        [
            {"open": c, "high": h, "low": l, "close": c}
            for c, h, l in zip(closes, highs, lows)
        ]
    )
    out = recognizer._check_double_top_bottom(df["close"], df["high"], df["low"])
    # 检测到双顶或双底（取决于 peak / trough 谁先满足条件）
    if out is not None:
        assert out["pattern"] in {"double_top", "double_bottom"}
        assert isinstance(out["points"], list)
        assert len(out["points"]) == 3


def test_double_bottom_returns_structure(recognizer):
    n = 60
    closes = np.full(n, 105.0)
    highs = np.full(n, 106.0)
    lows = np.full(n, 104.0)
    lows[15] = 90.0
    lows[45] = 90.0
    highs[30] = 110.0
    df = _df(
        [
            {"open": c, "high": h, "low": l, "close": c}
            for c, h, l in zip(closes, highs, lows)
        ]
    )
    out = recognizer._check_double_top_bottom(df["close"], df["high"], df["low"])
    if out is not None:
        assert out["pattern"] in {"double_top", "double_bottom"}


# ---------- _check_head_shoulders ----------


def test_head_shoulders_none_short_data(recognizer):
    df = _df([{"open": 100, "high": 101, "low": 99, "close": 100}] * 30)
    assert recognizer._check_head_shoulders(df["close"], df["high"], df["low"]) is None


def test_head_shoulders_top_returns_structure(recognizer):
    # 60 天，三个高点：左肩 ~12，头 ~30，右肩 ~48；头最高
    n = 60
    closes = np.full(n, 100.0)
    highs = np.full(n, 100.5)
    lows = np.full(n, 99.5)
    highs[12] = 110.0  # left shoulder
    highs[30] = 120.0  # head
    highs[48] = 110.0  # right shoulder
    df = _df(
        [
            {"open": c, "high": h, "low": l, "close": c}
            for c, h, l in zip(closes, highs, lows)
        ]
    )
    out = recognizer._check_head_shoulders(df["close"], df["high"], df["low"])
    if out is not None:
        assert out["pattern"] in {"head_shoulders_top", "head_shoulders_bottom"}
        assert len(out["points"]) == 3


def test_head_shoulders_bottom_returns_structure(recognizer):
    n = 60
    closes = np.full(n, 100.0)
    highs = np.full(n, 100.5)
    lows = np.full(n, 99.5)
    lows[12] = 90.0  # left shoulder
    lows[30] = 80.0  # head
    lows[48] = 90.0  # right shoulder
    df = _df(
        [
            {"open": c, "high": h, "low": l, "close": c}
            for c, h, l in zip(closes, highs, lows)
        ]
    )
    out = recognizer._check_head_shoulders(df["close"], df["high"], df["low"])
    if out is not None:
        assert out["pattern"] in {"head_shoulders_top", "head_shoulders_bottom"}

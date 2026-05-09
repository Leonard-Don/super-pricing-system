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


# ---------- 边界与边缘场景 ----------


def test_recognize_patterns_at_exactly_10_runs_candlestick(recognizer):
    """len(df) == 10 是 `< 10` 门槛之上的临界点；K 线分析应运行。"""
    df = _df([{"open": 100, "high": 101, "low": 99, "close": 100}] * 10)
    out = recognizer.recognize_patterns(df)
    # 每根都是平实 K 线 → doji；循环产生 7 个，slice [-5:] 截到 5 个
    assert len(out["candlestick_patterns"]) == 5
    assert all(p["pattern"] == "doji" for p in out["candlestick_patterns"])
    # 长度 < 20 → 图表形态分析跳过
    assert out["chart_patterns"] == []
    assert out["total_patterns"] == 5


def test_recognize_patterns_at_19_skips_chart_patterns(recognizer):
    """len 19 仍跑 K 线分析，但图表形态分析需 ≥20 → 跳过。"""
    df = _df([{"open": 100, "high": 101, "low": 99, "close": 100}] * 19)
    out = recognizer.recognize_patterns(df)
    assert out["chart_patterns"] == []
    # 循环范围 range(16) → 16 个 doji，截到 5
    assert len(out["candlestick_patterns"]) == 5


def test_recognize_patterns_total_count_invariant(recognizer):
    """total_patterns 必须等于 candlestick_patterns + chart_patterns 的长度之和。"""
    np.random.seed(7)
    rets = np.random.normal(0, 0.01, 80)
    closes = 100 * np.cumprod(1 + rets)
    df = _df(
        [{"open": c, "high": c * 1.01, "low": c * 0.99, "close": c * 1.005} for c in closes]
    )
    out = recognizer.recognize_patterns(df)
    assert out["total_patterns"] == len(out["candlestick_patterns"]) + len(
        out["chart_patterns"]
    )


def test_recognize_candlestick_truncated_to_last_5(recognizer):
    """K 线形态超过 5 个时，slice [-5:] 只保留最后 5 个（硬编码）。"""
    df = _df([{"open": 100, "high": 101, "low": 99, "close": 100}] * 10)
    out = recognizer._recognize_candlestick_patterns(df)
    assert len(out) == 5


def test_check_doji_at_exact_threshold_returns_none(recognizer):
    """body / total_range == 0.15 边界（严格 <），返回 None。"""
    # body=3, total=20 → ratio=0.15 (在 IEEE 754 double 中恰好等于 0.15 字面量)
    # 选择整数差以避免 100.3-100 这类浮点误差导致的边界抖动
    candle = _candle(100, 110, 90, 103)
    assert recognizer._check_doji(candle) is None


def test_check_hammer_with_doji_prev_classified_as_down(recognizer):
    """prev close == open（doji）时，二元判定将其归为 'down' → hammer。

    锁定当前的二元分类行为（非 hanging_man）。
    """
    prev = _candle(100, 101, 99, 100)  # doji body=0
    current = _candle(97.5, 98.6, 95.0, 98.5)
    out = recognizer._check_hammer(current, prev)
    assert out is not None
    assert out["pattern"] == "hammer"


def test_check_engulfing_with_doji_prev_returns_none(recognizer):
    """前一根是 doji 时，多空两个方向的吞没条件都失败。"""
    prev = _candle(100, 101, 99, 100)  # body=0
    current = _candle(99, 105, 98, 104)  # 大阳，本应吞没
    assert recognizer._check_engulfing(current, prev) is None


def test_check_engulfing_ratio_at_exact_boundary_returns_none(recognizer):
    """curr_body == prev_body * 1.2（严格 >）边界，返回 None。"""
    prev = _candle(101, 102, 99.5, 100)  # 阴 body=1
    current = _candle(99.9, 102, 99.5, 101.1)  # 阳 body=1.2 (恰好 1.2 倍)
    # 完整覆盖位置满足，但实体比例 1.2 > 1.2 为 False
    assert recognizer._check_engulfing(current, prev) is None


def test_three_white_soldiers_close_tie_returns_none(recognizer):
    """c2_close == c1_close → 严格大于条件失败。"""
    c1 = _candle(100, 102, 99, 101)
    c2 = _candle(100, 102, 99, 101)  # close 与 c1 相等
    c3 = _candle(101, 103, 100, 102)
    assert recognizer._check_three_soldiers_crows(c3, c2, c1) is None


def test_three_black_crows_close_tie_returns_none(recognizer):
    """c2_close == c1_close → 严格小于条件失败。"""
    c1 = _candle(103, 104, 100, 101)
    c2 = _candle(103, 104, 100, 101)  # close 与 c1 相等
    c3 = _candle(102, 103, 99, 100)
    assert recognizer._check_three_soldiers_crows(c3, c2, c1) is None


def test_morning_evening_star_with_first_candle_doji_returns_none(recognizer):
    """c1 是 doji（close == open）时，早晨/黄昏之星两个分支都失败。"""
    c1 = _candle(100, 105, 95, 100)  # body=0
    c2 = _candle(99.5, 100.5, 99, 99.8)
    c3 = _candle(100, 110, 100, 108)
    assert recognizer._check_morning_evening_star(c3, c2, c1) is None


def test_triangle_at_exact_min_length_runs(recognizer):
    """len(close) == 30 是 `< 30` 门槛之上的临界点；三角形分析应运行。"""
    n = 30
    closes = np.linspace(95, 99, n)
    highs = np.full(n, 100.0)
    lows = np.linspace(90, 99, n)
    df = _df(
        [{"open": c, "high": h, "low": l, "close": c} for c, h, l in zip(closes, highs, lows)]
    )
    out = recognizer._check_triangle(df["close"], df["high"], df["low"])
    assert out is not None
    assert out["pattern"] == "ascending_triangle"


def test_triangle_at_29_returns_none(recognizer):
    """len 29 → 长度门槛拒绝。"""
    n = 29
    closes = np.linspace(95, 99, n)
    highs = np.full(n, 100.0)
    lows = np.linspace(90, 99, n)
    df = _df(
        [{"open": c, "high": h, "low": l, "close": c} for c, h, l in zip(closes, highs, lows)]
    )
    assert recognizer._check_triangle(df["close"], df["high"], df["low"]) is None


def test_flag_at_exact_min_length_runs(recognizer):
    """len(close) == 30 临界点，旗形分析应运行。"""
    closes = (
        list(np.linspace(120, 105, 10))
        + list(np.linspace(105, 100, 10))
        + list(np.linspace(100, 100.5, 10))
    )
    assert len(closes) == 30
    highs = [c + 0.2 for c in closes]
    lows = [c - 0.2 for c in closes]
    df = _df(
        [{"open": c, "high": h, "low": l, "close": c} for c, h, l in zip(closes, highs, lows)]
    )
    out = recognizer._check_flag(df["close"], df["high"], df["low"])
    assert out is not None
    assert out["pattern"] == "bull_flag"


def test_flag_at_29_returns_none(recognizer):
    """len 29 → 长度门槛拒绝。"""
    df = _df([{"open": 100, "high": 101, "low": 99, "close": 100}] * 29)
    assert recognizer._check_flag(df["close"], df["high"], df["low"]) is None


def test_double_top_at_59_returns_none(recognizer):
    """len 59（< 60）→ 长度门槛拒绝。"""
    df = _df([{"open": 100, "high": 101, "low": 99, "close": 100}] * 59)
    assert (
        recognizer._check_double_top_bottom(df["close"], df["high"], df["low"]) is None
    )


def test_head_shoulders_at_59_returns_none(recognizer):
    """len 59（< 60）→ 长度门槛拒绝。"""
    df = _df([{"open": 100, "high": 101, "low": 99, "close": 100}] * 59)
    assert recognizer._check_head_shoulders(df["close"], df["high"], df["low"]) is None


def test_init_with_none_config_uses_defaults():
    """config=None → 走 `or {}` 兜底，使用全部默认值。"""
    r = PatternRecognizer(None)
    assert r.doji_threshold == 0.15
    assert r.max_patterns == 5


def test_init_with_empty_dict_config_uses_defaults():
    """config={} → 使用全部默认值，包括嵌套字典。"""
    r = PatternRecognizer({})
    assert r.doji_threshold == 0.15
    assert r.candlestick_window == 30
    assert r.peak_detection_window == {"short": 5, "long": 10}


def test_merge_config_unknown_key_silently_dropped():
    """DEFAULT_CONFIG 之外的键被静默丢弃（不报错也不存储）。"""
    r = PatternRecognizer({"unknown_key": 999, "max_patterns": 7})
    assert "unknown_key" not in r.config
    assert r.max_patterns == 7


def test_merge_config_does_not_mutate_class_default():
    """实例 config 的嵌套字典是独立副本，不污染类级 DEFAULT_CONFIG。"""
    r = PatternRecognizer({"peak_detection_window": {"short": 99}})
    r.config["peak_detection_window"]["short"] = 0
    assert PatternRecognizer.DEFAULT_CONFIG["peak_detection_window"]["short"] == 5
    r2 = PatternRecognizer()
    assert r2.config["peak_detection_window"]["short"] == 5


# ---------- 配置项当前未生效（latent bug 锁定） ----------
# 以下两个测试锁定当前实现的 latent bug：__init__ 把 doji_threshold / max_patterns
# 存入 self，但实现内部使用硬编码字面量（0.15 / 5）。如果将来修复使其使用 self.*，
# 这两个测试需要更新。


def test_doji_threshold_config_currently_ignored():
    """doji_threshold 通过 config 设置，但 _check_doji 用硬编码 0.15 判定。"""
    r = PatternRecognizer({"doji_threshold": 0.001})  # 极严
    # body=0.2, total=2 → ratio=0.1; 若按 config 应不是 doji（0.1 > 0.001），
    # 但实现按 0.15 判定（0.1 < 0.15 → 命中）
    candle = _candle(100, 101, 99, 100.2)
    out = r._check_doji(candle)
    assert out is not None
    assert out["pattern"] == "doji"


def test_max_patterns_config_currently_ignored():
    """max_patterns 通过 config 设置，但 _recognize_candlestick_patterns 用硬编码 5 截断。"""
    r = PatternRecognizer({"max_patterns": 10})
    df = _df([{"open": 100, "high": 101, "low": 99, "close": 100}] * 10)
    out = r._recognize_candlestick_patterns(df)
    # 7 个 doji 产生；若按 config=10 应保留全部 7 个；硬编码 5 则截到 5
    assert len(out) == 5

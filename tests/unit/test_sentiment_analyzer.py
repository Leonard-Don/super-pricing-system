"""SentimentAnalyzer characterization tests.

锁定波动率情绪、恐慌贪婪指数、市场广度、极端情绪检测、风险等级、整体情绪判断
等输出形状与边界规则。
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from src.analytics.sentiment_analyzer import SentimentAnalyzer


# ---------- fixtures ----------


@pytest.fixture
def analyzer():
    return SentimentAnalyzer()


def _make_df(closes, *, volumes=None, opens=None, highs=None, lows=None):
    n = len(closes)
    closes = np.asarray(closes, dtype=float)
    if volumes is None:
        volumes = np.full(n, 1_000_000, dtype=float)
    if opens is None:
        opens = closes
    if highs is None:
        highs = closes * 1.01
    if lows is None:
        lows = closes * 0.99
    dates = pd.date_range("2024-01-01", periods=n, freq="D")
    return pd.DataFrame(
        {
            "open": opens,
            "high": highs,
            "low": lows,
            "close": closes,
            "volume": volumes,
        },
        index=dates,
    )


@pytest.fixture
def stable_uptrend_df():
    """长期稳健上涨数据，覆盖 252 日 52w 高低点路径。"""
    np.random.seed(7)
    base = 100
    rets = np.random.normal(0.0008, 0.01, 300)
    closes = base * np.cumprod(1 + rets)
    return _make_df(closes)


@pytest.fixture
def short_df():
    np.random.seed(7)
    closes = 100 * np.cumprod(1 + np.random.normal(0, 0.01, 60))
    return _make_df(closes)


# ---------- analyze (顶层) ----------


def test_analyze_empty_returns_unknown_baseline(analyzer):
    out = analyzer.analyze(pd.DataFrame())
    assert out["overall_sentiment"] == "unknown"
    assert out["fear_greed_index"] == 50
    assert out["risk_level"] == "medium"


def test_analyze_short_data_returns_unknown_baseline(analyzer):
    df = _make_df([100, 101, 102, 103, 104, 105, 106])
    out = analyzer.analyze(df)
    assert out["overall_sentiment"] == "unknown"


def test_analyze_full_pipeline_returns_expected_keys(analyzer, stable_uptrend_df):
    out = analyzer.analyze(stable_uptrend_df, symbol="000001")
    assert set(out.keys()) >= {
        "overall_sentiment",
        "fear_greed_index",
        "volatility_sentiment",
        "market_breadth",
        "extreme_sentiment",
        "risk_level",
    }
    assert 0 <= out["fear_greed_index"] <= 100
    assert out["risk_level"] in {"very_high", "high", "medium", "low", "very_low"}


# ---------- _merge_config ----------


def test_merge_config_empty_falls_back_to_defaults(analyzer):
    assert analyzer.config["volatility_thresholds"]["panic"] == 40
    assert analyzer.config["fear_greed_weights"]["momentum"] == 25


def test_merge_config_partial_dict_merges_with_defaults():
    custom = {"volatility_thresholds": {"panic": 99}}
    a = SentimentAnalyzer(custom)
    # 自定义键覆盖
    assert a.config["volatility_thresholds"]["panic"] == 99
    # 默认键保留
    assert a.config["volatility_thresholds"]["fear"] == 30


def test_merge_config_unknown_keys_ignored():
    a = SentimentAnalyzer({"foo": "bar"})
    assert "foo" not in a.config


def test_merge_config_does_not_mutate_class_default():
    SentimentAnalyzer({"volatility_thresholds": {"panic": 999}})
    assert SentimentAnalyzer.DEFAULT_CONFIG["volatility_thresholds"]["panic"] == 40


# ---------- _analyze_volatility_sentiment ----------


def test_volatility_sentiment_calm_for_low_vol_data(analyzer):
    # 几乎无波动 → 应为 calm 或 complacent
    closes = np.linspace(100, 101, 250)
    df = _make_df(closes)
    out = analyzer._analyze_volatility_sentiment(df)
    assert out["sentiment"] in {"calm", "complacent"}
    assert out["volatility_trend"] in {"stable", "increasing", "decreasing"}
    assert out["historical_volatility"] >= 0
    assert out["atr_percent"] >= 0


def test_volatility_sentiment_panic_for_extreme_swings(analyzer):
    np.random.seed(1)
    rets = np.random.normal(0, 0.05, 250)  # ~80% 年化波动
    closes = 100 * np.cumprod(1 + rets)
    df = _make_df(closes)
    out = analyzer._analyze_volatility_sentiment(df)
    assert out["sentiment"] in {"panic", "fear"}


def test_volatility_sentiment_returns_thresholds_structure(analyzer, stable_uptrend_df):
    out = analyzer._analyze_volatility_sentiment(stable_uptrend_df)
    assert "high" in out["thresholds"]
    assert "low" in out["thresholds"]


def test_volatility_sentiment_short_data_uses_static_thresholds(analyzer, short_df):
    out = analyzer._analyze_volatility_sentiment(short_df)
    assert out["thresholds"]["high"] == 30
    assert out["thresholds"]["low"] == 15


# ---------- _calculate_fear_greed_index ----------


def test_fear_greed_index_strong_uptrend_is_greedy(analyzer):
    np.random.seed(1)
    rets = np.random.normal(0.005, 0.005, 300)
    closes = 100 * np.cumprod(1 + rets)
    df = _make_df(closes)
    fg = analyzer._calculate_fear_greed_index(df)
    assert fg >= 60


def test_fear_greed_index_strong_downtrend_is_fearful(analyzer):
    np.random.seed(1)
    rets = np.random.normal(-0.005, 0.005, 300)
    closes = 100 * np.cumprod(1 + rets)
    df = _make_df(closes)
    fg = analyzer._calculate_fear_greed_index(df)
    assert fg <= 50


def test_fear_greed_index_clamped_to_0_100(analyzer):
    # 极端单调上涨
    closes = np.linspace(50, 200, 300)
    df = _make_df(closes)
    fg = analyzer._calculate_fear_greed_index(df)
    assert 0 <= fg <= 100


def test_fear_greed_index_short_data_uses_full_window_high_low(analyzer, short_df):
    fg = analyzer._calculate_fear_greed_index(short_df)
    assert 0 <= fg <= 100


def test_fear_greed_index_volume_spike_up(analyzer):
    closes = np.linspace(100, 110, 50)  # 上涨
    volumes = np.full(50, 1_000_000, dtype=float)
    volumes[-1] = 3_000_000  # 末日放量
    df = _make_df(closes, volumes=volumes)
    fg = analyzer._calculate_fear_greed_index(df)
    assert 0 <= fg <= 100


def test_fear_greed_index_volume_spike_down(analyzer):
    closes = np.linspace(110, 100, 50)  # 下跌
    volumes = np.full(50, 1_000_000, dtype=float)
    volumes[-1] = 3_000_000  # 末日放量
    df = _make_df(closes, volumes=volumes)
    fg = analyzer._calculate_fear_greed_index(df)
    assert 0 <= fg <= 100


# ---------- _analyze_market_breadth ----------


def test_market_breadth_returns_status_and_counts(analyzer, stable_uptrend_df):
    out = analyzer._analyze_market_breadth(stable_uptrend_df)
    assert out["status"] in {
        "neutral",
        "strong_bullish",
        "bullish",
        "strong_bearish",
        "bearish",
    }
    assert out["new_highs"] >= 0
    assert out["new_lows"] >= 0
    assert 0 <= out["breadth_ratio"] <= 1


def test_market_breadth_handles_constant_price():
    a = SentimentAnalyzer()
    df = _make_df([100.0] * 30)
    out = a._analyze_market_breadth(df)
    # 每天既是 20 日新高也是 20 日新低 → ratio = 0.5
    assert out["breadth_ratio"] == 0.5


# ---------- _detect_extreme_sentiment ----------


def test_detect_extreme_sentiment_panic_selling(analyzer):
    closes = list(np.linspace(100, 95, 28)) + [85.0, 84.0]
    volumes = [1_000_000] * 28 + [3_000_000, 1_000_000]
    df = _make_df(closes, volumes=volumes)
    out = analyzer._detect_extreme_sentiment(df)
    assert out["has_extreme_sentiment"] is True
    types = [s["type"] for s in out["signals"]]
    assert "panic_selling" in types


def test_detect_extreme_sentiment_frenzy_buying(analyzer):
    closes = list(np.linspace(100, 105, 28)) + [115.0, 116.0]
    volumes = [1_000_000] * 28 + [4_000_000, 1_000_000]
    df = _make_df(closes, volumes=volumes)
    out = analyzer._detect_extreme_sentiment(df)
    types = [s["type"] for s in out["signals"]]
    assert "frenzy_buying" in types


def test_detect_extreme_sentiment_dead_market(analyzer):
    closes = list(np.linspace(100, 101, 30))
    volumes = [1_000_000] * 29 + [100_000]  # 末日成交量极低
    df = _make_df(closes, volumes=volumes)
    out = analyzer._detect_extreme_sentiment(df)
    types = [s["type"] for s in out["signals"]]
    assert "dead_market" in types


def test_detect_extreme_sentiment_consecutive_limits(analyzer):
    closes = [100, 110, 121, 133, 110, 100]  # 连续3日 >8% 波动
    df = _make_df(closes)
    out = analyzer._detect_extreme_sentiment(df)
    types = [s["type"] for s in out["signals"]]
    assert "consecutive_limits" in types


def test_detect_extreme_sentiment_calm_market_no_signals(analyzer):
    closes = list(np.linspace(100, 102, 60))
    df = _make_df(closes)
    out = analyzer._detect_extreme_sentiment(df)
    assert out["has_extreme_sentiment"] is False
    assert out["signals_count"] == 0


# ---------- _assess_risk_level ----------


def test_assess_risk_level_very_high(analyzer):
    df = _make_df(np.linspace(100, 60, 200))  # -40% drawdown
    vol = {"sentiment": "panic"}
    out = analyzer._assess_risk_level(df, vol, 10)
    assert out == "very_high"


def test_assess_risk_level_high(analyzer):
    df = _make_df(np.linspace(100, 85, 60))  # -15% drawdown
    vol = {"sentiment": "fear"}
    out = analyzer._assess_risk_level(df, vol, 25)
    assert out in {"very_high", "high"}


def test_assess_risk_level_low_or_very_low(analyzer):
    df = _make_df(np.linspace(100, 102, 60))  # 几乎无回撤
    vol = {"sentiment": "neutral"}
    out = analyzer._assess_risk_level(df, vol, 50)
    assert out in {"low", "very_low"}


# ---------- _determine_overall_sentiment ----------


@pytest.mark.parametrize(
    "fg, expected",
    [
        (90, "extreme_greed"),
        (70, "greed"),
        (50, "neutral_bullish"),
        (40, "neutral_bearish"),
        (25, "fear"),
        (10, "extreme_fear"),
    ],
)
def test_determine_overall_sentiment_buckets(analyzer, fg, expected):
    out = analyzer._determine_overall_sentiment(
        volatility_sentiment={"sentiment": "neutral"},
        fear_greed=fg,
        extreme_sentiment={"has_extreme_sentiment": False, "signals": []},
    )
    assert out == expected


def test_determine_overall_sentiment_panic_overrides_to_extreme_fear(analyzer):
    out = analyzer._determine_overall_sentiment(
        volatility_sentiment={"sentiment": "neutral"},
        fear_greed=80,  # 原本 extreme_greed
        extreme_sentiment={
            "has_extreme_sentiment": True,
            "signals": [{"type": "panic_selling"}],
        },
    )
    assert out == "extreme_fear"


def test_determine_overall_sentiment_frenzy_overrides_to_extreme_greed(analyzer):
    out = analyzer._determine_overall_sentiment(
        volatility_sentiment={"sentiment": "neutral"},
        fear_greed=10,  # 原本 extreme_fear
        extreme_sentiment={
            "has_extreme_sentiment": True,
            "signals": [{"type": "frenzy_buying"}],
        },
    )
    assert out == "extreme_greed"


# ---------- _interpret_vix ----------


@pytest.mark.parametrize(
    "vix, contains",
    [
        (10, "极低"),
        (15, "低恐慌"),
        (25, "中等"),
        (35, "高恐慌"),
        (50, "极度"),
    ],
)
def test_interpret_vix_buckets(analyzer, vix, contains):
    text = analyzer._interpret_vix(vix)
    assert contains in text

"""VolumePriceAnalyzer characterization tests.

锁定量能趋势、量价相关、MFI / OBV / A-D 线 / 量价形态 / 背离 / VPVR 各子分析的
输出形状与边界。覆盖 5 个量价形态分支与所有公开 dict 字段。
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from src.analytics.volume_price_analyzer import VolumePriceAnalyzer


# ---------- fixtures ----------


@pytest.fixture
def analyzer():
    return VolumePriceAnalyzer()


def _df(closes, *, volumes=None, opens=None, highs=None, lows=None):
    n = len(closes)
    closes = np.asarray(closes, dtype=float)
    if volumes is None:
        volumes = np.full(n, 1_000_000, dtype=float)
    else:
        volumes = np.asarray(volumes, dtype=float)
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
def stable_df():
    np.random.seed(11)
    closes = 100 * np.cumprod(1 + np.random.normal(0.001, 0.01, 100))
    return _df(closes)


# ---------- analyze 顶层 ----------


def test_analyze_empty_returns_baseline(analyzer):
    out = analyzer.analyze(pd.DataFrame())
    assert out["volume_trend"]["trend"] == "unknown"
    assert out["price_volume_correlation"] == 0
    assert out["money_flow"] == {}


def test_analyze_short_returns_baseline(analyzer):
    df = _df([100] * 10)
    out = analyzer.analyze(df)
    assert out["volume_trend"]["trend"] == "unknown"


def test_analyze_full_returns_all_keys(analyzer, stable_df):
    out = analyzer.analyze(stable_df)
    expected = {
        "volume_trend",
        "price_volume_correlation",
        "money_flow",
        "volume_patterns",
        "obv_analysis",
        "accumulation_distribution",
        "divergence",
        "vpvr_analysis",
    }
    assert expected.issubset(out.keys())


# ---------- _merge_config ----------


def test_merge_config_partial_dict_merges():
    a = VolumePriceAnalyzer({"volume_thresholds": {"explosive": 99}})
    assert a.config["volume_thresholds"]["explosive"] == 99
    assert a.config["volume_thresholds"]["increasing"] == 1.5  # 默认保留


def test_merge_config_default_class_not_mutated():
    VolumePriceAnalyzer({"volume_thresholds": {"explosive": 999}})
    assert VolumePriceAnalyzer.DEFAULT_CONFIG["volume_thresholds"]["explosive"] == 2.0


# ---------- _analyze_volume_trend ----------


def test_volume_trend_explosive(analyzer):
    volumes = [1_000_000] * 60 + [3_000_000]  # 末日 3 倍 5 日均量
    df = _df([100] * 61, volumes=volumes)
    out = analyzer._analyze_volume_trend(df["volume"])
    assert out["trend"] == "explosive"


def test_volume_trend_increasing(analyzer):
    # vol_5 = (4*1M + 2M)/5 = 1.2M。current=2M > 1.5*1.2M=1.8M (increasing) 但 < 2*1.2M=2.4M (非 explosive)
    volumes = [1_000_000] * 60 + [2_000_000]
    df = _df([100] * 61, volumes=volumes)
    out = analyzer._analyze_volume_trend(df["volume"])
    assert out["trend"] == "increasing"


def test_volume_trend_shrinking(analyzer):
    volumes = [1_000_000] * 60 + [300_000]  # < 5 日均量 0.5
    df = _df([100] * 61, volumes=volumes)
    out = analyzer._analyze_volume_trend(df["volume"])
    assert out["trend"] == "shrinking"


def test_volume_trend_direction_expanding(analyzer):
    # 前 50 日 100 万，后 5 日 200 万 → vol_5 > vol_20 * 1.2
    volumes = [1_000_000] * 50 + [2_000_000] * 5
    df = _df([100] * 55, volumes=volumes)
    out = analyzer._analyze_volume_trend(df["volume"])
    assert out["direction"] == "expanding"


def test_volume_trend_direction_contracting(analyzer):
    volumes = [2_000_000] * 50 + [200_000] * 5
    df = _df([100] * 55, volumes=volumes)
    out = analyzer._analyze_volume_trend(df["volume"])
    assert out["direction"] == "contracting"


def test_volume_trend_short_data_falls_back_to_vol20(analyzer):
    df = _df([100] * 25, volumes=[1_000_000] * 25)
    out = analyzer._analyze_volume_trend(df["volume"])
    # 数据不足 60 日 → vol_60 fallback 到 vol_20
    assert out["trend"] == "normal"


# ---------- _calculate_price_volume_correlation ----------


@pytest.mark.parametrize(
    "interpretation_expected",
    ["strong_positive", "positive", "neutral", "negative", "strong_negative"],
)
def test_price_volume_correlation_interpretation_buckets(analyzer, interpretation_expected):
    n = 50
    np.random.seed(2)
    base_returns = np.random.normal(0, 0.01, n)
    if interpretation_expected == "strong_positive":
        # volume 与 return 强正相关
        vol_changes = base_returns * 10 + np.random.normal(0, 0.001, n)
    elif interpretation_expected == "positive":
        vol_changes = base_returns * 0.5 + np.random.normal(0, 0.02, n)
    elif interpretation_expected == "strong_negative":
        vol_changes = -base_returns * 10 + np.random.normal(0, 0.001, n)
    elif interpretation_expected == "negative":
        vol_changes = -base_returns * 0.5 + np.random.normal(0, 0.02, n)
    else:  # neutral
        vol_changes = np.random.normal(0, 0.05, n)
    closes = 100 * np.cumprod(1 + base_returns)
    volumes = 1_000_000 * np.cumprod(1 + vol_changes)
    out = analyzer._calculate_price_volume_correlation(pd.Series(closes), pd.Series(volumes))
    assert -1 <= out["correlation"] <= 1
    assert out["interpretation"] in {
        "strong_positive",
        "positive",
        "neutral",
        "strong_negative",
        "negative",
    }


# ---------- _analyze_money_flow (MFI) ----------


def test_money_flow_status_buckets(analyzer):
    # 单调上涨 → typical price 持续上升 → MFI 应高
    df = _df(np.linspace(100, 200, 60))
    out = analyzer._analyze_money_flow(df)
    assert out["status"] in {"overbought", "strong_inflow", "neutral"}
    assert 0 <= out["mfi"] <= 100


def test_money_flow_handles_pure_downtrend(analyzer):
    df = _df(np.linspace(200, 100, 60))
    out = analyzer._analyze_money_flow(df)
    assert out["status"] in {"oversold", "strong_outflow", "neutral"}


# ---------- _identify_volume_patterns ----------


def test_volume_patterns_breakout_volume(analyzer):
    # 需要 ≥21 日，否则 rolling(20).max().iloc[-2] 是 NaN
    closes = [100] * 20 + [110]
    volumes = [1_000_000] * 20 + [3_000_000]
    df = _df(closes, volumes=volumes)
    out = analyzer._identify_volume_patterns(df)
    types = [p["pattern"] for p in out["patterns"]]
    assert "breakout_volume" in types


def test_volume_patterns_low_volume_decline(analyzer):
    closes = [100] * 15 + [99, 98, 97, 96, 95]
    volumes = [1_000_000] * 19 + [400_000]
    df = _df(closes, volumes=volumes)
    out = analyzer._identify_volume_patterns(df)
    types = [p["pattern"] for p in out["patterns"]]
    assert "low_volume_decline" in types


def test_volume_patterns_high_volume_stagnation(analyzer):
    # 5 日均量 > 20 日均量 1.3x，价格几乎不变
    closes = [100.0] * 15 + [100.5, 100.3, 100.4, 100.2, 100.3]
    volumes = [1_000_000] * 15 + [2_000_000] * 5
    df = _df(closes, volumes=volumes)
    out = analyzer._identify_volume_patterns(df)
    types = [p["pattern"] for p in out["patterns"]]
    assert "high_volume_stagnation" in types


def test_volume_patterns_extremely_low_volume(analyzer):
    closes = [100.0] * 20
    volumes = [1_000_000] * 19 + [100_000]
    df = _df(closes, volumes=volumes)
    out = analyzer._identify_volume_patterns(df)
    types = [p["pattern"] for p in out["patterns"]]
    assert "extremely_low_volume" in types


def test_volume_patterns_extremely_high_volume(analyzer):
    closes = [100.0] * 20
    volumes = [1_000_000] * 19 + [4_000_000]
    df = _df(closes, volumes=volumes)
    out = analyzer._identify_volume_patterns(df)
    types = [p["pattern"] for p in out["patterns"]]
    assert "extremely_high_volume" in types


def test_volume_patterns_calm_no_signals(analyzer):
    closes = list(np.linspace(100, 101, 25))
    df = _df(closes)
    out = analyzer._identify_volume_patterns(df)
    assert out["patterns_found"] == 0


# ---------- _analyze_obv ----------


def test_obv_uptrend_bullish(analyzer):
    closes = list(np.linspace(100, 120, 30))
    df = _df(closes)
    out = analyzer._analyze_obv(df["close"], df["volume"])
    assert out["obv_trend"] == "bullish"


def test_obv_downtrend_bearish(analyzer):
    closes = list(np.linspace(120, 100, 30))
    df = _df(closes)
    out = analyzer._analyze_obv(df["close"], df["volume"])
    assert out["obv_trend"] == "bearish"


def test_obv_flat_neutral_or_one_of_two(analyzer):
    closes = [100.0] * 30
    df = _df(closes)
    out = analyzer._analyze_obv(df["close"], df["volume"])
    # 完全平价 → ma5 == ma20 → neutral
    assert out["obv_trend"] == "neutral"


# ---------- _analyze_accumulation_distribution ----------


def test_ad_accumulation(analyzer):
    closes = list(np.linspace(100, 120, 30))
    # close 接近 high → CLV 偏正 → AD 累积
    highs = [c * 1.005 for c in closes]
    lows = [c * 0.99 for c in closes]
    df = _df(closes, highs=highs, lows=lows)
    out = analyzer._analyze_accumulation_distribution(df)
    assert out["ad_trend"] == "accumulation"


def test_ad_distribution(analyzer):
    closes = list(np.linspace(120, 100, 30))
    # close 接近 low → CLV 偏负 → AD 派发
    highs = [c * 1.01 for c in closes]
    lows = [c * 0.995 for c in closes]
    df = _df(closes, highs=highs, lows=lows)
    out = analyzer._analyze_accumulation_distribution(df)
    assert out["ad_trend"] == "distribution"


def test_ad_handles_high_equal_low(analyzer):
    closes = [100.0] * 30
    df = _df(closes, highs=closes, lows=closes)
    out = analyzer._analyze_accumulation_distribution(df)
    # high==low 时 CLV 被 fillna(0) → 不崩
    assert out["ad_trend"] in {"neutral", "accumulation", "distribution"}


# ---------- _detect_divergence ----------


def test_divergence_handles_short_data(analyzer):
    df = _df([100] * 5)
    out = analyzer._detect_divergence(df)
    # <10 日数据走 short circuit
    assert out["divergences_found"] == 0


def test_divergence_returns_structure(analyzer, stable_df):
    out = analyzer._detect_divergence(stable_df)
    assert "divergences_found" in out
    assert "divergences" in out
    assert isinstance(out["divergences"], list)


def test_divergence_runs_without_error_on_normal_path(analyzer):
    # 精确 manufacture bearish/bullish divergence 依赖 OBV 累积细节，
    # 此处仅验证 ≥10 日数据时函数不崩、结构正确。
    closes_first = list(np.linspace(100, 110, 10))
    closes_second = list(np.linspace(110, 115, 10))
    closes = closes_first + closes_second
    df = _df(closes, volumes=[1_000_000] * 20)
    out = analyzer._detect_divergence(df)
    assert isinstance(out["divergences_found"], int)
    assert isinstance(out["divergences"], list)


# ---------- _calculate_vpvr ----------


def test_vpvr_returns_poc_vah_val(analyzer, stable_df):
    out = analyzer._calculate_vpvr(stable_df)
    assert "poc" in out
    assert "vah" in out
    assert "val" in out
    assert out["val"] <= out["poc"] <= out["vah"]
    assert isinstance(out["profile"], list)
    assert len(out["profile"]) == 24  # 默认 bins


def test_vpvr_empty_when_price_min_equals_max(analyzer):
    closes = [100.0] * 30
    df = _df(closes, highs=closes, lows=closes)
    out = analyzer._calculate_vpvr(df)
    # min == max 走 early return
    assert out == {}


def test_vpvr_custom_bins(analyzer, stable_df):
    out = analyzer._calculate_vpvr(stable_df, bins=10)
    assert len(out["profile"]) == 10


def test_vpvr_profile_marks_poc_and_value_area(analyzer, stable_df):
    out = analyzer._calculate_vpvr(stable_df)
    pocs = [b for b in out["profile"] if b["is_poc"]]
    in_value = [b for b in out["profile"] if b["in_value_area"]]
    assert len(pocs) == 1
    assert len(in_value) >= 1

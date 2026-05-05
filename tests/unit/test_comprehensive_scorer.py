"""ComprehensiveScorer characterization tests.

锁定当前打分 / 推荐 / 置信度 / 风险提示 / 评分解释生成器的输出形状与边界，
为后续重构（拆分聚合层、调整权重）提供回归网。
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from src.analytics.comprehensive_scorer import ComprehensiveScorer


@pytest.fixture
def scorer():
    return ComprehensiveScorer()


# ---------- 短路：数据不足 ----------


def test_comprehensive_analysis_returns_neutral_when_data_insufficient(scorer):
    df = pd.DataFrame(
        {"open": [1] * 10, "high": [1] * 10, "low": [1] * 10, "close": [1] * 10, "volume": [1] * 10}
    )
    out = scorer.comprehensive_analysis(df)
    assert out["overall_score"] == 50
    assert out["recommendation"] == "观望"
    assert out["confidence"] == "low"
    assert "error" in out


def test_comprehensive_analysis_handles_empty_dataframe(scorer):
    out = scorer.comprehensive_analysis(pd.DataFrame())
    assert out["overall_score"] == 50
    assert out["recommendation"] == "观望"


# ---------- _calculate_trend_score ----------


@pytest.mark.parametrize(
    "trend, expected_delta",
    [
        ("strong_bullish", 30),
        ("bullish", 20),
        ("strong_bearish", -30),
        ("bearish", -20),
        ("neutral", 0),
    ],
)
def test_trend_score_responds_to_trend_direction(scorer, trend, expected_delta):
    # 默认 strength 50 不命中任何分支（>50 / <50 / >70 / <30 都不满足），
    # 所以仅按 trend 方向加减
    score = scorer._calculate_trend_score({"trend": trend})
    assert score == max(0, min(100, 50 + expected_delta))


@pytest.mark.parametrize(
    # 注意 strength==50 是个无操作 corner case：>50 / <50 / >70 / <30 都不命中
    "strength, delta",
    [(80, 10), (60, 5), (20, -10), (40, -5)],
)
def test_trend_score_responds_to_strength(scorer, strength, delta):
    score = scorer._calculate_trend_score({"trend": "neutral", "trend_strength": strength})
    assert score == max(0, min(100, 50 + delta))


def test_trend_score_strength_50_is_noop_branch(scorer):
    score = scorer._calculate_trend_score({"trend": "neutral", "trend_strength": 50})
    assert score == 50


@pytest.mark.parametrize(
    "signal, delta",
    [("strong_buy", 10), ("buy", 5), ("strong_sell", -10), ("sell", -5), ("neutral", 0)],
)
def test_trend_score_responds_to_signal_strength(scorer, signal, delta):
    score = scorer._calculate_trend_score(
        {"trend": "neutral", "trend_strength": 60, "signal_strength": {"signal": signal}}
    )
    # base 50 + strength(60→+5) + signal delta
    assert score == max(0, min(100, 50 + 5 + delta))


def test_trend_score_clamped_to_0_100(scorer):
    extreme = scorer._calculate_trend_score(
        {
            "trend": "strong_bullish",
            "trend_strength": 90,
            "signal_strength": {"signal": "strong_buy"},
        }
    )
    assert extreme == 100


# ---------- _calculate_volume_score ----------


def test_volume_score_obv_bullish(scorer):
    s = scorer._calculate_volume_score({"obv_analysis": {"obv_trend": "bullish"}})
    assert s == 70


def test_volume_score_obv_bearish(scorer):
    s = scorer._calculate_volume_score({"obv_analysis": {"obv_trend": "bearish"}})
    assert s == 30


@pytest.mark.parametrize(
    "flow_status, delta",
    [
        ("strong_inflow", 15),
        ("strong_outflow", -15),
        ("overbought", -10),
        ("oversold", 10),
        ("neutral", 0),
    ],
)
def test_volume_score_money_flow(scorer, flow_status, delta):
    s = scorer._calculate_volume_score({"money_flow": {"status": flow_status}})
    assert s == max(0, min(100, 50 + delta))


@pytest.mark.parametrize(
    "ad_trend, delta",
    [("accumulation", 10), ("distribution", -10), ("neutral", 0)],
)
def test_volume_score_accumulation_distribution(scorer, ad_trend, delta):
    s = scorer._calculate_volume_score({"accumulation_distribution": {"ad_trend": ad_trend}})
    assert s == max(0, min(100, 50 + delta))


def test_volume_score_divergences_accumulate(scorer):
    s = scorer._calculate_volume_score(
        {
            "divergence": {
                "divergences": [
                    {"signal": "bullish", "description": "x"},
                    {"signal": "bullish", "description": "y"},
                    {"signal": "bearish", "description": "z"},
                ]
            }
        }
    )
    assert s == 50 + 5 + 5 - 5  # 55


# ---------- _calculate_sentiment_score ----------


def test_sentiment_score_starts_from_fear_greed_index(scorer):
    s = scorer._calculate_sentiment_score({"fear_greed_index": 65})
    assert s == 65


def test_sentiment_score_capped_by_very_high_risk(scorer):
    s = scorer._calculate_sentiment_score(
        {"fear_greed_index": 80, "risk_level": "very_high"}
    )
    assert s == 30


def test_sentiment_score_capped_by_high_risk(scorer):
    s = scorer._calculate_sentiment_score({"fear_greed_index": 80, "risk_level": "high"})
    assert s == 50


def test_sentiment_score_panic_selling_lowers_score(scorer):
    s = scorer._calculate_sentiment_score(
        {
            "fear_greed_index": 50,
            "extreme_sentiment": {
                "has_extreme_sentiment": True,
                "signals": [{"type": "panic_selling"}],
            },
        }
    )
    assert s == 40


def test_sentiment_score_frenzy_buying_lowers_score(scorer):
    s = scorer._calculate_sentiment_score(
        {
            "fear_greed_index": 50,
            "extreme_sentiment": {
                "has_extreme_sentiment": True,
                "signals": [{"type": "frenzy_buying"}],
            },
        }
    )
    assert s == 40


def test_sentiment_score_clamped(scorer):
    s = scorer._calculate_sentiment_score({"fear_greed_index": 200})
    assert s == 100


# ---------- _calculate_technical_score ----------


def test_technical_score_uses_trend_score_baseline(scorer):
    s = scorer._calculate_technical_score({"score": 70})
    assert s == 70


def test_technical_score_all_timeframes_bullish(scorer):
    s = scorer._calculate_technical_score(
        {
            "score": 60,
            "multi_timeframe": {
                "1d": {"trend": "上涨"},
                "1w": {"trend": "上涨"},
                "1m": {"trend": "上涨"},
            },
        }
    )
    assert s == 70  # 60 + 10


def test_technical_score_two_thirds_bullish(scorer):
    s = scorer._calculate_technical_score(
        {
            "score": 60,
            "multi_timeframe": {
                "1d": {"trend": "上涨"},
                "1w": {"trend": "上涨"},
                "1m": {"trend": "下跌"},
            },
        }
    )
    assert s == 65  # 60 + 5


def test_technical_score_all_bearish(scorer):
    s = scorer._calculate_technical_score(
        {
            "score": 60,
            "multi_timeframe": {
                "1d": {"trend": "下跌"},
                "1w": {"trend": "下跌"},
                "1m": {"trend": "下跌"},
            },
        }
    )
    assert s == 50  # 60 - 10


def test_technical_score_clamped(scorer):
    s = scorer._calculate_technical_score({"score": 200})
    assert s == 100


# ---------- _calculate_fundamental_score ----------


def test_fundamental_score_averages_three_dimensions(scorer):
    s = scorer._calculate_fundamental_score(
        {
            "valuation": {"score": 60},
            "financial_health": {"score": 70},
            "growth": {"score": 80},
        }
    )
    assert s == pytest.approx(70.0)


def test_fundamental_score_falls_back_to_50_when_missing(scorer):
    assert scorer._calculate_fundamental_score({}) == pytest.approx(50.0)


# ---------- _generate_recommendation ----------


@pytest.mark.parametrize(
    "score, expected",
    [(80, "强烈买入"), (65, "买入"), (50, "持有"), (35, "卖出"), (20, "强烈卖出")],
)
def test_recommendation_buckets(scorer, score, expected):
    assert scorer._generate_recommendation(score, {}, {}, {}) == expected


# ---------- _assess_confidence ----------


def test_confidence_very_high_when_all_signals_strong(scorer):
    c = scorer._assess_confidence(
        trend_result={
            "trend_strength": 80,
            "signal_strength": {"buy_strength": 80, "sell_strength": 0},
        },
        volume_result={"price_volume_correlation": {"correlation": 0.7}},
        sentiment_result={},
    )
    assert c == "very_high"


def test_confidence_low_when_no_signals(scorer):
    c = scorer._assess_confidence(
        trend_result={"trend_strength": 10},
        volume_result={},
        sentiment_result={},
    )
    assert c == "low"


def test_confidence_medium_threshold(scorer):
    # trend_strength=40 → +1, buy=40/sell=0 不命中 (>50 / >75 都不到) → +0,
    # corr 0.4 → +1。 total=2 → "low"。改测 high 的边界：
    c = scorer._assess_confidence(
        trend_result={
            "trend_strength": 60,
            "signal_strength": {"buy_strength": 60, "sell_strength": 0},
        },
        volume_result={"price_volume_correlation": {"correlation": 0.4}},
        sentiment_result={},
    )
    # trend +2, signal +2, corr +1 → 5 → "high"
    assert c == "high"


def test_confidence_medium_when_score_3_to_4(scorer):
    # trend_strength=40 → +1, buy_strength=60/sell=0 → +2 (>50). total=3 → medium
    c = scorer._assess_confidence(
        trend_result={
            "trend_strength": 40,
            "signal_strength": {"buy_strength": 60, "sell_strength": 0},
        },
        volume_result={},
        sentiment_result={},
    )
    assert c == "medium"


# ---------- _summarize_key_signals ----------


def test_key_signals_strong_bullish(scorer):
    out = scorer._summarize_key_signals(
        {"trend": "strong_bullish", "indicators": {}}, {}, {}
    )
    types = [s["type"] for s in out]
    assert "趋势" in types


def test_key_signals_volume_patterns_added(scorer):
    out = scorer._summarize_key_signals(
        {"trend": "neutral", "indicators": {}},
        {"volume_patterns": {"patterns": [{"description": "巨量上攻"}]}},
        {},
    )
    assert any(s["type"] == "量价" and s["signal"] == "巨量上攻" for s in out)


def test_key_signals_extreme_sentiment_greed(scorer):
    out = scorer._summarize_key_signals(
        {"trend": "neutral", "indicators": {}},
        {},
        {"overall_sentiment": "extreme_greed"},
    )
    assert any(s["type"] == "情绪" and "贪婪" in s["signal"] for s in out)


def test_key_signals_extreme_sentiment_fear(scorer):
    out = scorer._summarize_key_signals(
        {"trend": "neutral", "indicators": {}},
        {},
        {"overall_sentiment": "extreme_fear"},
    )
    assert any(s["type"] == "情绪" and "恐慌" in s["signal"] for s in out)


def test_key_signals_rsi_overbought(scorer):
    out = scorer._summarize_key_signals(
        {"trend": "neutral", "indicators": {"rsi": 80}}, {}, {}
    )
    assert any(s["signal"] == "RSI超买" for s in out)


def test_key_signals_rsi_oversold(scorer):
    out = scorer._summarize_key_signals(
        {"trend": "neutral", "indicators": {"rsi": 20}}, {}, {}
    )
    assert any(s["signal"] == "RSI超卖" for s in out)


# ---------- _generate_risk_warnings ----------


def test_risk_warnings_high_risk(scorer):
    ws = scorer._generate_risk_warnings(
        {}, {}, {"risk_level": "very_high"}
    )
    assert any("极高" in w for w in ws)


def test_risk_warnings_divergence(scorer):
    ws = scorer._generate_risk_warnings(
        {},
        {"divergence": {"divergences": [{"description": "顶背离"}]}},
        {},
    )
    assert any("顶背离" in w and "趋势反转" in w for w in ws)


def test_risk_warnings_extreme_sentiment(scorer):
    ws = scorer._generate_risk_warnings(
        {}, {}, {"extreme_sentiment": {"has_extreme_sentiment": True}}
    )
    assert any("极端情绪" in w for w in ws)


def test_risk_warnings_high_volatility(scorer):
    ws = scorer._generate_risk_warnings(
        {"volatility": {"level": "high"}}, {}, {}
    )
    assert any("波动率" in w for w in ws)


def test_risk_warnings_weak_trend(scorer):
    ws = scorer._generate_risk_warnings(
        {"trend_strength": 20}, {}, {}
    )
    assert any("趋势强度" in w for w in ws)


def test_risk_warnings_empty_when_all_clear(scorer):
    ws = scorer._generate_risk_warnings(
        {"trend_strength": 80}, {}, {"risk_level": "low"}
    )
    assert ws == []


# ---------- _generate_score_explanation ----------


def test_score_explanation_returns_five_dimensions(scorer):
    out = scorer._generate_score_explanation(
        50, 50, 50, 50, 50,
        {"trend": "neutral", "indicators": {}},
        {"money_flow": {"status": "neutral"}},
        {"fear_greed_index": 50, "overall_sentiment": "neutral"},
    )
    dims = [item["dimension"] for item in out]
    assert dims == ["趋势面", "资金面", "情绪面", "技术面", "基本面"]


def test_score_explanation_bullish_trend_text(scorer):
    out = scorer._generate_score_explanation(
        70, 50, 50, 50, 50,
        {"trend": "strong_bullish", "trend_strength": 80, "indicators": {}},
        {"money_flow": {"status": "strong_inflow"}},
        {"fear_greed_index": 70, "overall_sentiment": "greed"},
    )
    by_dim = {item["dimension"]: item for item in out}
    assert "强" in by_dim["趋势面"]["reason"]
    assert by_dim["资金面"]["reason"] == "主力资金强劲流入"


def test_score_explanation_bearish_trend_text(scorer):
    out = scorer._generate_score_explanation(
        30, 50, 50, 50, 50,
        {"trend": "strong_bearish", "trend_strength": 80, "indicators": {}},
        {"money_flow": {"status": "strong_outflow"}},
        {"fear_greed_index": 30, "overall_sentiment": "fear"},
    )
    by_dim = {item["dimension"]: item for item in out}
    assert "下跌" in by_dim["趋势面"]["reason"]
    assert by_dim["资金面"]["reason"] == "主力资金大幅流出"


def test_score_explanation_overbought_money_flow_text(scorer):
    out = scorer._generate_score_explanation(
        50, 50, 50, 50, 50,
        {"trend": "neutral", "indicators": {}},
        {"money_flow": {"status": "overbought"}},
        {"fear_greed_index": 50, "overall_sentiment": "neutral"},
    )
    by_dim = {item["dimension"]: item for item in out}
    assert "超买" in by_dim["资金面"]["reason"]


def test_score_explanation_oversold_money_flow_text(scorer):
    out = scorer._generate_score_explanation(
        50, 50, 50, 50, 50,
        {"trend": "neutral", "indicators": {}},
        {"money_flow": {"status": "oversold"}},
        {"fear_greed_index": 50, "overall_sentiment": "neutral"},
    )
    by_dim = {item["dimension"]: item for item in out}
    assert "超卖" in by_dim["资金面"]["reason"]


def test_score_explanation_rsi_overbought_text(scorer):
    out = scorer._generate_score_explanation(
        50, 50, 50, 50, 50,
        {
            "trend": "neutral",
            "indicators": {"rsi": 75, "macd": {"histogram": 1}},
        },
        {"money_flow": {"status": "neutral"}},
        {"fear_greed_index": 50, "overall_sentiment": "neutral"},
    )
    by_dim = {item["dimension"]: item for item in out}
    assert "RSI超买" in by_dim["技术面"]["reason"]
    assert "MACD金叉" in by_dim["技术面"]["reason"]


def test_score_explanation_rsi_oversold_macd_dead_cross(scorer):
    out = scorer._generate_score_explanation(
        50, 50, 50, 50, 50,
        {
            "trend": "neutral",
            "indicators": {"rsi": 25, "macd": {"histogram": -1}},
        },
        {"money_flow": {"status": "neutral"}},
        {"fear_greed_index": 50, "overall_sentiment": "neutral"},
    )
    by_dim = {item["dimension"]: item for item in out}
    assert "RSI超卖" in by_dim["技术面"]["reason"]
    assert "MACD死叉" in by_dim["技术面"]["reason"]


def test_score_explanation_handles_non_numeric_rsi(scorer):
    # 当 indicators 没有 macd 时，代码默认走"MACD死叉"分支（这是当前行为，
    # 看似 bug 但已被 UI 适配——锁定为 characterization 测试）
    out = scorer._generate_score_explanation(
        50, 50, 50, 50, 50,
        {"trend": "neutral", "indicators": {"rsi": "n/a"}},
        {"money_flow": {"status": "neutral"}},
        {"fear_greed_index": 50, "overall_sentiment": "neutral"},
    )
    by_dim = {item["dimension"]: item for item in out}
    # rsi 非数字 → 重置为 50 → 不触发 RSI 信号
    assert "RSI" not in by_dim["技术面"]["reason"]
    # macd 缺失 → 默认空 dict → histogram>0 不成立 → 进入 "MACD死叉" 分支
    assert "MACD死叉" in by_dim["技术面"]["reason"]


@pytest.mark.parametrize(
    "fund_score, expected",
    [(70, "稳健"), (50, "一般"), (20, "较弱")],
)
def test_score_explanation_fundamental_text(scorer, fund_score, expected):
    out = scorer._generate_score_explanation(
        50, 50, 50, 50, fund_score,
        {"trend": "neutral", "indicators": {}},
        {"money_flow": {"status": "neutral"}},
        {"fear_greed_index": 50, "overall_sentiment": "neutral"},
    )
    by_dim = {item["dimension"]: item for item in out}
    assert expected in by_dim["基本面"]["reason"]


# ---------- _generate_recommendation_reasons ----------


def test_recommendation_reasons_bullish(scorer):
    out = scorer._generate_recommendation_reasons(
        {"trend": "strong_bullish", "signal_strength": {"buy_strength": 80}},
        {"volume_patterns": {"patterns": []}},
        {},
    )
    assert any("上升通道" in r for r in out)
    assert any("买入信号" in r for r in out)


def test_recommendation_reasons_bearish(scorer):
    out = scorer._generate_recommendation_reasons(
        {"trend": "strong_bearish", "signal_strength": {"sell_strength": 80}},
        {"volume_patterns": {"patterns": []}},
        {},
    )
    assert any("下降通道" in r for r in out)
    assert any("卖出信号" in r for r in out)


def test_recommendation_reasons_includes_volume_pattern(scorer):
    out = scorer._generate_recommendation_reasons(
        {"trend": "neutral", "signal_strength": {}},
        {"volume_patterns": {"patterns": [{"description": "放量突破"}]}},
        {},
    )
    assert any("放量突破" in r for r in out)


def test_recommendation_reasons_extreme_fear(scorer):
    out = scorer._generate_recommendation_reasons(
        {"trend": "neutral", "signal_strength": {}},
        {"volume_patterns": {"patterns": []}},
        {"overall_sentiment": "extreme_fear"},
    )
    assert any("超跌反弹" in r for r in out)


def test_recommendation_reasons_extreme_greed(scorer):
    out = scorer._generate_recommendation_reasons(
        {"trend": "neutral", "signal_strength": {}},
        {"volume_patterns": {"patterns": []}},
        {"overall_sentiment": "extreme_greed"},
    )
    assert any("追高风险" in r for r in out)


# ---------- comprehensive_analysis 集成路径 ----------


def test_comprehensive_analysis_integration(scorer, sample_data):
    fake_trend = {
        "trend": "bullish",
        "trend_strength": 60,
        "signal_strength": {"signal": "buy", "buy_strength": 65, "sell_strength": 10},
        "score": 65,
        "indicators": {"rsi": 55, "macd": {"histogram": 0.5}},
        "multi_timeframe": {},
        "volatility": {"level": "medium"},
    }
    fake_volume = {
        "obv_analysis": {"obv_trend": "bullish"},
        "money_flow": {"status": "strong_inflow"},
        "accumulation_distribution": {"ad_trend": "accumulation"},
        "divergence": {"divergences": []},
        "price_volume_correlation": {"correlation": 0.6},
        "volume_patterns": {"patterns": []},
    }
    fake_sentiment = {
        "fear_greed_index": 60,
        "risk_level": "medium",
        "extreme_sentiment": {"has_extreme_sentiment": False, "signals": []},
        "overall_sentiment": "neutral",
    }
    fake_fund = {
        "valuation": {"score": 60},
        "financial_health": {"score": 60},
        "growth": {"score": 60},
    }
    scorer.trend_analyzer = MagicMock()
    scorer.trend_analyzer.analyze_trend.return_value = fake_trend
    scorer.volume_analyzer = MagicMock()
    scorer.volume_analyzer.analyze.return_value = fake_volume
    scorer.sentiment_analyzer = MagicMock()
    scorer.sentiment_analyzer.analyze.return_value = fake_sentiment
    scorer.fundamental_analyzer = MagicMock()
    scorer.fundamental_analyzer.analyze.return_value = fake_fund
    scorer.pattern_recognizer = MagicMock()
    scorer.pattern_recognizer.recognize_patterns.return_value = {
        "candlestick_patterns": [],
        "chart_patterns": [],
    }

    out = scorer.comprehensive_analysis(sample_data, symbol="000001")

    # 必须返回的顶层键
    expected_keys = {
        "overall_score",
        "recommendation",
        "confidence",
        "scores",
        "score_explanation",
        "recommendation_reasons",
        "trend_analysis",
        "volume_analysis",
        "sentiment_analysis",
        "pattern_analysis",
        "fundamental_analysis",
        "key_signals",
        "risk_warnings",
    }
    assert expected_keys.issubset(out.keys())
    # 加权计算正确性 sanity
    assert 0 <= out["overall_score"] <= 100
    assert out["recommendation"] in {"强烈买入", "买入", "持有", "卖出", "强烈卖出"}
    assert out["confidence"] in {"very_high", "high", "medium", "low"}
    # scores dict 包含 5 个维度
    assert set(out["scores"].keys()) == {
        "trend",
        "volume",
        "sentiment",
        "technical",
        "fundamental",
    }


def test_comprehensive_analysis_skips_pattern_when_disabled(scorer, sample_data):
    scorer.trend_analyzer = MagicMock()
    scorer.trend_analyzer.analyze_trend.return_value = {
        "trend": "neutral",
        "trend_strength": 50,
        "signal_strength": {"signal": "neutral", "buy_strength": 30, "sell_strength": 30},
        "score": 50,
        "indicators": {},
        "multi_timeframe": {},
    }
    scorer.volume_analyzer = MagicMock()
    scorer.volume_analyzer.analyze.return_value = {
        "obv_analysis": {},
        "money_flow": {},
        "accumulation_distribution": {},
        "divergence": {},
        "price_volume_correlation": {},
        "volume_patterns": {"patterns": []},
    }
    scorer.sentiment_analyzer = MagicMock()
    scorer.sentiment_analyzer.analyze.return_value = {
        "fear_greed_index": 50,
        "risk_level": "medium",
        "extreme_sentiment": {"has_extreme_sentiment": False, "signals": []},
        "overall_sentiment": "neutral",
    }
    scorer.fundamental_analyzer = MagicMock()
    scorer.fundamental_analyzer.analyze.return_value = {
        "valuation": {"score": 50},
        "financial_health": {"score": 50},
        "growth": {"score": 50},
    }
    scorer.pattern_recognizer = MagicMock()

    out = scorer.comprehensive_analysis(sample_data, include_pattern=False)

    scorer.pattern_recognizer.recognize_patterns.assert_not_called()
    assert out["pattern_analysis"] == {
        "candlestick_patterns": [],
        "chart_patterns": [],
    }


def test_comprehensive_analysis_swallows_pattern_recognizer_error(scorer, sample_data, caplog):
    scorer.trend_analyzer = MagicMock()
    scorer.trend_analyzer.analyze_trend.return_value = {
        "trend": "neutral",
        "trend_strength": 50,
        "signal_strength": {"signal": "neutral", "buy_strength": 0, "sell_strength": 0},
        "score": 50,
        "indicators": {},
        "multi_timeframe": {},
    }
    scorer.volume_analyzer = MagicMock()
    scorer.volume_analyzer.analyze.return_value = {
        "obv_analysis": {},
        "money_flow": {},
        "accumulation_distribution": {},
        "divergence": {},
        "price_volume_correlation": {},
        "volume_patterns": {"patterns": []},
    }
    scorer.sentiment_analyzer = MagicMock()
    scorer.sentiment_analyzer.analyze.return_value = {
        "fear_greed_index": 50,
        "risk_level": "medium",
        "extreme_sentiment": {"has_extreme_sentiment": False, "signals": []},
        "overall_sentiment": "neutral",
    }
    scorer.fundamental_analyzer = MagicMock()
    scorer.fundamental_analyzer.analyze.return_value = {
        "valuation": {"score": 50},
        "financial_health": {"score": 50},
        "growth": {"score": 50},
    }
    scorer.pattern_recognizer = MagicMock()
    scorer.pattern_recognizer.recognize_patterns.side_effect = RuntimeError("boom")

    out = scorer.comprehensive_analysis(sample_data)

    # 异常被吞，pattern_analysis 退化到默认形态
    assert out["pattern_analysis"] == {
        "candlestick_patterns": [],
        "chart_patterns": [],
    }

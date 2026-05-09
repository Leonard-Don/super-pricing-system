"""Pure-function characterization tests for PricingGapAnalyzer.

Locks the screener-score arithmetic plus the surrounding pure helpers
(`_analyze_gap` severity tiers and sentinel guards, driver signal-strength
normalization, ranking-reason text, sort/rank assignment, summary text).
The arithmetic mixes alignment status mapping, governance-overlay
penalty/support sign-flipping, hard floors, and tier boundaries — all easy
to break silently in a refactor, so we pin the numbers and strings.
"""

import pytest

from src.analytics.pricing_gap_analyzer import PricingGapAnalyzer


@pytest.fixture
def analyzer():
    return PricingGapAnalyzer.__new__(PricingGapAnalyzer)


# ---------------------------------------------------------------------------
# `_screening_score` — alignment / actionable / governance arithmetic
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "kwargs, expected",
    [
        # 低估 + 治理支撑（negative discount_pct）— support 项被加上，penalty 被减去（双重利好）
        (
            dict(
                gap_pct=-25.0,
                confidence_score=0.6,
                primary_view="低估",
                alignment_status="aligned",
                people_governance_overlay={"governance_discount_pct": -4.0, "confidence": 0.7},
            ),
            21.84,
        ),
        # 高估 + 治理折价（positive discount_pct）— penalty 加大可操作性，conflict alignment 拉低总分
        (
            dict(
                gap_pct=30.0,
                confidence_score=0.5,
                primary_view="高估",
                alignment_status="conflict",
                people_governance_overlay={"governance_discount_pct": 8.0, "confidence": 0.6},
            ),
            13.86,
        ),
        # primary_view 不在 {高估,低估} → actionable_bonus=0；conflict 把总分压到负，floor 至 0
        (
            dict(
                gap_pct=5.0,
                confidence_score=0.3,
                primary_view="合理",
                alignment_status="conflict",
                people_governance_overlay=None,
            ),
            0.0,
        ),
        # gap_pct=None / confidence=0 → 触发 `or 0` 与 max(.., 0.2) 下限；空 overlay 走 dict 默认路径
        (
            dict(
                gap_pct=None,
                confidence_score=0.0,
                primary_view="低估",
                alignment_status="partial",
                people_governance_overlay={},
            ),
            3.5,
        ),
        # 低估 + 正向 discount_pct — 只减 penalty，support 因 min(positive, 0)=0 而失效
        (
            dict(
                gap_pct=-15.0,
                confidence_score=0.5,
                primary_view="低估",
                alignment_status="neutral",
                people_governance_overlay={"governance_discount_pct": 6.0, "confidence": 0.5},
            ),
            8.96,
        ),
        # 高估 + 负向 discount_pct — penalty 因符号变负 *降低* actionable_bonus；
        # governance_support 被算出但只在低估分支使用，此处不参与（锁住分支不对称）
        (
            dict(
                gap_pct=20.0,
                confidence_score=0.6,
                primary_view="高估",
                alignment_status="aligned",
                people_governance_overlay={"governance_discount_pct": -5.0, "confidence": 0.8},
            ),
            17.28,
        ),
    ],
)
def test_screening_score_branches(analyzer, kwargs, expected):
    assert analyzer._screening_score(**kwargs) == pytest.approx(expected)


def test_screening_score_unknown_alignment_status_yields_zero_bonus(analyzer):
    """Unmapped alignment_status falls through .get(default=0.0) — no contribution."""
    score = analyzer._screening_score(
        gap_pct=20.0,
        confidence_score=1.0,
        primary_view="高估",
        alignment_status="not-a-real-status",
        people_governance_overlay=None,
    )
    # base=20*1.0=20, alignment=0, actionable=2 (高估 in set, no overlay) → 22.0
    assert score == pytest.approx(22.0)


def test_screening_score_governance_confidence_floor_at_0_2(analyzer):
    """`governance_confidence < 0.2` is clamped to 0.2 in the penalty multiplier."""
    score = analyzer._screening_score(
        gap_pct=20.0,
        confidence_score=0.5,
        primary_view="高估",
        alignment_status="aligned",
        people_governance_overlay={"governance_discount_pct": 10.0, "confidence": 0.05},
    )
    # base=20*0.5=10, alignment=4 (aligned), penalty=10*max(0.05,0.2)*0.18=0.36
    # 高估: actionable=2+0.36=2.36; total=10+4+2.36=16.36
    # Without the floor, penalty would be 10*0.05*0.18=0.09 → total 16.09 — distinguishes the clamp.
    assert score == pytest.approx(16.36)


def test_screening_score_negative_confidence_score_floored_to_0_2(analyzer):
    """Negative `confidence_score` is clamped to 0.2 — base score stays positive instead of inverting."""
    score = analyzer._screening_score(
        gap_pct=20.0,
        confidence_score=-0.5,
        primary_view="低估",
        alignment_status="aligned",
        people_governance_overlay=None,
    )
    # base=abs(20)*max(-0.5,0.2)=20*0.2=4, alignment=4, actionable=2 → 10.0
    # Without the floor, base=-10 → max(-4, 0)=0 — distinguishes the clamp.
    assert score == pytest.approx(10.0)


# ---------------------------------------------------------------------------
# `_analyze_gap` — sentinel guards and severity tier boundaries
# ---------------------------------------------------------------------------


UNKNOWN_GAP_RESULT = {
    "mispricing_ratio": None,
    "gap_absolute": None,
    "gap_pct": None,
    "severity": "unknown",
    "label": "数据不足，无法计算定价差异",
}


@pytest.mark.parametrize(
    "valuation",
    [
        # missing fair_value entirely
        {},
        # mid is None
        {"current_price": 100.0, "fair_value": {"mid": None}},
        # mid is 0 (falsy → caught by `not mid_value`)
        {"current_price": 100.0, "fair_value": {"mid": 0}},
        # mid is negative (truthy, but `mid_value <= 0` triggers)
        {"current_price": 100.0, "fair_value": {"mid": -5.0}},
        # current_price is 0
        {"current_price": 0, "fair_value": {"mid": 100.0}},
        # current_price is negative
        {"current_price": -5.0, "fair_value": {"mid": 100.0}},
    ],
)
def test_analyze_gap_returns_unknown_when_inputs_missing(analyzer, valuation):
    assert analyzer._analyze_gap(factor={}, valuation=valuation) == UNKNOWN_GAP_RESULT


@pytest.mark.parametrize(
    "current_price, mid_value, expected_severity, expected_gap_pct, expected_direction",
    [
        # extreme: > 30%
        (140.0, 100.0, "extreme", 40.0, "溢价(高估)"),
        # boundary: exactly 30% — `> 0.30` is False so it's "high", not "extreme"
        (130.0, 100.0, "high", 30.0, "溢价(高估)"),
        # mid-tier samples (off-boundary)
        (115.0, 100.0, "moderate", 15.0, "溢价(高估)"),
        (107.0, 100.0, "mild", 7.0, "溢价(高估)"),
        (102.0, 100.0, "negligible", 2.0, "溢价(高估)"),
        # negative direction
        (85.0, 100.0, "moderate", -15.0, "折价(低估)"),
        # exact tie → direction=持平, severity=negligible
        (100.0, 100.0, "negligible", 0.0, "持平"),
    ],
)
def test_analyze_gap_severity_and_direction(
    analyzer,
    current_price,
    mid_value,
    expected_severity,
    expected_gap_pct,
    expected_direction,
):
    valuation = {
        "current_price": current_price,
        "fair_value": {"mid": mid_value, "low": mid_value * 0.9, "high": mid_value * 1.1},
        "valuation_status": {"label": "stub", "in_fair_range": True},
    }
    result = analyzer._analyze_gap(factor={}, valuation=valuation)
    assert result["severity"] == expected_severity
    assert result["gap_pct"] == pytest.approx(expected_gap_pct)
    assert result["direction"] == expected_direction
    assert result["valuation_label"] == "stub"
    assert result["in_fair_range"] is True


# ---------------------------------------------------------------------------
# `_driver_signal_strength` — per-impact normalization
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "driver, expected",
    [
        # alpha-style: magnitude / 5.0
        ({"impact": "positive", "magnitude": 10}, 2.0),
        ({"impact": "negative", "magnitude": 15}, 3.0),
        # beta-style: abs(magnitude - 1) / 0.3
        ({"impact": "risk", "magnitude": 1.6}, 2.0),
        ({"impact": "defensive", "magnitude": 0.4}, 2.0),
        # style: magnitude / 0.3
        ({"impact": "style", "magnitude": 0.6}, 2.0),
        # multiple-style: abs(magnitude - 1) / 0.3
        ({"impact": "overvalued", "magnitude": 1.6}, 2.0),
        ({"impact": "undervalued", "magnitude": 0.4}, 2.0),
        # default fallthrough: raw magnitude
        ({"impact": "market", "magnitude": 2.5}, 2.5),
        # missing impact key also takes the default branch
        ({"magnitude": 1.7}, 1.7),
        # None magnitude → `or 0` short-circuits to 0 across all branches
        ({"impact": "positive", "magnitude": None}, 0.0),
    ],
)
def test_driver_signal_strength_per_impact(analyzer, driver, expected):
    assert analyzer._driver_signal_strength(driver) == pytest.approx(expected)


def test_driver_signal_strength_short_circuits_when_precomputed(analyzer):
    """If `_signal_strength` is preset on the driver, recompute is skipped (cache contract)."""
    driver = {"_signal_strength": 7.0, "impact": "positive", "magnitude": 999}
    assert analyzer._driver_signal_strength(driver) == pytest.approx(7.0)


# ---------------------------------------------------------------------------
# `_driver_ranking_reason` — per-impact reason text branches
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "driver, expected_substring",
    [
        ({"impact": "positive"}, "Alpha 贡献最显著"),
        ({"impact": "negative"}, "负 Alpha 拖累"),
        ({"impact": "risk"}, "Beta 明显高于"),
        ({"impact": "defensive"}, "Beta 明显低于"),
        ({"impact": "style", "factor": "规模因子(小盘风格)"}, "规模因子(小盘风格) 暴露最突出"),
        ({"impact": "overvalued"}, "估值溢价"),
        ({"impact": "undervalued"}, "估值折价"),
        # unknown impact → generic fallback
        ({"impact": "market"}, "该信号的影响幅度最大"),
        # missing impact → also falls to the generic fallback
        ({}, "该信号的影响幅度最大"),
    ],
)
def test_driver_ranking_reason_branches(analyzer, driver, expected_substring):
    assert expected_substring in analyzer._driver_ranking_reason(driver)


# ---------------------------------------------------------------------------
# `_sort_drivers` — empty short-circuit + rank/strength enrichment
# ---------------------------------------------------------------------------


def test_sort_drivers_empty_returns_empty_list(analyzer):
    assert analyzer._sort_drivers([]) == []


def test_sort_drivers_orders_by_signal_strength_then_assigns_rank(analyzer):
    """Stronger signal goes first; ranks start at 1; signal_strength + ranking_reason are appended."""
    drivers = [
        {"factor": "AlphaA", "impact": "positive", "magnitude": 5.0},  # strength = 5/5 = 1.0
        {"factor": "StyleB", "impact": "style", "magnitude": 0.6},     # strength ≈ 2.0
    ]
    ranked = analyzer._sort_drivers(drivers)
    assert [d["factor"] for d in ranked] == ["StyleB", "AlphaA"]
    assert [d["rank"] for d in ranked] == [1, 2]
    assert ranked[0]["signal_strength"] == pytest.approx(2.0)
    assert ranked[1]["signal_strength"] == pytest.approx(1.0)
    assert ranked[0]["ranking_reason"]
    assert ranked[1]["ranking_reason"]


# ---------------------------------------------------------------------------
# `_generate_summary` — None-gap warning + people-stance suffix + 0→折价 quirk
# ---------------------------------------------------------------------------


def test_generate_summary_returns_warning_when_gap_pct_missing(analyzer):
    assert (
        analyzer._generate_summary(gap={"gap_pct": None}, valuation={})
        == "数据不足，无法进行定价差异分析"
    )


@pytest.mark.parametrize(
    "people_layer, expected_suffix",
    [
        (None, ""),
        ({}, ""),
        ({"stance": "fragile"}, "；人的维度偏脆弱"),
        ({"stance": "supportive"}, "；人的维度偏支撑"),
        # unknown stance falls through to no suffix
        ({"stance": "neutral"}, ""),
    ],
)
def test_generate_summary_people_layer_stance_suffix(analyzer, people_layer, expected_suffix):
    gap = {
        "current_price": 100,
        "fair_value_mid": 90,
        "gap_pct": 11.1,
        "severity_label": "中度偏离",
    }
    valuation = {"valuation_status": {"label": "高估"}}
    result = analyzer._generate_summary(gap, valuation, people_layer)
    assert result == f"市价$100，公允价值$90，溢价11.1%（中度偏离），估值状态：高估{expected_suffix}"


def test_generate_summary_zero_gap_pct_picks_折价_branch(analyzer):
    """gap_pct == 0 takes the `> 0` False branch → 折价; locks the asymmetric ternary."""
    gap = {
        "current_price": 100,
        "fair_value_mid": 100,
        "gap_pct": 0,
        "severity_label": "定价合理",
    }
    valuation = {"valuation_status": {"label": "合理"}}
    assert (
        analyzer._generate_summary(gap, valuation)
        == "市价$100，公允价值$100，折价0.0%（定价合理），估值状态：合理"
    )

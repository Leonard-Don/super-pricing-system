"""Pure-function characterization tests for PricingGapAnalyzer.

These tests pin down the screener-score arithmetic that drives the
ranking shown to users. The function mixes alignment status mapping,
governance-overlay penalty/support sign-flipping, and a hard floor at
zero — easy to break silently in a refactor, so we lock the numbers.
"""

import pytest

from src.analytics.pricing_gap_analyzer import PricingGapAnalyzer


@pytest.fixture
def analyzer():
    return PricingGapAnalyzer.__new__(PricingGapAnalyzer)


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

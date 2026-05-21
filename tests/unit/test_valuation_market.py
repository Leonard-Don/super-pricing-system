"""Market-aware DCF parameter tests (H3).

The DCF model historically hardcoded US parameters -- a US Treasury risk-free
rate and a US peer universe -- and applied them to every symbol regardless of
market. The model now detects the market from the symbol shape and uses
market-appropriate WACC inputs and comparable peers.
"""

import pytest

from src.analytics.valuation_model import MARKET_PARAMS, ValuationModel, _detect_market


@pytest.mark.parametrize(
    ("symbol", "expected_market"),
    [
        ("600519.SH", "CN"),
        ("000858.SZ", "CN"),
        ("0700.HK", "CN"),
        ("600519", "CN"),
        ("AAPL", "US"),
        ("GOOGL", "US"),
        ("TEST", "US"),
        ("", "US"),
    ],
)
def test_detect_market_classifies_by_symbol_shape(symbol, expected_market):
    assert _detect_market(symbol) == expected_market


def test_china_market_uses_a_lower_risk_free_rate_than_us():
    """A-share / HK valuations must anchor to China's sovereign yield, which is
    materially below the US Treasury yield."""
    assert MARKET_PARAMS["CN"]["risk_free_rate"] < MARKET_PARAMS["US"]["risk_free_rate"]


def test_dcf_applies_a_lower_wacc_for_china_than_us():
    """Same fundamentals, different market -> China's lower sovereign yield must
    flow through to a lower WACC and therefore a higher intrinsic value."""
    fundamentals = {
        "market_cap": 1_000.0,
        "enterprise_value": 1_000.0,
        "pe_ratio": 10.0,
        "revenue": 1_000.0,
        "profit_margin": 0.25,
        "operating_margin": 0.18,
        "shares_outstanding": 10.0,
        "beta": 1.0,
        "free_cash_flow": 120.0,
    }
    model = ValuationModel()

    us = model._dcf_valuation(dict(fundamentals), current_price=100.0, market="US")
    cn = model._dcf_valuation(dict(fundamentals), current_price=100.0, market="CN")

    assert "error" not in us and "error" not in cn
    assert cn["sensitivity_anchor"]["wacc"] < us["sensitivity_anchor"]["wacc"]
    assert cn["intrinsic_value"] > us["intrinsic_value"]

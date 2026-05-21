"""Tests for China A-share market classification (H4)."""

import pytest

from src.backtest.market_rules import a_share_price_limit_pct, is_a_share


@pytest.mark.parametrize(
    ("symbol", "expected"),
    [
        ("600519.SH", True),
        ("000858.SZ", True),
        ("688981.SH", True),
        ("300750.SZ", True),
        ("sh600000", True),
        ("600519", True),
        ("0700.HK", False),
        ("AAPL", False),
        ("", False),
    ],
)
def test_is_a_share(symbol, expected):
    assert is_a_share(symbol) is expected


@pytest.mark.parametrize(
    ("symbol", "expected_pct"),
    [
        ("600519.SH", 0.10),   # Shanghai main board
        ("000858.SZ", 0.10),   # Shenzhen main board
        ("688981.SH", 0.20),   # STAR Market
        ("300750.SZ", 0.20),   # ChiNext
        ("301236.SZ", 0.20),   # ChiNext (301 block)
        ("830799", 0.30),      # Beijing Stock Exchange
        ("AAPL", None),        # not an A-share
        ("0700.HK", None),     # Hong Kong has no daily price limit
    ],
)
def test_a_share_price_limit_pct(symbol, expected_pct):
    assert a_share_price_limit_pct(symbol) == expected_pct

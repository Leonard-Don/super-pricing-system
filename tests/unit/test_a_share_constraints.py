"""A-share execution-constraint tests (H4): T+1 settlement and price limits.

A `Backtester` constructed with a mainland A-share `symbol` must refuse fills
that are unrealizable on that market: buying a limit-up bar, selling a
limit-down bar, or selling a position on the same calendar day it was opened.
A US ticker carries none of these constraints.
"""

import pandas as pd

from src.backtest.backtester import Backtester


class _FixedSignals:
    name = "FixedSignals"

    def __init__(self, signals):
        self._signals = signals

    def generate_signals(self, data):
        return pd.Series(self._signals, index=data.index)


def _daily(prices):
    index = pd.date_range("2024-01-01", periods=len(prices), freq="D")
    return pd.DataFrame({"close": [float(p) for p in prices]}, index=index)


def test_limit_up_bar_blocks_a_buy():
    # Bar 1 closes +10% vs bar 0 -- limit-up on the main board; a buy is unfillable.
    data = _daily([10.0, 11.0, 12.0])
    results = Backtester(
        symbol="600519.SH", initial_capital=10_000, commission=0, slippage=0
    ).run(_FixedSignals([1, 0, 0]), data)
    assert results["num_trades"] == 0


def test_us_symbol_has_no_a_share_constraints():
    # Same +10% bar, but a US ticker has no price limit -- the buy goes through.
    data = _daily([10.0, 11.0, 12.0])
    results = Backtester(
        symbol="AAPL", initial_capital=10_000, commission=0, slippage=0
    ).run(_FixedSignals([1, 0, 0]), data)
    assert results["num_trades"] == 1


def test_limit_down_bar_blocks_a_sell():
    # Buy on bar 1; bar 3 closes -10% (limit-down) -- the sell there is unfillable.
    data = _daily([10.0, 10.0, 10.0, 9.0])
    results = Backtester(
        symbol="600519.SH", initial_capital=10_000, commission=0, slippage=0
    ).run(_FixedSignals([1, 0, -1, 0]), data)
    assert results["num_trades"] == 1
    assert results["has_open_position"] is True


def test_t_plus_1_blocks_same_day_sell():
    # Intraday bars on one calendar day: a position cannot be sold the same day.
    index = pd.date_range("2024-01-01 09:30", periods=4, freq="30min")
    data = pd.DataFrame({"close": [10.0, 10.0, 10.0, 10.0]}, index=index)
    results = Backtester(
        symbol="600519.SH", initial_capital=10_000, commission=0, slippage=0
    ).run(_FixedSignals([1, 0, -1, 0]), data)
    assert results["num_trades"] == 1
    assert results["has_open_position"] is True

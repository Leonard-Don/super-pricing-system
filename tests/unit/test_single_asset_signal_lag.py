"""Lookahead-bias regression tests for the single-asset execution engine.

The engine historically filled a signal at the *same bar's* close that
generated it -- a signal computed from bar i's close was executed at bar i's
close, which is unrealizable in live trading and biases backtests
optimistically. ``ExecutionConfig.signal_lag_bars`` (default 1) now delays
execution by one bar, matching the lag the cross-market engine already applies.
"""

import pandas as pd

from src.backtest._execution_engine import ExecutionConfig, SingleAssetExecutionEngine
from src.backtest.position_sizer import FixedFractionSizer


def _three_bar_data():
    return pd.DataFrame(
        {"close": [10.0, 20.0, 40.0], "volume": [1_000, 1_000, 1_000]},
        index=pd.date_range("2024-01-01", periods=3, freq="D"),
    )


def _run(signals, config):
    data = _three_bar_data()
    engine = SingleAssetExecutionEngine(
        initial_capital=10_000.0,
        commission=0.0,
        slippage=0.0,
        config=config,
    )
    return engine.execute(
        data=data,
        signals=pd.Series(signals, index=data.index),
        sizer=FixedFractionSizer(fraction=1.0),
        risk_mgr=None,
        stop_loss_pct=None,
        take_profit_pct=None,
        max_holding_days=None,
    )


def test_event_signal_executes_one_bar_after_it_fires():
    """A buy signal on bar 0 must fill at bar 1's close, not bar 0's."""
    result = _run([1, 0, 0], ExecutionConfig(signal_mode="event"))

    buys = [t for t in result["trades"] if t["type"] == "BUY"]
    assert len(buys) == 1
    assert buys[0]["price"] == 20.0
    assert buys[0]["date"] == _three_bar_data().index[1]


def test_signal_lag_can_be_disabled_for_pre_lagged_signals():
    """signal_lag_bars=0 restores same-bar fills for callers whose signals are
    already lagged upstream."""
    result = _run([1, 0, 0], ExecutionConfig(signal_mode="event", signal_lag_bars=0))

    buys = [t for t in result["trades"] if t["type"] == "BUY"]
    assert len(buys) == 1
    assert buys[0]["price"] == 10.0


def test_target_exposure_signal_is_also_lagged():
    """The target-exposure path lags too -- bar 0's full-exposure target fills
    at bar 1's close."""
    result = _run([1.0, 0.0, 0.0], ExecutionConfig(signal_mode="target"))

    buys = [t for t in result["trades"] if t["type"] == "BUY"]
    assert len(buys) == 1
    assert buys[0]["price"] == 20.0

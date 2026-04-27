import logging

import pandas as pd

import backend.app.api.v1.endpoints.backtest as backtest_endpoint


def test_fetch_backtest_data_uses_synthetic_fallback_for_default_history(monkeypatch):
    monkeypatch.setattr(
        backtest_endpoint.data_manager,
        "get_historical_data",
        lambda **kwargs: pd.DataFrame(),
    )

    data = backtest_endpoint._fetch_backtest_data("AAPL", None, None)

    assert len(data) >= 40
    assert set(["open", "high", "low", "close", "volume"]).issubset(data.columns)
    assert data.attrs["source"] == "synthetic_market_fallback"
    assert data.attrs["degraded"] is True


def test_run_backtest_pipeline_demotes_success_flow_logs(caplog, monkeypatch):
    caplog.set_level(logging.DEBUG, logger="backend.app.api.v1.endpoints.backtest")

    sample = pd.DataFrame(
        {
            "open": [100.0, 101.0],
            "high": [101.0, 102.0],
            "low": [99.0, 100.0],
            "close": [100.5, 101.5],
            "volume": [1_000_000, 1_100_000],
        },
        index=pd.date_range("2024-01-01", periods=2, freq="D"),
    )

    monkeypatch.setattr(
        backtest_endpoint,
        "_fetch_backtest_data",
        lambda symbol, start_date, end_date: sample,
    )
    monkeypatch.setattr(
        backtest_endpoint.StrategyValidator,
        "validate_strategy_params",
        lambda strategy_name, parameters: (True, None, {}),
    )
    monkeypatch.setattr(
        backtest_endpoint,
        "_create_strategy_instance",
        lambda strategy_name, cleaned_params: type("DummyStrategy", (), {"name": "BuyAndHold"})(),
    )
    monkeypatch.setattr(
        backtest_endpoint,
        "Backtester",
        lambda **kwargs: type("DummyBacktester", (), {"run": lambda self, strategy, data: {"portfolio": [], "trades": []}})(),
    )
    monkeypatch.setattr(
        backtest_endpoint,
        "normalize_backtest_results",
        lambda result: {"portfolio": [], "trades": [], "metrics": {}, "performance_metrics": {}},
    )
    monkeypatch.setattr(backtest_endpoint, "validate_and_fix_backtest_results", lambda result: result)
    monkeypatch.setattr(
        backtest_endpoint,
        "PerformanceAnalyzer",
        lambda results: type("DummyAnalyzer", (), {"calculate_metrics": lambda self: {}})(),
    )

    backtest_endpoint.run_backtest_pipeline(
        symbol="AAPL",
        strategy_name="buy_and_hold",
        parameters={},
        data=sample,
    )

    info_messages = [record.getMessage() for record in caplog.records if record.levelno == logging.INFO]
    debug_messages = [record.getMessage() for record in caplog.records if record.levelno == logging.DEBUG]

    assert not any("Starting backtest for AAPL with strategy buy_and_hold" in message for message in info_messages)
    assert not any("Running backtest with strategy: BuyAndHold" in message for message in info_messages)
    assert any("Starting backtest for AAPL with strategy buy_and_hold" in message for message in debug_messages)
    assert any("Running backtest with strategy: BuyAndHold" in message for message in debug_messages)

import logging

import src.utils.data_validation as data_validation_module

from src.utils.data_validation import validate_and_fix_backtest_results


def _base_backtest_result():
    return {
        "initial_capital": 10000,
        "final_value": 10000,
        "total_return": 0.0,
        "annualized_return": 0.0,
        "net_profit": 0.0,
        "sharpe_ratio": 0.0,
        "max_drawdown": 0.0,
        "sortino_ratio": 0.0,
        "calmar_ratio": 0.0,
        "num_trades": 0,
        "win_rate": 0.0,
        "profit_factor": 0.0,
        "best_trade": 0.0,
        "worst_trade": 0.0,
        "max_consecutive_wins": 0,
        "max_consecutive_losses": 0,
        "portfolio": [
            {
                "cash": 10000,
                "holdings": 0,
                "total": 10000,
                "position": 0,
                "returns": 0.0,
            }
        ],
    }


def test_validate_and_fix_backtest_results_demotes_no_trades_warning(caplog):
    caplog.set_level(logging.DEBUG, logger="src.utils.data_validation")

    validate_and_fix_backtest_results(
        {
            **_base_backtest_result(),
            "trades": [],
        }
    )

    warning_messages = [record.getMessage() for record in caplog.records if record.levelno >= logging.WARNING]
    debug_messages = [record.getMessage() for record in caplog.records if record.levelno == logging.DEBUG]

    assert not any("No trades found" in message for message in warning_messages)
    assert any("No trades found" in message for message in debug_messages)


def test_validate_and_fix_backtest_results_keeps_real_trade_warnings_at_warning(caplog):
    caplog.set_level(logging.DEBUG, logger="src.utils.data_validation")

    validate_and_fix_backtest_results(
        {
            **_base_backtest_result(),
            "trades": [
                {
                    "date": "2024-01-02",
                    "type": "HOLD",
                    "price": 100.0,
                    "shares": 10,
                }
            ],
        }
    )

    warning_messages = [record.getMessage() for record in caplog.records if record.levelno >= logging.WARNING]

    assert any("invalid type" in message for message in warning_messages)


def test_validate_and_fix_backtest_results_demotes_benign_fixed_fields(caplog, monkeypatch):
    caplog.set_level(logging.DEBUG, logger="src.utils.data_validation")

    monkeypatch.setattr(
        data_validation_module.data_validator,
        "validate_backtest_results",
        lambda _results: {
            "is_valid": True,
            "errors": [],
            "warnings": [],
            "fixed_fields": ["Converted portfolio from DataFrame to list"],
        },
    )

    validate_and_fix_backtest_results(
        {
            **_base_backtest_result(),
            "trades": [],
        }
    )

    info_messages = [record.getMessage() for record in caplog.records if record.levelno == logging.INFO]
    debug_messages = [record.getMessage() for record in caplog.records if record.levelno == logging.DEBUG]

    assert not any("Fixed data structure issues" in message for message in info_messages)
    assert any("Converted portfolio from DataFrame to list" in message for message in debug_messages)


def test_validate_and_fix_backtest_results_keeps_non_benign_fixed_fields_at_info(caplog, monkeypatch):
    caplog.set_level(logging.DEBUG, logger="src.utils.data_validation")

    monkeypatch.setattr(
        data_validation_module.data_validator,
        "validate_backtest_results",
        lambda _results: {
            "is_valid": True,
            "errors": [],
            "warnings": [],
            "fixed_fields": ["Fixed null value in final_value"],
        },
    )

    validate_and_fix_backtest_results(
        {
            **_base_backtest_result(),
            "trades": [],
        }
    )

    info_messages = [record.getMessage() for record in caplog.records if record.levelno == logging.INFO]

    assert any("Fixed null value in final_value" in message for message in info_messages)

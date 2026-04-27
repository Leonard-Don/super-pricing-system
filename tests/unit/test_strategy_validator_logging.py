import logging

from src.strategy.strategy_validator import StrategyValidator


def test_strategy_validator_demotes_success_and_default_logs(caplog):
    caplog.set_level(logging.DEBUG, logger="src.strategy.strategy_validator")

    is_valid, error_message, cleaned = StrategyValidator.validate_strategy_params(
        "moving_average",
        {},
    )

    assert is_valid is True
    assert error_message is None
    assert cleaned == {"fast_period": 20, "slow_period": 50}

    info_messages = [record.getMessage() for record in caplog.records if record.levelno == logging.INFO]
    debug_messages = [record.getMessage() for record in caplog.records if record.levelno == logging.DEBUG]

    assert not any("使用默认值" in message for message in info_messages)
    assert not any("策略参数验证通过" in message for message in info_messages)
    assert any("使用默认值 fast_period=20" in message for message in debug_messages)
    assert any("使用默认值 slow_period=50" in message for message in debug_messages)
    assert any("策略参数验证通过: moving_average" in message for message in debug_messages)

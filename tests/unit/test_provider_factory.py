import logging

import src.data.providers.provider_factory as provider_factory_module

from src.data.providers.base_provider import BaseDataProvider
from src.data.providers.provider_factory import DataProviderFactory


class DummyProvider(BaseDataProvider):
    name = "dummy"
    requires_api_key = False

    def get_historical_data(self, symbol, start_date=None, end_date=None, interval="1d"):
        return None

    def get_latest_quote(self, symbol):
        return {"symbol": symbol, "price": 1.0}


class DummyKeyProvider(DummyProvider):
    name = "dummy_key"
    requires_api_key = True


def test_provider_factory_demotes_duplicate_provider_logs(caplog, monkeypatch):
    monkeypatch.setattr(
        provider_factory_module.DataProviderFactory,
        "PROVIDER_CLASSES",
        {
            "dummy": DummyProvider,
            "dummy_key": DummyKeyProvider,
        },
    )
    provider_factory_module._LOGGED_PROVIDER_EVENTS.clear()

    caplog.set_level(logging.DEBUG, logger="src.data.providers.provider_factory")

    DataProviderFactory(
        {
            "default": "dummy",
            "providers": ["dummy", "dummy_key"],
            "api_keys": {"dummy_key": None},
            "fallback_enabled": True,
        }
    )
    DataProviderFactory(
        {
            "default": "dummy",
            "providers": ["dummy", "dummy_key"],
            "api_keys": {"dummy_key": None},
            "fallback_enabled": True,
        }
    )

    info_messages = [record.getMessage() for record in caplog.records if record.levelno == logging.INFO]
    debug_messages = [record.getMessage() for record in caplog.records if record.levelno == logging.DEBUG]

    assert info_messages.count("Initialized provider: dummy") == 1
    assert debug_messages.count("Initialized provider: dummy") == 1
    assert info_messages.count("Skipping dummy_key: API key not provided") == 1
    assert debug_messages.count("Skipping dummy_key: API key not provided") == 1

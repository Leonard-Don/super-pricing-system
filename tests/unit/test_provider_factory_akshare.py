"""akshare must be reachable in the default provider set (independent audit DOM1).

The A-share free fallback was unreachable by default: akshare was absent from the
default providers list, and even when listed the factory initializes providers via
`provider_class(api_key=...)`, which AKShareProvider's no-arg __init__ could not
accept — so the A_STOCK cross-market order silently degraded to tushare->yahoo.
"""

from __future__ import annotations

from src.data.providers.akshare_provider import AKShareProvider
from src.data.providers.provider_factory import DataProviderFactory


def test_akshare_provider_accepts_api_key_kwarg():
    # The factory always constructs providers as provider_class(api_key=...);
    # a free, keyless provider must tolerate (and ignore) that kwarg.
    provider = AKShareProvider(api_key=None)
    assert provider.name


def test_default_factory_initializes_akshare():
    factory = DataProviderFactory()
    assert "akshare" in factory.config["providers"]
    assert "akshare" in factory.providers, "akshare must be initialized in the default set"


def test_a_stock_cross_market_order_includes_akshare():
    factory = DataProviderFactory()
    order = factory.get_cross_market_provider_order("A_STOCK")
    assert "akshare" in order, "A-share fallback must reach the free akshare source"

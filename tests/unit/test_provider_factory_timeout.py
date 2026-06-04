"""DataProviderFactory.get_historical_data must bound how long the fallback chain
can block (independent audit P3).

Before: the loop called each provider's blocking get_historical_data with no
per-source cap, so one hung source could stall for its full internal timeout and
the worst case was the *sum* of every source's timeout (tens of seconds to 100+).
Now each source call is bounded by a per-source timeout and the whole chain by a
total budget; an over-budget/hung source is abandoned and the next is tried.
"""

from __future__ import annotations

import time
from datetime import datetime
from typing import Any, Optional

import pandas as pd

from src.data.providers.base_provider import BaseDataProvider
from src.data.providers.provider_factory import DataProviderFactory


class _ReadyProvider(BaseDataProvider):
    name = "ready"
    priority = 2
    requires_api_key = False

    def get_historical_data(
        self,
        symbol: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        interval: str = "1d",
    ) -> pd.DataFrame:
        return pd.DataFrame({"close": [1.0, 2.0]}, index=pd.date_range("2024-01-01", periods=2))

    def get_latest_quote(self, symbol: str) -> dict[str, Any]:
        return {"symbol": symbol, "price": 1.0}


class _HangingProvider(_ReadyProvider):
    name = "hanging"
    priority = 1
    sleep_s = 5.0

    def get_historical_data(
        self,
        symbol: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        interval: str = "1d",
    ) -> pd.DataFrame:
        time.sleep(self.sleep_s)
        return pd.DataFrame({"close": [9.9]}, index=pd.date_range("2024-01-01", periods=1))


class _Hang1(_HangingProvider):
    name = "h1"
    priority = 1


class _Hang2(_HangingProvider):
    name = "h2"
    priority = 2


def _factory_with(providers: dict) -> DataProviderFactory:
    factory = DataProviderFactory(
        {"default": "ready", "providers": [], "api_keys": {}, "fallback_enabled": True}
    )
    factory.providers = providers
    return factory


def test_hanging_source_is_abandoned_after_per_source_timeout():
    factory = _factory_with({"hanging": _HangingProvider(), "ready": _ReadyProvider()})
    factory.per_source_timeout = 0.3
    factory.total_fetch_budget = None  # isolate per-source behavior

    start = time.monotonic()
    data = factory.get_historical_data("TEST")
    elapsed = time.monotonic() - start

    assert not data.empty, "should fall through to the ready provider"
    assert float(data["close"].iloc[0]) == 1.0, "ready provider's data must be returned"
    assert elapsed < 3.0, f"must not wait the full 5s hang (took {elapsed:.2f}s)"

    attempts = {a["id"]: a for a in factory.get_last_fetch_source_health().get("attempts", [])}
    assert attempts["hanging"]["ok"] is False
    assert "timeout" in str(attempts["hanging"]["reason"]).lower()


def test_total_fetch_budget_caps_the_fallback_chain():
    factory = _factory_with({"h1": _Hang1(), "h2": _Hang2()})
    factory.per_source_timeout = 5.0
    factory.total_fetch_budget = 0.5

    start = time.monotonic()
    data = factory.get_historical_data("TEST")
    elapsed = time.monotonic() - start

    assert data.empty, "all sources hung past the budget -> empty result"
    assert elapsed < 3.0, f"total budget must cap the chain (took {elapsed:.2f}s)"


def test_fast_providers_unaffected_by_timeout_wrapping():
    # Regression: normal fast sources still succeed (and the wrapper preserves
    # the returned frame) under the default bounded-timeout path.
    factory = _factory_with({"ready": _ReadyProvider()})
    data = factory.get_historical_data("TEST")
    assert not data.empty
    assert float(data["close"].iloc[-1]) == 2.0

from datetime import datetime
import time

import pandas as pd

import src.data.realtime_manager as realtime_manager_module
from src.data.realtime_manager import RealTimeDataManager
from src.data.providers.base_provider import BaseDataProvider


def test_build_quote_preserves_missing_numeric_fields():
    manager = RealTimeDataManager()
    try:
        quote = manager._build_quote(
            "TEST",
            {
                "symbol": "TEST",
                "price": None,
                "change": None,
                "change_percent": None,
                "volume": None,
                "timestamp": datetime.now().isoformat(),
            },
            default_source="test",
        )
    finally:
        manager.cleanup()

    assert quote is not None
    assert quote.price is None
    assert quote.change is None
    assert quote.change_percent is None
    assert quote.volume is None
    assert quote.source == "test"


def test_build_quote_derives_previous_close_and_percent_when_possible():
    manager = RealTimeDataManager()
    try:
        quote = manager._build_quote(
            "TEST",
            {
                "symbol": "TEST",
                "price": 105.0,
                "change": 5.0,
                "timestamp": datetime.now().isoformat(),
            },
            default_source="test",
        )
    finally:
        manager.cleanup()

    assert quote is not None
    assert quote.previous_close == 100.0
    assert round(quote.change_percent, 2) == 5.0


def test_build_quote_normalizes_timezone_aware_timestamp():
    manager = RealTimeDataManager()
    try:
        quote = manager._build_quote(
            "TEST",
            {
                "symbol": "TEST",
                "price": 100.0,
                "timestamp": "2026-04-09T00:00:00+08:00",
            },
            default_source="test",
        )
    finally:
        manager.cleanup()

    assert quote is not None
    assert quote.timestamp.tzinfo is None


def test_get_quotes_dict_reuses_recent_bundle_cache():
    manager = RealTimeDataManager()
    calls = []

    def fake_fetch(symbols, use_cache=True):
        calls.append((tuple(symbols), use_cache))
        return {
            "AAPL": manager._build_quote(
                "AAPL",
                {
                    "symbol": "AAPL",
                    "price": 100.0,
                    "timestamp": datetime.now().isoformat(),
                },
                default_source="test",
            ),
            "MSFT": manager._build_quote(
                "MSFT",
                {
                    "symbol": "MSFT",
                    "price": 200.0,
                    "timestamp": datetime.now().isoformat(),
                },
                default_source="test",
            ),
        }, {"requested": 2}

    manager._fetch_real_time_data = fake_fetch
    try:
        first = manager.get_quotes_dict(["AAPL", "MSFT"], use_cache=True)
        second = manager.get_quotes_dict(["AAPL", "MSFT"], use_cache=True)
    finally:
        manager.cleanup()

    assert first == second
    assert calls == [(("AAPL", "MSFT"), True)]
    assert manager.runtime_stats["bundle_cache_hits"] == 1
    assert manager.runtime_stats["bundle_cache_writes"] >= 1


def test_store_quote_invalidates_recent_bundle_cache():
    manager = RealTimeDataManager()
    try:
        manager._store_cached_quote_bundle(
            ["AAPL"],
            {
                "AAPL": {
                    "symbol": "AAPL",
                    "price": 100.0,
                    "timestamp": datetime.now().isoformat(),
                },
            },
        )
        assert manager._get_cached_quote_bundle(["AAPL"]) is not None

        manager._store_quote(
            manager._build_quote(
                "AAPL",
                {
                    "symbol": "AAPL",
                    "price": 101.0,
                    "timestamp": datetime.now().isoformat(),
                },
                default_source="test",
            )
        )
    finally:
        manager.cleanup()

    assert manager._get_cached_quote_bundle(["AAPL"]) is None


def test_prewarm_quote_bundle_uses_cached_quotes_without_refetching():
    manager = RealTimeDataManager()
    try:
        manager._store_quote(
            manager._build_quote(
                "AAPL",
                {
                    "symbol": "AAPL",
                    "price": 101.0,
                    "timestamp": datetime.now().isoformat(),
                },
                default_source="test",
            )
        )
        manager._store_quote(
            manager._build_quote(
                "MSFT",
                {
                    "symbol": "MSFT",
                    "price": 202.0,
                    "timestamp": datetime.now().isoformat(),
                },
                default_source="test",
            )
        )

        payload = manager.prewarm_quote_bundle(["AAPL", "MSFT"])
    finally:
        manager.cleanup()

    assert payload["AAPL"]["price"] == 101.0
    assert payload["MSFT"]["price"] == 202.0


def test_update_quotes_prewarms_bundle_for_current_subscription_set():
    manager = RealTimeDataManager()
    manager.subscribed_symbols = {"AAPL", "MSFT"}

    def fake_fetch(symbols, use_cache=True):
        return {
            "AAPL": manager._build_quote(
                "AAPL",
                {
                    "symbol": "AAPL",
                    "price": 100.0,
                    "timestamp": datetime.now().isoformat(),
                },
                default_source="test",
            ),
            "MSFT": manager._build_quote(
                "MSFT",
                {
                    "symbol": "MSFT",
                    "price": 200.0,
                    "timestamp": datetime.now().isoformat(),
                },
                default_source="test",
            ),
        }, {"requested": 2, "cache_hits": 0, "fetched": 2, "misses": 0}

    manager._fetch_real_time_data = fake_fetch
    try:
        manager._update_quotes()
        bundle = manager._get_cached_quote_bundle(["AAPL", "MSFT"])
    finally:
        manager.cleanup()

    assert bundle is not None
    assert bundle["AAPL"]["price"] == 100.0
    assert bundle["MSFT"]["price"] == 200.0
    assert manager.runtime_stats["bundle_prewarm_calls"] >= 1


def test_market_summary_exposes_cache_runtime_stats():
    manager = RealTimeDataManager()
    try:
        manager.runtime_stats["bundle_cache_hits"] = 3
        manager.runtime_stats["bundle_cache_misses"] = 1
        manager.runtime_stats["bundle_cache_writes"] = 2
        manager.runtime_stats["bundle_prewarm_calls"] = 4
        manager.runtime_stats["last_fetch_stats"] = {"requested": 2, "cache_hits": 2}
        manager.runtime_stats["last_bundle_cache_key"] = ["AAPL", "MSFT"]
        manager.quote_history["AAPL"] = [
            manager._build_quote(
                "AAPL",
                {
                    "symbol": "AAPL",
                    "price": 100.0,
                    "change": 1.2,
                    "change_percent": 1.1,
                    "volume": 123,
                    "high": 101.0,
                    "low": 99.5,
                    "open": 99.8,
                    "previous_close": 98.9,
                    "bid": 99.9,
                    "ask": 100.1,
                    "timestamp": datetime.now().isoformat(),
                },
                default_source="test",
            )
        ]
        manager.quote_history["MSFT"] = [
            manager._build_quote(
                "MSFT",
                {
                    "symbol": "MSFT",
                    "price": 200.0,
                    "change": None,
                    "change_percent": None,
                    "volume": 456,
                    "high": None,
                    "low": None,
                    "open": 198.5,
                    "previous_close": 197.9,
                    "bid": None,
                    "ask": None,
                    "timestamp": datetime.now().isoformat(),
                },
                default_source="test",
            )
        ]
        summary = manager.get_market_summary()
    finally:
        manager.cleanup()

    assert summary["cache"]["bundle_cache_hits"] == 3
    assert summary["cache"]["bundle_cache_misses"] == 1
    assert summary["cache"]["bundle_cache_writes"] == 2
    assert summary["cache"]["bundle_prewarm_calls"] == 4
    assert summary["cache"]["last_fetch_stats"] == {"requested": 2, "cache_hits": 2}
    assert summary["cache"]["last_bundle_cache_key"] == ["AAPL", "MSFT"]
    assert summary["quality"]["active_quote_count"] == 2
    assert any(item["field"] == "price" and item["coverage_ratio"] == 1.0 for item in summary["quality"]["field_coverage"])
    assert any(item["field"] == "bid" and item["missing"] == 1 for item in summary["quality"]["field_coverage"])
    assert summary["quality"]["most_incomplete_symbols"][0]["symbol"] == "MSFT"


def test_provider_health_opens_short_circuit_after_repeated_failures():
    manager = RealTimeDataManager()

    try:
        manager._mark_provider_failure("failing", "boom")
        manager._mark_provider_failure("failing", "boom")
        manager._mark_provider_failure("failing", "boom")
        manager._mark_provider_success("healthy")
        summary = manager.get_market_summary()
    finally:
        manager.cleanup()

    assert summary["provider_health"]["failing"]["consecutive_failures"] == 3
    assert summary["provider_health"]["failing"]["circuit_open_until"] > time.time()
    assert summary["provider_health"]["healthy"]["successes"] == 1


class _SlowQuoteProvider(BaseDataProvider):
    name = "slow-single"
    priority = 1

    def get_historical_data(self, *args, **kwargs):
        raise NotImplementedError

    def get_latest_quote(self, symbol):
        time.sleep(0.05)
        return {"symbol": symbol, "price": 100.0, "timestamp": datetime.now().isoformat()}


class _SlowBatchProvider(BaseDataProvider):
    name = "slow-batch"
    priority = 1

    def get_historical_data(self, *args, **kwargs):
        raise NotImplementedError

    def get_latest_quote(self, symbol):
        raise NotImplementedError

    def get_multiple_quotes(self, symbols):
        time.sleep(0.05)
        return {
            symbol: {"symbol": symbol, "price": 100.0, "timestamp": datetime.now().isoformat()}
            for symbol in symbols
        }


def test_fetch_with_provider_times_out_slow_single_quotes(monkeypatch):
    manager = RealTimeDataManager()
    monkeypatch.setattr(realtime_manager_module, "PROVIDER_FETCH_TIMEOUT_SECONDS", 0.01)

    try:
        results = manager._fetch_with_provider(_SlowQuoteProvider(), ["AAPL", "MSFT"])
    finally:
        manager.cleanup()

    assert "timeout" in results["AAPL"]["error"]
    assert "timeout" in results["MSFT"]["error"]


def test_fetch_with_provider_times_out_slow_batch_quotes(monkeypatch):
    manager = RealTimeDataManager()
    monkeypatch.setattr(realtime_manager_module, "PROVIDER_FETCH_TIMEOUT_SECONDS", 0.01)

    try:
        try:
            manager._fetch_with_provider(_SlowBatchProvider(), ["AAPL", "MSFT"])
            assert False, "Expected batch fetch timeout"
        except TimeoutError as exc:
            assert "timed out" in str(exc)
    finally:
        manager.cleanup()


def test_fetch_real_time_data_falls_back_to_historical_snapshot_when_live_quotes_fail():
    manager = RealTimeDataManager()

    class _HistoricalFallback:
        def get_cross_market_historical_data(self, symbol, asset_class, start_date=None, end_date=None, interval="1d"):
            frame = pd.DataFrame(
                [
                    {
                        "date": datetime(2026, 4, 8),
                        "open": 100.0,
                        "high": 101.0,
                        "low": 99.0,
                        "close": 100.0,
                        "volume": 1000,
                    },
                    {
                        "date": datetime(2026, 4, 9),
                        "open": 101.0,
                        "high": 103.0,
                        "low": 100.5,
                        "close": 102.5,
                        "volume": 1250,
                    },
                ]
            )
            return {"data": frame, "provider": "test_history"}

    manager.data_manager = _HistoricalFallback()
    manager._fetch_provider_quotes = lambda symbols: {}

    try:
        quotes, stats = manager._fetch_real_time_data(["^GSPC"], use_cache=False)
    finally:
        manager.cleanup()

    assert "^GSPC" in quotes
    assert quotes["^GSPC"].price == 102.5
    assert quotes["^GSPC"].previous_close == 100.0
    assert round(quotes["^GSPC"].change, 2) == 2.5
    assert round(quotes["^GSPC"].change_percent, 2) == 2.5
    assert quotes["^GSPC"].source == "history_fallback:test_history"
    assert stats["fetched"] == 1
    assert stats["misses"] == 0


def test_build_quote_returns_none_for_empty_or_error_payload():
    manager = RealTimeDataManager()
    try:
        assert manager._build_quote("TEST", {}, default_source="test") is None
        assert manager._build_quote("TEST", None, default_source="test") is None
        assert (
            manager._build_quote(
                "TEST",
                {"symbol": "TEST", "error": "boom", "price": 100.0},
                default_source="test",
            )
            is None
        )
    finally:
        manager.cleanup()


def test_subscribe_symbol_returns_false_for_duplicate_and_collects_additional_callback():
    manager = RealTimeDataManager()

    def cb1(_quote):
        return None

    def cb2(_quote):
        return None

    try:
        assert manager.subscribe_symbol("aapl", cb1) is True
        assert manager.subscribe_symbol("AAPL", cb2) is False
        assert manager.subscribers["AAPL"] == {cb1, cb2}
        assert manager.subscribed_symbols == {"AAPL"}
    finally:
        manager.cleanup()


def test_unsubscribe_with_specific_callback_keeps_subscription_until_last_callback_drops():
    manager = RealTimeDataManager()

    def cb1(_quote):
        return None

    def cb2(_quote):
        return None

    try:
        manager.subscribe_symbol("AAPL", cb1)
        manager.subscribe_symbol("AAPL", cb2)

        assert manager.unsubscribe_symbol("AAPL", cb1) is False
        assert "AAPL" in manager.subscribed_symbols
        assert manager.subscribers["AAPL"] == {cb2}

        assert manager.unsubscribe_symbol("AAPL", cb2) is True
        assert "AAPL" not in manager.subscribed_symbols
        assert "AAPL" not in manager.subscribers
    finally:
        manager.cleanup()


def test_update_quotes_isolates_callback_exceptions_between_subscribers():
    manager = RealTimeDataManager()
    invocations = []

    def failing_callback(_quote):
        raise RuntimeError("boom")

    def recording_callback(quote):
        invocations.append(quote.symbol)

    def fake_fetch(symbols, use_cache=True):
        quote = manager._build_quote(
            "AAPL",
            {
                "symbol": "AAPL",
                "price": 100.0,
                "timestamp": datetime.now().isoformat(),
            },
            default_source="test",
        )
        return {"AAPL": quote}, {
            "requested": 1,
            "cache_hits": 0,
            "fetched": 1,
            "misses": 0,
        }

    try:
        manager.subscribe_symbol("AAPL", failing_callback)
        manager.subscribe_symbol("AAPL", recording_callback)
        manager._fetch_real_time_data = fake_fetch
        manager._update_quotes()
    finally:
        manager.cleanup()

    assert invocations == ["AAPL"]


def test_get_cached_quote_bundle_evicts_expired_entry_and_increments_miss_counter():
    manager = RealTimeDataManager()
    try:
        manager._store_cached_quote_bundle(
            ["AAPL"],
            {
                "AAPL": {
                    "symbol": "AAPL",
                    "price": 100.0,
                    "timestamp": datetime.now().isoformat(),
                }
            },
        )
        cache_key = ("AAPL",)
        assert cache_key in manager._quotes_bundle_cache

        _, payload = manager._quotes_bundle_cache[cache_key]
        manager._quotes_bundle_cache[cache_key] = (
            time.time() - manager.bundle_cache_ttl - 1,
            payload,
        )

        miss_count_before = manager.runtime_stats["bundle_cache_misses"]
        assert manager._get_cached_quote_bundle(["AAPL"]) is None
        assert cache_key not in manager._quotes_bundle_cache
        assert manager.runtime_stats["bundle_cache_misses"] == miss_count_before + 1
    finally:
        manager.cleanup()

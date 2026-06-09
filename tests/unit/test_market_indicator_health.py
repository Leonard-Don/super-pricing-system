"""
Unit tests for get_market_indicators() per-indicator source_health / checked_at
and for the macro overview's indicator_health surfacing.

Run subset:
    python3 -m pytest tests/unit/test_market_indicator_health.py -q
"""

from __future__ import annotations

import sys
import os
from datetime import datetime, timedelta
from typing import Any, Dict
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

# Ensure project root on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from src.data.data_manager import DataManager  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _make_dm(*, use_disk: bool = False) -> DataManager:
    """Create a DataManager with in-memory-only cache to avoid disk I/O."""
    dm = DataManager()
    dm.cache.use_disk = use_disk
    dm.cache.memory_cache.clear()
    dm.cache.access_times.clear()
    return dm


def _make_hist(close_value: float = 42.0) -> pd.DataFrame:
    """Return a minimal yfinance-style history DataFrame with one row."""
    return pd.DataFrame(
        {"Close": [close_value]},
        index=pd.to_datetime(["2026-06-09"]),
    )


TARGETS = ["vix", "dxy", "10y_yield", "gold", "oil", "sp500"]


# ---------------------------------------------------------------------------
# Tests — fresh fetch (no cache)
# ---------------------------------------------------------------------------


class TestGetMarketIndicatorsFreshFetch:
    """get_market_indicators() returns correct health on a fresh (no-cache) call."""

    def test_ok_indicators_have_health_ok(self, monkeypatch):
        """All successful fetches → source_health == 'ok'."""
        dm = _make_dm()

        def fake_ticker(symbol: str):  # noqa: ARG001
            mock = MagicMock()
            mock.history.return_value = _make_hist(18.5)
            return mock

        monkeypatch.setattr("yfinance.Ticker", fake_ticker)

        result = dm.get_market_indicators()

        health = result.get("indicator_health", {})
        assert len(health) == len(TARGETS), "All targets must appear in indicator_health"
        for name in TARGETS:
            assert name in health, f"{name} missing from indicator_health"
            assert health[name]["source_health"] == "ok", (
                f"{name}: expected source_health='ok', got {health[name]['source_health']!r}"
            )
            assert health[name]["value"] == pytest.approx(18.5, rel=1e-3)
            assert health[name]["checked_at"] is not None

    def test_failed_indicator_has_health_failed(self, monkeypatch):
        """When yfinance raises, the indicator gets source_health == 'failed'."""
        dm = _make_dm()
        call_count: Dict[str, int] = {}

        def fake_ticker(symbol: str):
            mock = MagicMock()
            if symbol == "^VIX":
                call_count["vix"] = 1
                mock.history.side_effect = RuntimeError("network timeout")
            else:
                mock.history.return_value = _make_hist(100.0)
            return mock

        monkeypatch.setattr("yfinance.Ticker", fake_ticker)

        result = dm.get_market_indicators()
        health = result.get("indicator_health", {})

        assert health["vix"]["source_health"] == "failed"
        assert health["vix"]["value"] is None
        assert call_count.get("vix"), "ticker should have been attempted for vix"

    def test_empty_dataframe_treated_as_failed(self, monkeypatch):
        """An empty DataFrame (no rows) → source_health == 'failed', value == None."""
        dm = _make_dm()

        def fake_ticker(symbol: str):
            mock = MagicMock()
            if symbol == "GC=F":
                mock.history.return_value = pd.DataFrame()  # empty
            else:
                mock.history.return_value = _make_hist(50.0)
            return mock

        monkeypatch.setattr("yfinance.Ticker", fake_ticker)

        result = dm.get_market_indicators()
        health = result.get("indicator_health", {})

        assert health["gold"]["source_health"] == "failed"
        assert health["gold"]["value"] is None

    def test_meta_counts_match_health_map(self, monkeypatch):
        """_meta ok_count and failed_count must equal actual counts in indicator_health."""
        dm = _make_dm()

        def fake_ticker(symbol: str):
            mock = MagicMock()
            if symbol in ("^VIX", "DX-Y.NYB"):
                mock.history.side_effect = ConnectionError("offline")
            else:
                mock.history.return_value = _make_hist(10.0)
            return mock

        monkeypatch.setattr("yfinance.Ticker", fake_ticker)

        result = dm.get_market_indicators()
        health = result.get("indicator_health", {})
        meta = result.get("_meta", {})

        ok = sum(1 for h in health.values() if h["source_health"] == "ok")
        failed = sum(1 for h in health.values() if h["source_health"] == "failed")

        assert meta["ok_count"] == ok
        assert meta["failed_count"] == failed

    def test_backward_compatible_flat_values(self, monkeypatch):
        """Raw float values still present at top level for backward compatibility."""
        dm = _make_dm()

        def fake_ticker(symbol: str):  # noqa: ARG001
            mock = MagicMock()
            mock.history.return_value = _make_hist(99.99)
            return mock

        monkeypatch.setattr("yfinance.Ticker", fake_ticker)

        result = dm.get_market_indicators()
        for name in TARGETS:
            assert name in result, f"Backward-compat flat key missing: {name}"
            assert isinstance(result[name], float)

    def test_fresh_cache_status_in_meta(self, monkeypatch):
        """_meta.cache_status == 'fresh' on a new fetch (not from cache)."""
        dm = _make_dm()

        def fake_ticker(symbol: str):  # noqa: ARG001
            mock = MagicMock()
            mock.history.return_value = _make_hist(20.0)
            return mock

        monkeypatch.setattr("yfinance.Ticker", fake_ticker)

        result = dm.get_market_indicators()
        assert result["_meta"]["cache_status"] == "fresh"


# ---------------------------------------------------------------------------
# Tests — cache hit (stale vs. fresh)
# ---------------------------------------------------------------------------


class TestGetMarketIndicatorsCacheHit:
    """get_market_indicators() health re-evaluation on cache hit."""

    def _seed_cache(self, dm: DataManager, fetched_at: datetime) -> None:
        """Insert a synthetic cached entry directly into the cache."""
        now_iso = fetched_at.isoformat()
        cached = {
            "vix": 15.0,
            "dxy": 104.0,
            "10y_yield": 4.5,
            "gold": 1900.0,
            "oil": 80.0,
            "sp500": 5000.0,
            "indicator_health": {
                name: {
                    "value": 15.0,
                    "source_health": "ok",
                    "checked_at": now_iso,
                }
                for name in TARGETS
            },
            "_meta": {
                "fetched_at": now_iso,
                "ok_count": 6,
                "failed_count": 0,
                "cache_status": "fresh",
            },
        }
        dm.cache.set("market_indicators_v2", cached, ttl=DataManager.MARKET_INDICATORS_TTL)

    def test_fresh_cache_hit_health_ok(self, monkeypatch):
        """A cache entry younger than TTL → all indicators get source_health='ok'."""
        dm = _make_dm()
        # Seed cache with a very recent fetched_at
        self._seed_cache(dm, fetched_at=datetime.now() - timedelta(seconds=60))

        # yfinance must NOT be called when cache is fresh
        monkeypatch.setattr(
            "yfinance.Ticker",
            lambda _: (_ for _ in ()).throw(AssertionError("yfinance called on fresh cache")),
        )

        result = dm.get_market_indicators()
        health = result.get("indicator_health", {})
        for name in TARGETS:
            assert health[name]["source_health"] == "ok", (
                f"Expected 'ok' on fresh cache hit for {name}"
            )
        assert result["_meta"]["cache_status"] == "fresh"

    def test_stale_cache_hit_health_stale(self, monkeypatch):
        """A cache entry older than TTL → all indicators get source_health='stale'."""
        dm = _make_dm()
        # Seed cache with a very old fetched_at (2 TTL windows ago)
        old_time = datetime.now() - timedelta(seconds=DataManager.MARKET_INDICATORS_TTL * 2)
        self._seed_cache(dm, fetched_at=old_time)

        # We also patch the TTL used for the cache.set so the cache entry
        # is not expired (i.e. the CacheManager still returns it but our
        # staleness logic marks it as stale).
        dm.cache.set(
            "market_indicators_v2",
            {
                "vix": 15.0,
                "dxy": 104.0,
                "10y_yield": 4.5,
                "gold": 1900.0,
                "oil": 80.0,
                "sp500": 5000.0,
                "indicator_health": {
                    name: {
                        "value": 15.0,
                        "source_health": "ok",
                        "checked_at": old_time.isoformat(),
                    }
                    for name in TARGETS
                },
                "_meta": {
                    "fetched_at": old_time.isoformat(),
                    "ok_count": 6,
                    "failed_count": 0,
                    "cache_status": "fresh",
                },
            },
            # Use a large TTL so CacheManager doesn't expire it — our code must
            # detect staleness via fetched_at independently.
            ttl=DataManager.MARKET_INDICATORS_TTL * 10,
        )

        monkeypatch.setattr(
            "yfinance.Ticker",
            lambda _: (_ for _ in ()).throw(AssertionError("yfinance called on stale cache hit")),
        )

        result = dm.get_market_indicators()
        health = result.get("indicator_health", {})
        for name in TARGETS:
            assert health[name]["source_health"] == "stale", (
                f"Expected 'stale' on expired cache for {name}, got {health[name]['source_health']!r}"
            )
        assert result["_meta"]["cache_status"] == "stale"


# ---------------------------------------------------------------------------
# Tests — macro overview surfaces indicator_health
# ---------------------------------------------------------------------------


class TestMacroOverviewIndicatorHealth:
    """The /overview endpoint must include indicator_health and indicator_meta."""

    def _make_mock_context(self) -> Dict[str, Any]:
        """Return a minimal _build_context()-like dict that includes health fields."""
        indicator_health = {
            name: {
                "value": 10.0,
                "source_health": "ok",
                "checked_at": "2026-06-09T00:00:00",
            }
            for name in TARGETS
        }
        indicator_meta = {
            "fetched_at": "2026-06-09T00:00:00",
            "ok_count": 6,
            "failed_count": 0,
            "cache_status": "fresh",
        }
        return {
            "indicator_health": indicator_health,
            "indicator_meta": indicator_meta,
        }

    def test_context_contains_indicator_health(self, monkeypatch):
        """_build_context() must populate indicator_health and indicator_meta keys."""
        import backend.app.api.v1.endpoints.macro as macro_mod

        mock_indicators = {
            name: 10.0 for name in TARGETS
        }
        mock_indicators["indicator_health"] = {
            name: {"value": 10.0, "source_health": "ok", "checked_at": "2026-06-09T00:00:00"}
            for name in TARGETS
        }
        mock_indicators["_meta"] = {
            "fetched_at": "2026-06-09T00:00:00",
            "ok_count": 6,
            "failed_count": 0,
            "cache_status": "fresh",
        }

        fake_dm = MagicMock()
        fake_dm.get_market_indicators.return_value = mock_indicators

        fake_snapshot = {
            "snapshot_timestamp": "2026-06-09T00:00:00",
            "signals": {},
            "providers": {},
            "refresh_status": {},
            "staleness": {},
            "provider_health": {},
            "source_mode_summary": {},
        }
        fake_manager = MagicMock()
        fake_manager.get_dashboard_snapshot.return_value = fake_snapshot
        fake_manager.get_records.return_value = []

        monkeypatch.setattr(macro_mod, "_market_data_manager", fake_dm)
        monkeypatch.setattr(
            "backend.app.api.v1.endpoints.macro.get_alt_data_manager",
            lambda: fake_manager,
        )

        context = macro_mod._build_context(refresh=False)

        assert "indicator_health" in context
        assert "indicator_meta" in context
        assert context["indicator_health"] == mock_indicators["indicator_health"]
        assert context["indicator_meta"] == mock_indicators["_meta"]

    def test_overview_contains_indicator_health_and_meta(self, monkeypatch):
        """get_macro_overview() must include indicator_health + indicator_meta in response."""
        import backend.app.api.v1.endpoints.macro as macro_mod

        mock_indicators = {
            name: 10.0 for name in TARGETS
        }
        ind_health = {
            name: {"value": 10.0, "source_health": "ok", "checked_at": "2026-06-09T00:00:00"}
            for name in TARGETS
        }
        ind_meta = {
            "fetched_at": "2026-06-09T00:00:00",
            "ok_count": 6,
            "failed_count": 0,
            "cache_status": "fresh",
        }
        mock_indicators["indicator_health"] = ind_health
        mock_indicators["_meta"] = ind_meta

        fake_dm = MagicMock()
        fake_dm.get_market_indicators.return_value = mock_indicators

        fake_snapshot = {
            "snapshot_timestamp": "2026-06-09T00:00:00",
            "signals": {},
            "providers": {},
            "refresh_status": {},
            "staleness": {},
            "provider_health": {},
            "source_mode_summary": {},
        }
        fake_manager = MagicMock()
        fake_manager.get_dashboard_snapshot.return_value = fake_snapshot
        fake_manager.get_records.return_value = []

        monkeypatch.setattr(macro_mod, "_market_data_manager", fake_dm)
        monkeypatch.setattr(
            "backend.app.api.v1.endpoints.macro.get_alt_data_manager",
            lambda: fake_manager,
        )

        # Minimal stubs for compute_all / combine
        monkeypatch.setattr(
            macro_mod._registry,
            "compute_all",
            lambda ctx: [],
        )
        monkeypatch.setattr(
            macro_mod._combiner,
            "combine",
            lambda results, weights: {
                "score": 0.0,
                "signal": 0,
                "confidence": 0.5,
                "factors": [],
            },
        )

        overview = macro_mod.get_macro_overview(refresh=False)

        assert "indicator_health" in overview, "overview must contain indicator_health"
        assert "indicator_meta" in overview, "overview must contain indicator_meta"
        assert overview["indicator_health"] == ind_health
        assert overview["indicator_meta"] == ind_meta

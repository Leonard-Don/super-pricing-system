"""Phase-2 ADR 0001 contract tests.

Pin down the runtime shape of `DataProviderFactory.get_source_health_report()`
and `_record_fetch_health()` so future refactors cannot silently drift away
from the SourceHealthEntry / FetchAttempt / FetchHealthReport contracts.

The fields covered here are the ones already shipping today (per
`docs/adr/0001-provider-abstraction.md` §"标准字段语义" + the附加 list):
`id`/`name`/`label`/`status`/`reason`/`required`/`fallback`/`requires_api_key`/
`priority`/`rate_limit`/`capabilities`/`checked_at` for entries and
`id`/`ok`/`status`/`reason`/`row_count`/`fallback`/`checked_at` for attempts.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

import pandas as pd

from src.data.providers.base_provider import BaseDataProvider
from src.data.providers.provider_factory import DataProviderFactory


class _ReadyProvider(BaseDataProvider):
    name = "ready"
    priority = 1
    rate_limit = 42
    requires_api_key = False

    def get_historical_data(
        self,
        symbol: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        interval: str = "1d",
    ) -> pd.DataFrame:
        return pd.DataFrame({"close": [1.0]}, index=pd.date_range("2024-01-01", periods=1))

    def get_latest_quote(self, symbol: str) -> dict[str, Any]:
        return {"symbol": symbol, "price": 1.0}


def test_source_health_entry_contains_all_contracted_fields(monkeypatch):
    """Every key the ADR lists for SourceHealthEntry must be present on a ready source."""
    monkeypatch.setattr(
        DataProviderFactory, "PROVIDER_CLASSES", {"ready": _ReadyProvider}
    )
    factory = DataProviderFactory(
        {
            "default": "ready",
            "providers": ["ready"],
            "api_keys": {},
            "fallback_enabled": True,
        }
    )

    report = factory.get_source_health_report()
    entry = next(source for source in report["sources"] if source["id"] == "ready")

    expected_keys = {
        "id",
        "name",
        "label",
        "ok",
        "status",
        "reason",
        "required",
        "fallback",
        "requires_api_key",
        "priority",
        "rate_limit",
        "capabilities",
        "checked_at",
    }
    assert set(entry.keys()) == expected_keys
    assert entry["id"] == "ready"
    assert entry["label"] == "ready"
    assert entry["ok"] is True
    assert entry["status"] == "ready"
    assert entry["reason"] is None
    assert entry["required"] is True  # name == default
    assert entry["fallback"] is False  # ok=True means fallback=False
    assert entry["requires_api_key"] is False
    assert entry["priority"] == 1
    assert entry["rate_limit"] == 42
    # capabilities is a dict[str, bool] with the four standard keys
    assert set(entry["capabilities"].keys()) == {
        "historical_data",
        "latest_quote",
        "fundamental_data",
        "order_book",
    }
    assert all(isinstance(value, bool) for value in entry["capabilities"].values())
    # checked_at is an RFC3339 UTC stamp (Z-suffixed)
    assert entry["checked_at"].endswith("Z")


def test_required_flag_tracks_default_source(monkeypatch):
    """required is True iff the source equals the configured default."""
    class _SecondaryProvider(_ReadyProvider):
        name = "secondary"
        priority = 5

    monkeypatch.setattr(
        DataProviderFactory,
        "PROVIDER_CLASSES",
        {"ready": _ReadyProvider, "secondary": _SecondaryProvider},
    )
    factory = DataProviderFactory(
        {
            "default": "ready",
            "providers": ["ready", "secondary"],
            "api_keys": {},
            "fallback_enabled": True,
        }
    )

    by_id = {entry["id"]: entry for entry in factory.get_source_health_report()["sources"]}
    assert by_id["ready"]["required"] is True
    assert by_id["secondary"]["required"] is False


def test_fallback_flag_only_true_for_unhealthy_sources_when_enabled(monkeypatch):
    """fallback is (not ok) AND fallback_enabled — see ADR §标准字段语义."""

    class _NeedsKeyProvider(_ReadyProvider):
        name = "needs_key"
        requires_api_key = True

    monkeypatch.setattr(
        DataProviderFactory,
        "PROVIDER_CLASSES",
        {"ready": _ReadyProvider, "needs_key": _NeedsKeyProvider},
    )
    factory = DataProviderFactory(
        {
            "default": "ready",
            "providers": ["ready", "needs_key"],
            "api_keys": {"needs_key": None},
            "fallback_enabled": True,
        }
    )
    by_id = {entry["id"]: entry for entry in factory.get_source_health_report()["sources"]}
    assert by_id["ready"]["fallback"] is False
    assert by_id["needs_key"]["fallback"] is True

    # With fallback disabled, the unhealthy source must not pose as a fallback.
    factory_disabled = DataProviderFactory(
        {
            "default": "ready",
            "providers": ["ready", "needs_key"],
            "api_keys": {"needs_key": None},
            "fallback_enabled": False,
        }
    )
    by_id_disabled = {
        entry["id"]: entry for entry in factory_disabled.get_source_health_report()["sources"]
    }
    assert by_id_disabled["needs_key"]["fallback"] is False


def test_source_health_report_envelope_shape(monkeypatch):
    """The top-level SourceHealthReport envelope must declare configured set + counts."""
    monkeypatch.setattr(
        DataProviderFactory, "PROVIDER_CLASSES", {"ready": _ReadyProvider}
    )
    factory = DataProviderFactory(
        {
            "default": "ready",
            "providers": ["ready"],
            "api_keys": {},
            "fallback_enabled": True,
        }
    )
    report = factory.get_source_health_report()
    assert set(report.keys()) == {
        "checked_at",
        "default_source",
        "fallback_enabled",
        "configured_sources",
        "active_provider_count",
        "configured_provider_count",
        "sources",
        "last_fetch",
    }
    assert report["default_source"] == "ready"
    assert report["configured_sources"] == ["ready"]
    assert report["active_provider_count"] == 1
    assert report["configured_provider_count"] == 1
    assert report["last_fetch"] is None


def test_fetch_attempt_contract_shape():
    """Every attempt entry in `_record_fetch_health` must follow the FetchAttempt shape."""

    class _EmptyProvider(_ReadyProvider):
        name = "empty"

        def get_historical_data(
            self,
            symbol: str,
            start_date: Optional[datetime] = None,
            end_date: Optional[datetime] = None,
            interval: str = "1d",
        ) -> pd.DataFrame:
            return pd.DataFrame()

    factory = DataProviderFactory(
        {
            "default": "empty",
            "providers": [],
            "api_keys": {},
            "fallback_enabled": True,
        }
    )
    factory.providers = {"empty": _EmptyProvider(), "ready": _ReadyProvider()}
    factory.get_historical_data("TEST")
    report = factory.get_last_fetch_source_health()

    expected_report_keys = {
        "checked_at",
        "symbol",
        "interval",
        "status",
        "selected_source",
        "fallback_used",
        "attempts",
    }
    assert set(report.keys()) == expected_report_keys

    attempt_keys = {"id", "ok", "status", "reason", "row_count", "fallback", "checked_at"}
    for attempt in report["attempts"]:
        assert set(attempt.keys()) == attempt_keys
        assert isinstance(attempt["id"], str)
        assert isinstance(attempt["ok"], bool)
        assert isinstance(attempt["status"], str)
        assert attempt["reason"] is None or isinstance(attempt["reason"], str)
        assert attempt["row_count"] is None or isinstance(attempt["row_count"], int)
        assert isinstance(attempt["fallback"], bool)
        assert attempt["checked_at"].endswith("Z")


def test_base_provider_has_no_rate_limit_noop_method():
    """The unenforced `_check_rate_limit` no-op must not exist on BaseDataProvider."""
    assert not hasattr(BaseDataProvider, "_check_rate_limit"), (
        "_check_rate_limit was a `return True` no-op with zero call sites; "
        "it must not be reintroduced as a misleading not-implemented limiter."
    )


def test_get_provider_info_does_not_advertise_unenforced_rate_limit():
    """`get_provider_info()` must not carry a `rate_limit` key it does not enforce."""
    info = _ReadyProvider().get_provider_info()
    assert "rate_limit" not in info, (
        "get_provider_info() advertised `rate_limit` while no limiter enforced it; "
        "the key must be dropped so the provider info stops implying enforcement."
    )
    # The honest fields stay.
    assert info["name"] == "ready"
    assert info["priority"] == 1
    assert info["requires_api_key"] is False


def test_rate_limit_attribute_still_readable_for_source_health_contract():
    """The `rate_limit` class attribute itself stays — it is a real contract field."""
    # `_provider_health_entry` reads this directly off the class; keep it intact.
    assert _ReadyProvider.rate_limit == 42
    assert BaseDataProvider.rate_limit == 60

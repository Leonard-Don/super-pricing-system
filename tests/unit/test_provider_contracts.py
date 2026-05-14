"""Phase-2 ADR 0001 contract tests.

Pin down the runtime shape of `DataProviderFactory.get_source_health_report()`
and `_record_fetch_health()` so future refactors cannot silently drift away
from the SourceHealthEntry / FetchAttempt / FetchHealthReport contracts.

The fields covered here are the ones already shipping today (per
`docs/adr/0001-provider-abstraction.md` §"标准字段语义" + the附加 list):
`id`/`name`/`label`/`status`/`reason`/`required`/`fallback`/`requires_api_key`/
`priority`/`rate_limit`/`capabilities`/`checked_at` for entries and
`id`/`ok`/`status`/`reason`/`row_count`/`fallback`/`checked_at` for attempts.
The Phase-3 fields (quality_score / evidence_url / freshness) are declared as
optional in `contracts.py` but are not yet asserted here.
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


def test_contracts_module_exposes_typed_dicts():
    """Phase-2: the contracts module must publish the named TypedDicts."""
    from src.data.providers import contracts

    assert hasattr(contracts, "SourceHealthEntry")
    assert hasattr(contracts, "FetchAttempt")
    assert hasattr(contracts, "FetchHealthReport")
    assert hasattr(contracts, "SourceHealthReport")
    assert hasattr(contracts, "ProviderEvent")
    assert hasattr(contracts, "ProviderCapabilities")
    # Phase-3 forward-declared (optional today)
    assert hasattr(contracts, "ProviderRecord")
    assert hasattr(contracts, "FreshnessMeta")


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


def test_freshness_meta_matches_alt_data_manager_contract():
    """FreshnessMeta TypedDict is structurally compatible with AltDataManager output."""
    from src.data.alternative.alt_data_manager import AltDataManager
    from src.data.providers.contracts import FreshnessMeta

    fresh = AltDataManager._build_freshness_meta(datetime.now())
    # TypedDict is a dict at runtime — verify keys overlap and types.
    typed: FreshnessMeta = {
        "age_hours": float(fresh["age_hours"]),
        "label": fresh["label"],
        "weight": float(fresh["weight"]),
    }
    assert typed["label"] in {"fresh", "recent", "aging", "stale"}
    assert isinstance(typed["age_hours"], float)
    assert isinstance(typed["weight"], float)


def test_provider_record_is_total_false():
    """ProviderRecord (Phase-3 forward) must accept partial dicts so today's code stays compatible."""
    from src.data.providers.contracts import ProviderRecord

    empty: ProviderRecord = {}
    partial: ProviderRecord = {"quality_score": 0.8}
    full: ProviderRecord = {
        "quality_score": 0.8,
        "evidence_url": "https://example.com/article",
        "freshness": {"age_hours": 1.0, "label": "fresh", "weight": 1.0},
    }
    # No assertion beyond type-time — runtime is plain dicts; this just guards the
    # contracts module against accidentally setting total=True on ProviderRecord.
    assert empty == {}
    assert partial["quality_score"] == 0.8
    assert full["freshness"]["label"] == "fresh"

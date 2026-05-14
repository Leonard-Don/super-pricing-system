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


# ---------------------------------------------------------------------------
# Phase-3 normalize_provider_record_metadata helper.
# These tests pin the contract for the producer-side helper so future
# providers can rely on a single source of truth for quality / evidence /
# freshness coercion.
# ---------------------------------------------------------------------------


def test_normalize_empty_input_yields_empty_record():
    from src.data.providers.contracts import normalize_provider_record_metadata

    assert normalize_provider_record_metadata(None) == {}
    assert normalize_provider_record_metadata({}) == {}


def test_normalize_quality_score_in_range_preserved():
    from src.data.providers.contracts import normalize_provider_record_metadata

    out = normalize_provider_record_metadata({"quality_score": 0.42})
    assert out == {"quality_score": 0.42}


def test_normalize_quality_score_clamps_out_of_range():
    from src.data.providers.contracts import normalize_provider_record_metadata

    assert normalize_provider_record_metadata({"quality_score": 1.5}) == {"quality_score": 1.0}
    assert normalize_provider_record_metadata({"quality_score": -0.25}) == {"quality_score": 0.0}


def test_normalize_quality_score_invalid_becomes_none():
    """Non-finite or non-numeric scores are explicitly None ('not assessed'), not clamped."""
    from src.data.providers.contracts import normalize_provider_record_metadata

    assert normalize_provider_record_metadata({"quality_score": float("nan")}) == {
        "quality_score": None
    }
    assert normalize_provider_record_metadata({"quality_score": float("inf")}) == {
        "quality_score": None
    }
    assert normalize_provider_record_metadata({"quality_score": "not-a-number"}) == {
        "quality_score": None
    }


def test_normalize_quality_score_explicit_none_preserved():
    from src.data.providers.contracts import normalize_provider_record_metadata

    out = normalize_provider_record_metadata({"quality_score": None})
    assert out == {"quality_score": None}


def test_normalize_legacy_people_quality_score_aliased_when_canonical_absent():
    """Legacy people_quality_score (alt-data side) is consumed only when quality_score is absent."""
    from src.data.providers.contracts import normalize_provider_record_metadata

    out = normalize_provider_record_metadata({"people_quality_score": 0.7})
    assert out == {"quality_score": 0.7}


def test_normalize_canonical_quality_score_wins_over_legacy_alias():
    """When both quality_score and people_quality_score are present, the canonical key wins."""
    from src.data.providers.contracts import normalize_provider_record_metadata

    out = normalize_provider_record_metadata(
        {"quality_score": 0.9, "people_quality_score": 0.1}
    )
    assert out == {"quality_score": 0.9}


def test_normalize_evidence_url_http_and_https_preserved():
    from src.data.providers.contracts import normalize_provider_record_metadata

    https = normalize_provider_record_metadata({"evidence_url": "https://stats.gov.cn/x"})
    http = normalize_provider_record_metadata({"evidence_url": "http://xueqiu.com/S/SH600519"})
    assert https == {"evidence_url": "https://stats.gov.cn/x"}
    assert http == {"evidence_url": "http://xueqiu.com/S/SH600519"}


def test_normalize_evidence_url_blank_becomes_none():
    from src.data.providers.contracts import normalize_provider_record_metadata

    assert normalize_provider_record_metadata({"evidence_url": ""}) == {"evidence_url": None}
    assert normalize_provider_record_metadata({"evidence_url": "   "}) == {"evidence_url": None}


def test_normalize_evidence_url_non_http_scheme_becomes_none():
    """Per ADR §标准字段语义: only http(s) canonical URLs; reject internal/file/javascript schemes."""
    from src.data.providers.contracts import normalize_provider_record_metadata

    assert normalize_provider_record_metadata({"evidence_url": "javascript:alert(1)"}) == {
        "evidence_url": None
    }
    assert normalize_provider_record_metadata({"evidence_url": "file:///etc/passwd"}) == {
        "evidence_url": None
    }
    assert normalize_provider_record_metadata({"evidence_url": "ftp://example.com/x"}) == {
        "evidence_url": None
    }


def test_normalize_evidence_url_strips_surrounding_whitespace():
    from src.data.providers.contracts import normalize_provider_record_metadata

    out = normalize_provider_record_metadata({"evidence_url": "  https://example.com/a  "})
    assert out == {"evidence_url": "https://example.com/a"}


def test_normalize_freshness_full_dict_passes_through_when_consistent():
    from src.data.providers.contracts import normalize_provider_record_metadata

    out = normalize_provider_record_metadata(
        {"freshness": {"age_hours": 2.0, "label": "fresh", "weight": 1.0}}
    )
    assert out == {"freshness": {"age_hours": 2.0, "label": "fresh", "weight": 1.0}}


def test_normalize_freshness_rederives_label_and_weight_from_age_hours():
    """age_hours is the single source of truth — inconsistent label/weight are corrected."""
    from src.data.providers.contracts import normalize_provider_record_metadata

    # Provider mistakenly tagged 100h-old data as 'fresh' / 1.0; normalizer corrects it.
    out = normalize_provider_record_metadata(
        {"freshness": {"age_hours": 100.0, "label": "fresh", "weight": 1.0}}
    )
    assert out == {"freshness": {"age_hours": 100.0, "label": "aging", "weight": 0.5}}


def test_normalize_freshness_buckets_match_alt_data_manager_contract():
    """Bucket boundaries must mirror AltDataManager._build_freshness_meta exactly."""
    from src.data.providers.contracts import normalize_provider_record_metadata

    cases = [
        (0.0, "fresh", 1.0),
        (24.0, "fresh", 1.0),
        (24.01, "recent", 0.75),
        (72.0, "recent", 0.75),
        (72.01, "aging", 0.5),
        (168.0, "aging", 0.5),
        (168.01, "stale", 0.25),
    ]
    for age, label, weight in cases:
        out = normalize_provider_record_metadata({"freshness": {"age_hours": age}})
        assert out == {"freshness": {"age_hours": round(age, 2), "label": label, "weight": weight}}


def test_normalize_freshness_clamps_negative_age_to_zero():
    """A clock skew that produces negative age_hours is clamped (matches AltDataManager)."""
    from src.data.providers.contracts import normalize_provider_record_metadata

    out = normalize_provider_record_metadata({"freshness": {"age_hours": -5.0}})
    assert out == {"freshness": {"age_hours": 0.0, "label": "fresh", "weight": 1.0}}


def test_normalize_freshness_invalid_becomes_none():
    from src.data.providers.contracts import normalize_provider_record_metadata

    assert normalize_provider_record_metadata({"freshness": {}}) == {"freshness": None}
    assert normalize_provider_record_metadata(
        {"freshness": {"age_hours": "soon"}}
    ) == {"freshness": None}
    assert normalize_provider_record_metadata({"freshness": "fresh"}) == {"freshness": None}
    assert normalize_provider_record_metadata({"freshness": None}) == {"freshness": None}


def test_normalize_absent_keys_stay_absent():
    """Absent input keys must NOT appear on output — preserves 'didn't declare' vs 'declared None'."""
    from src.data.providers.contracts import normalize_provider_record_metadata

    out = normalize_provider_record_metadata({"quality_score": 0.5})
    assert out == {"quality_score": 0.5}
    assert "evidence_url" not in out
    assert "freshness" not in out


def test_normalize_drops_unknown_keys():
    """Only the standardized ProviderRecord keys survive normalization."""
    from src.data.providers.contracts import normalize_provider_record_metadata

    out = normalize_provider_record_metadata(
        {
            "quality_score": 0.5,
            "trust_score": 0.9,
            "internal_debug": "ignored",
        }
    )
    assert out == {"quality_score": 0.5}


def test_normalize_full_record_round_trip():
    from src.data.providers.contracts import normalize_provider_record_metadata

    out = normalize_provider_record_metadata(
        {
            "quality_score": 0.81,
            "evidence_url": "https://example.com/article",
            "freshness": {"age_hours": 2.5},
        }
    )
    assert out == {
        "quality_score": 0.81,
        "evidence_url": "https://example.com/article",
        "freshness": {"age_hours": 2.5, "label": "fresh", "weight": 1.0},
    }

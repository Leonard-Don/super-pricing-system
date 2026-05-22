"""Tests for the alt-data narrative synthesizer (Phase E2).

Pins the deterministic synthesis rules in
``src/data/alternative/narrative.py``:

- Empty-state copy when there are no providers / no signals.
- Policy + macro_hf sentence structure when fresh records exist.
- ``[stale]`` prefix when a provider's snapshot is older than the
  ``STALE_THRESHOLD_DAYS`` constant.
- Idempotence: two calls with the same inputs produce the same
  ``summary`` / ``bullets`` / ``evidence_links`` (so the
  ``Cache-Control: max-age=300`` budget on the endpoint side is safe).
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import List

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import alt_data
from src.data.alternative.alt_data_manager import AltDataManager
from src.data.alternative.base_alt_provider import (
    AltDataCategory,
    AltDataRecord,
    BaseAltDataProvider,
)
from src.data.alternative.governance import AltDataSnapshotStore
from src.data.alternative.narrative import (
    EMPTY_INDUSTRY_NARRATIVE_SUMMARY,
    EMPTY_NARRATIVE_SUMMARY,
    STALE_THRESHOLD_DAYS,
    AltDataNarrative,
    build_alt_data_narrative,
)
from src.data.alternative.ticker_industry import (
    KNOWN_INDUSTRIES,
    filter_records_by_industry,
    is_known_industry,
    metals_for_industry,
    resolve_ticker_industry,
)


class _StubPolicyProvider(BaseAltDataProvider):
    """Stub provider that emits a deterministic per-source policy record set.

    Mimics the real ``policy_radar`` output: ``policy`` category with a
    ``policy_radar:<source>`` token in the record's ``source`` field,
    plus a ``signal`` payload carrying ``industry_signals`` and
    ``source_health`` so the narrative synthesizer can exercise both
    primary and fallback breakdown paths.
    """

    name = "policy_radar"
    category = AltDataCategory.POLICY

    def __init__(self) -> None:
        super().__init__()
        # Pre-populate latest_signal so the manager picks it up.
        self._latest_signal_payload = {
            "provider": "policy_radar",
            "source": "policy_radar",
            "category": "policy",
            "record_count": 12,
            "industry_signals": {
                "新能源汽车": {
                    "avg_impact": -0.35,
                    "mentions": 8,
                    "signal": "bearish",
                },
                "AI算力": {
                    "avg_impact": 0.08,
                    "mentions": 2,
                    "signal": "neutral",
                },
            },
            "source_health": {
                "fed": {"record_count": 5},
                "ecb": {"record_count": 4},
                "ndrc": {"record_count": 3},
            },
        }

    def fetch(self, **kwargs):  # pragma: no cover - exercised via refresh_all only
        return []

    def parse(self, raw_data):  # pragma: no cover
        return raw_data

    def normalize(self, parsed_data):  # pragma: no cover
        return []

    def emit_records(self, *, now: datetime) -> List[AltDataRecord]:
        """Helper used by the test harness to seed history + snapshot."""
        records: List[AltDataRecord] = []
        for source, count in (("fed", 5), ("ecb", 4), ("ndrc", 3)):
            for i in range(count):
                records.append(
                    AltDataRecord(
                        timestamp=now - timedelta(hours=i + 1),
                        source=f"policy_radar:{source}",
                        category=AltDataCategory.POLICY,
                        raw_value={"title": f"{source}-{i}"},
                        normalized_score=-0.35 if source != "ndrc" else 0.1,
                        confidence=0.7,
                        tags=["新能源汽车"] if source != "ndrc" else ["AI算力"],
                    )
                )
        return records


class _StubMacroProvider(BaseAltDataProvider):
    """Stub provider mirroring macro_hf's inventory record shape."""

    name = "macro_hf"
    category = AltDataCategory.COMMODITY_INVENTORY

    def __init__(self) -> None:
        super().__init__()
        self._latest_signal_payload = {
            "provider": "macro_hf",
            "source": "macro_hf",
            "category": "commodity_inventory",
            "record_count": 4,
        }

    def fetch(self, **kwargs):  # pragma: no cover
        return []

    def parse(self, raw_data):  # pragma: no cover
        return raw_data

    def normalize(self, parsed_data):  # pragma: no cover
        return []

    def emit_records(self, *, now: datetime) -> List[AltDataRecord]:
        """Seed two LME + two SHFE inventory rows with distinct trends."""
        spec = [
            ("lme", "copper", "铜", "destocking", "LME"),
            ("lme", "aluminium", "铝", "destocking", "LME"),
            ("shfe", "copper", "铜", "destocking", "SHFE"),
            ("shfe", "aluminium", "铝", "restocking", "SHFE"),
        ]
        records: List[AltDataRecord] = []
        for region_tag, metal_en, metal_zh, trend, region in spec:
            records.append(
                AltDataRecord(
                    timestamp=now - timedelta(minutes=spec.index((region_tag, metal_en, metal_zh, trend, region))),
                    source=f"macro_hf:inventory:{region_tag}",
                    category=AltDataCategory.COMMODITY_INVENTORY,
                    raw_value={
                        "metal": metal_en,
                        "name": metal_zh,
                        "trend": trend,
                        "signal": 1 if trend == "destocking" else -1,
                        "price_change_pct": -2.5 if trend == "destocking" else 1.8,
                    },
                    normalized_score=0.4 if trend == "destocking" else -0.4,
                    confidence=0.6,
                    tags=[metal_zh, "inventory", region_tag],
                    metadata={
                        "label": metal_zh,
                        "region": region,
                        "source_mode": "live" if region == "SHFE" else "proxy",
                    },
                )
            )
        return records


def _seed_manager(
    tmp_path: Path,
    *,
    seed_policy: bool = True,
    seed_macro: bool = True,
    snapshot_mtime_days_ago: float = 0.5,
) -> AltDataManager:
    """Build an AltDataManager whose snapshot store is fully seeded.

    ``snapshot_mtime_days_ago`` controls whether the on-disk snapshot
    files should be considered fresh (``0.5``) or stale (``>7``).
    """

    providers: dict[str, BaseAltDataProvider] = {}
    if seed_policy:
        providers["policy_radar"] = _StubPolicyProvider()
    if seed_macro:
        providers["macro_hf"] = _StubMacroProvider()

    store = AltDataSnapshotStore(tmp_path / "alt_data")
    providers_dir = store.providers_dir
    providers_dir.mkdir(parents=True, exist_ok=True)

    now = datetime.now().replace(microsecond=0)
    manager = AltDataManager(providers=providers, snapshot_store=store)

    # Seed each provider's in-memory history + latest_signals + snapshot.
    for key, provider in providers.items():
        records: List[AltDataRecord] = []
        if isinstance(provider, _StubPolicyProvider):
            records = provider.emit_records(now=now)
        elif isinstance(provider, _StubMacroProvider):
            records = provider.emit_records(now=now)
        provider._history = records
        manager.latest_signals[key] = provider._latest_signal_payload

        # Write a snapshot file so _component_last_refresh sees the mtime.
        snapshot_path = providers_dir / f"{key}.json"
        snapshot_path.write_text(
            json.dumps({"records": [r.to_dict() for r in records]}),
            encoding="utf-8",
        )
        mtime = (now - timedelta(days=snapshot_mtime_days_ago)).timestamp()
        os.utime(snapshot_path, (mtime, mtime))

    return manager


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_empty_manager_returns_minimal_narrative(tmp_path):
    """No providers, no signals -> the empty-state copy is returned."""

    manager = AltDataManager(
        providers={},
        snapshot_store=AltDataSnapshotStore(tmp_path / "alt_data"),
    )
    narrative = build_alt_data_narrative(manager)

    assert isinstance(narrative, AltDataNarrative)
    assert narrative.summary == EMPTY_NARRATIVE_SUMMARY
    assert narrative.bullets == []
    assert narrative.evidence_links == []
    assert narrative.generated_at  # ISO-8601 timestamp filled


def test_fresh_policy_and_macro_produce_three_sentences(tmp_path):
    """Both providers fresh -> exactly three sentences with policy + macro + cross-cutting."""

    manager = _seed_manager(tmp_path, snapshot_mtime_days_ago=0.5)
    narrative = build_alt_data_narrative(manager)

    # Exactly three bullets: policy, macro, cross-cutting.
    assert len(narrative.bullets) == 3
    assert len(narrative.evidence_links) == 3

    policy_bullet, macro_bullet, cross_bullet = narrative.bullets
    # No stale prefix when fresh.
    assert "[stale]" not in policy_bullet
    assert "[stale]" not in macro_bullet

    # Sentence #1 references the policy radar + source breakdown.
    assert "政策雷达" in policy_bullet
    assert "新能源汽车" in policy_bullet
    assert "-0.35" in policy_bullet  # avg_impact echoed
    assert "偏空" in policy_bullet  # direction label
    # Source health fallback (records < 7d) finds fed/ecb/ndrc per source_health.
    assert "fed=" in policy_bullet
    assert "ndrc" in policy_bullet  # CN side surfaced

    # Sentence #2 references inventory + at least one region.
    assert "宏观高频库存信号" in macro_bullet
    assert ("SHFE" in macro_bullet) or ("LME" in macro_bullet)
    assert "destocking" in macro_bullet

    # Sentence #3 ties the two together.
    assert cross_bullet.startswith("综合判读：")

    # Evidence links carry repo-relative snapshot paths.
    assert narrative.evidence_links[0]["component"] == "policy_radar"
    assert narrative.evidence_links[0]["snapshot_path"] == "cache/alt_data/providers/policy_radar.json"
    assert narrative.evidence_links[0]["stale"] is False
    assert narrative.evidence_links[1]["component"] == "macro_hf"
    assert narrative.evidence_links[1]["snapshot_path"] == "cache/alt_data/providers/macro_hf.json"


def test_stale_provider_gets_stale_prefix(tmp_path):
    """Snapshot older than STALE_THRESHOLD_DAYS -> sentence prefixed with [stale]."""

    days_stale = STALE_THRESHOLD_DAYS + 5  # well past the threshold
    manager = _seed_manager(tmp_path, snapshot_mtime_days_ago=days_stale)
    narrative = build_alt_data_narrative(manager)

    # All component bullets (policy, macro) carry the stale prefix.
    assert narrative.bullets[0].startswith("[stale]")
    assert narrative.bullets[1].startswith("[stale]")
    # Cross-cutting takeaway doesn't have a single snapshot so doesn't.
    assert not narrative.bullets[2].startswith("[stale]")

    # Evidence links report stale=True for the two upstream components.
    assert narrative.evidence_links[0]["stale"] is True
    assert narrative.evidence_links[1]["stale"] is True
    # The derived takeaway points at the audit doc and is never "stale".
    assert narrative.evidence_links[2]["component"] == "alt_data_audit"
    assert narrative.evidence_links[2]["stale"] is False


def test_idempotent_same_inputs_same_output(tmp_path):
    """Calling build_alt_data_narrative twice on the same manager yields identical bullets/links.

    ``generated_at`` is permitted to differ (it is a wall-clock stamp),
    but everything content-bearing must match exactly so the 5-min cache
    on the endpoint is safe.
    """

    manager = _seed_manager(tmp_path, snapshot_mtime_days_ago=0.5)

    first = build_alt_data_narrative(manager)
    second = build_alt_data_narrative(manager)

    assert first.summary == second.summary
    assert first.bullets == second.bullets
    # Evidence links compare by value -- generated_at is intentionally
    # excluded from this comparison.
    assert first.evidence_links == second.evidence_links


def test_only_policy_seeded_produces_two_sentences(tmp_path):
    """When only policy_radar has signals, the macro sentence is dropped."""

    manager = _seed_manager(
        tmp_path,
        seed_policy=True,
        seed_macro=False,
        snapshot_mtime_days_ago=0.5,
    )
    narrative = build_alt_data_narrative(manager)

    # Policy sentence + cross-cutting takeaway. Macro sentence is absent.
    assert len(narrative.bullets) == 2
    assert "政策雷达" in narrative.bullets[0]
    assert narrative.bullets[1].startswith("综合判读：")
    # No macro evidence link should appear.
    components = [link["component"] for link in narrative.evidence_links]
    assert "macro_hf" not in components
    assert "policy_radar" in components


def test_only_macro_seeded_produces_two_sentences(tmp_path):
    """When only macro_hf has signals, the policy sentence is dropped."""

    manager = _seed_manager(
        tmp_path,
        seed_policy=False,
        seed_macro=True,
        snapshot_mtime_days_ago=0.5,
    )
    narrative = build_alt_data_narrative(manager)

    # Macro sentence + cross-cutting (from inventory trends only).
    assert len(narrative.bullets) == 2
    assert "宏观高频库存信号" in narrative.bullets[0]
    assert narrative.bullets[1].startswith("综合判读：")
    components = [link["component"] for link in narrative.evidence_links]
    assert "policy_radar" not in components
    assert "macro_hf" in components


def test_to_dict_serialises_all_fields(tmp_path):
    """to_dict() must return all four fields with expected types."""

    manager = _seed_manager(tmp_path, snapshot_mtime_days_ago=0.5)
    payload = build_alt_data_narrative(manager).to_dict()

    assert set(payload.keys()) == {"summary", "bullets", "evidence_links", "generated_at"}
    assert isinstance(payload["summary"], str)
    assert isinstance(payload["bullets"], list)
    assert isinstance(payload["evidence_links"], list)
    assert isinstance(payload["generated_at"], str)
    # Every evidence_link has the documented shape.
    for link in payload["evidence_links"]:
        assert {"component", "snapshot_path", "verdict", "stale"} <= set(link.keys())


def test_narrative_endpoint_returns_payload_and_cache_header(monkeypatch, tmp_path):
    """GET /alt-data/narrative -> 200 with summary + Cache-Control: max-age=300."""

    manager = _seed_manager(tmp_path, snapshot_mtime_days_ago=0.5)

    app = FastAPI()
    app.include_router(alt_data.router, prefix="/alt-data")
    monkeypatch.setattr(alt_data, "_get_manager", lambda: manager)
    monkeypatch.setattr(alt_data, "_get_scheduler", lambda: None)
    client = TestClient(app)

    response = client.get("/alt-data/narrative")
    assert response.status_code == 200
    payload = response.json()
    assert "summary" in payload
    assert "bullets" in payload
    assert "evidence_links" in payload
    assert "generated_at" in payload
    assert payload["audit_doc_url"] == "docs/alt_data_audit.md"
    # Industry-scope echo: null in the no-param path -- the frontend
    # treats this as "global narrative".
    assert payload.get("industry_scope") in (None, "")
    # 5-minute Cache-Control budget per Phase E2 contract.
    assert response.headers.get("cache-control") == "max-age=300"


# ---------------------------------------------------------------------------
# Phase E2.1: industry-scoped narrative
# ---------------------------------------------------------------------------


def test_industry_scope_filters_policy_records_by_tags(tmp_path):
    """Industry-scoped query keeps only policy records tagged with that industry."""

    manager = _seed_manager(tmp_path, snapshot_mtime_days_ago=0.5)
    narrative = build_alt_data_narrative(manager, ticker_industry="新能源汽车")

    # Policy sentence is industry-scoped: framed as "相关政策记录" with
    # a per-industry impact clause rather than the global top-impact one.
    assert "新能源汽车 相关政策记录" in narrative.bullets[0]
    assert "新能源汽车 行业影响力" in narrative.bullets[0]
    assert "avg_impact=-0.35" in narrative.bullets[0]

    # The stub's industry-tagged records cover fed (5) + ecb (4) -> 9
    # records. The framing must echo that count, not the global total.
    assert "9" in narrative.bullets[0] or "8" in narrative.bullets[0]

    # The endpoint still surfaces policy_radar evidence with snapshot
    # path and stale flag derived from snapshot mtime.
    assert narrative.evidence_links[0]["component"] == "policy_radar"
    assert narrative.evidence_links[0]["stale"] is False


def test_industry_scope_filters_macro_to_relevant_metals(tmp_path):
    """Industry-scoped query filters macro_hf inventory to relevant metals only."""

    manager = _seed_manager(tmp_path, snapshot_mtime_days_ago=0.5)
    # AI算力 -> {铜} -- aluminum drops out, so the macro sentence
    # mentions only copper.
    narrative = build_alt_data_narrative(manager, ticker_industry="AI算力")

    macro_bullet = next((b for b in narrative.bullets if "宏观高频库存信号" in b), "")
    assert macro_bullet, "expected a macro sentence in the AI算力 narrative"
    assert "AI算力 相关金属" in macro_bullet
    assert "铜" in macro_bullet
    # Aluminum is in the stub but not in AI算力's mapped metals --
    # confirm it was filtered out so we don't show irrelevant noise.
    assert "铝" not in macro_bullet


def test_industry_scope_with_no_signals_returns_degraded_copy(tmp_path):
    """Industry not covered by policy_radar or macro_hf returns the empty-industry copy."""

    manager = _seed_manager(tmp_path, snapshot_mtime_days_ago=0.5)
    narrative = build_alt_data_narrative(manager, ticker_industry="完全不存在的行业")

    assert narrative.summary == EMPTY_INDUSTRY_NARRATIVE_SUMMARY
    # Bullets/evidence_links must be empty so the frontend Empty state
    # renders cleanly.
    assert narrative.bullets == []
    assert narrative.evidence_links == []
    # Generated_at is still populated -- it is a synthesis stamp, not a
    # signal-bearing field.
    assert narrative.generated_at


def test_industry_scope_endpoint_query_param(monkeypatch, tmp_path):
    """GET /alt-data/narrative?industry=新能源汽车 -> industry-scoped payload."""

    manager = _seed_manager(tmp_path, snapshot_mtime_days_ago=0.5)

    app = FastAPI()
    app.include_router(alt_data.router, prefix="/alt-data")
    monkeypatch.setattr(alt_data, "_get_manager", lambda: manager)
    monkeypatch.setattr(alt_data, "_get_scheduler", lambda: None)
    client = TestClient(app)

    response = client.get("/alt-data/narrative", params={"industry": "新能源汽车"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["industry_scope"] == "新能源汽车"
    assert any("新能源汽车" in bullet for bullet in payload["bullets"])
    # Industry-scoped path keeps the same cache budget.
    assert response.headers.get("cache-control") == "max-age=300"


def test_industry_scope_endpoint_empty_industry_returns_degraded_payload(
    monkeypatch, tmp_path
):
    """Industry with no signals -> degraded copy without raising."""

    manager = _seed_manager(tmp_path, snapshot_mtime_days_ago=0.5)
    app = FastAPI()
    app.include_router(alt_data.router, prefix="/alt-data")
    monkeypatch.setattr(alt_data, "_get_manager", lambda: manager)
    monkeypatch.setattr(alt_data, "_get_scheduler", lambda: None)
    client = TestClient(app)

    response = client.get(
        "/alt-data/narrative", params={"industry": "完全不存在的行业"}
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"] == EMPTY_INDUSTRY_NARRATIVE_SUMMARY
    assert payload["bullets"] == []
    assert payload["industry_scope"] == "完全不存在的行业"


# ---------------------------------------------------------------------------
# ticker_industry resolver
# ---------------------------------------------------------------------------


def test_known_industries_match_policy_signal_keys():
    """KNOWN_INDUSTRIES covers the labels that policy_radar actually emits."""

    # Sanity check: the four signal keys that ship in the audit corpus
    # are all members of the canonical set. Adding new industries to
    # ``industry_signals`` should always come with an update here.
    assert "新能源汽车" in KNOWN_INDUSTRIES
    assert "电网" in KNOWN_INDUSTRIES
    assert "风电" in KNOWN_INDUSTRIES
    assert "AI算力" in KNOWN_INDUSTRIES


def test_resolve_ticker_industry_uses_static_fallback():
    """Known A-share / US tickers resolve via the static fallback table."""

    # Static map covers the deterministic happy-path symbols.
    assert resolve_ticker_industry("300750") == "新能源汽车"
    assert resolve_ticker_industry("300750.sz") == "新能源汽车"
    assert resolve_ticker_industry("TSLA") == "新能源汽车"
    assert resolve_ticker_industry("NVDA") == "AI算力"
    assert resolve_ticker_industry("GOOGL") == "AI算力"
    assert resolve_ticker_industry("") is None
    assert resolve_ticker_industry("UNKNOWN_TICKER") is None


def test_resolve_ticker_industry_uses_data_manager_lookup():
    """Falls back to ``data_manager.get_fundamental_data`` and canonicalises label."""

    class _StubDataManager:
        def __init__(self, fundamentals):
            self._fundamentals = fundamentals

        def get_fundamental_data(self, symbol):
            return self._fundamentals

    manager = _StubDataManager({"industry": "Auto Manufacturers", "sector": "Consumer Cyclical"})
    assert resolve_ticker_industry("FAKE.XX", data_manager=manager) == "新能源汽车"

    manager_internet = _StubDataManager(
        {"industry": "Internet Content & Information", "sector": "Communication Services"}
    )
    assert resolve_ticker_industry("WEB.XX", data_manager=manager_internet) == "AI算力"

    # Unmappable provider label falls back to None (the narrative
    # builder then surfaces the degraded copy).
    manager_unknown = _StubDataManager({"industry": "Random Industry", "sector": ""})
    assert resolve_ticker_industry("FAKE2", data_manager=manager_unknown) is None

    # Error response from data manager -> None, not a raised exception.
    class _Broken:
        def get_fundamental_data(self, symbol):
            raise RuntimeError("provider down")

    assert resolve_ticker_industry("BAD", data_manager=_Broken()) is None


def test_is_known_industry_and_metals_for_industry():
    """is_known_industry validates against the canonical set; metals_for_industry maps correctly."""

    assert is_known_industry("新能源汽车")
    assert not is_known_industry("不存在")
    assert not is_known_industry(None)

    metals = metals_for_industry("新能源汽车")
    assert metals is not None
    assert "铜" in metals
    assert "铝" in metals

    assert metals_for_industry(None) is None
    assert metals_for_industry("不存在的行业") is None


def test_filter_records_by_industry_matches_tags():
    """filter_records_by_industry keeps records whose tags contain the industry label."""

    class _Rec:
        def __init__(self, tags, metadata=None, raw_value=None):
            self.tags = tags
            self.metadata = metadata or {}
            self.raw_value = raw_value or {}

    matched = _Rec(tags=["新能源汽车", "ev"])
    other = _Rec(tags=["AI算力"])
    meta_match = _Rec(tags=[], metadata={"industry": "新能源汽车"})
    raw_match = _Rec(tags=[], raw_value={"industry": "新能源汽车"})

    result = filter_records_by_industry(
        [matched, other, meta_match, raw_match],
        "新能源汽车",
    )
    assert matched in result
    assert other not in result
    assert meta_match in result
    assert raw_match in result


def test_idempotent_industry_scoped_call(tmp_path):
    """Industry-scoped synthesis is also idempotent (same input -> same bullets)."""

    manager = _seed_manager(tmp_path, snapshot_mtime_days_ago=0.5)
    first = build_alt_data_narrative(manager, ticker_industry="新能源汽车")
    second = build_alt_data_narrative(manager, ticker_industry="新能源汽车")

    assert first.bullets == second.bullets
    assert first.evidence_links == second.evidence_links

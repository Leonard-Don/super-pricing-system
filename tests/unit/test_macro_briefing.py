"""Tests for the alt-data macro daily briefing composer (Phase F5).

Pins the deterministic synthesis rules in
``src/data/alternative/macro_briefing.py``:

- All-providers-present path emits all five sections + a 3-sentence
  ``summary_paragraph``.
- Missing providers degrade gracefully (sections become empty, the
  composer never raises).
- The ``time_window_days`` query knob is plumbed through to the DTO and
  validated.
- Idempotence: same input → same content-bearing output.
- ``GET /alt-data/macro-briefing`` returns the payload with
  ``Cache-Control: max-age=300``.
- The public-summary distillation surfaces ``summary_paragraph`` +
  ``top_3_themes`` only.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import alt_data
from src.data.alternative.composite_signal import CompositeSignal, SupportingComponent
from src.data.alternative.macro_briefing import (
    DEFAULT_TIME_WINDOW_DAYS,
    EMPTY_BRIEFING_SUMMARY,
    MacroBriefing,
    compose_macro_briefing,
    macro_briefing_to_public_summary,
)

# ---------------------------------------------------------------------------
# Stub manager — duck-typed clone of AltDataManager that carries just
# ``latest_signals`` + ``providers`` (the contract shared with
# composite_signal.detect_composite_signals).
# ---------------------------------------------------------------------------


class _StubProvider:
    def __init__(self, history=None):
        self._history = history or []


class _StubManager:
    def __init__(self, latest_signals=None, providers=None):
        self.latest_signals = latest_signals or {}
        self.providers = providers or {}


def _make_full_manager() -> _StubManager:
    """Return a stub manager seeded with every provider populated.

    The seeded values are minimal but realistic — enough that each of the
    five briefing sections produces at least one bullet.
    """

    # Policy radar: 政策面 bullets + cross-cutting theme.
    policy_signal = {
        "industry_signals": {
            "新能源汽车": {
                "avg_impact": -0.35,
                "mentions": 12,
                "signal": "bearish",
            },
            "AI算力": {
                "avg_impact": 0.22,
                "mentions": 5,
                "signal": "bullish",
            },
            "光伏": {
                "avg_impact": 0.05,  # Below the floor — should be dropped
                "mentions": 1,
                "signal": "neutral",
            },
        },
    }
    # Policy execution: chaotic departments → extra policy-section bullet.
    policy_execution_signal = {
        "record_count": 4,
        "chaotic_department_count": 2,
        "reversal_count": 3,
    }

    # Fund holdings: 公募集中持有 bullet (≥ FUND_CONCENTRATION_THRESHOLD).
    fund_signal = {
        "top_concentration_tickers": [
            {"ticker": "600519", "holding_fund_count": 18, "total_aum_weight_pct": 0.42},
            {"ticker": "300750", "holding_fund_count": 16, "total_aum_weight_pct": 0.30},
            {"ticker": "000858", "holding_fund_count": 5, "total_aum_weight_pct": 0.10},
        ],
    }
    # Northbound: 资金面 bullet via top_inflow / outflow industries.
    nb_signal = {
        "top_inflow_industries": [
            {"industry": "AI算力", "netbuy_cny_billion": 6.5},
            {"industry": "电网", "netbuy_cny_billion": 2.8},
        ],
        "top_outflow_industries": [
            {"industry": "新能源汽车", "netbuy_cny_billion": -3.4},
        ],
    }
    # Block trades: optional but seeded so the capital-flow section exercises
    # the 3-source path.
    block_signal = {
        "top_inflow_industries": [
            {"industry": "光伏", "netbuy_cny_billion": 0.6},
        ],
        "top_outflow_industries": [
            {"industry": "白酒", "netbuy_cny_billion": -0.4},
        ],
    }

    # macro_hf: 商品面 bullets via SHFE + LME inventory history records.
    class _MetalRecord:
        def __init__(self, *, source, metal_zh, trend, region):
            self.source = source
            self.raw_value = {"name": metal_zh, "trend": trend}
            self.metadata = {"region": region}

    macro_history = [
        _MetalRecord(source="macro_hf:inventory:shfe", metal_zh="铜", trend="destocking", region="SHFE"),
        _MetalRecord(source="macro_hf:inventory:shfe", metal_zh="铝", trend="destocking", region="SHFE"),
        _MetalRecord(source="macro_hf:inventory:lme", metal_zh="铜", trend="destocking", region="LME"),
        _MetalRecord(source="macro_hf:inventory:lme", metal_zh="锌", trend="restocking", region="LME"),
    ]
    macro_signal = {"record_count": len(macro_history)}

    # People layer: 治理面 bullet via fragile_companies.
    people_signal = {
        "avg_fragility_score": 0.31,
        "fragile_company_count": 2,
        "fragile_companies": [
            {
                "symbol": "BABA",
                "people_fragility_score": 0.42,
                "risk_level": "high",
                "stance": "fragile",
            },
            {
                "symbol": "PDD",
                "people_fragility_score": 0.28,
                "risk_level": "medium",
                "stance": "fragile",
            },
        ],
        "supportive_companies": [],
    }

    # Supply chain — provider present but not directly consumed by sections
    # other than via composite signals; include to mirror the 10-provider env.
    supply_chain_signal = {"record_count": 0}

    latest = {
        "policy_radar": policy_signal,
        "policy_execution": policy_execution_signal,
        "supply_chain": supply_chain_signal,
        "macro_hf": macro_signal,
        "people_layer": people_signal,
        "fund_holdings": fund_signal,
        "northbound": nb_signal,
        "block_trades": block_signal,
    }
    providers = {
        "policy_radar": _StubProvider(),
        "policy_execution": _StubProvider(),
        "supply_chain": _StubProvider(),
        "macro_hf": _StubProvider(macro_history),
        "people_layer": _StubProvider(),
        "fund_holdings": _StubProvider(),
        "northbound": _StubProvider(),
        "block_trades": _StubProvider(),
    }
    return _StubManager(latest_signals=latest, providers=providers)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_compose_returns_all_sections_when_all_providers_present():
    """Full-coverage path emits all five sections + non-empty summary."""

    manager = _make_full_manager()
    briefing = compose_macro_briefing(manager)

    assert isinstance(briefing, MacroBriefing)
    assert briefing.summary_paragraph != EMPTY_BRIEFING_SUMMARY
    assert briefing.summary_paragraph.startswith("今日 alt-data 核心观察")

    assert briefing.policy_section, "policy section must have bullets"
    assert briefing.capital_flow_section, "capital flow section must have bullets"
    assert briefing.commodity_section, "commodity section must have bullets"
    assert briefing.governance_section, "governance section must have bullets"
    # Composite section may or may not be populated depending on whether the
    # composite detector finds an industry with 3+ agreeing components; for
    # the seeded data that's not guaranteed. We assert only that the field
    # exists and is a list.
    assert isinstance(briefing.composite_section, list)

    # At least the four guaranteed-populated sections produce evidence rows.
    components = {link["component"] for link in briefing.evidence_links}
    assert {"policy_radar", "fund_holdings", "macro_hf", "people_layer"} <= components

    # Policy section names the strongest impact industry first (sorted by
    # |avg_impact| desc).
    assert "新能源汽车" in briefing.policy_section[0]


def test_compose_handles_empty_manager_gracefully():
    """Manager with no signals and no providers returns degraded copy."""

    briefing = compose_macro_briefing(_StubManager())
    assert briefing.summary_paragraph == EMPTY_BRIEFING_SUMMARY
    assert briefing.policy_section == []
    assert briefing.capital_flow_section == []
    assert briefing.commodity_section == []
    assert briefing.governance_section == []
    assert briefing.composite_section == []
    assert briefing.evidence_links == []
    assert briefing.time_window_days == DEFAULT_TIME_WINDOW_DAYS


def test_compose_handles_partial_providers_gracefully():
    """Only policy + people layer seeded — three sections are empty."""

    manager = _StubManager(
        latest_signals={
            "policy_radar": {
                "industry_signals": {
                    "AI算力": {
                        "avg_impact": 0.4,
                        "mentions": 9,
                        "signal": "bullish",
                    },
                }
            },
            "people_layer": {
                "avg_fragility_score": 0.2,
                "fragile_company_count": 1,
                "fragile_companies": [
                    {
                        "symbol": "BIDU",
                        "people_fragility_score": 0.31,
                        "risk_level": "high",
                        "stance": "fragile",
                    }
                ],
                "supportive_companies": [],
            },
        },
        providers={
            "policy_radar": _StubProvider(),
            "people_layer": _StubProvider(),
        },
    )
    briefing = compose_macro_briefing(manager)

    assert briefing.policy_section, "policy bullets should fire from seeded data"
    assert briefing.governance_section, "governance bullets should fire from seeded data"
    assert briefing.capital_flow_section == []
    assert briefing.commodity_section == []
    # Summary paragraph cites the populated sections only.
    assert "AI算力" in briefing.summary_paragraph
    assert briefing.summary_paragraph != EMPTY_BRIEFING_SUMMARY


def test_time_window_days_is_threaded_through_and_clamped():
    """``time_window_days`` survives onto the DTO; <= 0 falls back to default."""

    manager = _make_full_manager()
    briefing = compose_macro_briefing(manager, time_window_days=14)
    assert briefing.time_window_days == 14

    fallback = compose_macro_briefing(manager, time_window_days=0)
    assert fallback.time_window_days == DEFAULT_TIME_WINDOW_DAYS


def test_compose_is_deterministic_same_inputs_same_output():
    """Two invocations on the same manager produce identical content fields."""

    manager = _make_full_manager()
    first = compose_macro_briefing(manager)
    second = compose_macro_briefing(manager)

    # generated_at is wall-clock and excluded from the equality check.
    assert first.policy_section == second.policy_section
    assert first.capital_flow_section == second.capital_flow_section
    assert first.commodity_section == second.commodity_section
    assert first.governance_section == second.governance_section
    assert first.composite_section == second.composite_section
    assert first.summary_paragraph == second.summary_paragraph
    assert first.evidence_links == second.evidence_links
    assert first.time_window_days == second.time_window_days


def test_composite_human_copy_uses_chinese_provider_labels(monkeypatch):
    """Composite bullets + summary must not leak raw provider slugs."""

    composite = CompositeSignal(
        direction="bullish",
        target_kind="industry",
        target="新能源汽车",
        conviction="medium",
        supporting_components=[
            SupportingComponent(
                component="fund_holdings",
                direction="bullish",
                signal_strength=0.58,
            ),
            SupportingComponent(
                component="shfe_inventory",
                direction="bullish",
                signal_strength=0.52,
            ),
            SupportingComponent(
                component="people_layer",
                direction="bullish",
                signal_strength=0.44,
            ),
        ],
    )
    monkeypatch.setattr(
        "src.data.alternative.macro_briefing.detect_composite_signals",
        lambda _manager, include_low=False: [composite],
    )

    briefing = compose_macro_briefing(_StubManager())  # type: ignore[arg-type]
    human_copy = " ".join([*briefing.composite_section, briefing.summary_paragraph])

    for label in ("基金持仓", "上期所库存", "人事层"):
        assert label in human_copy
    for raw_slug in ("fund_holdings", "shfe_inventory", "people_layer"):
        assert raw_slug not in human_copy


def test_public_summary_distillation_surfaces_themes_only():
    """``macro_briefing_to_public_summary`` keeps only publish-safe fields."""

    manager = _make_full_manager()
    briefing = compose_macro_briefing(manager)
    payload = macro_briefing_to_public_summary(briefing)

    assert set(payload.keys()) == {
        "summary_paragraph",
        "top_3_themes",
        "time_window_days",
        "generated_at",
    }
    # No evidence_links / snapshot paths leak out.
    assert "evidence_links" not in payload
    # Each theme carries only section + headline.
    for theme in payload["top_3_themes"]:
        assert set(theme.keys()) == {"section", "headline"}
    assert len(payload["top_3_themes"]) <= 3


def test_endpoint_returns_payload_with_cache_header(monkeypatch):
    """GET /alt-data/macro-briefing → 200 with Cache-Control: max-age=300."""

    manager = _make_full_manager()

    app = FastAPI()
    app.include_router(alt_data.router, prefix="/alt-data")
    monkeypatch.setattr(alt_data, "_get_manager", lambda: manager)
    monkeypatch.setattr(alt_data, "_get_scheduler", lambda: None)
    client = TestClient(app)

    response = client.get("/alt-data/macro-briefing")
    assert response.status_code == 200
    assert response.headers.get("cache-control") == "max-age=300"

    body = response.json()
    assert "summary_paragraph" in body
    assert isinstance(body.get("policy_section"), list)
    assert isinstance(body.get("capital_flow_section"), list)
    assert isinstance(body.get("commodity_section"), list)
    assert isinstance(body.get("governance_section"), list)
    assert isinstance(body.get("composite_section"), list)
    assert body.get("time_window_days") == DEFAULT_TIME_WINDOW_DAYS
    assert body.get("audit_doc_url") == "docs/alt_data_audit.md"


def test_endpoint_validates_time_window_days(monkeypatch):
    """``time_window_days`` query knob is clamped to [1, 30] by the route."""

    manager = _make_full_manager()
    app = FastAPI()
    app.include_router(alt_data.router, prefix="/alt-data")
    monkeypatch.setattr(alt_data, "_get_manager", lambda: manager)
    monkeypatch.setattr(alt_data, "_get_scheduler", lambda: None)
    client = TestClient(app)

    ok = client.get("/alt-data/macro-briefing?time_window_days=14")
    assert ok.status_code == 200
    assert ok.json().get("time_window_days") == 14

    too_big = client.get("/alt-data/macro-briefing?time_window_days=999")
    assert too_big.status_code == 422

    too_small = client.get("/alt-data/macro-briefing?time_window_days=0")
    assert too_small.status_code == 422


def test_compose_returns_none_safe_for_none_manager():
    """``compose_macro_briefing(None)`` returns the empty DTO without raising."""

    briefing = compose_macro_briefing(None)  # type: ignore[arg-type]
    assert isinstance(briefing, MacroBriefing)
    assert briefing.summary_paragraph == EMPTY_BRIEFING_SUMMARY
    assert briefing.policy_section == []
    assert briefing.time_window_days == DEFAULT_TIME_WINDOW_DAYS

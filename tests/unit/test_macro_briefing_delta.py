"""Tests for the macro briefing day-over-day delta detector (Phase F5.1).

Pins the deterministic diff rules in
``src/data/alternative/macro_briefing_delta.py``:

- Missing yesterday baseline → empty delta + cold-start note.
- Intensification detected (same sign, larger magnitude).
- Reversal detected (sign flip).
- New today / dropped today rows surfaced.
- Threshold filtering — small deltas ignored.
- Idempotence: same inputs → same content fields.
- Endpoint returns the documented payload shape with Cache-Control.
- Public summary distillation surfaces only safe-to-publish fields.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import alt_data
from src.data.alternative.macro_briefing import MacroBriefing
from src.data.alternative.macro_briefing_delta import (
    EMPTY_DELTA_NOTE,
    MacroBriefingDelta,
    POLICY_DELTA_THRESHOLD,
    SectionDelta,
    compute_macro_briefing_delta,
    macro_briefing_delta_to_public_summary,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_today_briefing() -> MacroBriefing:
    """A briefing with deliberately strong signals for the delta to surface.

    Policy: 新能源汽车 worsened from -0.20 to -0.39 (intensified bearish),
    AI算力 weakened from +0.40 to +0.22 (softened bullish), 锂电 appears
    today (+0.30, new_today), 光伏 reversed from -0.18 to +0.18.

    Capital flow: AI算力 北向 +6.5 亿 vs yesterday +2.0 亿.
    Governance: BABA 脆弱度 0.42 vs yesterday 0.30.
    Commodity: SHFE 铜 destocking changes to restocking.
    Composite: 新能源汽车 看空 MEDIUM newly today (no yesterday entry).
    """

    return MacroBriefing(
        generated_at="2026-05-17T08:00:00+00:00",
        time_window_days=7,
        policy_section=[
            "政策雷达 新能源汽车 avg_impact=-0.39 (偏空, mentions=94)。",
            "政策雷达 AI算力 avg_impact=+0.22 (偏多, mentions=8)。",
            "政策雷达 锂电 avg_impact=+0.30 (偏多, mentions=4)。",
            "政策雷达 光伏 avg_impact=+0.18 (偏多, mentions=3)。",
            "政策执行: 2 个部门标记 chaotic、累计 4 次反转。",
        ],
        capital_flow_section=[
            "北向资金净流入 AI算力(+6.5亿), 电网(+2.8亿)；"
            "北向资金净流出 新能源汽车(-3.4亿)。",
        ],
        commodity_section=[
            "SHFE 库存: 铜 累积；铝 去化。",
            "LME 库存: 铜/铝 持稳。",
        ],
        governance_section=[
            "高警惕公司: BABA(脆弱度0.42, high), PDD(脆弱度0.28, medium)。",
        ],
        composite_section=[
            "新能源汽车 看空 (MEDIUM, 3 组件: policy_radar, "
            "policy_execution, northbound)。"
        ],
        summary_paragraph="今日 alt-data 核心观察: ...",
        evidence_links=[],
    )


def _make_yesterday_briefing() -> MacroBriefing:
    """Yesterday briefing with weaker signals so the today diff is meaningful."""

    return MacroBriefing(
        generated_at="2026-05-16T08:00:00+00:00",
        time_window_days=7,
        policy_section=[
            "政策雷达 新能源汽车 avg_impact=-0.20 (偏空, mentions=50)。",
            "政策雷达 AI算力 avg_impact=+0.40 (偏多, mentions=15)。",
            # 锂电 absent yesterday → new_today
            "政策雷达 光伏 avg_impact=-0.18 (偏空, mentions=2)。",
            "政策执行: 1 个部门标记 chaotic、累计 1 次反转。",
        ],
        capital_flow_section=[
            "北向资金净流入 AI算力(+2.0亿), 电网(+2.5亿)；"
            "北向资金净流出 新能源汽车(-1.2亿)。",
        ],
        commodity_section=[
            "SHFE 库存: 铜 去化；铝 去化。",
            "LME 库存: 铜/铝 持稳。",
        ],
        governance_section=[
            "高警惕公司: BABA(脆弱度0.30, high), PDD(脆弱度0.27, medium)。",
        ],
        composite_section=[],  # No composite yesterday → new_today
        summary_paragraph="今日 alt-data 核心观察: ...",
        evidence_links=[],
    )


def _empty_briefing() -> MacroBriefing:
    return MacroBriefing(
        generated_at="2026-05-17T08:00:00+00:00",
        time_window_days=7,
    )


# ---------------------------------------------------------------------------
# Module-level tests
# ---------------------------------------------------------------------------


def test_returns_cold_start_when_yesterday_missing():
    """No yesterday briefing → empty delta lists + cold-start note."""

    today = _make_today_briefing()
    delta = compute_macro_briefing_delta(
        today_briefing=today, yesterday_briefing=None
    )
    assert isinstance(delta, MacroBriefingDelta)
    assert delta.has_baseline is False
    assert delta.summary_delta == EMPTY_DELTA_NOTE
    assert delta.policy_deltas == []
    assert delta.capital_flow_deltas == []
    assert delta.commodity_deltas == []
    assert delta.governance_deltas == []
    assert delta.composite_deltas == []
    # today_generated_at echoed for traceability even without baseline.
    assert delta.today_generated_at == today.generated_at
    assert delta.yesterday_generated_at == ""


def test_intensification_detected_on_policy_section():
    """新能源汽车 -0.20 → -0.39 should classify as intensified_bearish."""

    delta = compute_macro_briefing_delta(
        today_briefing=_make_today_briefing(),
        yesterday_briefing=_make_yesterday_briefing(),
    )
    assert delta.has_baseline is True
    keys = {d.key for d in delta.policy_deltas}
    assert "新能源汽车" in keys
    by_key = {d.key: d for d in delta.policy_deltas}
    nev = by_key["新能源汽车"]
    assert nev.direction == "intensified_bearish"
    assert nev.today == pytest.approx(-0.39)
    assert nev.yesterday == pytest.approx(-0.20)
    assert nev.delta is not None and nev.delta < 0
    assert "-0.20" in nev.headline and "-0.39" in nev.headline


def test_reversal_detected_on_policy_section():
    """光伏 -0.18 → +0.18 should classify as reversed_to_bullish."""

    delta = compute_macro_briefing_delta(
        today_briefing=_make_today_briefing(),
        yesterday_briefing=_make_yesterday_briefing(),
    )
    by_key = {d.key: d for d in delta.policy_deltas}
    assert "光伏" in by_key
    pv = by_key["光伏"]
    assert pv.direction == "reversed_to_bullish"
    assert pv.today == pytest.approx(+0.18)
    assert pv.yesterday == pytest.approx(-0.18)


def test_new_and_dropped_today_surfaced_on_policy_section():
    """锂电 new_today; 光伏 reversal already covered → ensure new_today fires."""

    delta = compute_macro_briefing_delta(
        today_briefing=_make_today_briefing(),
        yesterday_briefing=_make_yesterday_briefing(),
    )
    by_key = {d.key: d for d in delta.policy_deltas}
    assert "锂电" in by_key
    assert by_key["锂电"].direction == "new_today"
    assert by_key["锂电"].today == pytest.approx(+0.30)
    assert by_key["锂电"].yesterday is None
    assert "新增今日" in by_key["锂电"].headline


def test_threshold_filtering_drops_small_deltas():
    """A row whose absolute delta is below POLICY_DELTA_THRESHOLD must be dropped."""

    today = MacroBriefing(
        generated_at="2026-05-17T08:00:00+00:00",
        time_window_days=7,
        policy_section=[
            # Δ = 0.01 — under POLICY_DELTA_THRESHOLD (0.05). Must be dropped.
            "政策雷达 食品饮料 avg_impact=+0.31 (偏多, mentions=4)。",
        ],
    )
    yesterday = MacroBriefing(
        generated_at="2026-05-16T08:00:00+00:00",
        time_window_days=7,
        policy_section=[
            "政策雷达 食品饮料 avg_impact=+0.30 (偏多, mentions=4)。",
        ],
    )
    delta = compute_macro_briefing_delta(
        today_briefing=today, yesterday_briefing=yesterday
    )
    assert all(d.key != "食品饮料" for d in delta.policy_deltas)
    # And the threshold itself is 0.05 (sanity-check the constant tuning).
    assert POLICY_DELTA_THRESHOLD == 0.05


def test_governance_delta_intensifies_when_fragility_rises():
    """BABA 0.30 → 0.42 should fire as a governance delta with 恶化 phrasing."""

    delta = compute_macro_briefing_delta(
        today_briefing=_make_today_briefing(),
        yesterday_briefing=_make_yesterday_briefing(),
    )
    by_key = {d.key: d for d in delta.governance_deltas}
    assert "BABA" in by_key
    assert by_key["BABA"].today == pytest.approx(0.42)
    assert by_key["BABA"].yesterday == pytest.approx(0.30)
    assert "恶化" in by_key["BABA"].headline


def test_commodity_delta_categorical_reversal():
    """SHFE:铜 去化 → 累积 fires as a categorical reversal."""

    delta = compute_macro_briefing_delta(
        today_briefing=_make_today_briefing(),
        yesterday_briefing=_make_yesterday_briefing(),
    )
    by_key = {d.key: d for d in delta.commodity_deltas}
    assert "SHFE:铜" in by_key
    assert by_key["SHFE:铜"].direction in {
        "reversed_to_bearish",
        "reversed_to_bullish",
    }
    assert "去化" in by_key["SHFE:铜"].headline and "累积" in by_key["SHFE:铜"].headline


def test_composite_delta_new_today():
    """新能源汽车 composite NEW today fires as new_today."""

    delta = compute_macro_briefing_delta(
        today_briefing=_make_today_briefing(),
        yesterday_briefing=_make_yesterday_briefing(),
    )
    by_key = {d.key: d for d in delta.composite_deltas}
    assert "新能源汽车" in by_key
    assert by_key["新能源汽车"].direction == "new_today"
    assert "新触发" in by_key["新能源汽车"].headline


def test_summary_delta_starts_with_today_vs_yesterday_label():
    """Summary paragraph follows the documented '今日 vs 昨日 核心变化:' framing."""

    delta = compute_macro_briefing_delta(
        today_briefing=_make_today_briefing(),
        yesterday_briefing=_make_yesterday_briefing(),
    )
    assert delta.summary_delta.startswith("今日 vs 昨日 核心变化")


def test_compose_is_deterministic_same_inputs_same_output():
    """Two invocations on the same briefings produce identical content fields."""

    first = compute_macro_briefing_delta(
        today_briefing=_make_today_briefing(),
        yesterday_briefing=_make_yesterday_briefing(),
    )
    second = compute_macro_briefing_delta(
        today_briefing=_make_today_briefing(),
        yesterday_briefing=_make_yesterday_briefing(),
    )
    # generated_at is wall-clock — exclude from equality.
    assert [d.to_dict() for d in first.policy_deltas] == [
        d.to_dict() for d in second.policy_deltas
    ]
    assert [d.to_dict() for d in first.capital_flow_deltas] == [
        d.to_dict() for d in second.capital_flow_deltas
    ]
    assert [d.to_dict() for d in first.commodity_deltas] == [
        d.to_dict() for d in second.commodity_deltas
    ]
    assert [d.to_dict() for d in first.governance_deltas] == [
        d.to_dict() for d in second.governance_deltas
    ]
    assert [d.to_dict() for d in first.composite_deltas] == [
        d.to_dict() for d in second.composite_deltas
    ]
    assert first.summary_delta == second.summary_delta
    assert first.has_baseline == second.has_baseline


def test_both_empty_briefings_yields_no_change_note():
    """Two empty briefings → has_baseline=True but every delta list is empty."""

    delta = compute_macro_briefing_delta(
        today_briefing=_empty_briefing(),
        yesterday_briefing=_empty_briefing(),
    )
    assert delta.has_baseline is True
    assert delta.policy_deltas == []
    assert delta.commodity_deltas == []
    # summary_delta should reflect "no change" rather than the
    # cold-start note (we have a baseline, just no movement).
    assert "无显著变化" in delta.summary_delta or "无可对比" in delta.summary_delta


def test_public_summary_distillation_keeps_only_safe_fields():
    """``macro_briefing_delta_to_public_summary`` keeps only publish-safe fields."""

    delta = compute_macro_briefing_delta(
        today_briefing=_make_today_briefing(),
        yesterday_briefing=_make_yesterday_briefing(),
    )
    payload = macro_briefing_delta_to_public_summary(delta)
    assert set(payload.keys()) == {
        "summary_delta",
        "top_deltas",
        "has_baseline",
        "today_generated_at",
        "yesterday_generated_at",
        "generated_at",
    }
    for entry in payload["top_deltas"]:
        # Only per-section "headline" / "direction" leak — no numeric
        # today / yesterday readings.
        assert set(entry.keys()) == {"section", "headline", "direction"}
    assert len(payload["top_deltas"]) <= 3
    assert payload["has_baseline"] is True


# ---------------------------------------------------------------------------
# Endpoint tests
# ---------------------------------------------------------------------------


class _StubManager:
    """Minimal stub mirroring the contract the composer + delta need."""

    def __init__(self):
        self.latest_signals = {}
        self.providers = {}


def test_endpoint_returns_delta_payload_with_cache_header(monkeypatch):
    """GET /alt-data/macro-briefing-delta → 200 with documented shape."""

    today = _make_today_briefing()
    yesterday = _make_yesterday_briefing()

    app = FastAPI()
    app.include_router(alt_data.router, prefix="/alt-data")
    monkeypatch.setattr(alt_data, "_get_manager", lambda: _StubManager())
    monkeypatch.setattr(alt_data, "_get_scheduler", lambda: None)
    monkeypatch.setattr(
        alt_data, "_compose_today_briefing", lambda manager: today
    )
    monkeypatch.setattr(
        alt_data,
        "_compose_yesterday_briefing",
        lambda manager, target_date: yesterday,
    )

    client = TestClient(app)
    response = client.get("/alt-data/macro-briefing-delta")
    assert response.status_code == 200
    assert response.headers.get("cache-control") == "max-age=300"

    body = response.json()
    assert body.get("has_baseline") is True
    assert isinstance(body.get("policy_deltas"), list)
    assert isinstance(body.get("capital_flow_deltas"), list)
    assert isinstance(body.get("commodity_deltas"), list)
    assert isinstance(body.get("governance_deltas"), list)
    assert isinstance(body.get("composite_deltas"), list)
    assert body.get("summary_delta", "").startswith("今日 vs 昨日 核心变化")
    assert body.get("audit_doc_url") == "docs/alt_data_audit.md"
    # 新能源汽车 intensified_bearish present.
    keys = {d["key"] for d in body["policy_deltas"]}
    assert "新能源汽车" in keys


def test_endpoint_cold_start_when_yesterday_missing(monkeypatch):
    """Missing yesterday baseline returns has_baseline=False + empty deltas."""

    today = _make_today_briefing()

    app = FastAPI()
    app.include_router(alt_data.router, prefix="/alt-data")
    monkeypatch.setattr(alt_data, "_get_manager", lambda: _StubManager())
    monkeypatch.setattr(alt_data, "_get_scheduler", lambda: None)
    monkeypatch.setattr(
        alt_data, "_compose_today_briefing", lambda manager: today
    )
    monkeypatch.setattr(
        alt_data,
        "_compose_yesterday_briefing",
        lambda manager, target_date: None,
    )

    client = TestClient(app)
    response = client.get("/alt-data/macro-briefing-delta")
    assert response.status_code == 200
    body = response.json()
    assert body.get("has_baseline") is False
    assert body.get("policy_deltas") == []
    assert body.get("summary_delta") == EMPTY_DELTA_NOTE


def test_endpoint_validates_date_param(monkeypatch):
    """``date`` query knob must be ISO-8601; bad input → 422."""

    app = FastAPI()
    app.include_router(alt_data.router, prefix="/alt-data")
    monkeypatch.setattr(alt_data, "_get_manager", lambda: _StubManager())
    monkeypatch.setattr(alt_data, "_get_scheduler", lambda: None)
    monkeypatch.setattr(
        alt_data, "_compose_today_briefing", lambda manager: _make_today_briefing()
    )
    monkeypatch.setattr(
        alt_data,
        "_compose_yesterday_briefing",
        lambda manager, target_date: _make_yesterday_briefing(),
    )
    client = TestClient(app)

    bad = client.get("/alt-data/macro-briefing-delta?date=not-a-date")
    assert bad.status_code == 422


# ---------------------------------------------------------------------------
# SectionDelta unit-level coverage
# ---------------------------------------------------------------------------


def test_section_delta_to_dict_is_serialisable():
    """SectionDelta.to_dict() must yield JSON-safe primitives only."""

    d = SectionDelta(
        key="新能源汽车",
        today=-0.39,
        yesterday=-0.20,
        delta=-0.19,
        direction="intensified_bearish",
        headline="新能源汽车: -0.20 → -0.39 (恶化 95%)",
    )
    payload = d.to_dict()
    assert set(payload.keys()) == {
        "key",
        "today",
        "yesterday",
        "delta",
        "direction",
        "headline",
    }
    # All values either str, float, or None — round-trip-safe.
    for value in payload.values():
        assert value is None or isinstance(value, (str, int, float))

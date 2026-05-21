"""Tests for the cross-archive theme detector (Phase F6).

Pins the synthesis contract of
:func:`src.data.alternative.cross_archive_themes.detect_themes` and
the ``GET /alt-data/cross-archive-themes`` endpoint:

- Same industry on all 3 archives over ≥3 days each → HIGH conviction.
- Same industry on exactly 2 archives over ≥3 days each → MEDIUM.
- Single-archive ≥5 days of persistence → LOW.
- Industry on 2 archives for only 2 days each → filtered out.
- Empty archives → empty themes list (degrades quietly).
- ``days_window`` filter excludes archived rows older than the window.
- Endpoint shape + ``min_conviction`` filter respect the high > medium
  > low rank.
- ``themes_to_public_summary`` builds the documented top-3 buckets.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable, List, Optional, Tuple

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import alt_data
from src.data.alternative.composite_signal import (
    CompositeSignal,
    SupportingComponent,
)
from src.data.alternative.composite_signal_archive import (
    CompositeSignalArchive,
)
from src.data.alternative.cross_archive_themes import (
    CrossArchiveTheme,
    DEFAULT_DAYS_WINDOW,
    MAX_DAYS_WINDOW,
    detect_themes,
    themes_to_public_summary,
)
from src.data.alternative.macro_briefing import (
    MacroBriefing,
    MacroBriefingArchive,
)
from src.data.alternative.narrative import (
    AltDataNarrative,
    NarrativeArchive,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _backdate_archive_entry(
    archive_path: Path, *, archived_at: datetime, payload: dict
) -> None:
    """Inject a single row into a JSONL archive with a controlled timestamp.

    The on-disk archives accept ``archived_at`` from the payload during
    read; tests use this to stamp rows with arbitrary UTC dates without
    waiting for the wall clock.
    """

    import json

    row = dict(payload)
    row["archived_at"] = archived_at.replace(microsecond=0).isoformat()
    with archive_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def _seed_narrative(
    narrative_path: Path,
    *,
    industry: str,
    days: Iterable[int],
    reference: datetime,
) -> None:
    """Inject narrative archive rows mentioning ``industry`` on the given days."""

    for offset in days:
        ts = reference - timedelta(days=offset)
        _backdate_archive_entry(
            narrative_path,
            archived_at=ts,
            payload={
                "industry": industry,
                "summary": f"政策雷达本周捕获 {industry} 相关政策记录 ...",
                "bullets": [
                    f"政策雷达 {industry} avg_impact=-0.35 (偏空, mentions=12)。"
                ],
                "evidence_links": [],
                "original_generated_at": ts.isoformat(),
            },
        )


def _seed_composite(
    composite_path: Path,
    *,
    industry: str,
    days: Iterable[int],
    reference: datetime,
    direction: str = "bullish",
    conviction: str = "high",
) -> None:
    """Inject composite-signal archive rows on the given days."""

    for offset in days:
        ts = reference - timedelta(days=offset)
        _backdate_archive_entry(
            composite_path,
            archived_at=ts,
            payload={
                "direction": direction,
                "target_kind": "industry",
                "target": industry,
                "conviction": conviction,
                "supporting_components": [
                    {
                        "component": "policy_radar",
                        "direction": direction,
                        "signal_strength": 0.45,
                        "is_strong": True,
                        "detail": "avg_impact=+0.450; mentions=12",
                    }
                ],
                "aggregate_strength": 0.42,
                "original_emit_at": ts.isoformat(),
                "supporting_components_count": 1,
            },
        )


def _seed_macro_briefing(
    briefing_path: Path,
    *,
    industry: str,
    days: Iterable[int],
    reference: datetime,
) -> None:
    """Inject macro briefing archive rows mentioning ``industry`` on the given days."""

    for offset in days:
        ts = reference - timedelta(days=offset)
        _backdate_archive_entry(
            briefing_path,
            archived_at=ts,
            payload={
                "time_window_days": 7,
                "policy_section": [
                    f"政策雷达 {industry} avg_impact=-0.35 (偏空, mentions=12)。"
                ],
                "capital_flow_section": [
                    f"北向资金净流入 {industry}(+8.0亿)。"
                ],
                "commodity_section": [],
                "governance_section": [],
                "composite_section": [
                    f"{industry} 看多 (HIGH, 5 组件)。"
                ],
                "summary_paragraph": (
                    f"今日 alt-data 核心观察: 综合面: {industry} 看多。"
                ),
                "evidence_links": [],
                "evidence_links_count": 0,
                "original_generated_at": ts.isoformat(),
            },
        )


def _build_archives(
    tmp_path: Path,
) -> Tuple[NarrativeArchive, CompositeSignalArchive, MacroBriefingArchive]:
    """Build all three archive instances pointing at fresh tmp_path files."""

    narrative = NarrativeArchive(tmp_path / "narrative_history.jsonl")
    composite = CompositeSignalArchive(
        tmp_path / "composite_signal_history.jsonl"
    )
    macro = MacroBriefingArchive(
        tmp_path / "macro_briefing_history.jsonl"
    )
    return narrative, composite, macro


def _utc_today(hour: int = 12) -> datetime:
    return datetime.now(tz=timezone.utc).replace(
        hour=hour, minute=0, second=0, microsecond=0
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_high_conviction_when_all_three_archives_have_industry_for_seven_days(
    tmp_path,
):
    """HIGH conviction: all 3 archives mention same industry ≥3 days each."""

    reference = _utc_today()
    narrative, composite, macro = _build_archives(tmp_path)

    _seed_narrative(
        narrative.storage_path,
        industry="AI算力",
        days=range(0, 7),
        reference=reference,
    )
    _seed_composite(
        composite.storage_path,
        industry="AI算力",
        days=range(0, 7),
        reference=reference,
    )
    _seed_macro_briefing(
        macro.storage_path,
        industry="AI算力",
        days=range(0, 7),
        reference=reference,
    )

    themes = detect_themes(
        days_window=14,
        narrative_archive=narrative,
        composite_archive=composite,
        macro_briefing_archive=macro,
        now=reference,
    )

    assert len(themes) == 1
    theme = themes[0]
    assert isinstance(theme, CrossArchiveTheme)
    assert theme.industry == "AI算力"
    assert theme.conviction == "high"
    assert theme.days_in_narrative == 7
    assert theme.days_in_composite == 7
    assert theme.days_in_macro_briefing == 7
    assert theme.trend_direction == "bullish"
    assert set(theme.supporting_archives) == {
        "narrative",
        "composite",
        "macro_briefing",
    }
    # conviction_score must put HIGH well above 0.5 (rank=3 → 0.7 base
    # alone is already 0.7); cumulative-day bonus pushes it above 0.8.
    assert theme.conviction_score >= 0.7


def test_medium_conviction_when_only_two_archives_have_industry(tmp_path):
    """MEDIUM conviction: 2 archives ≥3 days each; third archive empty."""

    reference = _utc_today()
    narrative, composite, macro = _build_archives(tmp_path)

    _seed_narrative(
        narrative.storage_path,
        industry="新能源汽车",
        days=range(0, 5),
        reference=reference,
    )
    _seed_composite(
        composite.storage_path,
        industry="新能源汽车",
        days=range(0, 4),
        reference=reference,
        direction="bearish",
    )
    # No macro briefing rows for 新能源汽车.

    themes = detect_themes(
        days_window=14,
        narrative_archive=narrative,
        composite_archive=composite,
        macro_briefing_archive=macro,
        now=reference,
    )

    targets = {t.industry: t for t in themes}
    assert "新能源汽车" in targets
    theme = targets["新能源汽车"]
    assert theme.conviction == "medium"
    assert theme.days_in_macro_briefing == 0
    assert theme.days_in_narrative == 5
    assert theme.days_in_composite == 4
    assert theme.trend_direction == "bearish"
    assert set(theme.supporting_archives) == {"narrative", "composite"}


def test_low_conviction_when_only_one_archive_persists(tmp_path):
    """LOW conviction: 1 archive ≥5 days; other 2 empty for this industry."""

    reference = _utc_today()
    narrative, composite, macro = _build_archives(tmp_path)

    # Composite alone sees 储能 on 6 distinct days; no narrative, no macro.
    _seed_composite(
        composite.storage_path,
        industry="储能",
        days=range(0, 6),
        reference=reference,
    )

    themes = detect_themes(
        days_window=14,
        narrative_archive=narrative,
        composite_archive=composite,
        macro_briefing_archive=macro,
        now=reference,
    )

    targets = {t.industry: t for t in themes}
    assert "储能" in targets
    theme = targets["储能"]
    assert theme.conviction == "low"
    assert theme.days_in_composite == 6
    assert theme.days_in_narrative == 0
    assert theme.days_in_macro_briefing == 0
    assert theme.supporting_archives == ("composite",)


def test_industry_in_only_two_days_each_is_filtered_out(tmp_path):
    """An industry that appears in 2 archives but only 2 days each → no theme."""

    reference = _utc_today()
    narrative, composite, macro = _build_archives(tmp_path)

    _seed_narrative(
        narrative.storage_path,
        industry="光伏",
        days=range(0, 2),
        reference=reference,
    )
    _seed_composite(
        composite.storage_path,
        industry="光伏",
        days=range(0, 2),
        reference=reference,
    )

    themes = detect_themes(
        days_window=14,
        narrative_archive=narrative,
        composite_archive=composite,
        macro_briefing_archive=macro,
        now=reference,
    )

    # 光伏 has 2 archives but <3 days each → no MEDIUM, no HIGH; only
    # ≥5-day single-archive persistence clears the LOW tier; cumulative
    # max is 2 here so 光伏 is filtered out.
    assert all(t.industry != "光伏" for t in themes)


def test_empty_archives_yield_empty_theme_list(tmp_path):
    """Three empty archives → empty list (degrades quietly)."""

    narrative, composite, macro = _build_archives(tmp_path)
    themes = detect_themes(
        days_window=14,
        narrative_archive=narrative,
        composite_archive=composite,
        macro_briefing_archive=macro,
    )
    assert themes == []


def test_days_window_filter_excludes_old_rows(tmp_path):
    """``days_window`` clamps which archived rows feed into the detector."""

    reference = _utc_today()
    narrative, composite, macro = _build_archives(tmp_path)

    # 5 recent days + 5 days that are 30 days old. With a 14-day window,
    # only the recent batch should land in the count.
    _seed_narrative(
        narrative.storage_path,
        industry="电网",
        days=range(0, 5),
        reference=reference,
    )
    _seed_composite(
        composite.storage_path,
        industry="电网",
        days=range(0, 5),
        reference=reference,
    )
    _seed_macro_briefing(
        macro.storage_path,
        industry="电网",
        days=range(0, 5),
        reference=reference,
    )
    _seed_macro_briefing(
        macro.storage_path,
        industry="电网",
        days=range(30, 35),
        reference=reference,
    )

    themes_short = detect_themes(
        days_window=14,
        narrative_archive=narrative,
        composite_archive=composite,
        macro_briefing_archive=macro,
        now=reference,
    )
    theme = next(t for t in themes_short if t.industry == "电网")
    assert theme.days_in_macro_briefing == 5  # only recent half

    # Widen the window to 60 days: every backdated row also lands.
    fresh_narrative = NarrativeArchive(narrative.storage_path)
    fresh_composite = CompositeSignalArchive(composite.storage_path)
    fresh_macro = MacroBriefingArchive(macro.storage_path)
    themes_long = detect_themes(
        days_window=60,
        narrative_archive=fresh_narrative,
        composite_archive=fresh_composite,
        macro_briefing_archive=fresh_macro,
        now=reference,
    )
    theme_long = next(t for t in themes_long if t.industry == "电网")
    assert theme_long.days_in_macro_briefing == 10


def test_themes_to_public_summary_groups_top_three_per_tier(tmp_path):
    """``themes_to_public_summary`` returns top-3 HIGH + top-3 MEDIUM rows."""

    reference = _utc_today()
    narrative, composite, macro = _build_archives(tmp_path)

    # Seed 4 industries with HIGH conviction (all 3 archives ≥ 3 days) and
    # 2 industries with MEDIUM conviction (2 archives ≥ 3 days each).
    high_industries = ["AI算力", "电网", "新能源汽车", "光伏"]
    medium_industries = ["风电", "储能"]
    for industry in high_industries:
        _seed_narrative(
            narrative.storage_path,
            industry=industry,
            days=range(0, 4),
            reference=reference,
        )
        _seed_composite(
            composite.storage_path,
            industry=industry,
            days=range(0, 4),
            reference=reference,
        )
        _seed_macro_briefing(
            macro.storage_path,
            industry=industry,
            days=range(0, 4),
            reference=reference,
        )
    for industry in medium_industries:
        _seed_narrative(
            narrative.storage_path,
            industry=industry,
            days=range(0, 3),
            reference=reference,
        )
        _seed_composite(
            composite.storage_path,
            industry=industry,
            days=range(0, 3),
            reference=reference,
        )

    themes = detect_themes(
        days_window=14,
        narrative_archive=narrative,
        composite_archive=composite,
        macro_briefing_archive=macro,
        now=reference,
    )
    summary = themes_to_public_summary(themes)

    # Should expose exactly the top-3 HIGH and top-3 MEDIUM (we only
    # seeded 2 MEDIUM industries, so MEDIUM list has 2 entries).
    assert len(summary["top_3_high_conviction"]) == 3
    assert len(summary["top_3_medium_conviction"]) == 2
    assert summary["total_high_conviction"] == 4
    assert summary["total_medium_conviction"] == 2
    assert summary["total_low_conviction"] == 0
    # Top-3 HIGH rows must carry the documented fields.
    first = summary["top_3_high_conviction"][0]
    assert set(first.keys()) >= {
        "industry",
        "conviction",
        "days_visible",
        "supporting_archives",
        "trend_direction",
    }
    assert first["days_visible"] == 4 + 4 + 4
    assert set(first["supporting_archives"]) == {
        "narrative",
        "composite",
        "macro_briefing",
    }


def test_endpoint_shape_and_min_conviction_filter(tmp_path, monkeypatch):
    """``GET /alt-data/cross-archive-themes`` shape + min_conviction filter."""

    reference = _utc_today()
    narrative, composite, macro = _build_archives(tmp_path)

    # HIGH: AI算力 on all 3 archives for 5 days each.
    _seed_narrative(
        narrative.storage_path,
        industry="AI算力",
        days=range(0, 5),
        reference=reference,
    )
    _seed_composite(
        composite.storage_path,
        industry="AI算力",
        days=range(0, 5),
        reference=reference,
    )
    _seed_macro_briefing(
        macro.storage_path,
        industry="AI算力",
        days=range(0, 5),
        reference=reference,
    )
    # MEDIUM: 电网 on 2 archives for 3 days each.
    _seed_narrative(
        narrative.storage_path,
        industry="电网",
        days=range(0, 3),
        reference=reference,
    )
    _seed_composite(
        composite.storage_path,
        industry="电网",
        days=range(0, 3),
        reference=reference,
    )
    # LOW: 储能 on 1 archive (composite) for 5 days.
    _seed_composite(
        composite.storage_path,
        industry="储能",
        days=range(0, 5),
        reference=reference,
    )

    # Monkey-patch the cross-archive detector to read these test
    # archives instead of the module-level singletons. The endpoint
    # itself calls ``detect_cross_archive_themes(days_window=...)`` so
    # we wrap the helper.
    def _detect(*, days_window):
        return detect_themes(
            days_window=days_window,
            narrative_archive=narrative,
            composite_archive=composite,
            macro_briefing_archive=macro,
            now=reference,
        )

    monkeypatch.setattr(alt_data, "detect_cross_archive_themes", _detect)

    app = FastAPI()
    app.include_router(alt_data.router, prefix="/alt-data")
    client = TestClient(app)

    # Default invocation: 14-day window, min_conviction=medium.
    resp = client.get("/alt-data/cross-archive-themes")
    assert resp.status_code == 200
    payload = resp.json()
    assert set(payload.keys()) >= {
        "themes",
        "total",
        "days_window",
        "min_conviction",
        "tier_summary",
        "public_summary",
        "audit_doc_url",
    }
    assert payload["days_window"] == DEFAULT_DAYS_WINDOW
    assert payload["min_conviction"] == "medium"
    # medium filter: HIGH + MEDIUM industries kept; LOW filtered out.
    industries = {t["industry"] for t in payload["themes"]}
    assert "AI算力" in industries
    assert "电网" in industries
    assert "储能" not in industries
    assert payload["tier_summary"]["high"] == 1
    assert payload["tier_summary"]["medium"] == 1
    assert payload["tier_summary"]["low"] == 1
    # Public summary is built from every theme regardless of the filter.
    assert payload["public_summary"]["total_high_conviction"] == 1
    assert payload["public_summary"]["total_medium_conviction"] == 1
    assert payload["public_summary"]["total_low_conviction"] == 1

    # min_conviction=high: only AI算力 survives.
    resp_high = client.get(
        "/alt-data/cross-archive-themes", params={"min_conviction": "high"}
    )
    assert resp_high.status_code == 200
    high_payload = resp_high.json()
    assert [t["industry"] for t in high_payload["themes"]] == ["AI算力"]

    # min_conviction=low: HIGH + MEDIUM + LOW all surface.
    resp_low = client.get(
        "/alt-data/cross-archive-themes", params={"min_conviction": "low"}
    )
    assert resp_low.status_code == 200
    low_industries = {
        t["industry"] for t in resp_low.json()["themes"]
    }
    assert low_industries == {"AI算力", "电网", "储能"}

    # days_window upper-bound clamp via FastAPI's validator.
    resp_oversized = client.get(
        "/alt-data/cross-archive-themes",
        params={"days_window": MAX_DAYS_WINDOW + 5},
    )
    assert resp_oversized.status_code == 422

    # Invalid min_conviction is rejected by the regex pattern.
    resp_invalid = client.get(
        "/alt-data/cross-archive-themes", params={"min_conviction": "bogus"}
    )
    assert resp_invalid.status_code == 422

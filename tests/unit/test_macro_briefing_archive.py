"""Tests for the macro briefing time-series archive (Phase F5.2).

Pins the persistence + read contract of
:class:`MacroBriefingArchive` and the
``GET /alt-data/macro-briefing/history`` endpoint, plus the end-to-end
F5.1 delta integration:

- ``append`` -> ``recent`` roundtrip preserves every section + summary
  + evidence_links_count + original_generated_at.
- ``days`` filter clamps to the documented ``[1, 90]`` window.
- ``time_window_days`` filter is exact-match.
- Rotation moves the live file to ``*.timestamp.archive`` once it
  crosses :data:`ARCHIVE_ROTATE_SIZE_BYTES`.
- Malformed JSON lines on disk are skipped + logged.
- Empty briefings (every section empty) are NOT persisted.
- Endpoint shape + days clamp.
- F5.1 delta integration: ``_compose_yesterday_briefing`` resolves a
  baseline from the archive when a row exists for yesterday's UTC date,
  and the delta endpoint returns ``has_baseline=True``.
- Empty archive → ``has_baseline=False`` (cold-start path holds).
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import alt_data
from src.data.alternative.macro_briefing import (
    ARCHIVE_DEFAULT_DAYS_WINDOW,
    ARCHIVE_MAX_DAYS_WINDOW,
    ArchivedMacroBriefing,
    MacroBriefing,
    MacroBriefingArchive,
    reset_macro_briefing_archive_for_tests,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_briefing(
    *,
    generated_at: str = "2026-05-17T08:00:00+00:00",
    time_window_days: int = 7,
    policy: list = None,
    capital: list = None,
    commodity: list = None,
    governance: list = None,
    composite: list = None,
    summary: str = "今日 alt-data 核心观察: 政策面: 新能源汽车 avg_impact=-0.39 (偏空)。",
    evidence_links: list = None,
) -> MacroBriefing:
    return MacroBriefing(
        generated_at=generated_at,
        time_window_days=time_window_days,
        policy_section=policy
        if policy is not None
        else [
            "政策雷达 新能源汽车 avg_impact=-0.39 (偏空, mentions=94)。",
            "政策执行: 2 个部门标记 chaotic、累计 4 次反转。",
        ],
        capital_flow_section=capital if capital is not None else [],
        commodity_section=commodity
        if commodity is not None
        else ["LME 库存: 铜/铝 持稳。"],
        governance_section=governance
        if governance is not None
        else ["高警惕公司: BABA(脆弱度0.33, high)。"],
        composite_section=composite if composite is not None else [],
        summary_paragraph=summary,
        evidence_links=evidence_links
        if evidence_links is not None
        else [
            {
                "section": "policy",
                "component": "policy_radar",
                "snapshot_path": "cache/alt_data/providers/policy_radar.json",
                "stale": False,
                "last_refresh_at": "2026-05-17T07:30:00+00:00",
            },
        ],
    )


def _build_archive(tmp_path: Path, **kwargs) -> MacroBriefingArchive:
    return MacroBriefingArchive(
        tmp_path / "macro_briefing_history.jsonl", **kwargs
    )


class _StubManager:
    """Minimal stub mirroring the contract the composer + delta need."""

    def __init__(self):
        self.latest_signals = {}
        self.providers = {}


# ---------------------------------------------------------------------------
# Tests — archive layer
# ---------------------------------------------------------------------------


def test_append_then_recent_roundtrip(tmp_path):
    """append() -> recent() round-trips every field on the briefing."""

    archive = _build_archive(tmp_path)
    briefing = _make_briefing()

    entry = archive.append(briefing)
    assert isinstance(entry, ArchivedMacroBriefing)
    assert entry.time_window_days == 7
    assert entry.policy_section == briefing.policy_section
    assert entry.commodity_section == briefing.commodity_section
    assert entry.governance_section == briefing.governance_section
    assert entry.summary_paragraph == briefing.summary_paragraph
    assert entry.original_generated_at == briefing.generated_at
    assert entry.evidence_links_count == len(briefing.evidence_links)

    fetched = archive.recent(days=14)
    assert len(fetched) == 1
    row = fetched[0]
    assert row.time_window_days == 7
    assert row.policy_section == briefing.policy_section
    assert row.governance_section == briefing.governance_section
    assert row.summary_paragraph == briefing.summary_paragraph
    assert row.evidence_links_count == 1
    # to_dict() shape is JSON-safe + denormalised count is recomputed.
    payload = row.to_dict()
    assert payload["evidence_links_count"] == 1
    assert payload["original_generated_at"] == briefing.generated_at


def test_recent_days_window_filters_old_entries(tmp_path):
    """recent(days=N) excludes archived rows older than N days."""

    archive = _build_archive(tmp_path)
    archive.append(_make_briefing())

    backdated_at = (
        (datetime.now(tz=timezone.utc) - timedelta(days=60))
        .replace(microsecond=0)
        .isoformat()
    )
    with archive.storage_path.open("a", encoding="utf-8") as handle:
        handle.write(
            json.dumps(
                {
                    "archived_at": backdated_at,
                    "time_window_days": 14,
                    "policy_section": ["历史政策回看。"],
                    "capital_flow_section": [],
                    "commodity_section": [],
                    "governance_section": [],
                    "composite_section": [],
                    "summary_paragraph": "history",
                    "evidence_links": [],
                    "evidence_links_count": 0,
                    "original_generated_at": backdated_at,
                },
                ensure_ascii=False,
            )
            + "\n"
        )

    fetched = archive.recent(days=14)
    assert len(fetched) == 1
    assert fetched[0].time_window_days == 7

    # Fresh archive instance whose memory_cap is forced small drives
    # the disk-fallback branch and surfaces the older row when the
    # window is widened.
    fresh_archive = _build_archive(tmp_path, memory_cap=2)
    fetched_long = fresh_archive.recent(days=90)
    assert len(fetched_long) == 2
    assert {entry.time_window_days for entry in fetched_long} == {7, 14}


def test_recent_time_window_filter(tmp_path):
    """time_window_days filter is exact-match against stored field."""

    archive = _build_archive(tmp_path)
    archive.append(_make_briefing(time_window_days=7))
    archive.append(_make_briefing(time_window_days=14))
    archive.append(_make_briefing(time_window_days=14))

    weekly = archive.recent(days=14, time_window_days=7)
    assert [e.time_window_days for e in weekly] == [7]

    biweekly = archive.recent(days=14, time_window_days=14)
    assert all(e.time_window_days == 14 for e in biweekly)
    assert len(biweekly) == 2

    # None disables the filter -- every row matches.
    assert len(archive.recent(days=14)) == 3


def test_rotation_when_file_exceeds_threshold(tmp_path):
    """append() rotates the JSONL once it crosses the threshold."""

    archive = _build_archive(tmp_path, rotate_size_bytes=512)
    # Each row is ~1-2 KB after JSON encoding (rich UTF-8 Chinese content).
    for _ in range(3):
        archive.append(_make_briefing())

    archive.append(_make_briefing(summary="POST-ROTATION-MARKER 新一日报"))
    rolled = list(tmp_path.glob("macro_briefing_history.jsonl.*.archive"))
    assert rolled, "expected at least one rolled archive file"

    with archive.storage_path.open("r", encoding="utf-8") as handle:
        lines = [line for line in handle if line.strip()]
    assert len(lines) == 1
    assert "POST-ROTATION-MARKER" in lines[0]


def test_recent_skips_malformed_lines(tmp_path, caplog):
    """A corrupt JSON line is logged + skipped, not raised."""

    archive_path = tmp_path / "macro_briefing_history.jsonl"
    valid_row = json.dumps(
        {
            "archived_at": datetime.now(tz=timezone.utc).isoformat(),
            "time_window_days": 7,
            "policy_section": ["合法行。"],
            "capital_flow_section": [],
            "commodity_section": [],
            "governance_section": [],
            "composite_section": [],
            "summary_paragraph": "valid summary",
            "evidence_links": [],
            "evidence_links_count": 0,
            "original_generated_at": "2026-05-17T08:00:00+00:00",
        },
        ensure_ascii=False,
    )
    archive_path.write_text(
        f"{valid_row}\n{{ not valid json }}\n{valid_row}\n",
        encoding="utf-8",
    )

    archive = MacroBriefingArchive(archive_path)
    with caplog.at_level(logging.WARNING):
        fetched = archive.recent(days=14)
    assert len(fetched) == 2
    assert all(entry.time_window_days == 7 for entry in fetched)
    assert any("malformed" in rec.message.lower() for rec in caplog.records)


def test_empty_briefing_is_not_persisted(tmp_path):
    """A briefing whose sections are all empty is not written to disk."""

    archive = _build_archive(tmp_path)
    empty = _make_briefing(
        policy=[],
        capital=[],
        commodity=[],
        governance=[],
        composite=[],
        summary="alt-data 暂无可发布的宏观日报",
        evidence_links=[],
    )
    entry = archive.append(empty)
    # The returned entry still carries metadata so the caller can mirror
    # it onto a response, but disk + memory remain untouched.
    assert isinstance(entry, ArchivedMacroBriefing)
    assert not archive.storage_path.exists() or archive.storage_path.stat().st_size == 0
    assert archive.recent(days=14) == []


def test_find_for_date_returns_yesterday_briefing(tmp_path):
    """find_for_date() matches the most-recent row on the target UTC day."""

    archive = _build_archive(tmp_path)
    today = datetime.now(tz=timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    yesterday = today - timedelta(days=1)

    # Append two rows on yesterday's date: an early morning one and a
    # later evening one. find_for_date should return the newer entry.
    morning_briefing = _make_briefing(
        generated_at=(yesterday.replace(hour=2)).isoformat(),
        summary="MORNING ENTRY for yesterday",
    )
    evening_briefing = _make_briefing(
        generated_at=(yesterday.replace(hour=20)).isoformat(),
        summary="EVENING ENTRY for yesterday",
    )
    # Manually write rows with archived_at on yesterday so the
    # day-match anchors to the synthetic stamp not wall-clock.
    morning_payload = {
        "archived_at": yesterday.replace(hour=2).isoformat(),
        "time_window_days": 7,
        "policy_section": morning_briefing.policy_section,
        "capital_flow_section": [],
        "commodity_section": morning_briefing.commodity_section,
        "governance_section": morning_briefing.governance_section,
        "composite_section": [],
        "summary_paragraph": morning_briefing.summary_paragraph,
        "evidence_links": [dict(link) for link in morning_briefing.evidence_links],
        "evidence_links_count": len(morning_briefing.evidence_links),
        "original_generated_at": morning_briefing.generated_at,
    }
    evening_payload = dict(morning_payload)
    evening_payload["archived_at"] = yesterday.replace(hour=20).isoformat()
    evening_payload["summary_paragraph"] = evening_briefing.summary_paragraph
    evening_payload["original_generated_at"] = evening_briefing.generated_at

    with archive.storage_path.open("w", encoding="utf-8") as handle:
        handle.write(json.dumps(morning_payload, ensure_ascii=False) + "\n")
        handle.write(json.dumps(evening_payload, ensure_ascii=False) + "\n")

    # Fresh instance so the seed-from-disk path is exercised.
    fresh = _build_archive(tmp_path)
    found = fresh.find_for_date(target_date=yesterday)
    assert found is not None
    assert "EVENING ENTRY" in found.summary_paragraph

    # A different target date returns None.
    earlier = fresh.find_for_date(target_date=yesterday - timedelta(days=3))
    assert earlier is None


# ---------------------------------------------------------------------------
# Tests — F5.1 delta integration
# ---------------------------------------------------------------------------


def test_compose_yesterday_briefing_resolves_from_archive(tmp_path, monkeypatch):
    """``_compose_yesterday_briefing`` reads the most-recent yesterday row."""

    archive = _build_archive(tmp_path)
    today_anchor = datetime.now(tz=timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    yesterday_anchor = today_anchor - timedelta(days=1)

    payload = {
        "archived_at": yesterday_anchor.replace(hour=10).isoformat(),
        "time_window_days": 7,
        "policy_section": [
            "政策雷达 新能源汽车 avg_impact=-0.20 (偏空, mentions=50)。"
        ],
        "capital_flow_section": [],
        "commodity_section": ["SHFE 库存: 铜 去化；铝 去化。"],
        "governance_section": [
            "高警惕公司: BABA(脆弱度0.30, high)。",
        ],
        "composite_section": [],
        "summary_paragraph": "yesterday baseline",
        "evidence_links": [],
        "evidence_links_count": 0,
        "original_generated_at": yesterday_anchor.replace(hour=10).isoformat(),
    }
    with archive.storage_path.open("w", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")

    monkeypatch.setattr(
        alt_data, "_get_macro_briefing_archive", lambda: archive
    )

    # No explicit date -> defaults to today (UTC) -> looks up yesterday.
    yesterday_briefing = alt_data._compose_yesterday_briefing(
        manager=_StubManager(), target_date=None
    )
    assert yesterday_briefing is not None
    assert yesterday_briefing.summary_paragraph == "yesterday baseline"
    # The materialised briefing's generated_at echoes the composer stamp
    # carried in the archived row, not the archived_at wall-clock.
    assert yesterday_briefing.generated_at == yesterday_anchor.replace(
        hour=10
    ).isoformat()


def test_compose_yesterday_briefing_returns_none_when_archive_empty(
    tmp_path, monkeypatch
):
    """Empty archive surfaces as ``None`` (cold-start path)."""

    archive = _build_archive(tmp_path)
    monkeypatch.setattr(
        alt_data, "_get_macro_briefing_archive", lambda: archive
    )

    result = alt_data._compose_yesterday_briefing(
        manager=_StubManager(), target_date=None
    )
    assert result is None


def test_macro_briefing_delta_endpoint_has_baseline_true_with_archive(
    tmp_path, monkeypatch
):
    """F5.1 delta endpoint resolves baseline via F5.2 archive end-to-end."""

    archive = _build_archive(tmp_path)
    today_anchor = datetime.now(tz=timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    yesterday_anchor = today_anchor - timedelta(days=1)

    yesterday_payload = {
        "archived_at": yesterday_anchor.replace(hour=10).isoformat(),
        "time_window_days": 7,
        "policy_section": [
            "政策雷达 新能源汽车 avg_impact=-0.20 (偏空, mentions=50)。",
            "政策雷达 AI算力 avg_impact=+0.40 (偏多, mentions=15)。",
        ],
        "capital_flow_section": [],
        "commodity_section": ["SHFE 库存: 铜 去化；铝 去化。"],
        "governance_section": ["高警惕公司: BABA(脆弱度0.30, high)。"],
        "composite_section": [],
        "summary_paragraph": "yesterday baseline",
        "evidence_links": [],
        "evidence_links_count": 0,
        "original_generated_at": yesterday_anchor.replace(hour=10).isoformat(),
    }
    with archive.storage_path.open("w", encoding="utf-8") as handle:
        handle.write(json.dumps(yesterday_payload, ensure_ascii=False) + "\n")

    monkeypatch.setattr(
        alt_data, "_get_macro_briefing_archive", lambda: archive
    )

    # Today briefing: 新能源汽车 -0.39 (worse than yesterday's -0.20),
    # AI算力 +0.22 (softened from +0.40). Both will fire as deltas.
    today_briefing = MacroBriefing(
        generated_at=today_anchor.replace(hour=8).isoformat(),
        time_window_days=7,
        policy_section=[
            "政策雷达 新能源汽车 avg_impact=-0.39 (偏空, mentions=94)。",
            "政策雷达 AI算力 avg_impact=+0.22 (偏多, mentions=8)。",
        ],
        capital_flow_section=[],
        commodity_section=["SHFE 库存: 铜 累积；铝 去化。"],
        governance_section=["高警惕公司: BABA(脆弱度0.42, high)。"],
        composite_section=[],
        summary_paragraph="today snapshot",
        evidence_links=[],
    )
    monkeypatch.setattr(
        alt_data, "_compose_today_briefing", lambda manager: today_briefing
    )
    monkeypatch.setattr(alt_data, "_get_manager", lambda: _StubManager())
    monkeypatch.setattr(alt_data, "_get_scheduler", lambda: None)

    app = FastAPI()
    app.include_router(alt_data.router, prefix="/alt-data")
    client = TestClient(app)
    response = client.get("/alt-data/macro-briefing-delta")
    assert response.status_code == 200
    body = response.json()
    assert body["has_baseline"] is True
    # 新能源汽车 intensified bearish should be surfaced.
    policy_keys = {d["key"] for d in body["policy_deltas"]}
    assert "新能源汽车" in policy_keys
    # The summary opens with the documented framing.
    assert body["summary_delta"].startswith("今日 vs 昨日 核心变化")


# ---------------------------------------------------------------------------
# Tests — endpoint shape
# ---------------------------------------------------------------------------


def test_history_endpoint_shape_and_days_clamp(tmp_path, monkeypatch):
    """GET /alt-data/macro-briefing/history shape + days clamp."""

    archive = _build_archive(tmp_path)
    archive.append(_make_briefing())

    monkeypatch.setattr(
        alt_data, "_get_macro_briefing_archive", lambda: archive
    )

    app = FastAPI()
    app.include_router(alt_data.router, prefix="/alt-data")
    client = TestClient(app)

    response = client.get("/alt-data/macro-briefing/history")
    assert response.status_code == 200
    payload = response.json()
    assert set(payload.keys()) >= {
        "archives",
        "total",
        "days_window",
        "time_window_days_filter",
        "audit_doc_url",
    }
    assert payload["days_window"] == ARCHIVE_DEFAULT_DAYS_WINDOW
    assert payload["time_window_days_filter"] is None
    assert payload["total"] == 1
    assert payload["archives"][0]["time_window_days"] == 7
    assert payload["archives"][0]["evidence_links_count"] == 1

    # days clamp: anything above 90 is rejected by FastAPI's validator.
    oversized = client.get(
        "/alt-data/macro-briefing/history",
        params={"days": ARCHIVE_MAX_DAYS_WINDOW + 5},
    )
    assert oversized.status_code == 422

    # Lower-bound clamp.
    zero = client.get("/alt-data/macro-briefing/history", params={"days": 0})
    assert zero.status_code == 422

    # time_window_days filter is plumbed through to recent().
    filtered = client.get(
        "/alt-data/macro-briefing/history", params={"time_window_days": 7}
    )
    assert filtered.status_code == 200
    assert filtered.json()["time_window_days_filter"] == 7
    assert filtered.json()["total"] == 1

    # A filter that matches no row returns an empty archives list.
    no_match = client.get(
        "/alt-data/macro-briefing/history", params={"time_window_days": 14}
    )
    assert no_match.status_code == 200
    assert no_match.json()["total"] == 0


def test_history_endpoint_empty_archive_returns_empty_payload(monkeypatch):
    """An empty archive surfaces as total=0 (not an error)."""

    archive_returns_none = lambda: None  # noqa: E731 - inline lambda is clearer
    monkeypatch.setattr(
        alt_data, "_get_macro_briefing_archive", archive_returns_none
    )

    app = FastAPI()
    app.include_router(alt_data.router, prefix="/alt-data")
    client = TestClient(app)
    response = client.get("/alt-data/macro-briefing/history")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 0
    assert body["archives"] == []


@pytest.fixture(autouse=True)
def _reset_module_singleton():
    """Ensure each test starts with a clean module-level archive."""

    reset_macro_briefing_archive_for_tests(None)
    yield
    reset_macro_briefing_archive_for_tests(None)

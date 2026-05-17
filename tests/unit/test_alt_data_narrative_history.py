"""Tests for the alt-data narrative time-series archive (Phase E4).

Pins the persistence + read contract of
:class:`NarrativeArchive` and the
``GET /alt-data/narrative/history`` endpoint:

- ``append`` -> ``recent`` roundtrip preserves bullets / industry /
  evidence_links payload.
- ``days`` filter clamps to the documented [1, 90] window.
- ``industry`` filter is exact-match and applies post-time-window.
- Rotation moves the live file to ``*.timestamp.archive`` once it
  crosses :data:`ARCHIVE_ROTATE_SIZE_BYTES`.
- Malformed lines on disk are skipped + logged (a single corrupt row
  cannot break the endpoint).
- External scheduler / worker JSONL appends are visible even before the
  in-process memory cache reaches its cap.
- The in-memory cap (:data:`ARCHIVE_MEMORY_CAP`) is respected even when
  the on-disk file exceeds it.
- The endpoint shape (``archives`` / ``total`` / ``days_window`` /
  ``industry_scope``) and the days clamp behaviour.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import alt_data
from src.data.alternative.narrative import (
    ARCHIVE_DEFAULT_DAYS_WINDOW,
    ARCHIVE_MAX_DAYS_WINDOW,
    AltDataNarrative,
    ArchivedNarrative,
    NarrativeArchive,
    reset_narrative_archive_for_tests,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_narrative(
    *,
    summary: str = "政策雷达本周捕获 12 条记录。 综合判读：能源金属上行压力。",
    bullets: List[str] | None = None,
    generated_at: str = "2026-05-17T08:00:00+00:00",
) -> AltDataNarrative:
    return AltDataNarrative(
        summary=summary,
        bullets=bullets
        if bullets is not None
        else [
            "政策雷达本周捕获 12 条记录。",
            "综合判读：能源金属上行压力。",
        ],
        evidence_links=[
            {
                "component": "policy_radar",
                "snapshot_path": "cache/alt_data/providers/policy_radar.json",
                "verdict": "WORKING-PROTOTYPE",
                "stale": False,
            },
            {
                "component": "alt_data_audit",
                "snapshot_path": "docs/alt_data_audit.md",
                "verdict": "DERIVED",
                "stale": False,
            },
        ],
        generated_at=generated_at,
    )


def _build_archive(tmp_path: Path, **kwargs) -> NarrativeArchive:
    return NarrativeArchive(tmp_path / "narrative_history.jsonl", **kwargs)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_append_then_recent_roundtrip(tmp_path):
    """append() -> recent() returns the entry with bullets and industry intact."""

    archive = _build_archive(tmp_path)
    narrative = _make_narrative()

    entry = archive.append(narrative, industry="新能源汽车")
    assert isinstance(entry, ArchivedNarrative)
    assert entry.industry == "新能源汽车"
    assert entry.bullets == narrative.bullets
    assert entry.original_generated_at == narrative.generated_at

    fetched = archive.recent(days=14)
    assert len(fetched) == 1
    assert fetched[0].summary == narrative.summary
    assert fetched[0].bullets == narrative.bullets
    assert fetched[0].industry == "新能源汽车"
    # Evidence links survive the JSON round-trip with their payload.
    assert fetched[0].evidence_links[0]["component"] == "policy_radar"


def test_recent_days_window_filters_out_old_entries(tmp_path):
    """recent(days=N) excludes entries older than N days."""

    archive = _build_archive(tmp_path)
    archive.append(_make_narrative(), industry="新能源汽车")

    # Backdate the on-disk JSONL by overwriting with a hand-rolled
    # entry that is well outside the requested window.
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
                    "industry": None,
                    "summary": "old-summary",
                    "bullets": ["old"],
                    "evidence_links": [],
                    "original_generated_at": backdated_at,
                },
                ensure_ascii=False,
            )
            + "\n"
        )

    # A 14-day window only includes the fresh append.
    fetched = archive.recent(days=14)
    assert len(fetched) == 1
    assert fetched[0].summary != "old-summary"

    # Stretching the window to 90 days still doesn't include the
    # 60-day entry on the fresh archive instance because the in-memory
    # deque was populated by ``append`` and the disk read only fires
    # when the deque is saturated; force-instantiate a fresh archive
    # so the seed path covers the older row.
    fresh_archive = _build_archive(tmp_path)
    fetched_long = fresh_archive.recent(days=90)
    # Now both rows should be visible.
    assert len(fetched_long) == 2


def test_recent_industry_filter_exact_match(tmp_path):
    """industry filter is exact-match -- empty / None matches all."""

    archive = _build_archive(tmp_path)
    archive.append(_make_narrative(summary="ev"), industry="新能源汽车")
    archive.append(_make_narrative(summary="ai"), industry="AI算力")
    archive.append(_make_narrative(summary="global"), industry=None)

    all_entries = archive.recent(days=14)
    assert len(all_entries) == 3

    ev_only = archive.recent(days=14, industry="新能源汽车")
    assert [e.summary for e in ev_only] == ["ev"]

    ai_only = archive.recent(days=14, industry="AI算力")
    assert [e.summary for e in ai_only] == ["ai"]

    # Unknown industry -> empty list (not an error).
    empty = archive.recent(days=14, industry="不存在的行业")
    assert empty == []


def test_rotation_when_file_exceeds_threshold(tmp_path):
    """append() rotates the JSONL to ``*.archive`` once it exceeds the threshold."""

    archive = _build_archive(tmp_path, rotate_size_bytes=512)
    # Fill until we cross the 512B threshold. Each row is ~300 bytes.
    for _ in range(5):
        archive.append(_make_narrative(), industry="新能源汽车")

    # The next append must rotate -- a rolled file should appear on
    # disk and the live file must be a fresh JSONL.
    archive.append(_make_narrative(summary="after-rotation"), industry="新能源汽车")
    rolled = list(tmp_path.glob("narrative_history.jsonl.*.archive"))
    assert rolled, "expected at least one rolled archive file"

    # The live file only contains the post-rotation row.
    with archive.storage_path.open("r", encoding="utf-8") as handle:
        lines = [line for line in handle if line.strip()]
    assert len(lines) == 1
    assert "after-rotation" in lines[0]


def test_recent_skips_malformed_lines(tmp_path, caplog):
    """A corrupt JSON line is logged + skipped, not raised."""

    archive_path = tmp_path / "narrative_history.jsonl"
    valid_row = json.dumps(
        {
            "archived_at": datetime.now(tz=timezone.utc).isoformat(),
            "industry": None,
            "summary": "valid-summary",
            "bullets": ["bullet"],
            "evidence_links": [],
            "original_generated_at": "2026-05-17T08:00:00+00:00",
        },
        ensure_ascii=False,
    )
    archive_path.write_text(
        f"{valid_row}\n{{ not valid json }}\n{valid_row}\n",
        encoding="utf-8",
    )

    archive = NarrativeArchive(archive_path)
    with caplog.at_level(logging.WARNING):
        fetched = archive.recent(days=14)
    # Two valid rows survive; the malformed one is dropped.
    assert len(fetched) == 2
    assert all(entry.summary == "valid-summary" for entry in fetched)
    assert any("malformed" in rec.message.lower() for rec in caplog.records)


def test_in_memory_cap_falls_back_to_disk(tmp_path):
    """A fresh archive whose memory cap is smaller than the disk seeds correctly."""

    archive_path = tmp_path / "narrative_history.jsonl"
    base_ts = datetime.now(tz=timezone.utc).replace(microsecond=0)
    with archive_path.open("w", encoding="utf-8") as handle:
        for idx in range(8):
            row = {
                "archived_at": (base_ts - timedelta(minutes=idx)).isoformat(),
                "industry": "新能源汽车" if idx % 2 == 0 else None,
                "summary": f"row-{idx}",
                "bullets": [f"bullet-{idx}"],
                "evidence_links": [],
                "original_generated_at": (base_ts - timedelta(minutes=idx)).isoformat(),
            }
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")

    # memory_cap=3 forces the disk-fallback branch.
    archive = NarrativeArchive(archive_path, memory_cap=3)
    fetched = archive.recent(days=14)
    # All 8 rows are within the window and surface across the merged
    # memory + disk view.
    assert len(fetched) == 8

    # Industry filter still works through the merged view.
    ev_only = archive.recent(days=14, industry="新能源汽车")
    assert {e.summary for e in ev_only} == {"row-0", "row-2", "row-4", "row-6"}


def test_recent_sees_external_jsonl_append_before_memory_cap(tmp_path):
    """recent() picks up fresh JSONL rows appended by another process."""

    archive = _build_archive(tmp_path, memory_cap=10)
    archive.append(_make_narrative(summary="local-summary"), industry="新能源汽车")
    external_ts = (datetime.now(tz=timezone.utc) + timedelta(seconds=1)).isoformat()
    external_row = {
        "archived_at": external_ts,
        "industry": "AI算力",
        "summary": "external-scheduler-summary",
        "bullets": ["external bullet"],
        "evidence_links": [],
        "original_generated_at": external_ts,
    }
    with archive.storage_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(external_row, ensure_ascii=False) + "\n")

    fetched = archive.recent(days=14)

    assert len(fetched) == 2
    assert [entry.summary for entry in fetched] == [
        "external-scheduler-summary",
        "local-summary",
    ]
    assert archive.recent(days=14, industry="AI算力")[0].summary == (
        "external-scheduler-summary"
    )


def test_endpoint_shape_and_days_clamp(tmp_path, monkeypatch):
    """GET /alt-data/narrative/history returns the documented payload shape and clamps days."""

    archive = _build_archive(tmp_path)
    archive.append(_make_narrative(summary="latest"), industry="新能源汽车")

    monkeypatch.setattr(alt_data, "_get_narrative_archive", lambda: archive)

    app = FastAPI()
    app.include_router(alt_data.router, prefix="/alt-data")
    client = TestClient(app)

    # Default invocation -> 14-day window, no industry filter.
    response = client.get("/alt-data/narrative/history")
    assert response.status_code == 200
    payload = response.json()
    assert set(payload.keys()) >= {
        "archives",
        "total",
        "days_window",
        "industry_scope",
    }
    assert payload["days_window"] == ARCHIVE_DEFAULT_DAYS_WINDOW
    assert payload["industry_scope"] is None
    assert payload["total"] == 1
    assert payload["archives"][0]["summary"] == "latest"

    # days clamp: anything above 90 is rejected by FastAPI's validator.
    response_oversized = client.get(
        "/alt-data/narrative/history", params={"days": ARCHIVE_MAX_DAYS_WINDOW + 5}
    )
    assert response_oversized.status_code == 422

    # Lower-bound clamp: days=0 also fails validation.
    response_zero = client.get("/alt-data/narrative/history", params={"days": 0})
    assert response_zero.status_code == 422

    # Industry filter applied via the endpoint reaches recent() correctly.
    response_industry = client.get(
        "/alt-data/narrative/history", params={"industry": "新能源汽车"}
    )
    assert response_industry.status_code == 200
    assert response_industry.json()["industry_scope"] == "新能源汽车"
    assert response_industry.json()["total"] == 1


def test_endpoint_narrative_call_appends_to_archive(tmp_path, monkeypatch):
    """GET /alt-data/narrative appends the generated narrative to the archive."""

    from src.data.alternative.alt_data_manager import AltDataManager
    from src.data.alternative.governance import AltDataSnapshotStore

    # Use the existing seed helper from the narrative test module so we
    # have a manager that produces non-empty narrative content.
    from tests.unit.test_alt_data_narrative import _seed_manager

    manager = _seed_manager(tmp_path / "manager", snapshot_mtime_days_ago=0.5)
    archive = _build_archive(tmp_path)

    monkeypatch.setattr(alt_data, "_get_manager", lambda: manager)
    monkeypatch.setattr(alt_data, "_get_scheduler", lambda: None)
    monkeypatch.setattr(alt_data, "_get_narrative_archive", lambda: archive)

    app = FastAPI()
    app.include_router(alt_data.router, prefix="/alt-data")
    client = TestClient(app)

    pre = archive.recent(days=14)
    assert pre == []

    response = client.get("/alt-data/narrative")
    assert response.status_code == 200
    payload = response.json()
    # The shape of the existing payload is unchanged.
    assert "summary" in payload and "bullets" in payload

    post = archive.recent(days=14)
    assert len(post) == 1
    assert post[0].summary == payload["summary"]
    assert post[0].original_generated_at == payload["generated_at"]


@pytest.fixture(autouse=True)
def _reset_module_singleton():
    """Ensure each test starts with a clean module-level archive."""

    reset_narrative_archive_for_tests(None)
    yield
    reset_narrative_archive_for_tests(None)

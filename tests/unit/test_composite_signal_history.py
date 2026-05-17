"""Tests for the composite signal time-series archive (Phase F4.1).

Pins the persistence + read contract of
:class:`CompositeSignalArchive` and the
``GET /alt-data/composite-signals/history`` endpoint:

- ``append`` -> ``recent`` roundtrip preserves direction / target /
  conviction / supporting_components / aggregate_strength /
  original_emit_at.
- ``days`` filter clamps to the documented ``[1, 90]`` window.
- ``industry`` filter is exact-match against ``target``.
- ``min_conviction`` filter respects the ``high > medium > low`` rank.
- Rotation moves the live file to ``*.timestamp.archive`` once it
  crosses :data:`ARCHIVE_ROTATE_SIZE_BYTES`.
- Malformed JSON lines on disk are skipped + logged.
- In-memory cap honoured when the on-disk file exceeds it.
- Endpoint shape + days clamp.
- Idempotent: empty input doesn't append (``append_many`` skip).
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import alt_data
from src.data.alternative.composite_signal import (
    ARCHIVE_DEFAULT_DAYS_WINDOW,
    ARCHIVE_MAX_DAYS_WINDOW,
    ArchivedCompositeSignal,
    CompositeSignal,
    CompositeSignalArchive,
    SupportingComponent,
    reset_composite_signal_archive_for_tests,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_signal(
    *,
    direction: str = "bullish",
    target: str = "AI算力",
    conviction: str = "high",
    aggregate_strength: float = 0.42,
    emit_at: str = "2026-05-17T08:00:00+00:00",
    components: Optional[List[SupportingComponent]] = None,
) -> CompositeSignal:
    return CompositeSignal(
        direction=direction,
        target_kind="industry",
        target=target,
        conviction=conviction,
        supporting_components=components
        if components is not None
        else [
            SupportingComponent(
                component="policy_radar",
                direction=direction,
                signal_strength=0.45,
                is_strong=True,
                detail="avg_impact=+0.450; mentions=12",
            ),
            SupportingComponent(
                component="northbound",
                direction=direction,
                signal_strength=0.30,
                is_strong=True,
                detail="industry_netflow_cny_billion=+6.50",
            ),
            SupportingComponent(
                component="fund_holdings",
                direction=direction,
                signal_strength=0.55,
                is_strong=True,
                detail="summed_aum_weight_pct=0.620",
            ),
        ],
        emit_at=emit_at,
        aggregate_strength=aggregate_strength,
    )


def _build_archive(tmp_path: Path, **kwargs) -> CompositeSignalArchive:
    return CompositeSignalArchive(
        tmp_path / "composite_signal_history.jsonl", **kwargs
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_append_then_recent_roundtrip(tmp_path):
    """append() -> recent() round-trips every field on the signal."""

    archive = _build_archive(tmp_path)
    signal = _make_signal()

    entry = archive.append(signal)
    assert isinstance(entry, ArchivedCompositeSignal)
    assert entry.direction == "bullish"
    assert entry.target == "AI算力"
    assert entry.conviction == "high"
    assert entry.original_emit_at == signal.emit_at
    assert len(entry.supporting_components) == 3
    assert entry.supporting_components[0]["component"] == "policy_radar"

    fetched = archive.recent(days=14)
    assert len(fetched) == 1
    assert fetched[0].direction == signal.direction
    assert fetched[0].target == signal.target
    assert fetched[0].conviction == signal.conviction
    # Round-trip the supporting_components list through JSON faithfully.
    assert fetched[0].supporting_components[1]["component"] == "northbound"
    # Aggregate strength survives serialisation with the documented 4dp
    # rounding.
    assert abs(fetched[0].aggregate_strength - 0.42) < 1e-6


def test_recent_days_window_filters_old_entries(tmp_path):
    """recent(days=N) excludes archived rows older than N days."""

    archive = _build_archive(tmp_path)
    archive.append(_make_signal())

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
                    "direction": "bearish",
                    "target_kind": "industry",
                    "target": "新能源汽车",
                    "conviction": "medium",
                    "supporting_components": [],
                    "aggregate_strength": 0.2,
                    "original_emit_at": backdated_at,
                },
                ensure_ascii=False,
            )
            + "\n"
        )

    fetched = archive.recent(days=14)
    assert len(fetched) == 1
    assert fetched[0].target == "AI算力"

    # A fresh archive instance whose memory_cap is forced small drives
    # the disk-fallback branch and surfaces the older row when the
    # window is widened.
    fresh_archive = _build_archive(tmp_path, memory_cap=2)
    fetched_long = fresh_archive.recent(days=90)
    assert len(fetched_long) == 2
    assert {entry.target for entry in fetched_long} == {
        "AI算力",
        "新能源汽车",
    }


def test_recent_industry_filter_exact_match(tmp_path):
    """industry filter is exact-match against ``target``."""

    archive = _build_archive(tmp_path)
    archive.append(_make_signal(target="AI算力"))
    archive.append(_make_signal(target="新能源汽车", direction="bearish"))
    archive.append(_make_signal(target="电网"))

    all_entries = archive.recent(days=14)
    assert {entry.target for entry in all_entries} == {
        "AI算力",
        "新能源汽车",
        "电网",
    }

    ai_only = archive.recent(days=14, industry="AI算力")
    assert [entry.target for entry in ai_only] == ["AI算力"]

    new_energy = archive.recent(days=14, industry="新能源汽车")
    assert [entry.target for entry in new_energy] == ["新能源汽车"]
    assert new_energy[0].direction == "bearish"

    # Unknown industry → empty list (not an error).
    assert archive.recent(days=14, industry="不存在的行业") == []


def test_recent_min_conviction_filter(tmp_path):
    """min_conviction filter respects the high > medium > low rank."""

    archive = _build_archive(tmp_path)
    archive.append(_make_signal(target="AI算力", conviction="high"))
    archive.append(_make_signal(target="光伏", conviction="medium"))
    archive.append(_make_signal(target="电网", conviction="low"))

    high_only = archive.recent(days=14, min_conviction="high")
    assert [entry.target for entry in high_only] == ["AI算力"]

    medium_plus = archive.recent(days=14, min_conviction="medium")
    assert {entry.target for entry in medium_plus} == {"AI算力", "光伏"}

    low_plus = archive.recent(days=14, min_conviction="low")
    assert len(low_plus) == 3

    # None / empty disables the filter.
    assert len(archive.recent(days=14, min_conviction=None)) == 3
    assert len(archive.recent(days=14, min_conviction="")) == 3


def test_rotation_when_file_exceeds_threshold(tmp_path):
    """append() rotates the JSONL once it crosses the threshold."""

    archive = _build_archive(tmp_path, rotate_size_bytes=512)
    # Each row is ~500 bytes after JSON encoding.
    for _ in range(5):
        archive.append(_make_signal())

    # Push past the 512-byte threshold so the next append rotates.
    archive.append(_make_signal(target="post-rotation-target"))
    rolled = list(tmp_path.glob("composite_signal_history.jsonl.*.archive"))
    assert rolled, "expected at least one rolled archive file"

    with archive.storage_path.open("r", encoding="utf-8") as handle:
        lines = [line for line in handle if line.strip()]
    assert len(lines) == 1
    assert "post-rotation-target" in lines[0]


def test_recent_skips_malformed_lines(tmp_path, caplog):
    """A corrupt JSON line is logged + skipped, not raised."""

    archive_path = tmp_path / "composite_signal_history.jsonl"
    valid_row = json.dumps(
        {
            "archived_at": datetime.now(tz=timezone.utc).isoformat(),
            "direction": "bullish",
            "target_kind": "industry",
            "target": "AI算力",
            "conviction": "high",
            "supporting_components": [],
            "aggregate_strength": 0.4,
            "original_emit_at": "2026-05-17T08:00:00+00:00",
        },
        ensure_ascii=False,
    )
    archive_path.write_text(
        f"{valid_row}\n{{ not valid json }}\n{valid_row}\n",
        encoding="utf-8",
    )

    archive = CompositeSignalArchive(archive_path)
    with caplog.at_level(logging.WARNING):
        fetched = archive.recent(days=14)
    assert len(fetched) == 2
    assert all(entry.target == "AI算力" for entry in fetched)
    assert any("malformed" in rec.message.lower() for rec in caplog.records)


def test_in_memory_cap_falls_back_to_disk(tmp_path):
    """A fresh archive whose memory cap is smaller than the disk seeds correctly."""

    archive_path = tmp_path / "composite_signal_history.jsonl"
    base_ts = datetime.now(tz=timezone.utc).replace(microsecond=0)
    industries = ["AI算力", "新能源汽车", "电网", "光伏"]
    with archive_path.open("w", encoding="utf-8") as handle:
        for idx in range(8):
            row = {
                "archived_at": (base_ts - timedelta(minutes=idx)).isoformat(),
                "direction": "bullish" if idx % 2 == 0 else "bearish",
                "target_kind": "industry",
                "target": industries[idx % len(industries)],
                "conviction": "high" if idx % 3 == 0 else "medium",
                "supporting_components": [],
                "aggregate_strength": 0.3 + idx * 0.01,
                "original_emit_at": (base_ts - timedelta(minutes=idx)).isoformat(),
            }
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")

    archive = CompositeSignalArchive(archive_path, memory_cap=3)
    fetched = archive.recent(days=14)
    assert len(fetched) == 8

    # Industry filter still works through the merged memory + disk view.
    ai_only = archive.recent(days=14, industry="AI算力")
    assert all(entry.target == "AI算力" for entry in ai_only)
    assert len(ai_only) == 2  # idx 0 and idx 4


def test_append_many_skips_empty(tmp_path):
    """append_many([]) is a no-op — empty input doesn't inflate the log."""

    archive = _build_archive(tmp_path)
    assert archive.append_many([]) == []
    assert not archive.storage_path.exists() or archive.storage_path.stat().st_size == 0
    assert archive.recent(days=14) == []

    # Non-empty list appends every signal.
    appended = archive.append_many(
        [_make_signal(target="AI算力"), _make_signal(target="光伏")]
    )
    assert len(appended) == 2
    assert {entry.target for entry in appended} == {"AI算力", "光伏"}


def test_endpoint_shape_and_days_clamp(tmp_path, monkeypatch):
    """GET /alt-data/composite-signals/history shape + days clamp."""

    archive = _build_archive(tmp_path)
    archive.append(_make_signal(target="AI算力"))

    monkeypatch.setattr(
        alt_data, "_get_composite_signal_archive", lambda: archive
    )

    app = FastAPI()
    app.include_router(alt_data.router, prefix="/alt-data")
    client = TestClient(app)

    # Default invocation -> 14-day window, no filters.
    response = client.get("/alt-data/composite-signals/history")
    assert response.status_code == 200
    payload = response.json()
    assert set(payload.keys()) >= {
        "archives",
        "total",
        "days_window",
        "industry_scope",
        "min_conviction",
        "audit_doc_url",
    }
    assert payload["days_window"] == ARCHIVE_DEFAULT_DAYS_WINDOW
    assert payload["industry_scope"] is None
    assert payload["min_conviction"] is None
    assert payload["total"] == 1
    assert payload["archives"][0]["target"] == "AI算力"
    assert payload["archives"][0]["direction"] == "bullish"
    assert payload["archives"][0]["supporting_components_count"] == 3

    # days clamp: anything above 90 is rejected by FastAPI's validator.
    response_oversized = client.get(
        "/alt-data/composite-signals/history",
        params={"days": ARCHIVE_MAX_DAYS_WINDOW + 5},
    )
    assert response_oversized.status_code == 422

    # Lower-bound clamp: days=0 also fails validation.
    response_zero = client.get(
        "/alt-data/composite-signals/history", params={"days": 0}
    )
    assert response_zero.status_code == 422

    # Industry filter applied via the endpoint reaches recent() correctly.
    response_industry = client.get(
        "/alt-data/composite-signals/history",
        params={"industry": "AI算力"},
    )
    assert response_industry.status_code == 200
    assert response_industry.json()["industry_scope"] == "AI算力"
    assert response_industry.json()["total"] == 1

    # min_conviction filter applied via the endpoint.
    response_conviction = client.get(
        "/alt-data/composite-signals/history",
        params={"min_conviction": "high"},
    )
    assert response_conviction.status_code == 200
    assert response_conviction.json()["min_conviction"] == "high"


def test_composite_signals_endpoint_appends_to_archive(tmp_path, monkeypatch):
    """GET /alt-data/composite-signals appends detected signals to the archive."""

    from tests.unit.test_composite_signal import _build_full_bullish_manager

    manager = _build_full_bullish_manager()
    archive = _build_archive(tmp_path)

    monkeypatch.setattr(alt_data, "_get_manager", lambda: manager)
    monkeypatch.setattr(alt_data, "_get_scheduler", lambda: None)
    monkeypatch.setattr(
        manager,
        "get_dashboard_snapshot",
        lambda refresh=False: {"snapshot_timestamp": "2026-05-17T10:00:00+00:00"},
        raising=False,
    )
    monkeypatch.setattr(
        alt_data, "_get_composite_signal_archive", lambda: archive
    )

    app = FastAPI()
    app.include_router(alt_data.router, prefix="/alt-data")
    client = TestClient(app)

    assert archive.recent(days=14) == []

    response = client.get(
        "/alt-data/composite-signals", params={"min_conviction": "low"}
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["composite_signals"], "expected at least one composite emission"

    post = archive.recent(days=14)
    # The high-conviction bullish AI算力 row should have landed.
    assert post, "endpoint should have appended composite signals"
    targets = {entry.target for entry in post}
    assert "AI算力" in targets


@pytest.fixture(autouse=True)
def _reset_module_singleton():
    """Ensure each test starts with a clean module-level archive."""

    reset_composite_signal_archive_for_tests(None)
    yield
    reset_composite_signal_archive_for_tests(None)

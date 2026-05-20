"""Tests for the point-in-time structural-decay signal panel store.

Pins the persistence + read contract of
:class:`src.analytics.signal_panel.SignalPanelStore` -- the store that
closes the validation gap by persisting every ``build_structural_decay``
score instead of discarding it:

- ``append`` -> ``recent`` round-trips symbol / score / components.
- ``record_structural_decay`` maps the engine output into a panel row,
  reconciling per-category component deltas and capturing point-in-time
  raw inputs (capm/ff3 alpha, gap, fragility).
- An empty symbol is skipped (cannot anchor a cross-sectional rank-IC).
- ``recent(days=N)`` excludes rows older than N days; ``symbol`` /
  ``signal_name`` filters are exact.
- ``observation_count`` counts every on-disk row.
- Rotation moves the live file to ``*.timestamp.archive`` once it
  crosses the configured size.
- Malformed JSON lines on disk are skipped (a corrupt row never breaks
  a read).
- In-memory cap is honoured when the on-disk file exceeds it.
- Point-in-time discipline: a row's stored ``observed_at`` is preserved
  verbatim.
- ``SignalAdapter.structural_decay_panel_frame`` bridges the panel into
  a backtest-consumable frame.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints.infrastructure import routes as infrastructure_routes
from scripts import validate_structural_decay
from src.analytics import signal_panel as signal_panel_module
from src.analytics.signal_panel import (
    PANEL_MEMORY_CAP,
    SignalPanelRow,
    SignalPanelStore,
    get_signal_panel_store,
    reset_signal_panel_store_for_tests,
)
from src.backtest.signal_adapter import SignalAdapter

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_store(tmp_path: Path, **kwargs) -> SignalPanelStore:
    return SignalPanelStore(tmp_path / "structural_decay_panel.jsonl", **kwargs)


def _make_structural_decay(score: float = 0.42) -> dict:
    """A minimal `build_structural_decay`-shaped result for the store."""

    return {
        "score": score,
        "action": "structural_avoid",
        "dominant_failure_mode": "execution",
        "components": [
            {"key": "execution_decay", "label": "执行", "delta": 0.18, "status": "positive", "detail": "d"},
            {"key": "people_fragility", "label": "组织", "delta": 0.16, "status": "positive", "detail": "d"},
            {"key": "evidence_conflict", "label": "证据", "delta": 0.14, "status": "positive", "detail": "d"},
        ],
    }


# ---------------------------------------------------------------------------
# append / recent round-trip
# ---------------------------------------------------------------------------


def test_append_then_recent_roundtrip(tmp_path):
    """append() -> recent() round-trips every field on a panel row."""

    store = _build_store(tmp_path)
    row = SignalPanelRow(
        observed_at="2026-05-19T08:00:00+00:00",
        symbol="BABA",
        signal_name="structural_decay",
        final_score=0.42,
        action="structural_avoid",
        dominant_failure_mode="execution",
        component_scores={"execution": 0.18, "people": 0.16},
    )

    persisted = store.append(row)
    assert isinstance(persisted, SignalPanelRow)
    assert persisted.symbol == "BABA"

    fetched = store.recent(days=30)
    assert len(fetched) == 1
    assert fetched[0].symbol == "BABA"
    assert fetched[0].signal_name == "structural_decay"
    assert abs(fetched[0].final_score - 0.42) < 1e-9
    assert fetched[0].component_scores["execution"] == 0.18
    # Point-in-time discipline: the observation stamp is preserved verbatim.
    assert fetched[0].observed_at == "2026-05-19T08:00:00+00:00"


def test_recent_returns_rows_oldest_first(tmp_path):
    """recent() yields rows ascending by observed_at for walk-forward use."""

    store = _build_store(tmp_path)
    now = datetime.now(tz=timezone.utc)
    for offset_days in (5, 1, 3):
        stamp = (now - timedelta(days=offset_days)).replace(microsecond=0).isoformat()
        store.append(
            SignalPanelRow(
                observed_at=stamp,
                symbol="AAPL",
                signal_name="structural_decay",
                final_score=0.3,
            )
        )
    fetched = store.recent(days=30)
    stamps = [r.observed_at for r in fetched]
    assert stamps == sorted(stamps)


# ---------------------------------------------------------------------------
# record_structural_decay mapping
# ---------------------------------------------------------------------------


def test_record_structural_decay_maps_engine_output(tmp_path):
    """record_structural_decay() reconciles component deltas + raw inputs."""

    store = _build_store(tmp_path)
    row = store.record_structural_decay(
        symbol="baba",
        structural_decay=_make_structural_decay(score=0.42),
        factor={"capm": {"alpha_pct": -6.2}, "fama_french": {"alpha_pct": -4.1}},
        gap={"gap_pct": 22.0},
        people_layer={"people_fragility_score": 0.66},
    )
    assert row is not None
    # Symbol is upper-cased.
    assert row.symbol == "BABA"
    assert abs(row.final_score - 0.42) < 1e-9
    # Per-category deltas are summed back from the components list.
    assert abs(row.component_scores["execution"] - 0.18) < 1e-9
    assert abs(row.component_scores["people"] - 0.16) < 1e-9
    assert abs(row.component_scores["evidence"] - 0.14) < 1e-9
    assert row.component_scores["valuation"] == 0.0
    # Point-in-time raw inputs are captured alongside the category scores.
    assert abs(row.component_scores["capm_alpha_pct"] - (-6.2)) < 1e-9
    assert abs(row.component_scores["ff3_alpha_pct"] - (-4.1)) < 1e-9
    assert abs(row.component_scores["gap_pct"] - 22.0) < 1e-9
    assert abs(row.component_scores["people_fragility_score"] - 0.66) < 1e-9


def test_record_structural_decay_skips_empty_symbol(tmp_path):
    """A row with no symbol cannot anchor a rank-IC, so it is dropped."""

    store = _build_store(tmp_path)
    assert store.record_structural_decay(
        symbol="   ", structural_decay=_make_structural_decay()
    ) is None
    assert store.observation_count() == 0


def test_record_structural_decay_tolerates_missing_inputs(tmp_path):
    """Missing factor/gap/people dicts default to neutral, never raise."""

    store = _build_store(tmp_path)
    row = store.record_structural_decay(
        symbol="AAPL", structural_decay=_make_structural_decay()
    )
    assert row is not None
    assert row.component_scores["capm_alpha_pct"] == 0.0
    assert row.component_scores["gap_pct"] == 0.0


# ---------------------------------------------------------------------------
# filters / counts
# ---------------------------------------------------------------------------


def test_recent_days_window_filters_old_entries(tmp_path):
    """recent(days=N) excludes panel rows older than N days."""

    store = _build_store(tmp_path)
    store.append(
        SignalPanelRow(
            observed_at=datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat(),
            symbol="AAPL",
            signal_name="structural_decay",
            final_score=0.3,
        )
    )
    backdated = (
        (datetime.now(tz=timezone.utc) - timedelta(days=400))
        .replace(microsecond=0)
        .isoformat()
    )
    with store.storage_path.open("a", encoding="utf-8") as handle:
        handle.write(
            json.dumps(
                {
                    "observed_at": backdated,
                    "symbol": "OLD",
                    "signal_name": "structural_decay",
                    "final_score": 0.9,
                }
            )
            + "\n"
        )
    fetched = store.recent(days=90)
    assert {r.symbol for r in fetched} == {"AAPL"}


def test_recent_symbol_and_signal_name_filters(tmp_path):
    """recent() applies exact symbol + signal_name filters after the window."""

    store = _build_store(tmp_path)
    stamp = datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()
    store.append(SignalPanelRow(observed_at=stamp, symbol="AAPL", signal_name="structural_decay", final_score=0.3))
    store.append(SignalPanelRow(observed_at=stamp, symbol="BABA", signal_name="structural_decay", final_score=0.5))
    store.append(
        SignalPanelRow(
            observed_at=stamp,
            symbol="AAPL",
            signal_name="structural_decay_reconstructed",
            final_score=0.4,
        )
    )

    assert {r.symbol for r in store.recent(days=30, symbol="aapl")} == {"AAPL"}
    recon = store.recent(days=30, signal_name="structural_decay_reconstructed")
    assert len(recon) == 1
    assert recon[0].symbol == "AAPL"
    live = store.recent(days=30, signal_name="structural_decay")
    assert {r.symbol for r in live} == {"AAPL", "BABA"}


def test_validation_panel_prefers_live_rows_over_matching_backfill():
    """Validation keeps signal identity so live rows replace backfill rows."""

    rows = [
        SignalPanelRow(
            observed_at="2026-05-19T08:00:00+00:00",
            symbol="AAPL",
            signal_name=validate_structural_decay.RECONSTRUCTED_SIGNAL_NAME,
            final_score=0.91,
        ),
        SignalPanelRow(
            observed_at="2026-05-19T12:00:00+00:00",
            symbol="AAPL",
            signal_name="structural_decay",
            final_score=0.22,
        ),
        SignalPanelRow(
            observed_at="2026-05-19T08:00:00+00:00",
            symbol="BABA",
            signal_name=validate_structural_decay.RECONSTRUCTED_SIGNAL_NAME,
            final_score=0.44,
        ),
    ]

    frame = validate_structural_decay.panel_to_score_frame(rows)

    assert "signal_name" in frame.columns
    assert len(frame) == 2
    aapl = frame[frame["symbol"] == "AAPL"].iloc[0]
    assert aapl["signal_name"] == "structural_decay"
    assert abs(aapl["score"] - 0.22) < 1e-9
    baba = frame[frame["symbol"] == "BABA"].iloc[0]
    assert baba["signal_name"] == validate_structural_decay.RECONSTRUCTED_SIGNAL_NAME


def test_observation_count_counts_all_disk_rows(tmp_path):
    """observation_count() returns the whole-panel row count, not a window."""

    store = _build_store(tmp_path)
    assert store.observation_count() == 0
    for i in range(4):
        store.append(
            SignalPanelRow(
                observed_at=f"2026-05-1{i}T00:00:00+00:00",
                symbol="AAPL",
                signal_name="structural_decay",
                final_score=0.1 * i,
            )
        )
    assert store.observation_count() == 4


# ---------------------------------------------------------------------------
# on-disk hygiene
# ---------------------------------------------------------------------------


def test_rotation_rolls_file_once_size_exceeded(tmp_path):
    """The JSONL rolls to *.timestamp.archive once it crosses the threshold."""

    store = _build_store(tmp_path, rotate_size_bytes=200)
    for i in range(12):
        store.append(
            SignalPanelRow(
                observed_at=f"2026-05-{i + 1:02d}T00:00:00+00:00",
                symbol="AAPL",
                signal_name="structural_decay",
                final_score=0.1,
            )
        )
    rolled = list(tmp_path.glob("structural_decay_panel.jsonl.*.archive"))
    assert rolled, "expected at least one rotated archive segment"


def test_rotation_preserves_rows_when_multiple_rolls_share_timestamp(
    monkeypatch, tmp_path
):
    """Multiple rotations in the same second must not overwrite archives."""

    class FixedDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 5, 20, 12, 0, 0, tzinfo=tz)

    monkeypatch.setattr(signal_panel_module, "datetime", FixedDateTime)
    store = _build_store(tmp_path, rotate_size_bytes=120)

    for i in range(8):
        store.append(
            SignalPanelRow(
                observed_at=f"2026-05-20T12:0{i}:00+00:00",
                symbol=f"SYM{i}",
                signal_name="structural_decay",
                final_score=0.1,
            )
        )

    assert store.observation_count() == 8


def test_recent_and_count_include_rotated_archive_segments(tmp_path):
    """Consumers still see panel history after JSONL rotation."""

    store = _build_store(tmp_path)
    archived_row = SignalPanelRow(
        observed_at="2026-05-18T00:00:00+00:00",
        symbol="OLD",
        signal_name="structural_decay",
        final_score=0.1,
    )
    active_row = SignalPanelRow(
        observed_at="2026-05-19T00:00:00+00:00",
        symbol="NEW",
        signal_name="structural_decay",
        final_score=0.2,
    )
    archive_path = store.storage_path.with_name(
        f"{store.storage_path.name}.20260518T000000Z.archive"
    )
    archive_path.write_text(
        json.dumps(archived_row.to_dict(), ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    store.storage_path.write_text(
        json.dumps(active_row.to_dict(), ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    fresh = SignalPanelStore(store.storage_path)
    fetched = fresh.recent(
        days=30,
        now=datetime(2026, 5, 20, tzinfo=timezone.utc),
    )

    assert [row.symbol for row in fetched] == ["OLD", "NEW"]
    assert fresh.observation_count() == 2


def test_malformed_json_line_is_skipped(tmp_path):
    """A corrupt JSONL line is skipped + logged, never breaks a read."""

    store = _build_store(tmp_path)
    store.append(
        SignalPanelRow(
            observed_at=datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat(),
            symbol="AAPL",
            signal_name="structural_decay",
            final_score=0.3,
        )
    )
    with store.storage_path.open("a", encoding="utf-8") as handle:
        handle.write("{not valid json\n")

    # A fresh store re-seeds from disk and must survive the corrupt line.
    fresh = SignalPanelStore(store.storage_path)
    fetched = fresh.recent(days=30)
    assert len(fetched) == 1
    assert fetched[0].symbol == "AAPL"


def test_memory_cap_honoured_when_disk_exceeds_it(tmp_path):
    """recent() still sees rows beyond the in-memory cap by reading disk."""

    store = _build_store(tmp_path, memory_cap=3)
    now = datetime.now(tz=timezone.utc)
    for i in range(8):
        stamp = (now - timedelta(hours=i)).replace(microsecond=0).isoformat()
        store.append(
            SignalPanelRow(
                observed_at=stamp,
                symbol=f"SYM{i}",
                signal_name="structural_decay",
                final_score=0.1,
            )
        )
    fetched = store.recent(days=30)
    # All 8 rows are within the window even though the deque only holds 3.
    assert len(fetched) == 8


# ---------------------------------------------------------------------------
# singleton hook
# ---------------------------------------------------------------------------


def test_reset_singleton_for_tests(tmp_path):
    """reset_signal_panel_store_for_tests injects a fresh store."""

    injected = _build_store(tmp_path)
    reset_signal_panel_store_for_tests(injected)
    try:
        assert get_signal_panel_store() is injected
    finally:
        reset_signal_panel_store_for_tests(None)


# ---------------------------------------------------------------------------
# SignalAdapter bridge into the backtest engine
# ---------------------------------------------------------------------------


def test_signal_adapter_panel_frame_shapes_for_backtest(tmp_path):
    """SignalAdapter.structural_decay_panel_frame yields a tidy backtest frame."""

    store = _build_store(tmp_path)
    store.append(
        SignalPanelRow(
            observed_at="2026-01-05T00:00:00+00:00",
            symbol="AAPL",
            signal_name="structural_decay",
            final_score=0.3,
            component_scores={"execution": 0.1, "people": 0.2},
        )
    )
    store.append(
        SignalPanelRow(
            observed_at="2026-02-05T00:00:00+00:00",
            symbol="AAPL",
            signal_name="structural_decay",
            final_score=0.5,
            component_scores={"execution": 0.3, "people": 0.2},
        )
    )
    store.append(
        SignalPanelRow(
            observed_at="2026-01-05T00:00:00+00:00",
            symbol="BABA",
            signal_name="structural_decay",
            final_score=0.7,
            component_scores={"execution": 0.5, "people": 0.2},
        )
    )

    frame = SignalAdapter.structural_decay_panel_frame(store=store)
    assert list(frame.index.names) == ["observed_at"]
    assert "final_score" in frame.columns
    assert "execution" in frame.columns
    # 3 rows, ascending by observation date.
    assert len(frame) == 3
    assert frame.index.is_monotonic_increasing

    single = SignalAdapter.structural_decay_panel_frame(symbol="AAPL", store=store)
    assert len(single) == 2
    assert set(single["symbol"]) == {"AAPL"}


def test_signal_adapter_panel_frame_empty_panel(tmp_path):
    """An empty panel yields an empty frame with the expected columns."""

    store = _build_store(tmp_path)
    frame = SignalAdapter.structural_decay_panel_frame(store=store)
    assert frame.empty
    assert list(frame.columns) == ["symbol", "final_score"]
    assert frame.index.name == "observed_at"


def test_memory_cap_constant_is_positive():
    """The exported in-memory cap is a sane positive integer."""

    assert isinstance(PANEL_MEMORY_CAP, int)
    assert PANEL_MEMORY_CAP > 0


# ---------------------------------------------------------------------------
# Infrastructure API contract
# ---------------------------------------------------------------------------


def test_infrastructure_signal_panel_endpoint_exposes_filtered_contract(monkeypatch, tmp_path):
    """The API exposes a stable filtered panel summary + row contract."""

    store = _build_store(tmp_path)
    recent_stamp = datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()
    store.append(
        SignalPanelRow(
            observed_at=recent_stamp,
            symbol="AAPL",
            signal_name="structural_decay",
            final_score=0.42,
            action="structural_avoid",
            dominant_failure_mode="execution",
            component_scores={"execution": 0.18, "people": 0.16},
        )
    )
    store.append(
        SignalPanelRow(
            observed_at=recent_stamp,
            symbol="BABA",
            signal_name="structural_decay_reconstructed",
            final_score=0.27,
        )
    )
    monkeypatch.setattr(infrastructure_routes, "get_signal_panel_store", lambda: store)

    app = FastAPI()
    app.include_router(infrastructure_routes.router, prefix="/infrastructure")
    response = TestClient(app).get("/infrastructure/signal-panel?symbol=aapl&days=30&limit=5")

    assert response.status_code == 200
    payload = response.json()
    assert payload["window_days"] == 30
    assert payload["symbol"] == "AAPL"
    assert payload["signal_name"] is None
    assert payload["observation_count"] == 2
    assert payload["matched_count"] == 1
    assert payload["returned_count"] == 1
    assert payload["truncated"] is False
    assert payload["live_count"] == 1
    assert payload["reconstructed_count"] == 0
    assert payload["symbols"] == ["AAPL"]
    assert payload["rows"] == [
        {
            "observed_at": recent_stamp,
            "symbol": "AAPL",
            "signal_name": "structural_decay",
            "final_score": 0.42,
            "action": "structural_avoid",
            "dominant_failure_mode": "execution",
            "component_scores": {"execution": 0.18, "people": 0.16},
        }
    ]


def test_structural_decay_writeup_mentions_signal_panel_api_contract():
    """The generated validation doc names the API contract for panel inspection."""

    row = SignalPanelRow(
        observed_at="2026-05-19T00:00:00+00:00",
        symbol="AAPL",
        signal_name="structural_decay",
        final_score=0.42,
    )
    eval_panel = validate_structural_decay.pd.DataFrame(
        [{"anchor": validate_structural_decay.pd.Timestamp("2026-05-19"), "symbol": "AAPL", "score": 0.42}]
    )
    result = validate_structural_decay.HorizonResult(
        horizon_months=1,
        n_anchors=1,
        n_pairs=1,
        mean_ic=0.0,
        ic_t_stat=0.0,
        ic_info_ratio=0.0,
        ic_hit_rate=0.0,
        boot_ci_low=float("nan"),
        boot_ci_high=float("nan"),
        long_short_mean=0.0,
        long_short_t_stat=0.0,
    )

    writeup = validate_structural_decay.build_writeup(
        [row],
        eval_panel,
        [result],
        live_count=1,
        reconstructed_count=0,
    )

    assert "`GET /infrastructure/signal-panel`" in writeup
    assert "matched_count" in writeup

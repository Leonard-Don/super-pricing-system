"""Tests that async endpoints offload synchronous DataManager IO to a worker thread.

Root cause context: several `async def` routes called `data_manager.get_*` directly,
running cache-miss network IO on the event-loop thread and blocking the whole worker.
The fix wraps each call in `run_in_threadpool`. These tests pin that contract by
asserting the data method executes on a thread *other than* the event-loop thread.

Method validity (verified by probe, not assumed): under `TestClient`, the app event
loop runs on the pytest main thread (loop_id == main_id), and `run_in_threadpool`
dispatches to a distinct anyio worker thread (worker_id != loop_id). So:
  bare/inline call  -> thread id == main thread id   (BLOCKS the loop)
  offloaded call    -> thread id != main thread id   (does NOT block)

Targets are endpoints that return plain dicts (no strict response_model), so a small
synthetic frame round-trips to HTTP 200 without tripping response validation.
"""

import threading

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.main import app

HIST_PATCH = "backend.app.api.v1.endpoints.analysis.data_manager.get_historical_data"


def _history_frame(rows: int = 60):
    idx = pd.date_range("2026-01-01", periods=rows, freq="D")
    base = [10.0 + (i % 5) * 0.1 for i in range(rows)]
    return pd.DataFrame(
        {
            "open": base,
            "high": [b + 0.3 for b in base],
            "low": [b - 0.3 for b in base],
            "close": [b + 0.1 for b in base],
            "volume": [1000 + i for i in range(rows)],
        },
        index=idx,
    )


def _thread_capturing_fetch(captured: dict):
    def _fake(*args, **kwargs):
        captured["thread_id"] = threading.get_ident()
        return _history_frame()

    return _fake


@pytest.fixture
def client():
    return TestClient(app)


def test_sentiment_runs_data_fetch_off_event_loop(client, monkeypatch):
    """/analysis/sentiment must offload its data fetch to a worker thread."""
    main_thread_id = threading.get_ident()
    captured: dict = {}
    monkeypatch.setattr(HIST_PATCH, _thread_capturing_fetch(captured))

    resp = client.post("/analysis/sentiment", json={"symbol": "AAPL", "interval": "1d"})

    assert resp.status_code == 200
    assert captured.get("thread_id") is not None, "data fetch was never invoked"
    assert captured["thread_id"] != main_thread_id, (
        "data fetch ran on the event-loop thread (not offloaded)"
    )


def test_correlation_runs_data_fetch_off_event_loop(client, monkeypatch):
    """/analysis/correlation must offload its per-symbol data fetch to a worker thread."""
    main_thread_id = threading.get_ident()
    captured: dict = {}
    monkeypatch.setattr(HIST_PATCH, _thread_capturing_fetch(captured))

    resp = client.post(
        "/analysis/correlation",
        json={"symbols": ["AAPL", "MSFT"], "interval": "1d", "period_days": 90},
    )

    assert resp.status_code == 200
    assert captured.get("thread_id") is not None, "data fetch was never invoked"
    assert captured["thread_id"] != main_thread_id, (
        "data fetch ran on the event-loop thread (not offloaded)"
    )

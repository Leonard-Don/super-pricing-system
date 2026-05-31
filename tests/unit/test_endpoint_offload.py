"""Async endpoints must not run synchronous DataManager network IO on the event loop.

Root cause (independent audit P2/P4): several `async def` routes called
`data_manager.get_*` directly, so a cache-miss network fetch ran on the event-loop
thread and blocked the whole uvicorn worker; two routes additionally fetched N
symbols one-by-one (N+1) instead of using the concurrent batch helper.

Contract pinned here (version-independent — does not rely on TestClient thread
topology): the handler hands the blocking fetch to ``run_in_threadpool``. We spy
each endpoint module's ``run_in_threadpool`` and assert the *exact* patched fetch
callable was offloaded through it. For the two multi-symbol routes we additionally
assert ``get_multiple_stocks`` is called once (batch) and ``get_historical_data``
is never looped per symbol.
"""

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.main import app


def _history_frame(rows: int = 60, offset: float = 0.0):
    idx = pd.date_range("2026-01-01", periods=rows, freq="D")
    base = [10.0 + offset + (i % 7) * 0.13 + i * 0.01 for i in range(rows)]
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


def _spy_threadpool(monkeypatch, module):
    """Replace module.run_in_threadpool with a spy that records the offloaded
    callables and still forwards to the real implementation."""
    real = module.run_in_threadpool
    offloaded = []

    async def _spy(fn, *args, **kwargs):
        offloaded.append(fn)
        return await real(fn, *args, **kwargs)

    monkeypatch.setattr(module, "run_in_threadpool", _spy)
    return offloaded


@pytest.fixture
def client():
    return TestClient(app)


def test_market_data_offloads_fetch(client, monkeypatch):
    import backend.app.api.v1.endpoints.market_data as mod

    offloaded = _spy_threadpool(monkeypatch, mod)
    fake = lambda *a, **k: _history_frame()  # noqa: E731
    monkeypatch.setattr(mod.data_manager, "get_historical_data", fake)

    resp = client.post("/market-data/", json={"symbol": "AAPL", "interval": "1d"})

    assert resp.status_code == 200, resp.text
    assert fake in offloaded, "get_historical_data was not offloaded via run_in_threadpool"


def test_macro_factor_backtest_offloads_fetch(client, monkeypatch):
    import backend.app.api.v1.endpoints.macro as mod

    offloaded = _spy_threadpool(monkeypatch, mod)
    fake = lambda *a, **k: _history_frame()  # noqa: E731
    monkeypatch.setattr(mod._market_data_manager, "get_historical_data", fake)

    # unique benchmark avoids the response cache short-circuiting the fetch
    resp = client.get("/macro/factor-backtest", params={"benchmark": "ZZOFFLOAD", "period": "1y"})

    assert resp.status_code == 200, resp.text
    assert fake in offloaded, "benchmark fetch was not offloaded via run_in_threadpool"


def test_optimization_uses_batch_fetch_off_event_loop(client, monkeypatch):
    import backend.app.api.v1.endpoints.optimization as mod

    offloaded = _spy_threadpool(monkeypatch, mod)
    calls = {"batch": 0, "single": 0}

    def fake_batch(symbols, *args, **kwargs):
        calls["batch"] += 1
        return {s: _history_frame(offset=i * 1.7) for i, s in enumerate(symbols)}

    def fake_single(*args, **kwargs):
        calls["single"] += 1
        return _history_frame()

    monkeypatch.setattr(mod.data_manager, "get_multiple_stocks", fake_batch)
    monkeypatch.setattr(mod.data_manager, "get_historical_data", fake_single)

    resp = client.post(
        "/optimization/optimize",
        json={"symbols": ["AAPL", "MSFT", "GOOG"], "period": "1y", "objective": "max_sharpe"},
    )

    assert resp.status_code == 200, resp.text
    assert calls["batch"] == 1, "must fetch all symbols via one concurrent batch (no N+1)"
    assert calls["single"] == 0, "must not loop get_historical_data per symbol"
    assert fake_batch in offloaded, "batch fetch was not offloaded via run_in_threadpool"


def test_correlation_uses_batch_fetch_off_event_loop(client, monkeypatch):
    import backend.app.api.v1.endpoints.analysis._helpers as helpers
    import backend.app.api.v1.endpoints.analysis.correlation as mod

    offloaded = _spy_threadpool(monkeypatch, mod)
    calls = {"batch": 0, "single": 0}

    def fake_batch(symbols, *args, **kwargs):
        calls["batch"] += 1
        return {s: _history_frame(offset=i * 1.7) for i, s in enumerate(symbols)}

    def fake_single(*args, **kwargs):
        calls["single"] += 1
        return _history_frame()

    monkeypatch.setattr(helpers.data_manager, "get_multiple_stocks", fake_batch)
    monkeypatch.setattr(helpers.data_manager, "get_historical_data", fake_single)

    resp = client.post(
        "/analysis/correlation",
        json={"symbols": ["AAPL", "MSFT", "GOOG"], "period_days": 90},
    )

    assert resp.status_code == 200, resp.text
    assert calls["batch"] == 1, "must fetch all symbols via one concurrent batch (no N+1)"
    assert calls["single"] == 0, "must not loop get_historical_data per symbol"
    assert fake_batch in offloaded, "batch fetch was not offloaded via run_in_threadpool"

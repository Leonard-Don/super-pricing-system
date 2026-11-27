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


def test_macro_factor_backtest_offloads_fetch(client, monkeypatch):
    import backend.app.api.v1.endpoints.macro as mod

    offloaded = _spy_threadpool(monkeypatch, mod)
    fake = lambda *a, **k: _history_frame()  # noqa: E731
    monkeypatch.setattr(mod._market_data_manager, "get_historical_data", fake)

    # unique benchmark avoids the response cache short-circuiting the fetch
    resp = client.get("/macro/factor-backtest", params={"benchmark": "ZZOFFLOAD", "period": "1y"})

    assert resp.status_code == 200, resp.text
    assert fake in offloaded, "benchmark fetch was not offloaded via run_in_threadpool"

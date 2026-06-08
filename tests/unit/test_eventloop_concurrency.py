"""Integration test: event loop stays responsive under a concurrent request burst.

Regression guard for the class of bug shipped in PR #107: a heavy sync handler
running ON the event loop (i.e. declared ``async def`` when it should be plain
``def``) would stall every other in-flight request for the duration of the slow
call.  The fix was to keep heavy handlers as sync ``def`` so FastAPI runs them in
the default threadpool, leaving the event loop free.

This test proves the invariant at runtime rather than relying on inspect-based
static checks:

1.  A fake slow manager is injected into ``alt_data._get_manager`` so that
    ``GET /alt-data/snapshot`` deterministically takes ~1 s (``time.sleep(1.0)``
    inside a plain sync function — the same profile as real blocking I/O in a
    sync ``def`` handler that FastAPI offloads to the threadpool).

2.  ``asyncio.gather`` fires N (4) slow requests plus 1 cheap health request
    concurrently.  We measure:
    - ``health_elapsed``: wall-time for ``GET /health`` to return.
    - ``total_elapsed``: wall-time for ALL N+1 requests to finish.

3.  Assertions (generous margins for CI):
    - ``health_elapsed < 0.7 s``  — loop was NOT blocked while slow handlers ran.
    - ``total_elapsed < 2.5 s``   — all N slow requests ran concurrently, not
      serially (serial sum would be ~4 s; threadpool concurrency squeezes it to
      ~1 s plus overhead).

If the handler were ever changed back to ``async def``, the ``time.sleep(1.0)``
would block the event loop and the health request would NOT return until after the
first slow coroutine completed (~1 s), failing the first assertion.  The total
would also balloon to ≈N seconds (serial), failing the second.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any
from unittest.mock import MagicMock

import httpx
import pytest

from backend.app.api.v1.endpoints import alt_data as _alt_data_mod
from backend.main import app

# ---------------------------------------------------------------------------
# Slow fake manager
# ---------------------------------------------------------------------------

_SLEEP_DURATION = 1.0  # seconds — the simulated blocking work in the threadpool


class _SlowManager:
    """Minimal stand-in for AltDataManager; get_dashboard_snapshot sleeps."""

    def get_dashboard_snapshot(self, refresh: bool = False) -> dict[str, Any]:  # noqa: D401
        time.sleep(_SLEEP_DURATION)
        return {
            "snapshot_timestamp": "2026-01-01T00:00:00",
            "signals": {},
            "providers": {},
            "refresh_status": {},
            "staleness": {},
            "provider_health": {},
            "source_mode_summary": {},
        }

    # Provide stub implementations for any other attribute the endpoint might
    # access at module-load time or during teardown.
    def __getattr__(self, item: str):  # type: ignore[override]
        return MagicMock()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _timed_get(client: httpx.AsyncClient, url: str) -> float:
    """Return the wall-clock seconds taken to complete a GET request."""
    t0 = time.perf_counter()
    resp = await client.get(url)
    elapsed = time.perf_counter() - t0
    # Raise on HTTP errors so test failures are obvious.
    assert resp.status_code == 200, (
        f"Unexpected {resp.status_code} for {url}: {resp.text[:200]}"
    )
    return elapsed


# ---------------------------------------------------------------------------
# The test
# ---------------------------------------------------------------------------

async def test_event_loop_stays_free_under_slow_sync_handler_burst(monkeypatch):
    """Health endpoint returns quickly while N slow sync-def handlers run concurrently.

    This is the runtime regression guard for PR #107: if a handler is sync ``def``
    FastAPI offloads it to the threadpool and the event loop remains free, so a
    cheap ``/health`` request flying alongside N slow ones still returns in well
    under 1 s.
    """

    # Inject the slow fake manager into the alt-data endpoint module.
    # _get_manager() is the indirection point the existing tests also use for
    # patching (see test_alt_data_endpoint.py and test_alt_data_health.py).
    slow_mgr = _SlowManager()
    monkeypatch.setattr(_alt_data_mod, "_get_manager", lambda: slow_mgr)

    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        N_SLOW = 4

        t_wall_start = time.perf_counter()

        # Fire all requests concurrently and capture individual timings.
        results = await asyncio.gather(
            *[_timed_get(client, "/alt-data/snapshot") for _ in range(N_SLOW)],
            _timed_get(client, "/health"),
        )

        total_elapsed = time.perf_counter() - t_wall_start

    # The last item in results corresponds to _timed_get(client, "/health").
    health_elapsed = results[-1]

    # ------------------------------------------------------------------
    # Assertion 1: the event loop was NOT blocked.
    #
    # If the handler ran on the event loop (``async def`` + ``time.sleep``),
    # the very first coroutine would block the loop for ~1 s before the health
    # request could even be dispatched.  With proper threadpool offload the
    # event loop stays free and health returns almost immediately.
    #
    # Margin: 0.7 s is generous enough for slow CI boxes while still being well
    # below the 1 s sleep that would guarantee failure in the broken case.
    # ------------------------------------------------------------------
    assert health_elapsed < 0.7, (
        f"Event loop appears blocked: /health took {health_elapsed:.3f} s while "
        f"{N_SLOW} slow handlers were in flight. Expected < 0.7 s. "
        "This typically means a heavy handler was accidentally changed to "
        "``async def`` (blocking the event loop) instead of staying ``def`` "
        "(offloaded to the threadpool)."
    )

    # ------------------------------------------------------------------
    # Assertion 2: the N slow requests ran concurrently (threadpool), not
    # serially.
    #
    # Serial execution would take ≈ N × 1 s = 4 s.
    # Concurrent threadpool execution takes ≈ 1 s (all N run in parallel).
    # We allow up to 2.5 s for overhead on a heavily loaded CI machine.
    # ------------------------------------------------------------------
    assert total_elapsed < 2.5, (
        f"Slow handlers appear to have run serially: total wall-clock was "
        f"{total_elapsed:.3f} s for {N_SLOW} × {_SLEEP_DURATION} s tasks. "
        f"Expected < 2.5 s (concurrent). Serial sum would be "
        f"~{N_SLOW * _SLEEP_DURATION:.1f} s."
    )

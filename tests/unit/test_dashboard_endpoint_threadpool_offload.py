"""Guard: the heavy dashboard endpoints stay sync `def` so FastAPI offloads them.

Root cause (debugging session 2026-06-07): `get_macro_overview` and
`get_alt_data_snapshot` were `async def` but did CPU-heavy / blocking work
(`compute_all`, the `build_*` helpers, blocking provider fetches) directly in the
event loop. Under the research-workbench's concurrent request burst this froze the
loop, so other requests stalled and the frontend hit its 45s timeout.

FastAPI runs a *sync* `def` path operation in its worker threadpool (off the event
loop), so these must remain plain `def`. This test fails if someone re-adds `async`.
"""

from __future__ import annotations

import inspect

from backend.app.api.v1.endpoints.alt_data import get_alt_data_snapshot
from backend.app.api.v1.endpoints.credibility import (
    get_macro_credibility,
    get_pricing_credibility,
    get_screener_credibility,
)
from backend.app.api.v1.endpoints.events import get_events_summary
from backend.app.api.v1.endpoints.infrastructure.routes import get_infrastructure_status
from backend.app.api.v1.endpoints.macro import get_macro_overview
from backend.app.api.v1.endpoints.research_workbench import (
    get_research_briefing_distribution,
    get_research_task_stats,
    list_alt_data_candidates,
    list_research_tasks,
)
from backend.app.api.v1.endpoints.analysis.risk_and_peers import (
    get_industry_comparison,
    get_risk_metrics,
)
from backend.app.api.v1.endpoints.analysis.routes import (
    analyze_fundamental,
    analyze_volume_price,
    get_technical_indicators,
)


def test_macro_overview_is_sync_def_for_threadpool_offload():
    assert not inspect.iscoroutinefunction(get_macro_overview), (
        "get_macro_overview must stay a sync `def` so FastAPI runs its blocking body "
        "in the threadpool instead of freezing the event loop."
    )


def test_alt_data_snapshot_is_sync_def_for_threadpool_offload():
    assert not inspect.iscoroutinefunction(get_alt_data_snapshot), (
        "get_alt_data_snapshot must stay a sync `def` so a slow provider fetch never "
        "blocks the event loop."
    )


def test_workbench_load_endpoints_are_sync_def_for_threadpool_offload():
    # The research-workbench page fires these concurrently on load; each does blocking
    # store I/O, and infra/status does ~10s cold infra probes. They must stay sync `def`
    # so FastAPI runs them in the threadpool — a blocked event loop would also stall the
    # already-offloaded macro/alt-data handlers it can no longer dispatch.
    for fn in (
        list_research_tasks,
        get_research_task_stats,
        get_research_briefing_distribution,
        list_alt_data_candidates,
        get_infrastructure_status,
    ):
        assert not inspect.iscoroutinefunction(fn), (
            f"{fn.__name__} must stay a sync `def` for threadpool offload."
        )


def test_credibility_endpoints_are_sync_def_for_threadpool_offload():
    """The three credibility handlers read files and run metric computation —
    blocking work. They must remain plain `def` so FastAPI offloads them to the
    threadpool rather than running them on the event loop."""
    for fn in (get_pricing_credibility, get_macro_credibility, get_screener_credibility):
        assert not inspect.iscoroutinefunction(fn), (
            f"{fn.__name__} must stay a sync `def` for threadpool offload."
        )


def test_events_summary_is_sync_def_for_threadpool_offload():
    """get_events_summary makes 3 sequential blocking yfinance calls
    (calendar / dividends / news). Must be a plain `def` so FastAPI
    runs it in the threadpool rather than stalling the event loop."""
    assert not inspect.iscoroutinefunction(get_events_summary), (
        "get_events_summary must be a sync `def` for threadpool offload."
    )


def test_risk_and_peer_endpoints_are_sync_def_for_threadpool_offload():
    """get_industry_comparison (up to 6 fundamental fetches) and
    get_risk_metrics (2 historical-data fetches + pandas compute) are
    pure blocking work with no awaitable dependencies. They must be
    plain `def` so FastAPI runs them in the threadpool."""
    for fn in (get_industry_comparison, get_risk_metrics):
        assert not inspect.iscoroutinefunction(fn), (
            f"{fn.__name__} must be a sync `def` for threadpool offload."
        )


def test_analysis_heavy_endpoints_are_sync_def_for_threadpool_offload():
    """analyze_fundamental, analyze_volume_price, and get_technical_indicators
    each do a blocking data fetch + compute with no awaitable dependencies.
    They must be plain `def` so FastAPI offloads them to the threadpool."""
    for fn in (analyze_fundamental, analyze_volume_price, get_technical_indicators):
        assert not inspect.iscoroutinefunction(fn), (
            f"{fn.__name__} must be a sync `def` for threadpool offload."
        )

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
from backend.app.api.v1.endpoints.macro import get_macro_overview


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

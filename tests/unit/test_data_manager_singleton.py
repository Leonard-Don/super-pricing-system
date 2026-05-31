"""The default DataManager must be a process-wide singleton (independent audit M3/PERF4).

~18 modules each constructed `DataManager()`, giving each its own in-memory cache
and a 10-worker ThreadPoolExecutor (~180 idle threads) and fragmenting the
historical-data cache. They must now share one instance via get_data_manager().
"""

from __future__ import annotations

from src.data.data_manager import DataManager, get_data_manager


def test_get_data_manager_returns_singleton():
    assert get_data_manager() is get_data_manager()
    assert isinstance(get_data_manager(), DataManager)


def test_endpoint_modules_share_the_singleton():
    import backend.app.api.v1.endpoints.market_data as market_data
    import backend.app.api.v1.endpoints.optimization as optimization
    from backend.app.api.v1.endpoints.analysis import _helpers as analysis_helpers

    shared = get_data_manager()
    assert market_data.data_manager is shared
    assert optimization.data_manager is shared
    assert analysis_helpers.data_manager is shared
    # ...and therefore the same object as each other (one cache, one thread pool)
    assert market_data.data_manager is optimization.data_manager


def test_macro_modules_share_the_singleton():
    import backend.app.api.v1.endpoints.macro as macro
    import backend.app.api.v1.endpoints.macro_support as macro_support

    shared = get_data_manager()
    assert macro._market_data_manager is shared
    assert macro_support._market_data_manager is shared

import time

from backend.app.core.bounded_cache import BoundedTTLCache


def test_bounded_cache_evicts_oldest_entry_when_capacity_is_exceeded():
    cache = BoundedTTLCache(maxsize=2)

    cache["a"] = {"value": 1, "ts": time.time()}
    cache["b"] = {"value": 2, "ts": time.time()}
    cache["c"] = {"value": 3, "ts": time.time()}

    assert cache.get("a") is None
    assert cache.get("b")["value"] == 2
    assert cache.get("c")["value"] == 3
    assert len(cache) == 2


def test_bounded_cache_get_promotes_recent_entry_for_lru_eviction():
    cache = BoundedTTLCache(maxsize=2)

    cache["a"] = {"value": 1, "ts": time.time()}
    cache["b"] = {"value": 2, "ts": time.time()}
    assert cache.get("a")["value"] == 1

    cache["c"] = {"value": 3, "ts": time.time()}

    assert cache.get("b") is None
    assert cache.get("a")["value"] == 1
    assert cache.get("c")["value"] == 3


def test_bounded_cache_prunes_entries_past_hard_ttl():
    now = time.time()
    cache = BoundedTTLCache(
        maxsize=4,
        max_age_seconds=30,
        timestamp_getter=lambda entry: entry.get("ts"),
    )

    cache["expired"] = {"value": 1, "ts": now - 60}
    cache["fresh"] = {"value": 2, "ts": now}

    assert cache.get("expired") is None
    assert cache.get("fresh")["value"] == 2
    assert len(cache) == 1

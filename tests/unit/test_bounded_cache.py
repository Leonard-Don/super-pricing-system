import time

import pytest

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


@pytest.mark.parametrize("bad_size", [0, -1, -100])
def test_bounded_cache_rejects_maxsize_below_one(bad_size):
    with pytest.raises(ValueError, match="maxsize"):
        BoundedTTLCache(maxsize=bad_size)


def test_bounded_cache_get_returns_explicit_default_for_missing_key():
    cache = BoundedTTLCache(maxsize=2)
    sentinel = object()

    assert cache.get("missing", sentinel) is sentinel


def test_bounded_cache_pop_returns_default_for_missing_key():
    cache = BoundedTTLCache(maxsize=2)
    sentinel = object()

    assert cache.pop("missing", sentinel) is sentinel


def test_bounded_cache_pop_removes_and_returns_existing_value():
    cache = BoundedTTLCache(maxsize=2)
    cache["a"] = {"value": 1, "ts": time.time()}

    assert cache.pop("a")["value"] == 1
    assert "a" not in cache
    assert len(cache) == 0


def test_bounded_cache_contains_prunes_expired_entries():
    now = time.time()
    cache = BoundedTTLCache(
        maxsize=4,
        max_age_seconds=30,
        timestamp_getter=lambda entry: entry.get("ts"),
    )

    cache["stale"] = {"value": 1, "ts": now - 90}
    cache["fresh"] = {"value": 2, "ts": now}

    assert "stale" not in cache
    assert "fresh" in cache


def test_bounded_cache_len_prunes_expired_entries():
    now = time.time()
    cache = BoundedTTLCache(
        maxsize=4,
        max_age_seconds=30,
        timestamp_getter=lambda entry: entry.get("ts"),
    )

    cache["stale_one"] = {"value": 1, "ts": now - 200}
    cache["stale_two"] = {"value": 2, "ts": now - 200}
    cache["fresh"] = {"value": 3, "ts": now}

    assert len(cache) == 1


def test_bounded_cache_ignores_timestamp_getter_exceptions():
    now = time.time()

    def boom(_value):
        raise RuntimeError("boom")

    cache = BoundedTTLCache(
        maxsize=2,
        max_age_seconds=30,
        timestamp_getter=boom,
    )
    cache["a"] = {"value": 1, "ts": now - 9999}

    assert cache.get("a")["value"] == 1
    assert "a" in cache
    assert len(cache) == 1


def test_bounded_cache_ignores_non_numeric_timestamps():
    cache = BoundedTTLCache(
        maxsize=2,
        max_age_seconds=30,
        timestamp_getter=lambda entry: entry.get("ts"),
    )

    cache["string_ts"] = {"value": 1, "ts": "not-a-number"}
    cache["none_ts"] = {"value": 2, "ts": None}

    assert cache.get("string_ts")["value"] == 1
    assert cache.get("none_ts")["value"] == 2
    assert len(cache) == 2


def test_bounded_cache_setitem_update_promotes_existing_key_to_mru():
    cache = BoundedTTLCache(maxsize=2)
    cache["a"] = {"value": 1, "ts": time.time()}
    cache["b"] = {"value": 2, "ts": time.time()}

    cache["a"] = {"value": 11, "ts": time.time()}
    cache["c"] = {"value": 3, "ts": time.time()}

    assert cache.get("a")["value"] == 11
    assert cache.get("b") is None
    assert cache.get("c")["value"] == 3

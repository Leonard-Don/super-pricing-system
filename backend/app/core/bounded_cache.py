"""Bounded in-memory caches with optional age-based eviction."""

from __future__ import annotations

import threading
import time
from collections import OrderedDict
from typing import Callable, Generic, Optional, TypeVar

K = TypeVar("K")
V = TypeVar("V")


class BoundedTTLCache(Generic[K, V]):
    """A small thread-safe LRU cache with optional hard-expiry pruning."""

    def __init__(
        self,
        *,
        maxsize: int,
        max_age_seconds: Optional[float] = None,
        timestamp_getter: Optional[Callable[[V], Optional[float]]] = None,
    ) -> None:
        if maxsize < 1:
            raise ValueError("maxsize must be >= 1")
        self.maxsize = int(maxsize)
        self.max_age_seconds = max_age_seconds if max_age_seconds and max_age_seconds > 0 else None
        self.timestamp_getter = timestamp_getter
        self._store: "OrderedDict[K, V]" = OrderedDict()
        self._lock = threading.RLock()

    def _entry_timestamp(self, value: V) -> Optional[float]:
        if self.timestamp_getter is None:
            return None
        try:
            timestamp = self.timestamp_getter(value)
        except Exception:
            return None
        if timestamp is None:
            return None
        try:
            return float(timestamp)
        except (TypeError, ValueError):
            return None

    def _is_expired(self, value: V, now: Optional[float] = None) -> bool:
        if self.max_age_seconds is None:
            return False
        timestamp = self._entry_timestamp(value)
        if timestamp is None:
            return False
        now_value = now if now is not None else time.time()
        return (now_value - timestamp) > self.max_age_seconds

    def _prune_expired_locked(self, now: Optional[float] = None) -> None:
        if self.max_age_seconds is None or not self._store:
            return
        now_value = now if now is not None else time.time()
        expired_keys = [
            key
            for key, value in self._store.items()
            if self._is_expired(value, now=now_value)
        ]
        for key in expired_keys:
            self._store.pop(key, None)

    def get(self, key: K, default: Optional[V] = None) -> Optional[V]:
        with self._lock:
            self._prune_expired_locked()
            if key not in self._store:
                return default
            value = self._store.pop(key)
            self._store[key] = value
            return value

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    def pop(self, key: K, default: Optional[V] = None) -> Optional[V]:
        with self._lock:
            return self._store.pop(key, default)

    def __contains__(self, key: object) -> bool:
        with self._lock:
            self._prune_expired_locked()
            return key in self._store

    def __len__(self) -> int:
        with self._lock:
            self._prune_expired_locked()
            return len(self._store)

    def __setitem__(self, key: K, value: V) -> None:
        with self._lock:
            self._prune_expired_locked()
            if key in self._store:
                self._store.pop(key, None)
            self._store[key] = value
            while len(self._store) > self.maxsize:
                self._store.popitem(last=False)


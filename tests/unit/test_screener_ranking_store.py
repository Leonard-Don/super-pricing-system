"""Tests for ScreenerRankingStore — TDD, concurrency-safe."""
from __future__ import annotations

import threading

from backend.app.services.screener_ranking_store import ScreenerRankingStore


def test_append_and_list(tmp_path):
    s = ScreenerRankingStore(storage_path=tmp_path / "rankings.json")
    s.append_ranking({"snapshot_timestamp": "2026-06-08T00:00:00", "rankings": [{"symbol": "AAPL", "score": 0.5}]})
    rows = s.list_rankings(limit=10)
    assert len(rows) == 1 and rows[0]["rankings"][0]["symbol"] == "AAPL"


def test_concurrent_appends_do_not_corrupt(tmp_path):
    s = ScreenerRankingStore(storage_path=tmp_path / "r.json")

    def worker(i):
        s.append_ranking({"snapshot_timestamp": f"2026-06-08T00:00:{i:02d}", "rankings": []})

    ts = [threading.Thread(target=worker, args=(i,)) for i in range(20)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert len(s.list_rankings(limit=100)) == 20

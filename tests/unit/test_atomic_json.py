"""Atomic JSON store writes — durability guard.

Regression cover for the hardening pass: a crash mid-write must never truncate a
store into oblivion (the old write_text/json.dump path could, and _load then silently
reset to []).
"""
import json

from src.utils.atomic_json import atomic_write_json


def test_atomic_write_json_roundtrip(tmp_path):
    p = tmp_path / "x.json"
    atomic_write_json(p, [{"a": 1}], indent=2)
    assert json.loads(p.read_text()) == [{"a": 1}]


def test_atomic_write_json_leaves_no_temp_files(tmp_path):
    p = tmp_path / "x.json"
    atomic_write_json(p, {"k": "v"})
    assert sorted(f.name for f in tmp_path.iterdir()) == ["x.json"]


def test_atomic_write_json_overwrite_stays_valid(tmp_path):
    p = tmp_path / "x.json"
    atomic_write_json(p, {"v": 1})
    atomic_write_json(p, {"v": 2})
    assert json.loads(p.read_text()) == {"v": 2}


def test_screener_store_survives_leftover_temp_from_crashed_write(tmp_path):
    # A truncated temp file (as a crashed atomic write would leave) must NOT affect
    # the committed store — the reader only ever sees the os.replace'd target.
    from backend.app.services.screener_ranking_store import ScreenerRankingStore

    store = ScreenerRankingStore(storage_path=tmp_path / "r.json")
    store.append_ranking({"snapshot_timestamp": "t1", "rankings": [{"symbol": "AAPL", "score": 0.5}]})
    (tmp_path / ".r.json.crash.tmp").write_text("{ truncated json")  # simulate crash debris
    rows = store.list_rankings()
    assert len(rows) == 1 and rows[0]["rankings"][0]["symbol"] == "AAPL"

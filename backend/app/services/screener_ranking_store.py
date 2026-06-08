"""Point-in-time screener ranking snapshots (JSON, RLock-guarded)."""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any, Dict, List

from src.utils.atomic_json import atomic_write_json


class ScreenerRankingStore:
    def __init__(self, storage_path: str | Path, max_records: int = 500):
        self._path = Path(storage_path)
        self._max = max_records
        self._lock = threading.RLock()
        self._path.parent.mkdir(parents=True, exist_ok=True)

    def _load(self) -> List[Dict[str, Any]]:
        if not self._path.exists():
            return []
        try:
            return json.loads(self._path.read_text() or "[]")
        except (json.JSONDecodeError, OSError):
            return []

    def append_ranking(self, snapshot: Dict[str, Any]) -> None:
        with self._lock:
            data = self._load()
            data.append(snapshot)
            data = data[-self._max:]
            atomic_write_json(self._path, data)  # tmp + os.replace → crash-safe

    def list_rankings(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._lock:
            return self._load()[-limit:]

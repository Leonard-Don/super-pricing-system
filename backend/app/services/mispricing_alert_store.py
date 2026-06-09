"""Per-profile mispricing-alert rule + fire history (atomic JSON, RLock-guarded).

Mirrors the realtime-alerts profile-file pattern, with atomic writes (src.utils.atomic_json)
so a crash mid-write can't corrupt the store. A rule is DISABLED by default (safety:
no auto-firing until the user opts in).
"""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

from src.utils.atomic_json import atomic_write_json
from src.utils.config import PROJECT_ROOT

DEFAULT_RULE: Dict[str, Any] = {
    "enabled": False,
    "threshold_pct": 20.0,
    "direction": "both",
    "min_confidence": 0.5,
    "cooldown_hours": 24.0,
    "channels": [],
}
VALID_DIRECTIONS = {"under", "over", "both"}


class MispricingAlertStore:
    def __init__(self, storage_path: str | Path | None = None):
        self.storage_path = Path(storage_path or PROJECT_ROOT / "data" / "mispricing_alerts")
        self.storage_path.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()

    def _file(self, profile_id: Optional[str]) -> Path:
        pid = (str(profile_id).strip().lower() if profile_id else "default") or "default"
        return self.storage_path / f"{pid}.json"

    def _empty(self) -> Dict[str, Any]:
        return {"rule": dict(DEFAULT_RULE), "last_fired": {}, "history": []}

    def _load(self, profile_id: Optional[str]) -> Dict[str, Any]:
        path = self._file(profile_id)
        if not path.exists():
            return self._empty()
        try:
            data = json.loads(path.read_text() or "{}")
        except (json.JSONDecodeError, OSError):
            return self._empty()
        return {
            "rule": {**DEFAULT_RULE, **(data.get("rule") or {})},
            "last_fired": data.get("last_fired") or {},
            "history": data.get("history") or [],
        }

    def _normalize_rule(self, rule: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        rule = rule or {}
        direction = str(rule.get("direction", "both") or "both")
        if direction not in VALID_DIRECTIONS:
            direction = "both"
        return {
            "enabled": bool(rule.get("enabled", False)),
            "threshold_pct": abs(float(rule.get("threshold_pct", DEFAULT_RULE["threshold_pct"]) or 0)),
            "direction": direction,
            "min_confidence": max(0.0, min(1.0, float(rule.get("min_confidence", DEFAULT_RULE["min_confidence"]) or 0))),
            "cooldown_hours": max(0.0, float(rule.get("cooldown_hours", DEFAULT_RULE["cooldown_hours"]) or 0)),
            "channels": [str(c) for c in (rule.get("channels") or []) if c],
        }

    def get_rule(self, profile_id: Optional[str] = None) -> Dict[str, Any]:
        with self._lock:
            return self._load(profile_id)["rule"]

    def set_rule(self, rule: Dict[str, Any], profile_id: Optional[str] = None) -> Dict[str, Any]:
        with self._lock:
            data = self._load(profile_id)
            data["rule"] = self._normalize_rule(rule)
            atomic_write_json(self._file(profile_id), data, indent=2)
            return data["rule"]

    def get_last_fired(self, profile_id: Optional[str] = None) -> Dict[str, Any]:
        with self._lock:
            return self._load(profile_id)["last_fired"]

    def get_history(self, profile_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        with self._lock:
            return self._load(profile_id)["history"][-limit:]

    def record_fire(self, fire: Dict[str, Any], when_iso: str, profile_id: Optional[str] = None) -> None:
        with self._lock:
            data = self._load(profile_id)
            data["last_fired"][fire["symbol"]] = when_iso
            data["history"] = (data["history"] + [{**fire, "fired_at": when_iso}])[-200:]
            atomic_write_json(self._file(profile_id), data, indent=2)


mispricing_alert_store = MispricingAlertStore()

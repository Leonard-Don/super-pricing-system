"""Proactive mispricing-alert endpoints (Tier 3, PR-1: eval core, NO auto-send).

Sync `def` handlers (FastAPI threadpool — the evaluate path does blocking per-symbol
analysis). Reuses the existing watchlist (realtime_preferences.symbols) + the pricing
analyzer. `evaluate` is a DRY-RUN: it computes what WOULD fire and never sends.

PR-2: the watchlist+analyzer helpers are now in
`backend.app.services.mispricing_alert_readings` (shared with the scheduler).
The seams below delegate to that module so existing tests can still monkeypatch
`_get_watchlist` / `_get_analyzer` at the *endpoint* level without coupling to
scheduler internals.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from backend.app.services.mispricing_alert_evaluator import evaluate_mispricing_alerts
from backend.app.services.mispricing_alert_store import mispricing_alert_store
import backend.app.services.mispricing_alert_readings as _readings_mod

logger = logging.getLogger(__name__)
router = APIRouter()


class MispricingRuleRequest(BaseModel):
    enabled: bool = False
    threshold_pct: float = 20.0
    direction: str = "both"
    min_confidence: float = 0.5
    cooldown_hours: float = 24.0
    channels: List[str] = []


# ── seams (monkeypatch-friendly) ──────────────────────────────────────────────
def _get_store():
    return mispricing_alert_store


def _get_watchlist(profile_id: Optional[str]) -> List[str]:
    """Delegate to the shared readings module (monkeypatch-friendly seam)."""
    return _readings_mod._get_watchlist(profile_id)


def _get_analyzer():
    """Delegate to the shared readings module (monkeypatch-friendly seam)."""
    return _readings_mod._get_analyzer()


def _confidence_from_valuation(valuation: Dict[str, Any]) -> Optional[float]:
    """Delegate to the shared readings module."""
    return _readings_mod._confidence_from_valuation(valuation)


def _reading_for_symbol(analyzer: Any, symbol: str) -> Optional[Dict[str, Any]]:
    """Delegate to the shared readings module."""
    return _readings_mod._reading_for_symbol(analyzer, symbol)


# ── endpoints ─────────────────────────────────────────────────────────────────
@router.get("/mispricing/rule", summary="获取错价告警规则")
def get_mispricing_rule(profile_id: Optional[str] = None):
    return _get_store().get_rule(profile_id)


@router.put("/mispricing/rule", summary="保存错价告警规则")
def set_mispricing_rule(rule: MispricingRuleRequest, profile_id: Optional[str] = None):
    return _get_store().set_rule(rule.model_dump(), profile_id)


@router.get("/mispricing/history", summary="错价告警触发历史")
def get_mispricing_history(profile_id: Optional[str] = None, limit: int = 50):
    return {"history": _get_store().get_history(profile_id, limit=limit)}


@router.post("/mispricing/evaluate", summary="错价告警 dry-run(只算不外发)")
def evaluate_mispricing(profile_id: Optional[str] = None):
    """DRY-RUN: evaluate the watchlist against the rule NOW and return would-fire.
    Never sends a notification (PR-1). Evaluates regardless of rule.enabled so users
    can test thresholds."""
    try:
        store = _get_store()
        rule = store.get_rule(profile_id)
        symbols = _get_watchlist(profile_id)
        if not symbols:
            return {"status": "empty_watchlist", "rule": rule, "evaluated": 0, "would_fire": []}
        analyzer = _get_analyzer()
        readings = [r for r in (_reading_for_symbol(analyzer, s) for s in symbols) if r is not None]
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        fires = evaluate_mispricing_alerts(rule, readings, store.get_last_fired(profile_id), now)
        return {"status": "ok", "rule": rule, "evaluated": len(readings), "would_fire": fires}
    except Exception as exc:
        logger.error("evaluate_mispricing error: %s", exc, exc_info=True)
        return {"status": "error", "message": "Mispricing evaluation failed."}

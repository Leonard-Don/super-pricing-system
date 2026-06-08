"""Tests for credibility endpoints — sync-def smoke + shape + sync guard."""
from __future__ import annotations

import inspect
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import credibility


def _build_client(monkeypatch, tmp_path):
    """Build a minimal FastAPI app with only the credibility router mounted."""
    mini_app = FastAPI()
    mini_app.include_router(credibility.router, prefix="/credibility")

    # Patch the valuation history root so reads return empty (no network)
    monkeypatch.setattr(credibility, "_get_valuation_history_root", lambda: tmp_path / "quant_lab")

    # Patch the market data manager to return an empty DataFrame
    import pandas as pd

    monkeypatch.setattr(credibility, "_get_market_data_manager", lambda: _FakeDataManager())

    # Patch the screener ranking store
    from backend.app.services.screener_ranking_store import ScreenerRankingStore
    store = ScreenerRankingStore(storage_path=tmp_path / "rankings.json")
    monkeypatch.setattr(credibility, "_get_screener_ranking_store", lambda: store)

    # Patch the macro score snapshots (benchmark closes come from the fake DM → empty)
    monkeypatch.setattr(credibility, "_get_macro_snapshots", lambda limit=250: [
        {"snapshot_timestamp": "2026-01-01T00:00:00", "macro_score": 0.05, "confidence": 0.6},
    ])

    return TestClient(mini_app)


class _FakeDataManager:
    def get_historical_data(self, symbol, period="2y", interval="1d"):
        import pandas as pd
        return pd.DataFrame()


def test_pricing_signal_credibility_returns_shape(monkeypatch, tmp_path):
    client = _build_client(monkeypatch, tmp_path)
    r = client.get("/credibility/pricing?symbol=AAPL&horizons=5,20")
    assert r.status_code == 200
    body = r.json()
    assert "horizons" in body and "since_date" in body


def test_screener_credibility_accumulating_when_empty(monkeypatch, tmp_path):
    client = _build_client(monkeypatch, tmp_path)
    r = client.get("/credibility/screener")
    assert r.status_code == 200


def test_macro_credibility_returns_unified_envelope(monkeypatch, tmp_path):
    client = _build_client(monkeypatch, tmp_path)
    r = client.get("/credibility/macro")
    assert r.status_code == 200
    body = r.json()
    assert "horizons" in body and "since_date" in body and body.get("benchmark") == "SPY"


def test_screener_credibility_never_fabricates_spread(monkeypatch, tmp_path):
    client = _build_client(monkeypatch, tmp_path)
    r = client.get("/credibility/screener")
    assert r.status_code == 200
    body = r.json()
    # Honest: capture-only until real per-symbol forward-return alignment exists.
    assert body["status"] == "accumulating"
    assert "quantile_spread" not in body


def test_credibility_endpoints_are_sync_def():
    assert not inspect.iscoroutinefunction(credibility.get_pricing_credibility)
    assert not inspect.iscoroutinefunction(credibility.get_macro_credibility)
    assert not inspect.iscoroutinefunction(credibility.get_screener_credibility)

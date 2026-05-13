from __future__ import annotations

import pandas as pd
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import market_data


def _client_for(router, prefix: str) -> TestClient:
    app = FastAPI()
    app.include_router(router, prefix=prefix)
    return TestClient(app)


def test_market_data_success_uses_frame_scoped_source_health(monkeypatch):
    class StaticDataManager:
        def get_historical_data(self, **kwargs):
            data = pd.DataFrame(
                {"close": [100.0]},
                index=pd.date_range("2024-01-01", periods=1),
            )
            data.attrs["source_health"] = {
                "status": "success",
                "selected_source": f"frame_{kwargs['symbol']}",
                "attempts": [{"id": "ready", "ok": True}],
            }
            return data

        def get_last_fetch_source_health(self):
            return {"status": "success", "selected_source": "stale_global"}

    monkeypatch.setattr(market_data, "data_manager", StaticDataManager())
    client = _client_for(market_data.router, "/market-data")

    response = client.post("/market-data/", json={"symbol": "AAPL"})

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["source_health"]["selected_source"] == "frame_AAPL"
    assert payload["source_health"]["selected_source"] != "stale_global"


def test_market_data_sources_health_endpoint_uses_normalized_report(monkeypatch):
    class StaticDataManager:
        def get_source_health_report(self):
            return {
                "fallback_enabled": True,
                "sources": [{"id": "ready", "status": "ready", "ok": True}],
            }

    monkeypatch.setattr(market_data, "data_manager", StaticDataManager())
    client = _client_for(market_data.router, "/market-data")

    response = client.get("/market-data/sources/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["sources"][0]["id"] == "ready"


def test_market_data_success_omits_stale_global_source_health_without_frame_attrs(monkeypatch):
    class StaticDataManager:
        def get_historical_data(self, **kwargs):
            return pd.DataFrame(
                {"close": [100.0]},
                index=pd.date_range("2024-01-01", periods=1),
            )

        def get_last_fetch_source_health(self):
            return {"status": "success", "selected_source": "stale_global"}

    monkeypatch.setattr(market_data, "data_manager", StaticDataManager())
    client = _client_for(market_data.router, "/market-data")

    response = client.post("/market-data/", json={"symbol": "AAPL"})

    assert response.status_code == 200
    assert response.json()["data"]["source_health"] == {}

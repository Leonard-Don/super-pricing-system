from fastapi import FastAPI
from fastapi.testclient import TestClient

import backend.app.api.v1.endpoints.quant_lab as quant_lab_endpoint


def _build_client():
    app = FastAPI()
    app.include_router(quant_lab_endpoint.router, prefix="/quant-lab")
    return TestClient(app)


def test_quant_lab_sync_endpoints_run_inside_to_thread(monkeypatch):
    client = _build_client()
    to_thread_calls = []

    async def fake_to_thread(func, *args, **kwargs):
        to_thread_calls.append({"func": func, "args": args, "kwargs": kwargs})
        return func(*args, **kwargs)

    monkeypatch.setattr(quant_lab_endpoint.asyncio, "to_thread", fake_to_thread)

    cases = [
        ("post", "/quant-lab/optimizer", "optimize_strategy", {"symbol": "AAPL", "strategy": "moving_average"}),
        ("post", "/quant-lab/risk-center", "analyze_risk_center", {"symbols": ["AAPL"]}),
        ("get", "/quant-lab/trading-journal?profile_id=desk-a", "get_trading_journal", None),
        ("put", "/quant-lab/trading-journal?profile_id=desk-a", "update_trading_journal", {"notes": {}, "strategy_lifecycle": []}),
        ("get", "/quant-lab/alerts?profile_id=desk-a", "get_alert_orchestration", None),
        ("put", "/quant-lab/alerts?profile_id=desk-a", "update_alert_orchestration", {"history_updates": []}),
        ("post", "/quant-lab/alerts/publish?profile_id=desk-a", "publish_alert_event", {"rule_name": "Manual alert"}),
        ("get", "/quant-lab/data-quality", "get_data_quality", None),
        ("post", "/quant-lab/valuation-lab", "analyze_valuation_lab", {"symbol": "AAPL"}),
        ("post", "/quant-lab/industry-rotation", "run_industry_rotation_lab", {"start_date": "2025-01-01", "end_date": "2025-12-31"}),
        ("post", "/quant-lab/factor-expression", "evaluate_factor_expression", {"symbol": "AAPL", "expression": "rank(close)"}),
    ]

    for method, path, service_method_name, payload in cases:
        def _handler(*args, _service_method_name=service_method_name):
            return {
                "service_method": _service_method_name,
                "args_count": len(args),
            }

        monkeypatch.setattr(quant_lab_endpoint.quant_lab_service, service_method_name, _handler)
        request = getattr(client, method)
        response = request(path, json=payload) if payload is not None else request(path)

        assert response.status_code == 200
        assert response.json()["service_method"] == service_method_name
        assert to_thread_calls[-1]["func"] is _handler


def test_quant_lab_value_error_still_maps_to_400(monkeypatch):
    client = _build_client()

    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    def _raise_value_error(_payload):
        raise ValueError("bad request")

    monkeypatch.setattr(quant_lab_endpoint.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(quant_lab_endpoint.quant_lab_service, "optimize_strategy", _raise_value_error)

    response = client.post(
        "/quant-lab/optimizer",
        json={"symbol": "AAPL", "strategy": "moving_average"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "bad request"


def test_quant_lab_async_industry_rotation_queue_forces_fast_path(monkeypatch):
    client = _build_client()
    submissions = []

    class FakeTaskQueue:
        def submit(self, *, name, payload, backend):
            submissions.append({
                "name": name,
                "payload": payload,
                "backend": backend,
            })
            return {
                "id": "task-123",
                "name": name,
                "payload": payload,
                "execution_backend": backend,
            }

    monkeypatch.setattr(quant_lab_endpoint, "task_queue_manager", FakeTaskQueue())

    response = client.post(
        "/quant-lab/industry-rotation/async",
        json={"start_date": "2025-01-01", "end_date": "2025-12-31"},
    )

    assert response.status_code == 200
    assert submissions[0]["name"] == "quant_industry_rotation"
    assert submissions[0]["payload"]["prefer_fast_path"] is True
    assert submissions[0]["payload"]["task_origin"] == "quant_lab"

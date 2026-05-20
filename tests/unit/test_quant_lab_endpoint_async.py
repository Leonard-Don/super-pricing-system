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
        ("get", "/quant-lab/trading-journal?profile_id=desk-a", "get_trading_journal", None),
        ("put", "/quant-lab/trading-journal?profile_id=desk-a", "update_trading_journal", {"notes": {}, "strategy_lifecycle": []}),
        ("get", "/quant-lab/alerts?profile_id=desk-a", "get_alert_orchestration", None),
        ("put", "/quant-lab/alerts?profile_id=desk-a", "update_alert_orchestration", {"history_updates": []}),
        ("post", "/quant-lab/alerts/action?profile_id=desk-a", "apply_alert_action", {"alert_id": False, "action": "acknowledge"}),
        ("post", "/quant-lab/alerts/publish?profile_id=desk-a", "publish_alert_event", {"rule_name": "Manual alert"}),
        ("get", "/quant-lab/data-quality", "get_data_quality", None),
        ("post", "/quant-lab/valuation-lab", "analyze_valuation_lab", {"symbol": "AAPL"}),
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


def test_alert_update_endpoint_omits_unset_default_lists(monkeypatch):
    client = _build_client()
    received = []

    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    def _update_alert_orchestration(payload, profile_id):
        received.append({"payload": payload, "profile_id": profile_id})
        return {"ok": True}

    monkeypatch.setattr(quant_lab_endpoint.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(quant_lab_endpoint.quant_lab_service, "update_alert_orchestration", _update_alert_orchestration)

    response = client.put(
        "/quant-lab/alerts?profile_id=desk-a",
        json={"history_updates": [{"id": "alert-1", "status": "resolved"}]},
    )

    assert response.status_code == 200, response.text
    assert received == [
        {
            "profile_id": "desk-a",
            "payload": {"history_updates": [{"id": "alert-1", "status": "resolved"}]},
        }
    ]


def test_alert_action_endpoint_accepts_frontend_alias_payload(monkeypatch):
    client = _build_client()
    received = []

    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    def _apply_alert_action(payload, profile_id):
        received.append({"payload": payload, "profile_id": profile_id})
        return {"ok": True, "payload": payload, "profile_id": profile_id}

    monkeypatch.setattr(quant_lab_endpoint.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(quant_lab_endpoint.quant_lab_service, "apply_alert_action", _apply_alert_action)

    response = client.post(
        "/quant-lab/alerts/action?profile_id=desk-a",
        json={
            "targetAlertId": 0,
            "actionType": "snooze",
            "note": "0",
            "snoozedUntil": "2026-05-12",
            "sourceActionId": "check_snoozed_alert:0",
        },
    )

    assert response.status_code == 200, response.text
    assert received == [
        {
            "profile_id": "desk-a",
            "payload": {
                "alert_id": 0,
                "action": "snooze",
                "note": "0",
                "snoozed_until": "2026-05-12",
                "source_action_id": "check_snoozed_alert:0",
            },
        }
    ]


def test_alert_action_endpoint_accepts_bare_id_alias(monkeypatch):
    client = _build_client()
    received = []

    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    def _apply_alert_action(payload, profile_id):
        received.append(payload)
        return {"ok": True}

    monkeypatch.setattr(quant_lab_endpoint.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(quant_lab_endpoint.quant_lab_service, "apply_alert_action", _apply_alert_action)

    response = client.post("/quant-lab/alerts/action", json={"id": False, "action": "dismiss"})

    assert response.status_code == 200, response.text
    assert received == [
        {
            "alert_id": False,
            "action": "dismiss",
            "note": None,
            "snoozed_until": None,
            "source_action_id": None,
        }
    ]


def test_quant_lab_value_error_still_maps_to_400(monkeypatch):
    client = _build_client()

    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    def _raise_value_error(_payload):
        raise ValueError("bad request")

    monkeypatch.setattr(quant_lab_endpoint.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(quant_lab_endpoint.quant_lab_service, "evaluate_factor_expression", _raise_value_error)

    response = client.post(
        "/quant-lab/factor-expression",
        json={"symbol": "AAPL", "expression": "rank(close)"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "bad request"


def test_quant_lab_async_valuation_queue_adds_quant_lab_origin(monkeypatch):
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
        "/quant-lab/valuation-lab/async",
        json={"symbol": "AAPL", "period": "1y"},
    )

    assert response.status_code == 200
    assert submissions[0]["name"] == "quant_valuation_lab"
    assert submissions[0]["payload"]["task_origin"] == "quant_lab"

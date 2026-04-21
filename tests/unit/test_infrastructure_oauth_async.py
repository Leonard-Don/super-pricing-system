from fastapi import FastAPI
from fastapi.testclient import TestClient

import backend.app.api.v1.endpoints.infrastructure as infrastructure_endpoint


def _build_client():
    app = FastAPI()
    app.include_router(infrastructure_endpoint.router, prefix="/infrastructure")
    return TestClient(app)


def test_oauth_exchange_endpoint_uses_to_thread(monkeypatch):
    client = _build_client()
    to_thread_calls = []

    async def fake_to_thread(func, *args, **kwargs):
        to_thread_calls.append({"func": func, "args": args, "kwargs": kwargs})
        return func(*args, **kwargs)

    def fake_exchange(provider_id, *, code, state, redirect_uri=None, expires_in_seconds=None, refresh_expires_in_seconds=None):
        return {
            "provider_id": provider_id,
            "code": code,
            "state": state,
            "redirect_uri": redirect_uri,
            "expires_in_seconds": expires_in_seconds,
            "refresh_expires_in_seconds": refresh_expires_in_seconds,
        }

    monkeypatch.setattr(infrastructure_endpoint.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(infrastructure_endpoint, "exchange_oauth_authorization_code", fake_exchange)

    response = client.post(
        "/infrastructure/auth/oauth/providers/github/exchange",
        json={
            "code": "abc123",
            "state": "state-1",
            "expires_in_seconds": 7200,
            "refresh_expires_in_seconds": 14400,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider_id"] == "github"
    assert payload["code"] == "abc123"
    assert payload["state"] == "state-1"
    assert to_thread_calls[-1]["func"] is fake_exchange


def test_oauth_callback_uses_to_thread_before_rendering_html(monkeypatch):
    client = _build_client()
    to_thread_calls = []

    async def fake_to_thread(func, *args, **kwargs):
        to_thread_calls.append({"func": func, "args": args, "kwargs": kwargs})
        return func(*args, **kwargs)

    def fake_exchange(provider_id, *, code, state, redirect_uri=None, expires_in_seconds=None, refresh_expires_in_seconds=None):
        return {
            "provider_id": provider_id,
            "frontend_origin": "http://localhost:3100",
            "access_token": "token-1",
        }

    monkeypatch.setattr(infrastructure_endpoint.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(infrastructure_endpoint, "exchange_oauth_authorization_code", fake_exchange)

    response = client.get(
        "/infrastructure/auth/oauth/providers/github/callback?code=abc123&state=state-1",
        headers={"origin": "http://localhost:3100"},
    )

    assert response.status_code == 200
    assert "quant-oauth-callback" in response.text
    assert "\"success\": true" in response.text.lower()
    assert to_thread_calls[-1]["func"] is fake_exchange


def test_infrastructure_tasks_endpoint_returns_cursor_page(monkeypatch):
    client = _build_client()
    calls = []

    class FakeTaskQueue:
        def list_tasks_page(self, limit=50, cursor=None, status=None, execution_backend=None, task_view=None, sort_by=None, sort_direction=None):
            calls.append((limit, cursor, status, execution_backend, task_view, sort_by, sort_direction))
            return {
                "tasks": [{"id": "task-1", "status": "queued"}],
                "limit": limit,
                "has_more": True,
                "next_cursor": "cursor-1",
                "total": 12,
            }

    monkeypatch.setattr(infrastructure_endpoint, "task_queue_manager", FakeTaskQueue())

    response = client.get(
        "/infrastructure/tasks?limit=25&cursor=cursor-0&status=running&execution_backend=celery&task_view=active&sort_by=activity&sort_direction=desc"
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["tasks"] == [{"id": "task-1", "status": "queued"}]
    assert payload["has_more"] is True
    assert payload["next_cursor"] == "cursor-1"
    assert payload["total"] == 12
    assert calls == [(25, "cursor-0", "running", "celery", "active", "activity", "desc")]


def test_infrastructure_tasks_endpoint_rejects_invalid_cursor(monkeypatch):
    client = _build_client()

    class FakeTaskQueue:
        def list_tasks_page(self, limit=50, cursor=None, status=None, execution_backend=None, task_view=None, sort_by=None, sort_direction=None):
            raise ValueError("Invalid record cursor")

    monkeypatch.setattr(infrastructure_endpoint, "task_queue_manager", FakeTaskQueue())

    response = client.get("/infrastructure/tasks?cursor=broken-token")

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid record cursor"

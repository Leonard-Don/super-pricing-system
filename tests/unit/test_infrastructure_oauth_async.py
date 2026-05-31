from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.core.auth import get_current_user_optional

from backend.app.api.v1.endpoints import infrastructure as infrastructure_pkg
from backend.app.api.v1.endpoints.infrastructure import auth_routes as infrastructure_auth
from backend.app.api.v1.endpoints.infrastructure import persistence_routes as infrastructure_persistence
from backend.app.api.v1.endpoints.infrastructure import routes as infrastructure_routes


def _build_client():
    app = FastAPI()
    app.include_router(infrastructure_pkg.router, prefix="/infrastructure")
    return TestClient(app)


def _override_user(client, user):
    """Pin the user that ``get_current_user_optional`` resolves to.

    Mirrors what the real dependency returns: a non-admin caller (auth disabled
    or a researcher token) yields ``role="researcher"``; an admin caller yields
    ``role="admin"``. Used to exercise the admin guard without standing up a
    full token-issuing auth stack.
    """
    client.app.dependency_overrides[get_current_user_optional] = lambda: user


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

    monkeypatch.setattr(infrastructure_auth.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(infrastructure_auth, "exchange_oauth_authorization_code", fake_exchange)

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

    monkeypatch.setattr(infrastructure_auth.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(infrastructure_auth, "exchange_oauth_authorization_code", fake_exchange)

    response = client.get(
        "/infrastructure/auth/oauth/providers/github/callback?code=abc123&state=state-1",
        headers={"origin": "http://localhost:3100"},
    )

    assert response.status_code == 200
    assert "quant-oauth-callback" in response.text
    assert "\"success\": true" in response.text.lower()
    assert to_thread_calls[-1]["func"] is fake_exchange


def test_oauth_callback_success_never_targets_wildcard_origin(monkeypatch):
    """SECURITY: the success payload carries the token bundle; it must never be
    postMessage'd to a wildcard ('*') target origin, even when the provider
    config omits a frontend_origin and no Origin header is present."""
    client = _build_client()

    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    def fake_exchange(provider_id, *, code, state, redirect_uri=None, expires_in_seconds=None, refresh_expires_in_seconds=None):
        # deliberately no frontend_origin -> worst case for target resolution
        return {"provider_id": provider_id, "access_token": "SUPER-SECRET-TOKEN"}

    monkeypatch.setattr(infrastructure_auth.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(infrastructure_auth, "exchange_oauth_authorization_code", fake_exchange)

    # no Origin header on purpose
    response = client.get(
        "/infrastructure/auth/oauth/providers/github/callback?code=abc123&state=state-1"
    )

    html = response.text
    assert response.status_code == 200
    assert "SUPER-SECRET-TOKEN" in html  # token bundle is in the payload
    assert 'const targetOrigin = "*"' not in html, "token bundle must not target wildcard origin"
    assert "|| '*'" not in html, "JS must not fall back to a wildcard postMessage target"


def test_oauth_callback_error_path_has_no_wildcard_postmessage():
    client = _build_client()
    response = client.get(
        "/infrastructure/auth/oauth/providers/github/callback?error=access_denied"
    )
    html = response.text
    assert response.status_code == 200
    assert 'const targetOrigin = "*"' not in html
    assert "|| '*'" not in html


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

    monkeypatch.setattr(infrastructure_routes, "task_queue_manager", FakeTaskQueue())

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

    monkeypatch.setattr(infrastructure_routes, "task_queue_manager", FakeTaskQueue())

    response = client.get("/infrastructure/tasks?cursor=broken-token")

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid record cursor"


# ---------------------------------------------------------------------------
# Admin-guard regression tests for state-mutating infrastructure endpoints.
#
# These POST/DELETE handlers mutate shared persistence / rate-limit /
# notification / config state. They previously ran under the non-enforcing
# ``get_current_user_optional`` dependency with no ``_require_admin`` call, so
# an anonymous caller (auth disabled) or any non-admin token could mutate that
# state. The guard must reject non-admin callers (403, matching what
# ``_require_admin`` raises) while still letting admin callers through.
# ---------------------------------------------------------------------------

_NON_ADMIN_USER = {"sub": "anonymous", "role": "researcher", "auth_method": "optional"}
_ADMIN_USER = {"sub": "ops-admin", "role": "admin", "auth_method": "bearer"}


class _FakePersistenceManager:
    """Records write calls so a successful admin path can be asserted."""

    def __init__(self):
        self.record_calls = []
        self.timeseries_calls = []

    def put_record(self, **kwargs):
        self.record_calls.append(kwargs)
        return {"stored": True, **kwargs}

    def put_timeseries(self, **kwargs):
        self.timeseries_calls.append(kwargs)
        return {"stored": True, **kwargs}

    def list_records(self, record_type=None, limit=50):
        return []


def test_persistence_records_post_rejects_non_admin(monkeypatch):
    client = _build_client()
    _override_user(client, _NON_ADMIN_USER)
    fake = _FakePersistenceManager()
    monkeypatch.setattr(infrastructure_persistence, "persistence_manager", fake)

    response = client.post(
        "/infrastructure/persistence/records",
        json={"record_type": "research", "record_key": "k1", "payload": {"x": 1}},
    )

    assert response.status_code == 403
    assert fake.record_calls == []


def test_persistence_timeseries_post_rejects_non_admin(monkeypatch):
    client = _build_client()
    _override_user(client, _NON_ADMIN_USER)
    fake = _FakePersistenceManager()
    monkeypatch.setattr(infrastructure_persistence, "persistence_manager", fake)

    response = client.post(
        "/infrastructure/persistence/timeseries",
        json={"series_name": "s1", "symbol": "AAPL", "timestamp": "2026-05-22T00:00:00Z", "value": 1.0},
    )

    assert response.status_code == 403
    assert fake.timeseries_calls == []


def test_rate_limits_post_rejects_non_admin(monkeypatch):
    client = _build_client()
    _override_user(client, _NON_ADMIN_USER)
    configure_calls = []

    class FakeRateLimiter:
        def configure_defaults(self, **kwargs):
            configure_calls.append(kwargs)

        def configure_endpoint_rules(self, rules):
            configure_calls.append({"rules": rules})
            return rules

        def status(self):
            return {}

    monkeypatch.setattr(infrastructure_routes, "rate_limiter", FakeRateLimiter())

    response = client.post(
        "/infrastructure/rate-limits",
        json={"default_requests_per_minute": 60, "default_burst_size": 10, "rules": []},
    )

    assert response.status_code == 403
    assert configure_calls == []


def test_config_versions_post_rejects_non_admin(monkeypatch):
    client = _build_client()
    _override_user(client, _NON_ADMIN_USER)
    fake = _FakePersistenceManager()
    monkeypatch.setattr(infrastructure_routes, "persistence_manager", fake)

    response = client.post(
        "/infrastructure/config-versions",
        json={"config_type": "alerts", "config_key": "default", "payload": {"v": 1}},
    )

    assert response.status_code == 403
    assert fake.record_calls == []


def test_config_versions_restore_rejects_non_admin(monkeypatch):
    client = _build_client()
    _override_user(client, _NON_ADMIN_USER)
    fake = _FakePersistenceManager()
    monkeypatch.setattr(infrastructure_routes, "persistence_manager", fake)

    response = client.post(
        "/infrastructure/config-versions/restore",
        json={"config_type": "alerts", "config_key": "default", "version": 1},
    )

    assert response.status_code == 403
    assert fake.record_calls == []


def test_notification_channel_post_rejects_non_admin(monkeypatch):
    client = _build_client()
    _override_user(client, _NON_ADMIN_USER)
    save_calls = []

    class FakeNotificationService:
        def save_channel(self, payload):
            save_calls.append(payload)
            return payload

        def delete_channel(self, channel_id):
            save_calls.append({"deleted": channel_id})
            return {"deleted": channel_id}

    monkeypatch.setattr(infrastructure_routes, "notification_service", FakeNotificationService())

    response = client.post(
        "/infrastructure/notifications/channels",
        json={"id": "ch1", "type": "webhook", "label": "Ops", "enabled": True, "settings": {}},
    )

    assert response.status_code == 403
    assert save_calls == []


def test_notification_channel_delete_rejects_non_admin(monkeypatch):
    client = _build_client()
    _override_user(client, _NON_ADMIN_USER)
    delete_calls = []

    class FakeNotificationService:
        def delete_channel(self, channel_id):
            delete_calls.append(channel_id)
            return {"deleted": channel_id}

    monkeypatch.setattr(infrastructure_routes, "notification_service", FakeNotificationService())

    response = client.delete("/infrastructure/notifications/channels/ch1")

    assert response.status_code == 403
    assert delete_calls == []


def test_persistence_records_post_allows_admin(monkeypatch):
    """The fix must not break the legitimate path: an admin caller still writes."""
    client = _build_client()
    _override_user(client, _ADMIN_USER)
    fake = _FakePersistenceManager()
    monkeypatch.setattr(infrastructure_persistence, "persistence_manager", fake)

    response = client.post(
        "/infrastructure/persistence/records",
        json={"record_type": "research", "record_key": "k1", "payload": {"x": 1}},
    )

    assert response.status_code == 200
    assert len(fake.record_calls) == 1
    assert fake.record_calls[0]["record_type"] == "research"


def test_rate_limits_post_allows_admin(monkeypatch):
    """An admin caller still reconfigures rate limits after the fix."""
    client = _build_client()
    _override_user(client, _ADMIN_USER)
    configure_calls = []

    class FakeRateLimiter:
        def configure_defaults(self, **kwargs):
            configure_calls.append(("defaults", kwargs))

        def configure_endpoint_rules(self, rules):
            configure_calls.append(("rules", rules))
            return rules

        def status(self):
            return {"ok": True}

    monkeypatch.setattr(infrastructure_routes, "rate_limiter", FakeRateLimiter())

    response = client.post(
        "/infrastructure/rate-limits",
        json={"default_requests_per_minute": 60, "default_burst_size": 10, "rules": []},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["updated_by"] == "ops-admin"
    assert configure_calls[0][0] == "defaults"

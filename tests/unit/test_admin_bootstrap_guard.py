"""Tests for the infrastructure admin guards.

``_require_admin_or_bootstrap`` historically opened *every* admin route while no
admin account existed (``bootstrap_required``). That window let an
unauthenticated remote caller register their own admin account. The bootstrap
exception is now confined to loopback callers, and ``_require_admin`` carries no
bootstrap escape at all -- sensitive admin operations always require admin role.
"""

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from backend.app.api.v1.endpoints.infrastructure import _helpers

_AUTH_STATUS = "backend.app.api.v1.endpoints.infrastructure._helpers.auth_status"


def _request(client_host: str, headers: dict | None = None) -> Request:
    raw_headers = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/infrastructure/auth/users",
            "headers": raw_headers,
            "client": (client_host, 4321),
        }
    )


def test_require_admin_rejects_non_admin_even_during_bootstrap(monkeypatch):
    monkeypatch.setattr(_AUTH_STATUS, lambda: {"bootstrap_required": True})

    with pytest.raises(HTTPException) as exc:
        _helpers._require_admin({"role": "researcher"})

    assert exc.value.status_code == 403


def test_require_admin_allows_admin(monkeypatch):
    monkeypatch.setattr(_AUTH_STATUS, lambda: {"bootstrap_required": False})

    _helpers._require_admin({"role": "admin"})  # no exception


def test_bootstrap_bypass_rejects_remote_anonymous_caller(monkeypatch):
    """Core fix: during the bootstrap window a non-loopback caller is still
    rejected, so a remote attacker cannot self-register an admin account."""
    monkeypatch.setattr(_AUTH_STATUS, lambda: {"bootstrap_required": True})

    with pytest.raises(HTTPException) as exc:
        _helpers._require_admin_or_bootstrap({}, _request("203.0.113.7"))

    assert exc.value.status_code == 403


def test_bootstrap_bypass_allows_loopback_caller(monkeypatch):
    """A loopback caller during the bootstrap window is still allowed so the
    operator can create the first admin account."""
    monkeypatch.setattr(_AUTH_STATUS, lambda: {"bootstrap_required": True})

    _helpers._require_admin_or_bootstrap({}, _request("127.0.0.1"))  # no exception


def test_bootstrap_bypass_ignores_spoofed_forwarded_header(monkeypatch):
    """Locality is judged from the TCP peer only -- a spoofed X-Forwarded-For
    must not unlock the bootstrap bypass for a remote caller."""
    monkeypatch.setattr(_AUTH_STATUS, lambda: {"bootstrap_required": True})

    spoofed = _request("203.0.113.7", headers={"X-Forwarded-For": "127.0.0.1"})
    with pytest.raises(HTTPException) as exc:
        _helpers._require_admin_or_bootstrap({}, spoofed)

    assert exc.value.status_code == 403


def test_admin_passes_bootstrap_guard_when_not_bootstrapping(monkeypatch):
    monkeypatch.setattr(_AUTH_STATUS, lambda: {"bootstrap_required": False})

    _helpers._require_admin_or_bootstrap({"role": "admin"}, _request("203.0.113.7"))


def test_non_admin_rejected_by_bootstrap_guard_when_not_bootstrapping(monkeypatch):
    monkeypatch.setattr(_AUTH_STATUS, lambda: {"bootstrap_required": False})

    with pytest.raises(HTTPException) as exc:
        _helpers._require_admin_or_bootstrap({"role": "researcher"}, _request("127.0.0.1"))

    assert exc.value.status_code == 403

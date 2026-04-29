"""Regression tests for the AUTH_SECRET production guard in backend/app/core/auth.py.

The guard refuses to sign JWTs with the development fallback in production,
which is a hard requirement: an attacker with the published fallback secret
could mint arbitrary tokens.
"""

from __future__ import annotations

import importlib
import logging

import pytest


@pytest.fixture
def reload_auth(monkeypatch):
    def _reload(env: dict[str, str]):
        for key in ("AUTH_SECRET", "ENVIRONMENT"):
            monkeypatch.setenv(key, env.get(key, ""))
        from backend.app.core import auth

        return importlib.reload(auth)

    return _reload


def test_production_without_secret_raises(reload_auth):
    auth = reload_auth({"ENVIRONMENT": "production", "AUTH_SECRET": ""})
    with pytest.raises(RuntimeError, match="AUTH_SECRET"):
        auth._auth_secret()


def test_production_alias_prod_also_enforces(reload_auth):
    auth = reload_auth({"ENVIRONMENT": "prod", "AUTH_SECRET": ""})
    with pytest.raises(RuntimeError, match="AUTH_SECRET"):
        auth._auth_secret()


def test_production_with_secret_returns_bytes(reload_auth):
    auth = reload_auth(
        {"ENVIRONMENT": "production", "AUTH_SECRET": "real-prod-secret-123"}
    )
    assert auth._auth_secret() == b"real-prod-secret-123"


def test_development_falls_back_with_warning(reload_auth, caplog):
    auth = reload_auth({"ENVIRONMENT": "development", "AUTH_SECRET": ""})
    auth._AUTH_SECRET_WARNED = False  # reset the once-per-process latch
    with caplog.at_level(logging.WARNING, logger="backend.app.core.auth"):
        first = auth._auth_secret()
        second = auth._auth_secret()

    assert first == b"dev-only-change-me"
    assert second == b"dev-only-change-me"
    # Warning should be emitted at most once per process to avoid log spam.
    matching = [r for r in caplog.records if "AUTH_SECRET is not set" in r.getMessage()]
    assert len(matching) == 1, f"expected exactly one warning, got {len(matching)}"


def test_test_environment_uses_explicit_secret(reload_auth):
    auth = reload_auth({"ENVIRONMENT": "test", "AUTH_SECRET": "pytest-fixture-key"})
    assert auth._auth_secret() == b"pytest-fixture-key"


def test_verify_password_returns_false_for_malformed_payload(reload_auth):
    auth = reload_auth({"ENVIRONMENT": "test", "AUTH_SECRET": "x"})
    assert auth._verify_password("any", "") is False
    assert auth._verify_password("any", "wrong-format") is False
    # algorithm is right but salt is non-hex → bytes.fromhex raises ValueError
    assert auth._verify_password("any", "pbkdf2_sha256$200000$ZZZ$BAD") is False


def test_verify_password_does_not_swallow_unexpected_errors(reload_auth, monkeypatch):
    """If an unexpected exception type is raised inside the verify path, it should
    propagate so we can fix it instead of silently logging users out."""
    auth = reload_auth({"ENVIRONMENT": "test", "AUTH_SECRET": "x"})

    def _explode(*_args, **_kwargs):
        raise RuntimeError("simulated bug")

    monkeypatch.setattr(auth.hashlib, "pbkdf2_hmac", _explode)
    with pytest.raises(RuntimeError, match="simulated bug"):
        auth._verify_password("any", "pbkdf2_sha256$200000$abcd$beef")

"""Regression tests for the CORS credentialed-wildcard boot guard.

The guard refuses to start the application when *all three* of these hold:
  1. ``cors_origins`` contains ``"*"``
  2. ``allow_credentials`` is ``True``
  3. ``ENVIRONMENT`` is not ``"development"``

This mirrors the AUTH_SECRET guard in ``backend/app/core/auth/_secrets.py``
which refuses to sign JWTs with the fallback secret in production.

See: ``src/settings/api.py`` — ``assert_no_credentialed_wildcard_cors``
"""

from __future__ import annotations

import importlib

import pytest


@pytest.fixture
def reload_api_settings(monkeypatch):
    """Reload ``src.settings.api`` after monkey-patching the environment."""

    def _reload(env: dict[str, str]):
        for key in ("CORS_ORIGINS", "CORS_EXTRA_ORIGINS", "ENVIRONMENT", "FRONTEND_URL"):
            monkeypatch.setenv(key, env.get(key, ""))
        import src.settings.api as api

        return importlib.reload(api)

    return _reload


# ---------------------------------------------------------------------------
# RED tests — the guard must raise when the dangerous combination is present
# ---------------------------------------------------------------------------

def test_wildcard_with_credentials_non_dev_raises(reload_api_settings):
    """Production env + wildcard origin + credentials → must refuse to boot."""
    api = reload_api_settings({"ENVIRONMENT": "production", "FRONTEND_URL": "https://app.example.com"})
    with pytest.raises(RuntimeError, match="credentialed wildcard CORS"):
        api.assert_no_credentialed_wildcard_cors(
            cors_origins=["*"],
            allow_credentials=True,
        )


def test_wildcard_with_credentials_test_env_raises(reload_api_settings):
    """Test env (!=development) + wildcard + credentials → must refuse to boot."""
    api = reload_api_settings({"ENVIRONMENT": "test", "FRONTEND_URL": "http://localhost:3100"})
    with pytest.raises(RuntimeError, match="credentialed wildcard CORS"):
        api.assert_no_credentialed_wildcard_cors(
            cors_origins=["*"],
            allow_credentials=True,
        )


def test_wildcard_with_credentials_staging_env_raises(reload_api_settings):
    """Staging env + wildcard + credentials → must refuse to boot."""
    api = reload_api_settings({"ENVIRONMENT": "staging", "FRONTEND_URL": "https://staging.example.com"})
    with pytest.raises(RuntimeError, match="credentialed wildcard CORS"):
        api.assert_no_credentialed_wildcard_cors(
            cors_origins=["*"],
            allow_credentials=True,
        )


# ---------------------------------------------------------------------------
# GREEN tests — safe configs must NOT trip the guard
# ---------------------------------------------------------------------------

def test_explicit_origins_with_credentials_does_not_raise(reload_api_settings):
    """Explicit origin list (no wildcard) + credentials → safe, no exception."""
    api = reload_api_settings({"ENVIRONMENT": "production", "FRONTEND_URL": "https://app.example.com"})
    # Must not raise
    api.assert_no_credentialed_wildcard_cors(
        cors_origins=["https://app.example.com"],
        allow_credentials=True,
    )


def test_wildcard_without_credentials_does_not_raise(reload_api_settings):
    """Wildcard without credentials → not a CORS-credentialing violation."""
    api = reload_api_settings({"ENVIRONMENT": "production", "FRONTEND_URL": "https://app.example.com"})
    # Must not raise — allow_credentials=False makes the combo safe
    api.assert_no_credentialed_wildcard_cors(
        cors_origins=["*"],
        allow_credentials=False,
    )


def test_development_env_wildcard_with_credentials_does_not_raise(reload_api_settings):
    """Development env explicitly exempted — mirrors the AUTH_SECRET guard behaviour."""
    api = reload_api_settings({"ENVIRONMENT": "development", "FRONTEND_URL": "http://localhost:3100"})
    # Must not raise in development
    api.assert_no_credentialed_wildcard_cors(
        cors_origins=["*"],
        allow_credentials=True,
    )


def test_empty_origins_with_credentials_does_not_raise(reload_api_settings):
    """Empty origin list can't match '*' — guard must pass cleanly."""
    api = reload_api_settings({"ENVIRONMENT": "production", "FRONTEND_URL": "https://app.example.com"})
    api.assert_no_credentialed_wildcard_cors(
        cors_origins=[],
        allow_credentials=True,
    )


def test_wildcard_among_explicit_origins_raises(reload_api_settings):
    """'*' mixed with explicit origins is still dangerous — guard fires."""
    api = reload_api_settings({"ENVIRONMENT": "production", "FRONTEND_URL": "https://app.example.com"})
    with pytest.raises(RuntimeError, match="credentialed wildcard CORS"):
        api.assert_no_credentialed_wildcard_cors(
            cors_origins=["https://app.example.com", "*"],
            allow_credentials=True,
        )

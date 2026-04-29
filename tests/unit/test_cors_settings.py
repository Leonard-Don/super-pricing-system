"""Regression tests for the environment-aware CORS resolver in src/settings/api.py.

The resolver is security-critical: a misconfigured production CORS list with
``allow_credentials=True`` is a classic vulnerability vector, so we lock its
behavior in every supported configuration mode.
"""

from __future__ import annotations

import importlib

import pytest


@pytest.fixture
def reload_api_settings(monkeypatch):
    """Reload ``src.settings.api`` after monkey-patching the env, so module-level
    constants reflect the test environment."""

    def _reload(env: dict[str, str]):
        # Always neutralize values that .env may have leaked in.
        for key in ("CORS_ORIGINS", "CORS_EXTRA_ORIGINS", "ENVIRONMENT", "FRONTEND_URL"):
            monkeypatch.setenv(key, env.get(key, ""))
        import src.settings.api as api  # local import keeps the reload honest

        return importlib.reload(api)

    return _reload


def test_production_default_only_includes_frontend_url(reload_api_settings):
    api = reload_api_settings(
        {"ENVIRONMENT": "production", "FRONTEND_URL": "https://app.example.com"}
    )
    assert api.CORS_ORIGINS == ["https://app.example.com"]


def test_production_does_not_include_localhost(reload_api_settings):
    api = reload_api_settings(
        {"ENVIRONMENT": "prod", "FRONTEND_URL": "https://app.example.com"}
    )
    assert all("localhost" not in origin and "127.0.0.1" not in origin for origin in api.CORS_ORIGINS)


def test_development_includes_common_localhost_origins(reload_api_settings):
    api = reload_api_settings(
        {"ENVIRONMENT": "development", "FRONTEND_URL": "http://127.0.0.1:3100"}
    )
    assert "http://localhost:3100" in api.CORS_ORIGINS
    assert "http://127.0.0.1:3000" in api.CORS_ORIGINS


def test_explicit_cors_origins_replaces_defaults_via_json(reload_api_settings):
    api = reload_api_settings(
        {
            "ENVIRONMENT": "production",
            "FRONTEND_URL": "https://app.example.com",
            "CORS_ORIGINS": '["https://only-one.com"]',
        }
    )
    assert api.CORS_ORIGINS == ["https://only-one.com"]


def test_explicit_cors_origins_supports_comma_separated(reload_api_settings):
    api = reload_api_settings(
        {
            "ENVIRONMENT": "production",
            "FRONTEND_URL": "https://app.example.com",
            "CORS_ORIGINS": "https://a.com, https://b.com,https://c.com",
        }
    )
    assert api.CORS_ORIGINS == [
        "https://a.com",
        "https://b.com",
        "https://c.com",
    ]


def test_extra_origins_are_appended(reload_api_settings):
    api = reload_api_settings(
        {
            "ENVIRONMENT": "production",
            "FRONTEND_URL": "https://app.example.com",
            "CORS_EXTRA_ORIGINS": "https://admin.example.com,https://staging.example.com",
        }
    )
    assert api.CORS_ORIGINS == [
        "https://app.example.com",
        "https://admin.example.com",
        "https://staging.example.com",
    ]


def test_wildcard_is_rejected_when_credentials_required(reload_api_settings, caplog):
    api = reload_api_settings(
        {
            "ENVIRONMENT": "production",
            "FRONTEND_URL": "https://app.example.com",
            "CORS_ORIGINS": '["*", "https://safe.com"]',
        }
    )
    assert "*" not in api.CORS_ORIGINS
    assert api.CORS_ORIGINS == ["https://safe.com"]


def test_duplicate_origins_are_deduplicated(reload_api_settings):
    api = reload_api_settings(
        {
            "ENVIRONMENT": "development",
            "FRONTEND_URL": "http://localhost:3100",  # already in localhost defaults
        }
    )
    # FRONTEND_URL appears at the head; the duplicate localhost entry is dropped.
    assert api.CORS_ORIGINS.count("http://localhost:3100") == 1


def test_malformed_json_falls_back_to_comma_split(reload_api_settings, caplog):
    api = reload_api_settings(
        {
            "ENVIRONMENT": "production",
            "FRONTEND_URL": "https://app.example.com",
            # Looks like JSON but isn't valid — resolver should not crash.
            "CORS_ORIGINS": "[https://broken.com",
        }
    )
    # Falls through to comma-split, which yields a single dirty token.
    # Exact value isn't important; the contract is "no crash, no '*' leakage".
    assert "*" not in api.CORS_ORIGINS

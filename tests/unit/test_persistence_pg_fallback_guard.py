"""Regression tests for the production fail-fast guard on the
PostgreSQL → SQLite silent fallback in PersistenceManager.

When DATABASE_URL points at PG but the schema bootstrap fails (network,
auth, missing extension, ...), the manager used to silently switch to a
local SQLite file and continue. In production this means the app boots
"successfully" but writes records to the wrong target; the operator
only finds out on the next restart or migration.

The guard mirrors the AUTH_SECRET production guard: if
``ENVIRONMENT in {"production", "prod"}``, re-raise instead of falling
back so systemd / docker-compose surface the failure.
"""

from __future__ import annotations

import logging

import pytest

from backend.app.core.persistence import _connection, _manager


@pytest.fixture
def force_pg_bootstrap_failure(monkeypatch):
    """Make detect_driver claim postgres + ensure_postgres_schema raise."""

    def _apply(env_value: str | None):
        if env_value is None:
            monkeypatch.delenv("ENVIRONMENT", raising=False)
        else:
            monkeypatch.setenv("ENVIRONMENT", env_value)
        monkeypatch.setenv("DATABASE_URL", "postgresql://fake-host/fake-db")
        monkeypatch.setattr(_connection, "detect_driver", lambda manager: "postgres_psycopg3")
        boom = ConnectionError("simulated PG connection refused")

        def _raise(_manager):
            raise boom

        monkeypatch.setattr(_connection, "ensure_postgres_schema", _raise)
        return boom

    return _apply


def test_production_pg_bootstrap_failure_raises(force_pg_bootstrap_failure, tmp_path):
    cause = force_pg_bootstrap_failure("production")
    with pytest.raises(RuntimeError, match="PostgreSQL") as exc_info:
        _manager.PersistenceManager(sqlite_path=tmp_path / "local.sqlite3")
    # Original ConnectionError surfaced as __cause__ so operators can see why.
    assert exc_info.value.__cause__ is cause


def test_production_alias_prod_also_enforces(force_pg_bootstrap_failure, tmp_path):
    force_pg_bootstrap_failure("prod")
    with pytest.raises(RuntimeError, match="PostgreSQL"):
        _manager.PersistenceManager(sqlite_path=tmp_path / "local.sqlite3")


def test_development_falls_back_to_sqlite_with_warning(force_pg_bootstrap_failure, caplog, tmp_path):
    force_pg_bootstrap_failure("development")
    with caplog.at_level(logging.WARNING, logger="backend.app.core.persistence._manager"):
        manager = _manager.PersistenceManager(sqlite_path=tmp_path / "local.sqlite3")

    assert manager._driver == "sqlite"
    matching = [r for r in caplog.records if "PostgreSQL bootstrap failed" in r.getMessage()]
    assert matching, "expected fallback warning in development"


def test_unset_environment_falls_back_to_sqlite(force_pg_bootstrap_failure, caplog, tmp_path):
    """Default ENVIRONMENT (unset) keeps the local-dev convenience behavior."""
    force_pg_bootstrap_failure(None)
    with caplog.at_level(logging.WARNING, logger="backend.app.core.persistence._manager"):
        manager = _manager.PersistenceManager(sqlite_path=tmp_path / "local.sqlite3")

    assert manager._driver == "sqlite"


def test_test_environment_keeps_fallback_for_pytest(force_pg_bootstrap_failure, tmp_path):
    """ENVIRONMENT=test (the default in CI/local pytest) does NOT trigger the
    guard, so test suites that exercise PersistenceManager without a real
    Postgres still get the SQLite fallback."""
    force_pg_bootstrap_failure("test")
    manager = _manager.PersistenceManager(sqlite_path=tmp_path / "local.sqlite3")
    assert manager._driver == "sqlite"

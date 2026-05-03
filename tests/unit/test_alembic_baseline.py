"""Smoke tests for the Alembic migration tree.

Verifies the baseline revision is well-formed and the offline SQL renderer
produces a non-empty CREATE TABLE plan. We do not stand up a Postgres
instance here — the env.py path that talks to a live database is exercised
by deployment scripts.
"""
from __future__ import annotations

import pathlib
import subprocess
import sys


REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]


def _run_alembic(*args: str, env_database_url: str = "postgresql://stub") -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=REPO_ROOT,
        env={"DATABASE_URL": env_database_url, "PATH": "/usr/bin:/bin:/usr/local/bin"},
        capture_output=True,
        text=True,
        check=False,
    )


def test_history_lists_baseline_as_head():
    result = _run_alembic("history")
    assert result.returncode == 0, result.stderr
    assert "0001_baseline" in result.stdout
    assert "head" in result.stdout


def test_offline_upgrade_renders_create_table():
    result = _run_alembic("upgrade", "--sql", "0001_baseline")
    assert result.returncode == 0, result.stderr
    assert "CREATE TABLE IF NOT EXISTS infra_records" in result.stdout
    assert "CREATE TABLE IF NOT EXISTS infra_timeseries" in result.stdout
    assert "INSERT INTO alembic_version" in result.stdout


def test_env_refuses_sqlite_url():
    result = _run_alembic("upgrade", "--sql", "0001_baseline", env_database_url="sqlite:///tmp/x.db")
    assert result.returncode != 0
    assert "Refusing to run Alembic against SQLite" in result.stderr or "Refusing to run Alembic against SQLite" in result.stdout

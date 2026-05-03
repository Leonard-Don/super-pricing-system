"""Alembic environment for the PostgreSQL/TimescaleDB schema.

Reads ``DATABASE_URL`` from the process environment when ``alembic.ini``'s
``sqlalchemy.url`` is left blank — this matches how the rest of the
backend resolves persistence (see ``backend/app/core/persistence``).

SQLite is intentionally not handled here. Local SQLite databases keep using
the inline bootstrap in ``_manager.py``; managing two driver dialects from
one migration tree would force every schema change to ship a SQLite shim,
which is not the use case Alembic was wired in for.
"""

from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = None


def _resolve_database_url() -> str:
    explicit = (config.get_main_option("sqlalchemy.url") or "").strip()
    if explicit:
        return explicit
    env_url = (os.getenv("DATABASE_URL") or "").strip()
    if not env_url:
        raise RuntimeError(
            "Alembic requires DATABASE_URL (or sqlalchemy.url in alembic.ini); "
            "neither was set."
        )
    if env_url.startswith("sqlite"):
        raise RuntimeError(
            "Refusing to run Alembic against SQLite; SQLite databases use the "
            "inline bootstrap in backend/app/core/persistence/_manager.py."
        )
    return env_url


def run_migrations_offline() -> None:
    """Generate SQL without connecting to the database."""
    context.configure(
        url=_resolve_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Connect and apply migrations against the live database."""
    section = config.get_section(config.config_ini_section) or {}
    section["sqlalchemy.url"] = _resolve_database_url()
    connectable = engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

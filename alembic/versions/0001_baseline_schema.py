"""Baseline schema: infra_records + infra_timeseries.

This revision codifies the PostgreSQL schema currently bootstrapped inline by
``backend/app/core/persistence/_manager.py``. Existing PostgreSQL deployments
should run::

    alembic stamp 0001_baseline

once, after which Alembic owns subsequent schema changes. New deployments
can run::

    alembic upgrade head

instead of relying on the inline bootstrap.

The downgrade path drops both tables; only run it on disposable databases.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-05-03

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "0001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS infra_records (
            id TEXT PRIMARY KEY,
            record_type TEXT NOT NULL,
            record_key TEXT NOT NULL,
            payload JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
        );
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_infra_records_type_key
            ON infra_records(record_type, record_key);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_infra_records_updated
            ON infra_records(updated_at DESC, id DESC);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_infra_records_type_updated
            ON infra_records(record_type, updated_at DESC, id DESC);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_infra_records_task_status
            ON infra_records(record_type, (payload->>'status'), updated_at DESC, id DESC);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_infra_records_task_backend
            ON infra_records(record_type, (payload->>'execution_backend'), updated_at DESC, id DESC);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_infra_records_task_activity
            ON infra_records(
                record_type,
                (CASE payload->>'status'
                    WHEN 'failed' THEN 5
                    WHEN 'running' THEN 4
                    WHEN 'queued' THEN 3
                    WHEN 'completed' THEN 2
                    WHEN 'cancelled' THEN 1
                    ELSE 0
                END) DESC,
                updated_at DESC,
                id DESC
            );
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS infra_timeseries (
            id BIGSERIAL PRIMARY KEY,
            series_name TEXT NOT NULL,
            symbol TEXT NOT NULL,
            ts TIMESTAMPTZ NOT NULL,
            value DOUBLE PRECISION,
            payload JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL
        );
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_infra_timeseries_lookup
            ON infra_timeseries(series_name, symbol, ts);
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS infra_timeseries CASCADE;")
    op.execute("DROP TABLE IF EXISTS infra_records CASCADE;")

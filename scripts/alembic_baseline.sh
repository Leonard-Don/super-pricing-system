#!/usr/bin/env bash
# Stamp an existing PostgreSQL/TimescaleDB deployment to the baseline revision
# WITHOUT applying any DDL — use this once on a database that was bootstrapped
# by the inline schema in backend/app/core/persistence/_manager.py.
#
# Usage:
#   DATABASE_URL=postgresql://... ./scripts/alembic_baseline.sh
#
# Subsequent schema changes go through `alembic revision -m "..."` followed
# by `alembic upgrade head`.

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set." >&2
  echo "Export DATABASE_URL=postgresql://... before running this script." >&2
  exit 1
fi

case "$DATABASE_URL" in
  sqlite*)
    echo "ERROR: this script only handles PostgreSQL. SQLite uses the inline" >&2
    echo "       bootstrap in backend/app/core/persistence/_manager.py." >&2
    exit 2
    ;;
esac

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "Stamping database at $DATABASE_URL to revision 0001_baseline..."
alembic stamp 0001_baseline
echo "OK: database now reports 0001_baseline as current."
echo "    Run 'alembic upgrade head' for any future revisions."

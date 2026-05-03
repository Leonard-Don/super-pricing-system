#!/usr/bin/env bash
# Regenerate the mypy error baseline. Run after intentionally fixing type
# errors so the gate reflects new floor.
set -euo pipefail
MYPY_OUT=$(mypy backend src --ignore-missing-imports 2>&1 || true)
COUNT=$(printf '%s\n' "$MYPY_OUT" | grep -c ": error:" || true)
echo "$COUNT" > scripts/mypy_baseline_count.txt
echo "mypy baseline updated: $COUNT errors"

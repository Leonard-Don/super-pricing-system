#!/usr/bin/env bash
# CI gate: fail if mypy error count exceeds the recorded baseline. Does not
# require zero errors — only blocks regression. Update the baseline via
# scripts/generate_mypy_baseline.sh after fixing real errors.
set -euo pipefail
BASELINE_FILE="scripts/mypy_baseline_count.txt"
if [ ! -f "$BASELINE_FILE" ]; then
  echo "ERROR: missing $BASELINE_FILE — run scripts/generate_mypy_baseline.sh first"
  exit 2
fi
BASELINE=$(tr -d ' \n' < "$BASELINE_FILE")
# mypy exits non-zero when it finds errors; we expect that and only care
# about the count. Capture without letting pipefail kill the script.
MYPY_OUT=$(mypy backend src --ignore-missing-imports 2>&1 || true)
CURRENT=$(printf '%s\n' "$MYPY_OUT" | grep -c ": error:" || true)
echo "mypy baseline: $BASELINE | current: $CURRENT"
if [ "$CURRENT" -gt "$BASELINE" ]; then
  echo "ERROR: mypy error count increased from $BASELINE to $CURRENT"
  echo "       Either fix the new errors or, if the baseline genuinely shifted,"
  echo "       run scripts/generate_mypy_baseline.sh and commit the new count."
  exit 1
fi
echo "OK: mypy gate passed"

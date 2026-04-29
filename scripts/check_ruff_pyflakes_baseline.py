#!/usr/bin/env python3
"""Fail when new Ruff/Pyflakes violations appear beyond the committed baseline."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BASELINE_PATH = PROJECT_ROOT / "quality" / "ruff_pyflakes_baseline.json"
DEFAULT_TARGETS = ("backend", "src")


def _run_ruff(targets: tuple[str, ...]) -> list[dict[str, Any]]:
    command = [
        sys.executable,
        "-m",
        "ruff",
        "check",
        "--select",
        "F",
        "--output-format",
        "json",
        *targets,
    ]
    result = subprocess.run(command, cwd=PROJECT_ROOT, text=True, capture_output=True, check=False)
    if result.returncode not in {0, 1}:
        sys.stderr.write(result.stderr or result.stdout)
        raise SystemExit(result.returncode)
    if not result.stdout.strip():
        return []
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        sys.stderr.write(result.stdout)
        raise SystemExit(f"Unable to parse Ruff JSON output: {exc}") from exc
    if not isinstance(payload, list):
        raise SystemExit("Unexpected Ruff JSON output shape")
    return payload


def _relative_filename(filename: str) -> str:
    path = Path(filename)
    if path.is_absolute():
        try:
            return path.relative_to(PROJECT_ROOT).as_posix()
        except ValueError:
            return path.as_posix()
    return path.as_posix()


def _violation_key(violation: dict[str, Any]) -> str:
    filename = _relative_filename(str(violation.get("filename", "")))
    code = str(violation.get("code", ""))
    message = str(violation.get("message", "")).strip()
    return f"{filename}|{code}|{message}"


def _counter_from_violations(violations: list[dict[str, Any]]) -> Counter[str]:
    return Counter(_violation_key(violation) for violation in violations)


def _load_baseline() -> Counter[str]:
    if not BASELINE_PATH.exists():
        raise SystemExit(
            f"Missing {BASELINE_PATH.relative_to(PROJECT_ROOT)}. "
            "Run scripts/check_ruff_pyflakes_baseline.py --write-baseline first."
        )
    payload = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    entries = payload.get("violations", [])
    counter: Counter[str] = Counter()
    for entry in entries:
        counter[str(entry["key"])] = int(entry["count"])
    return counter


def _write_baseline(counter: Counter[str], targets: tuple[str, ...]) -> None:
    BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "description": "Baseline for existing Ruff Pyflakes (F*) violations. CI fails on any new key/count.",
        "targets": list(targets),
        "matching": "filename + rule code + message, counted per duplicate occurrence",
        "total": sum(counter.values()),
        "violations": [
            {"key": key, "count": count}
            for key, count in sorted(counter.items())
        ],
    }
    BASELINE_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _format_counter(counter: Counter[str], limit: int = 25) -> str:
    lines = []
    for key, count in counter.most_common(limit):
        suffix = f" x{count}" if count > 1 else ""
        lines.append(f"  - {key}{suffix}")
    omitted = sum(counter.values()) - sum(count for _, count in counter.most_common(limit))
    if omitted:
        lines.append(f"  ... {omitted} more")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write-baseline", action="store_true", help="Replace the committed baseline with current output.")
    parser.add_argument("targets", nargs="*", default=DEFAULT_TARGETS, help="Paths passed to Ruff.")
    args = parser.parse_args()

    targets = tuple(args.targets)
    current = _counter_from_violations(_run_ruff(targets))
    if args.write_baseline:
        _write_baseline(current, targets)
        print(f"Wrote {BASELINE_PATH.relative_to(PROJECT_ROOT)} with {sum(current.values())} violations.")
        return 0

    baseline = _load_baseline()
    new_violations = current - baseline
    resolved_violations = baseline - current
    if new_violations:
        print("New Ruff/Pyflakes violations relative to baseline:")
        print(_format_counter(new_violations))
        print(
            f"Current total: {sum(current.values())}; "
            f"baseline total: {sum(baseline.values())}; "
            f"resolved historical count: {sum(resolved_violations.values())}"
        )
        return 1

    print(
        "Ruff/Pyflakes baseline gate passed: "
        f"current={sum(current.values())}, baseline={sum(baseline.values())}, "
        f"resolved={sum(resolved_violations.values())}, new=0"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Lightweight system checks used by scripts/run_tests.py."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
PYTHON_COMPILE_TARGETS = ("backend", "src", "scripts")
NODE_CHECK_TARGETS = (
    "tests/e2e/consoleNoise.js",
    "tests/e2e/runtimeConfig.js",
    "tests/e2e/serviceManager.js",
    "tests/e2e/verify_app_surface.js",
    "tests/e2e/verify_continuous_review_flow.js",
    "tests/e2e/verify_current_app_suite.js",
    "tests/e2e/verify_pricing_research.js",
    "tests/e2e/verify_quantlab_features.js",
    "tests/e2e/verify_research_suite.js",
)


def run_check(label: str, command: list[str]) -> int:
    print(f"\n=== {label} ===")
    result = subprocess.run(command, cwd=PROJECT_ROOT)
    if result.returncode == 0:
        print(f"PASS {label}")
    else:
        print(f"FAIL {label} (exit {result.returncode})")
    return result.returncode


def run_python_compile_check() -> int:
    return run_check(
        "python compileall",
        [sys.executable, "-m", "compileall", *PYTHON_COMPILE_TARGETS],
    )


def run_node_syntax_checks() -> int:
    if shutil.which("node") is None:
        print("\nSKIP node syntax checks: node is not installed.")
        return 0

    failures = []
    for target in NODE_CHECK_TARGETS:
        exit_code = run_check("node --check " + target, ["node", "--check", target])
        if exit_code != 0:
            failures.append(target)

    if failures:
        print("\nNode syntax failures:")
        for target in failures:
            print(f" - {target}")
        return 1

    return 0


def main() -> int:
    checks = [
        run_python_compile_check(),
        run_node_syntax_checks(),
    ]
    return 0 if all(code == 0 for code in checks) else 1


if __name__ == "__main__":
    sys.exit(main())

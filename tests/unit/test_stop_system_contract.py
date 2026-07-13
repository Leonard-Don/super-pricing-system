"""Behavior contract tests for the system shutdown orchestrator."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
STOP_SYSTEM_SCRIPT = REPO_ROOT / "scripts" / "stop_system.sh"


def _write_executable(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(0o755)


def _run_stop_system(tmp_path: Path, *args: str) -> tuple[subprocess.CompletedProcess[str], list[str]]:
    project_root = tmp_path / "project"
    scripts_dir = project_root / "scripts"
    fake_bin = tmp_path / "bin"
    scripts_dir.mkdir(parents=True)
    fake_bin.mkdir()

    copied_script = scripts_dir / "stop_system.sh"
    shutil.copy2(STOP_SYSTEM_SCRIPT, copied_script)

    call_log = tmp_path / "helper-calls.log"
    helpers = {
        "stop_alt_data_beat.sh": "beat",
        "stop_celery_worker.sh": "worker",
        "stop_infra_stack.sh": "infra",
    }
    for filename, label in helpers.items():
        _write_executable(
            scripts_dir / filename,
            f"""#!/bin/sh
printf '{label}' >> "$CALL_LOG"
for arg in "$@"; do
    printf '\t%s' "$arg" >> "$CALL_LOG"
done
printf '\n' >> "$CALL_LOG"
""",
        )

    for command in ("lsof", "pgrep"):
        _write_executable(fake_bin / command, "#!/bin/sh\nexit 1\n")

    env = os.environ.copy()
    env["CALL_LOG"] = str(call_log)
    env["PATH"] = f"{fake_bin}:/usr/bin:/bin"
    result = subprocess.run(
        ["/bin/bash", str(copied_script), *args],
        cwd=project_root,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    calls = call_log.read_text(encoding="utf-8").splitlines() if call_log.exists() else []
    return result, calls


def test_with_worker_stops_beat_before_worker(tmp_path: Path) -> None:
    result, calls = _run_stop_system(tmp_path, "--with-worker")

    assert result.returncode == 0, result.stderr
    assert calls == ["beat", "worker"]


def test_without_optional_flags_stops_no_optional_helpers(tmp_path: Path) -> None:
    result, calls = _run_stop_system(tmp_path)

    assert result.returncode == 0, result.stderr
    assert calls == []


@pytest.mark.parametrize(
    ("args", "expected_calls"),
    [
        (("--with-infra",), ["infra"]),
        (("--remove-infra-volumes",), ["infra\t--remove-volumes"]),
    ],
)
def test_infra_flags_only_stop_infra(
    tmp_path: Path,
    args: tuple[str, ...],
    expected_calls: list[str],
) -> None:
    result, calls = _run_stop_system(tmp_path, *args)

    assert result.returncode == 0, result.stderr
    assert calls == expected_calls

"""Unit tests for the lightweight experiment registry.

The registry tracks strategy / market-data diagnostic runs with stable
metadata (run_id, timestamps, params, metrics, status, artifacts, and an
optional source_health snapshot). It supports in-memory and JSONL-backed
storage, deterministic serialization, and credential redaction on inbound
params and source_health reasons.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from src.research.experiments import (
    ExperimentRegistry,
    ExperimentRegistryError,
    VALID_RUN_STATUSES,
)


def test_create_run_assigns_id_and_timestamps_and_defaults():
    registry = ExperimentRegistry()

    run = registry.create_run(name="alpha-grid", kind="strategy_backtest")

    assert run["run_id"]
    assert run["name"] == "alpha-grid"
    assert run["kind"] == "strategy_backtest"
    assert run["status"] == "created"
    assert run["created_at"].endswith("Z")
    assert run["updated_at"] == run["created_at"]
    assert run["params"] == {}
    assert run["metrics"] == {}
    assert run["artifacts"] == []
    assert run["tags"] == []
    assert run["source_health"] is None


def test_create_run_accepts_optional_metadata_and_source_health():
    registry = ExperimentRegistry()

    run = registry.create_run(
        name="ff5-replication",
        kind="factor_diagnostic",
        params={"lookback": 252, "winsor": 0.01},
        artifacts=["s3://bucket/ff5/factors.parquet"],
        tags=["fama-french", "monthly"],
        source_health={
            "checked_at": "2026-05-13T12:00:00Z",
            "selected_source": "akshare",
            "fallback_used": False,
        },
    )

    assert run["params"] == {"lookback": 252, "winsor": 0.01}
    assert run["artifacts"] == ["s3://bucket/ff5/factors.parquet"]
    assert run["tags"] == ["fama-french", "monthly"]
    assert run["source_health"]["selected_source"] == "akshare"


def test_create_run_rejects_unknown_status():
    registry = ExperimentRegistry()

    with pytest.raises(ExperimentRegistryError):
        registry.create_run(name="bad", kind="x", status="bogus")


def test_get_run_returns_isolated_copy():
    registry = ExperimentRegistry()
    created = registry.create_run(name="iso", kind="strategy_backtest", params={"lr": 0.1})

    fetched = registry.get_run(created["run_id"])
    fetched["params"]["lr"] = 999
    fetched["artifacts"].append("mutated")

    # A second read must not see the caller's mutation.
    again = registry.get_run(created["run_id"])
    assert again["params"] == {"lr": 0.1}
    assert again["artifacts"] == []


def test_list_runs_orders_newest_first():
    registry = ExperimentRegistry()
    first = registry.create_run(name="a", kind="k")
    second = registry.create_run(name="b", kind="k")
    third = registry.create_run(name="c", kind="k")

    listed = [run["run_id"] for run in registry.list_runs()]
    assert listed == [third["run_id"], second["run_id"], first["run_id"]]


def test_list_runs_filters_by_kind_status_tags_and_limit():
    registry = ExperimentRegistry()
    backtest = registry.create_run(name="bt", kind="strategy_backtest", tags=["nightly"])
    diagnostic = registry.create_run(name="dq", kind="data_quality", tags=["nightly", "macro"])
    registry.update_run(diagnostic["run_id"], status="completed")
    registry.create_run(name="adhoc", kind="strategy_backtest", tags=["adhoc"])

    by_kind = registry.list_runs(kind="strategy_backtest")
    assert {run["name"] for run in by_kind} == {"bt", "adhoc"}

    by_status = registry.list_runs(status="completed")
    assert [run["name"] for run in by_status] == ["dq"]

    by_tag = registry.list_runs(tag="macro")
    assert [run["name"] for run in by_tag] == ["dq"]

    by_tag_and_kind = registry.list_runs(kind="strategy_backtest", tag="nightly")
    assert [run["name"] for run in by_tag_and_kind] == ["bt"]
    assert registry.list_runs(limit=0) == []
    assert len(registry.list_runs(limit=2)) == 2
    with pytest.raises(ExperimentRegistryError):
        registry.list_runs(limit=-1)
    assert backtest["status"] == "created"


def test_update_run_sets_status_metrics_and_artifacts_and_bumps_updated_at():
    registry = ExperimentRegistry()
    created = registry.create_run(name="run", kind="strategy_backtest")
    initial_updated_at = created["updated_at"]

    updated = registry.update_run(
        created["run_id"],
        status="running",
        metrics={"sharpe": 1.2, "max_dd": -0.18},
        artifacts=["report.json"],
        timestamp="2026-05-13T13:00:00Z",
    )

    assert updated["status"] == "running"
    assert updated["metrics"] == {"sharpe": 1.2, "max_dd": -0.18}
    assert updated["artifacts"] == ["report.json"]
    assert updated["updated_at"] == "2026-05-13T13:00:00Z"
    assert updated["updated_at"] != initial_updated_at
    assert updated["created_at"] == created["created_at"]


def test_update_run_merges_metrics_and_appends_artifacts_without_dupes():
    registry = ExperimentRegistry()
    created = registry.create_run(
        name="merge",
        kind="strategy_backtest",
        artifacts=["a.json"],
    )

    registry.update_run(created["run_id"], metrics={"sharpe": 1.0})
    final = registry.update_run(
        created["run_id"],
        metrics={"sharpe": 1.5, "trades": 42},
        artifacts=["a.json", "b.json"],
    )

    assert final["metrics"] == {"sharpe": 1.5, "trades": 42}
    assert final["artifacts"] == ["a.json", "b.json"]


def test_update_run_rejects_unknown_status_and_missing_id():
    registry = ExperimentRegistry()
    created = registry.create_run(name="bad", kind="x")

    with pytest.raises(ExperimentRegistryError):
        registry.update_run(created["run_id"], status="bogus")

    with pytest.raises(ExperimentRegistryError):
        registry.update_run("does-not-exist", status="running")


def test_valid_run_statuses_cover_lifecycle():
    assert {"created", "running", "completed", "failed", "aborted"}.issubset(VALID_RUN_STATUSES)


def test_create_run_redacts_api_keys_in_all_persisted_metadata(monkeypatch):
    registry = ExperimentRegistry()

    run = registry.create_run(
        name="leaky token=NAMESECRET",
        kind="strategy_backtest",
        params={
            "endpoint": "https://example.invalid/query?apikey=SECRET123&symbol=TEST",
            "dsn": "postgres://user@example.invalid/db?password=PGSECRET",
            "api_key": "raw-secret",
            "nested": {"token": "tok-987"},
        },
        metrics={"note": "authorization Bearer METRICSECRET"},
        artifacts=["https://example.invalid/report.json?secret=ARTIFACTSECRET"],
        tags=["bearer TAGSECRET"],
        source_health={
            "attempts": [
                {
                    "id": "akshare",
                    "ok": False,
                    "reason": "401 Authorization Bearer SECRET-XYZ",
                }
            ]
        },
    )

    flattened = json.dumps(run)
    for secret in [
        "NAMESECRET",
        "SECRET123",
        "PGSECRET",
        "raw-secret",
        "tok-987",
        "METRICSECRET",
        "ARTIFACTSECRET",
        "TAGSECRET",
        "SECRET-XYZ",
    ]:
        assert secret not in flattened
    assert run["params"]["api_key"] == "[REDACTED]"
    assert run["params"]["nested"]["token"] == "[REDACTED]"
    assert "[REDACTED]" in run["params"]["endpoint"]
    assert "[REDACTED]" in run["params"]["dsn"]
    assert "[REDACTED]" in run["metrics"]["note"]
    assert "[REDACTED]" in run["artifacts"][0]
    assert "[REDACTED]" in run["source_health"]["attempts"][0]["reason"]


def test_jsonl_persistence_round_trips_runs(tmp_path: Path):
    storage = tmp_path / "experiments.jsonl"
    registry = ExperimentRegistry(storage_path=storage)
    created = registry.create_run(
        name="persist",
        kind="strategy_backtest",
        params={"lr": 0.05},
    )
    registry.update_run(created["run_id"], status="completed", metrics={"sharpe": 0.9})

    raw_lines = storage.read_text().strip().splitlines()
    assert len(raw_lines) == 1
    parsed = json.loads(raw_lines[0])
    assert parsed["run_id"] == created["run_id"]
    assert parsed["status"] == "completed"

    reloaded = ExperimentRegistry(storage_path=storage)
    reloaded_run = reloaded.get_run(created["run_id"])
    assert reloaded_run["status"] == "completed"
    assert reloaded_run["metrics"] == {"sharpe": 0.9}


def test_jsonl_serialization_is_stable_across_writes(tmp_path: Path):
    storage = tmp_path / "experiments.jsonl"
    registry = ExperimentRegistry(storage_path=storage)
    run = registry.create_run(
        name="stable",
        kind="x",
        params={"b": 2, "a": 1},
        tags=["z", "a"],
    )
    first_dump = storage.read_text()

    registry.update_run(run["run_id"], metrics={"sharpe": 1.0})
    registry.update_run(run["run_id"], metrics={"sharpe": 1.0})

    second_dump = storage.read_text()
    # Field order is deterministic so the only difference between dumps is
    # the metrics update (and updated_at, which we control separately).
    first_payload = json.loads(first_dump.strip())
    second_payload = json.loads(second_dump.strip())
    assert list(first_payload.keys()) == list(second_payload.keys())
    assert first_payload["params"] == {"b": 2, "a": 1}
    assert first_payload["tags"] == ["z", "a"]


def test_jsonl_serialization_normalizes_non_finite_numbers(tmp_path: Path):
    storage = tmp_path / "experiments.jsonl"
    registry = ExperimentRegistry(storage_path=storage)
    run = registry.create_run(
        name="finite",
        kind="strategy_backtest",
        params={"bad": float("nan")},
        metrics={"sharpe": float("inf"), "drawdown": float("-inf")},
    )

    assert run["params"]["bad"] is None
    assert run["metrics"] == {"sharpe": None, "drawdown": None}
    raw = storage.read_text()
    assert "NaN" not in raw
    assert "Infinity" not in raw
    assert json.loads(raw)["metrics"] == {"sharpe": None, "drawdown": None}

def test_jsonl_load_raises_on_read_failure(tmp_path: Path, monkeypatch):
    storage = tmp_path / "experiments.jsonl"
    storage.write_text("{}\n")

    def boom(*args, **kwargs):
        raise OSError("permission denied")

    monkeypatch.setattr(Path, "read_text", boom)

    with pytest.raises(ExperimentRegistryError, match="Failed to read experiment registry"):
        ExperimentRegistry(storage_path=storage)


def test_jsonl_load_ignores_corrupt_lines(tmp_path: Path):
    storage = tmp_path / "experiments.jsonl"
    storage.write_text(
        '{"run_id": "good", "name": "g", "kind": "x", "status": "created", '
        '"created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z", '
        '"params": {}, "metrics": {}, "artifacts": [], "tags": [], "source_health": null}\n'
        "this-is-not-json\n"
        '{"run_id": "good2", "name": "g2", "kind": "x", "status": "completed", '
        '"created_at": "2026-01-02T00:00:00Z", "updated_at": "2026-01-02T00:00:00Z", '
        '"params": {}, "metrics": {}, "artifacts": [], "tags": [], "source_health": null}\n'
    )

    registry = ExperimentRegistry(storage_path=storage)

    ids = [run["run_id"] for run in registry.list_runs()]
    assert ids == ["good2", "good"]

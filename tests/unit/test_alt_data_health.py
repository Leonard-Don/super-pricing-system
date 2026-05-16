"""Tests for the alt-data runtime health manifest and /alt-data/health endpoint."""

from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import alt_data
from src.data.alternative.alt_data_manager import AltDataManager
from src.data.alternative.governance import AltDataSnapshotStore
from src.data.alternative.health_manifest import (
    ALT_DATA_HEALTH_MANIFEST,
    VALID_VERDICTS,
    VERDICT_DEAD,
    VERDICT_PRODUCTION,
    VERDICT_SCAFFOLDING_ONLY,
    VERDICT_WORKING_PROTOTYPE,
    ComponentHealth,
    refresh_runtime_state,
    summarize_manifest,
)
from tests.unit.test_alt_data_pipeline import DummyAltProvider


_ISO_8601_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2})?$"
)


def _build_client(monkeypatch, manager):
    app = FastAPI()
    app.include_router(alt_data.router, prefix="/alt-data")
    monkeypatch.setattr(alt_data, "_get_manager", lambda: manager)
    monkeypatch.setattr(alt_data, "_get_scheduler", lambda: None)
    return TestClient(app)


def _build_manager(tmp_path) -> AltDataManager:
    return AltDataManager(
        providers={"dummy_policy": DummyAltProvider()},
        snapshot_store=AltDataSnapshotStore(tmp_path / "alt_data"),
    )


def test_manifest_shape_post_phase_a_no_scaffolding_only():
    """The static manifest must not contain SCAFFOLDING-ONLY entries.

    The audit's Phase A actions cut every SCAFFOLDING-ONLY component from
    the active pipeline. The manifest is the runtime mirror of *real*
    verdicts, so SCAFFOLDING-ONLY must be absent after Phase A.
    """

    verdicts = [c.verdict for c in ALT_DATA_HEALTH_MANIFEST]
    assert VERDICT_SCAFFOLDING_ONLY not in verdicts, (
        f"manifest should have no SCAFFOLDING-ONLY entries post-Phase-A; "
        f"got verdicts {sorted(set(verdicts))}"
    )
    # Every verdict must be one of the four valid labels.
    for component in ALT_DATA_HEALTH_MANIFEST:
        assert component.verdict in VALID_VERDICTS

    # Phase B addition (shfe_inventory) and Phase D coverage (policy_radar
    # via NEA JSON) must both be present so the manifest stays in sync.
    names = {c.name for c in ALT_DATA_HEALTH_MANIFEST}
    assert "shfe_inventory" in names, "Phase B SHFE adapter missing from manifest"
    assert "policy_radar" in names, "policy_radar (Phase D coverage) missing from manifest"

    # Counts: 3 PRODUCTION (people_layer, entity_resolution, governance),
    # 4 WORKING-PROTOTYPE (policy_radar, policy_execution, lme_inventory,
    # shfe_inventory). No DEAD, no SCAFFOLDING-ONLY.
    summary = summarize_manifest(ALT_DATA_HEALTH_MANIFEST)
    assert summary["production_count"] == 3
    assert summary["working_prototype_count"] == 4
    assert summary["scaffolding_only_count"] == 0
    assert summary["dead_count"] == 0
    assert summary["total_components"] == len(ALT_DATA_HEALTH_MANIFEST) == 7


def test_runtime_overlay_reads_snapshot_mtime(tmp_path):
    """refresh_runtime_state should overlay the on-disk snapshot mtime."""

    manager = _build_manager(tmp_path)
    providers_dir = manager.snapshot_store.providers_dir
    providers_dir.mkdir(parents=True, exist_ok=True)

    # Write a stub policy_radar snapshot, then pin its mtime to a fixed value.
    snapshot_path = providers_dir / "policy_radar.json"
    snapshot_path.write_text(json.dumps({"records": []}), encoding="utf-8")
    fixed_epoch = time.mktime(time.strptime("2026-04-01 09:30:00", "%Y-%m-%d %H:%M:%S"))
    os.utime(snapshot_path, (fixed_epoch, fixed_epoch))

    overlaid = refresh_runtime_state(manager)
    policy_row = next(c for c in overlaid if c.name == "policy_radar")
    assert policy_row.last_refresh_at is not None
    assert policy_row.last_refresh_at.startswith("2026-04-01T")
    assert _ISO_8601_RE.match(policy_row.last_refresh_at), (
        f"last_refresh_at must be ISO-8601, got {policy_row.last_refresh_at!r}"
    )

    # Components without a snapshot key (entity_resolution, governance) must
    # surface None rather than a fabricated timestamp.
    entity_row = next(c for c in overlaid if c.name == "entity_resolution")
    assert entity_row.last_refresh_at is None
    governance_row = next(c for c in overlaid if c.name == "governance")
    assert governance_row.last_refresh_at is None

    # Snapshot file does not exist for shfe_inventory's underlying macro_hf
    # snapshot in this fresh tmp_path -- ensure None rather than crash.
    shfe_row = next(c for c in overlaid if c.name == "shfe_inventory")
    assert shfe_row.last_refresh_at is None


def test_runtime_overlay_does_not_mutate_static_manifest(tmp_path):
    """Static manifest must not be mutated by refresh_runtime_state."""

    manager = _build_manager(tmp_path)
    providers_dir = manager.snapshot_store.providers_dir
    providers_dir.mkdir(parents=True, exist_ok=True)
    (providers_dir / "policy_radar.json").write_text("{}", encoding="utf-8")

    _ = refresh_runtime_state(manager)
    for component in ALT_DATA_HEALTH_MANIFEST:
        assert component.last_refresh_at is None, (
            f"static manifest entry {component.name!r} was mutated"
        )


def test_health_endpoint_returns_200_with_expected_schema(monkeypatch, tmp_path):
    """GET /alt-data/health returns 200 with the documented payload shape."""

    manager = _build_manager(tmp_path)
    client = _build_client(monkeypatch, manager)

    response = client.get("/alt-data/health")
    assert response.status_code == 200
    payload = response.json()

    # Top-level keys
    for key in (
        "manifest",
        "generated_at",
        "audit_doc_url",
        "total_components",
        "production_count",
        "working_prototype_count",
        "scaffolding_only_count",
        "dead_count",
    ):
        assert key in payload, f"missing key {key!r} in /alt-data/health payload"

    # Manifest shape
    assert isinstance(payload["manifest"], list)
    assert len(payload["manifest"]) == payload["total_components"]
    assert payload["audit_doc_url"] == "docs/alt_data_audit.md"
    assert _ISO_8601_RE.match(payload["generated_at"]), (
        f"generated_at must be ISO-8601, got {payload['generated_at']!r}"
    )

    required_component_keys = {
        "name",
        "sub_package",
        "source",
        "cadence_minutes",
        "persistence_target",
        "verdict",
        "audit_section_ref",
        "last_refresh_at",
    }
    for entry in payload["manifest"]:
        assert required_component_keys.issubset(entry.keys()), (
            f"manifest row missing required keys: {required_component_keys - entry.keys()}"
        )
        assert entry["verdict"] in VALID_VERDICTS


def test_health_endpoint_counts_match_manifest_rows(monkeypatch, tmp_path):
    """Total + per-verdict counts must add up across the manifest rows."""

    manager = _build_manager(tmp_path)
    client = _build_client(monkeypatch, manager)

    payload = client.get("/alt-data/health").json()
    verdict_counts = {
        VERDICT_PRODUCTION: payload["production_count"],
        VERDICT_WORKING_PROTOTYPE: payload["working_prototype_count"],
        VERDICT_SCAFFOLDING_ONLY: payload["scaffolding_only_count"],
        VERDICT_DEAD: payload["dead_count"],
    }
    assert sum(verdict_counts.values()) == payload["total_components"]

    actual_counts: dict[str, int] = {v: 0 for v in VALID_VERDICTS}
    for entry in payload["manifest"]:
        actual_counts[entry["verdict"]] = actual_counts.get(entry["verdict"], 0) + 1
    for verdict, count in actual_counts.items():
        assert verdict_counts[verdict] == count, (
            f"verdict {verdict!r} count mismatch: "
            f"header={verdict_counts[verdict]}, rows={count}"
        )


def test_health_endpoint_last_refresh_at_is_iso_or_null(monkeypatch, tmp_path):
    """Each row's last_refresh_at must be ISO-8601 or null (no junk values)."""

    manager = _build_manager(tmp_path)
    providers_dir = manager.snapshot_store.providers_dir
    providers_dir.mkdir(parents=True, exist_ok=True)
    # Write a real snapshot for one provider so we exercise both branches.
    (providers_dir / "policy_radar.json").write_text("{}", encoding="utf-8")

    client = _build_client(monkeypatch, manager)
    payload = client.get("/alt-data/health").json()

    seen_iso = False
    seen_null = False
    for entry in payload["manifest"]:
        value = entry["last_refresh_at"]
        if value is None:
            seen_null = True
        else:
            assert _ISO_8601_RE.match(value), (
                f"last_refresh_at must be ISO-8601, got {value!r} for {entry['name']!r}"
            )
            seen_iso = True

    # entity_resolution + governance guarantee at least one null row;
    # policy_radar snapshot ensures at least one ISO row.
    assert seen_iso, "no ISO last_refresh_at returned despite policy_radar snapshot existing"
    assert seen_null, "expected utility rows (entity_resolution/governance) to have null last_refresh_at"


def test_component_health_rejects_invalid_verdict():
    """ComponentHealth must guard against typos in the verdict field."""

    with pytest.raises(ValueError) as exc_info:
        ComponentHealth(
            name="bogus",
            sub_package="bogus",
            source="bogus",
            cadence_minutes=None,
            persistence_target="bogus",
            verdict="MOSTLY-DEAD",
            audit_section_ref="bogus",
        )
    assert "Invalid verdict" in str(exc_info.value)


def test_health_endpoint_audit_doc_url_is_repo_relative(monkeypatch, tmp_path):
    """audit_doc_url must point at the repo-relative docs path, not an absolute URL."""

    manager = _build_manager(tmp_path)
    client = _build_client(monkeypatch, manager)

    payload = client.get("/alt-data/health").json()
    audit_url = payload["audit_doc_url"]
    assert audit_url == "docs/alt_data_audit.md"
    # Confirm the file exists relative to the repo root so consumers can fetch it.
    repo_root = Path(__file__).resolve().parents[2]
    assert (repo_root / audit_url).is_file(), (
        f"audit_doc_url {audit_url!r} should resolve to a real file under {repo_root}"
    )

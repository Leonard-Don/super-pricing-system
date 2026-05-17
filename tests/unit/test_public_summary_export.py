"""Unit tests for Phase F1 ``scripts/export_public_summary.py``.

Covers:

- All expected provider keys land in the output when all 5 snapshots exist.
- A missing provider snapshot is silently omitted (no synthetic data).
- An empty ``industry_signals`` map round-trips as ``{}`` rather than ``None``.
- ``schema_version`` is surfaced at the top level and matches the constant.
- Atomic write leaves no half-written file behind on failure.
- Sensitive runtime fields (file paths, raw record bodies, debug fields,
  ``_internal_*`` keys, ``provider_info`` block, ``refresh_status`` block)
  do **not** appear anywhere in the output JSON.
- Determinism: same input + fixed ``generated_at`` → byte-identical output.
- Components-health block aggregates the static manifest tier counts.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

import pytest

# Make sure the script module is importable when the test is collected via
# ``pytest`` from repo root. ``conftest.py`` already adds the repo root to
# ``sys.path``, so a plain import is enough.
import sys

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "scripts"))

import export_public_summary as export_module  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_policy_radar_snapshot() -> Dict[str, Any]:
    """A representative ``policy_radar.json`` payload (real-shape, trimmed)."""

    return {
        "provider": "policy_radar",
        "signal": {
            "source": "policy_radar",
            "category": "policy",
            "signal": 0,
            "strength": 0.25,
            "confidence": 0.6,
            "record_count": 20,
            "policy_count": 20,
            "industry_signals": {
                "新能源汽车": {
                    "avg_impact": -0.39,
                    "mentions": 8,
                    "signal": "bearish",
                },
                "电网": {
                    "avg_impact": 0.10,
                    "mentions": 4,
                    "signal": "neutral",
                },
            },
            "source_health": {
                "fed": {"record_count": 10, "full_text_ratio": 0.5, "level": "watch"},
                "ecb": {"record_count": 10, "full_text_ratio": 0.5, "level": "watch"},
                # ndrc/nea/boe deliberately missing -- distiller should
                # backfill them as 0.
            },
            "timestamp": "2026-05-05T11:00:55.132458",
            # Sensitive / debug fields we should NEVER surface:
            "_internal_debug_state": {"raw_html_bytes": "<html>...</html>"},
            "source_paths": ["/Users/foo/cache/alt_data/providers/policy_radar.json"],
        },
        "records": [
            {
                "record_id": "fakeid",
                "source": "policy_radar:fed",
                "raw_value": {
                    "title": "Long policy text body that shouldn't leak",
                    "full_html": "<html>secret</html>",
                },
            }
        ],
        "provider_info": {
            "last_update": "2026-05-05T11:00:55.132458",
            "secret_api_key_hash": "deadbeef",
        },
        "snapshot_timestamp": "2026-05-05T11:00:55.132458",
        "refresh_status": {
            "provider": "policy_radar",
            "last_success_at": "2026-05-05T11:00:55.132458",
            "duration_ms": 53962.07,
        },
    }


def _make_macro_hf_snapshot() -> Dict[str, Any]:
    return {
        "provider": "macro_hf",
        "signal": {
            "source": "macro_hf",
            "category": "macro_hf",
            "record_count": 4,
            "dimensions": {
                "inventory": {"count": 2, "score": 0.0},
                "trade": {"count": 1, "score": 0.0},
            },
            "macro_pressure": 0.0,
            "source_mode_summary": {
                "counts": {"proxy": 1, "live": 1},
                "dominant": "live",
            },
            "timestamp": "2026-05-05T11:02:15.485885",
        },
        "records": [
            {
                "raw_value": {
                    "data_type": "inventory",
                    "metal": "copper",
                    "trend": "destocking",
                    "price_change_pct": -2.5,
                    "volatility": 28.85,
                    "confidence": 0.7,
                    "source_mode": "live",
                    "lag_days": 1,
                    "coverage": 1.0,
                }
            },
            {
                "raw_value": {
                    "data_type": "inventory",
                    "metal": "copper",
                    "trend": "stable",
                    "price_change_pct": -0.86,
                    "volatility": 28.85,
                    "confidence": 0.086,
                    "source_mode": "proxy",
                    "lag_days": 1,
                    "coverage": 0.68,
                }
            },
            # Non-inventory record should be skipped by the distiller.
            {
                "raw_value": {
                    "data_type": "customs",
                    "category": "semiconductors",
                }
            },
        ],
        "snapshot_timestamp": "2026-05-05T11:02:15.485885",
        "refresh_status": {"provider": "macro_hf"},
    }


def _make_people_layer_snapshot() -> Dict[str, Any]:
    return {
        "provider": "people_layer",
        "signal": {
            "source": "people_layer",
            "category": "people_layer",
            "record_count": 33,
            "company_count": 16,
            "fragile_company_count": 2,
            "supportive_company_count": 14,
            "avg_fragility_score": 0.20,
            "avg_quality_score": 0.45,
            "source_mode_summary": {
                "counts": {"curated": 28, "proxy": 5},
                "dominant": "curated",
            },
            "watchlist": [
                {
                    "symbol": "BABA",
                    "company_name": "阿里巴巴",  # leak-test: name kept off
                    "risk_level": "high",
                    "stance": "fragile",
                    "people_fragility_score": 0.33,
                    "people_quality_score": 0.38,
                    "evidence": {"hiring": {"summary": "do-not-leak"}},
                }
            ],
            "timestamp": "2026-05-05T11:02:15.641591",
        },
        "snapshot_timestamp": "2026-05-05T11:02:15.641591",
    }


def _make_policy_execution_snapshot() -> Dict[str, Any]:
    return {
        "provider": "policy_execution",
        "signal": {
            "department_count": 2,
            "chaotic_department_count": 2,
            "reversal_count": 4,
            "department_board": [
                {
                    "department": "fed",
                    "department_label": "FED",
                    "record_count": 20,
                    "chaos_score": 1.0,
                    "label": "chaotic",
                    "policy_reversal_count": 2,
                    "execution_status": "reversal_cluster",
                    "lag_days": 3,
                    "latest_title": "should-not-leak-headline",
                }
            ],
            "timestamp": "2026-05-05T11:02:15.649270",
        },
        "snapshot_timestamp": "2026-05-05T11:02:15.649270",
    }


def _make_supply_chain_snapshot() -> Dict[str, Any]:
    return {
        "provider": "supply_chain",
        "signal": {
            "alert_count": 0,
            "dimensions": {
                "talent_structure": {"score": 0.0, "count": 7, "label": "人才结构信号"}
            },
            "timestamp": "2026-05-05T11:02:06.981462",
        },
        "snapshot_timestamp": "2026-05-05T11:02:06.981462",
    }


@pytest.fixture
def populated_providers_dir(tmp_path: Path) -> Path:
    """Write all 5 provider snapshots into a tmp providers dir."""

    providers_dir = tmp_path / "providers"
    providers_dir.mkdir()
    (providers_dir / "policy_radar.json").write_text(
        json.dumps(_make_policy_radar_snapshot()), encoding="utf-8"
    )
    (providers_dir / "macro_hf.json").write_text(
        json.dumps(_make_macro_hf_snapshot()), encoding="utf-8"
    )
    (providers_dir / "people_layer.json").write_text(
        json.dumps(_make_people_layer_snapshot()), encoding="utf-8"
    )
    (providers_dir / "policy_execution.json").write_text(
        json.dumps(_make_policy_execution_snapshot()), encoding="utf-8"
    )
    (providers_dir / "supply_chain.json").write_text(
        json.dumps(_make_supply_chain_snapshot()), encoding="utf-8"
    )
    return providers_dir


@pytest.fixture
def version_file(tmp_path: Path) -> Path:
    path = tmp_path / "VERSION"
    path.write_text("4.2.0\n", encoding="utf-8")
    return path


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_export_contains_all_five_provider_keys(populated_providers_dir, version_file):
    payload = export_module.build_public_summary(
        populated_providers_dir,
        version_path=version_file,
        generated_at="2026-05-17T00:00:00+00:00",
        include_components_health=False,
    )
    assert set(payload["providers"].keys()) == {
        "policy_radar",
        "macro_hf",
        "people_layer",
        "policy_execution",
        "supply_chain",
    }


def test_missing_provider_is_omitted_from_output(populated_providers_dir, version_file):
    # Drop policy_execution; the output must not synthesise it.
    (populated_providers_dir / "policy_execution.json").unlink()

    payload = export_module.build_public_summary(
        populated_providers_dir,
        version_path=version_file,
        generated_at="2026-05-17T00:00:00+00:00",
        include_components_health=False,
    )
    assert "policy_execution" not in payload["providers"]
    assert set(payload["providers"].keys()) == {
        "policy_radar",
        "macro_hf",
        "people_layer",
        "supply_chain",
    }


def test_empty_industry_signals_round_trips_as_empty_dict(tmp_path: Path):
    providers_dir = tmp_path / "providers"
    providers_dir.mkdir()
    snapshot = _make_policy_radar_snapshot()
    snapshot["signal"]["industry_signals"] = {}
    (providers_dir / "policy_radar.json").write_text(
        json.dumps(snapshot), encoding="utf-8"
    )

    payload = export_module.build_public_summary(
        providers_dir,
        generated_at="2026-05-17T00:00:00+00:00",
        include_components_health=False,
    )
    assert payload["providers"]["policy_radar"]["industry_signals"] == {}
    # Explicit: graceful empty, not None.
    assert payload["providers"]["policy_radar"]["industry_signals"] is not None


def test_schema_version_surfaces_in_output(populated_providers_dir, version_file):
    payload = export_module.build_public_summary(
        populated_providers_dir,
        version_path=version_file,
        generated_at="2026-05-17T00:00:00+00:00",
        include_components_health=False,
    )
    assert payload["schema_version"] == export_module.SCHEMA_VERSION
    assert payload["schema_version"] == 1  # current value -- bumps on breaking change


def test_atomic_write_swaps_file_in_one_step(populated_providers_dir, version_file, tmp_path):
    output_path = tmp_path / "public" / "alt_data_summary.json"
    payload = export_module.build_public_summary(
        populated_providers_dir,
        version_path=version_file,
        generated_at="2026-05-17T00:00:00+00:00",
        include_components_health=False,
    )
    export_module.write_public_summary_atomic(payload, output_path)

    # File exists and is parseable JSON identical to the payload (modulo
    # JSON key ordering, which sort_keys guarantees).
    assert output_path.exists()
    written = json.loads(output_path.read_text(encoding="utf-8"))
    assert written == payload
    # No tempfile leftover next to the target.
    leftovers = list(output_path.parent.glob("alt_data_summary-*.json.tmp"))
    assert leftovers == [], f"Tempfile not cleaned up: {leftovers}"


def test_atomic_write_cleans_up_tempfile_on_write_failure(monkeypatch, tmp_path):
    """If json.dump explodes mid-write, the tempfile is unlinked, output stays untouched."""

    output_path = tmp_path / "alt_data_summary.json"
    # Pre-existing file we must not corrupt.
    output_path.write_text('{"prior":"state"}', encoding="utf-8")

    def _explode(*_args, **_kwargs):
        raise RuntimeError("simulated serialization failure")

    monkeypatch.setattr(export_module.json, "dump", _explode)

    with pytest.raises(RuntimeError, match="simulated"):
        export_module.write_public_summary_atomic({"foo": "bar"}, output_path)

    # Output untouched.
    assert output_path.read_text(encoding="utf-8") == '{"prior":"state"}'
    # No half-written tempfile lingering.
    leftovers = list(tmp_path.glob("alt_data_summary-*.json.tmp"))
    assert leftovers == []


def test_sensitive_runtime_fields_are_excluded(populated_providers_dir, version_file):
    payload = export_module.build_public_summary(
        populated_providers_dir,
        version_path=version_file,
        generated_at="2026-05-17T00:00:00+00:00",
        include_components_health=False,
    )
    blob = json.dumps(payload, ensure_ascii=False)

    # File-system paths must never leak.
    assert "/Users/" not in blob
    assert "/cache/" not in blob
    assert ".json" not in blob  # no file extensions in values

    # Internal / debug fields and secret-bearing keys must never leak.
    assert "_internal_debug_state" not in blob
    assert "secret_api_key_hash" not in blob
    assert "deadbeef" not in blob
    assert "source_paths" not in blob

    # Raw record bodies and full HTML must never leak.
    assert "raw_value" not in blob
    assert "full_html" not in blob
    assert "<html>" not in blob
    assert "Long policy text body that shouldn't leak" not in blob

    # Runtime envelopes (provider_info, refresh_status, records) must not
    # appear as keys in the public output.
    for provider in payload["providers"].values():
        assert "provider_info" not in provider
        assert "refresh_status" not in provider
        assert "records" not in provider
        # No keys starting with underscore (debug convention).
        assert all(not k.startswith("_") for k in provider.keys())


def test_determinism_same_input_same_output(populated_providers_dir, version_file):
    """Same input + fixed generated_at → byte-identical JSON output."""

    fixed_stamp = "2026-05-17T00:00:00+00:00"
    first = export_module.build_public_summary(
        populated_providers_dir,
        version_path=version_file,
        generated_at=fixed_stamp,
        include_components_health=False,
    )
    second = export_module.build_public_summary(
        populated_providers_dir,
        version_path=version_file,
        generated_at=fixed_stamp,
        include_components_health=False,
    )
    # Same structure.
    assert first == second
    # Same serialized bytes when sort_keys + indent are pinned.
    assert json.dumps(first, ensure_ascii=False, indent=2, sort_keys=True) == json.dumps(
        second, ensure_ascii=False, indent=2, sort_keys=True
    )


def test_policy_radar_by_source_backfills_canonical_zeros(
    populated_providers_dir, version_file
):
    """Even when ndrc/nea/boe report nothing, the keys appear with 0."""

    payload = export_module.build_public_summary(
        populated_providers_dir,
        version_path=version_file,
        generated_at="2026-05-17T00:00:00+00:00",
        include_components_health=False,
    )
    by_source = payload["providers"]["policy_radar"]["by_source"]
    assert by_source["fed"] == 10
    assert by_source["ecb"] == 10
    assert by_source["ndrc"] == 0
    assert by_source["nea"] == 0
    assert by_source["boe"] == 0


def test_macro_hf_metals_aggregate_with_region_breakdown(
    populated_providers_dir, version_file
):
    """Inventory records collapse per metal with per-region breakdown."""

    payload = export_module.build_public_summary(
        populated_providers_dir,
        version_path=version_file,
        generated_at="2026-05-17T00:00:00+00:00",
        include_components_health=False,
    )
    copper = payload["providers"]["macro_hf"]["metals"]["copper"]
    # Two source_modes (live + proxy) → two region buckets.
    assert set(copper["region_breakdown"].keys()) == {"SHFE", "LME"}
    # Top-level weekly_change_pct prefers SHFE (live) over LME (proxy).
    assert copper["weekly_change_pct"] == pytest.approx(-2.5)
    assert copper["trend"] == "destocking"


def test_components_health_aggregates_static_manifest():
    """The components_health block mirrors the health_manifest tier counts."""

    pytest.importorskip("src.data.alternative.health_manifest")
    health = export_module._build_components_health()
    # Phase F3 adds northbound (9 total components):
    # 3 PRODUCTION (people_layer, entity_resolution, governance)
    # 6 WORKING-PROTOTYPE (policy_radar, policy_execution, lme_inventory,
    # shfe_inventory, fund_holdings, northbound), 0 SCAFFOLDING-ONLY, 0 DEAD.
    assert health["total"] == 9
    assert health["production"] == 3
    assert health["working_prototype"] == 6
    assert health["scaffolding_only"] == 0
    assert health["dead"] == 0


def test_export_writes_to_disk_via_export_helper(
    populated_providers_dir, version_file, tmp_path
):
    """End-to-end: ``export_public_summary`` builds + atomic-writes."""

    output_path = tmp_path / "public" / "alt_data_summary.json"
    payload = export_module.export_public_summary(
        populated_providers_dir,
        output_path,
        version_path=version_file,
        generated_at="2026-05-17T00:00:00+00:00",
    )
    assert output_path.exists()
    written = json.loads(output_path.read_text(encoding="utf-8"))
    # ``components_health`` is included by default; can't compare equality
    # to ``payload`` unless we account for it.
    assert written["schema_version"] == 1
    assert written["generated_at"] == "2026-05-17T00:00:00+00:00"
    assert written["source_codebase_version"] == "4.2.0"
    assert set(written["providers"].keys()) == set(payload["providers"].keys())

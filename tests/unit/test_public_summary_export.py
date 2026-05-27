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

# Make sure the script module is importable when the test is collected via
# ``pytest`` from repo root. ``conftest.py`` already adds the repo root to
# ``sys.path``, so a plain import is enough.
import sys
from pathlib import Path
from typing import Any, Dict

import pytest

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
    # Block-trades provider adds the 10th component:
    # 3 PRODUCTION (people_layer, entity_resolution, governance)
    # 7 WORKING-PROTOTYPE (policy_radar, policy_execution, lme_inventory,
    # shfe_inventory, fund_holdings, northbound, block_trades),
    # 0 SCAFFOLDING-ONLY, 0 DEAD.
    assert health["total"] == 10
    assert health["production"] == 3
    assert health["working_prototype"] == 7
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


def test_live_macro_briefing_human_copy_uses_localized_provider_labels():
    """Committed public artifact must not leak raw slugs in human copy."""

    summary_path = REPO_ROOT / "data" / "public" / "alt_data_summary.json"
    if not summary_path.exists():
        pytest.skip(
            "data/public/alt_data_summary.json missing -- run "
            "scripts/export_public_summary.py to regenerate."
        )

    payload = json.loads(summary_path.read_text(encoding="utf-8"))
    macro = payload.get("macro_briefing") or {}
    human_copy_parts = [macro.get("summary_paragraph") or ""]
    for theme in macro.get("top_3_themes") or []:
        if isinstance(theme, dict):
            human_copy_parts.append(theme.get("headline") or "")
    human_copy = " ".join(human_copy_parts)

    for label in ("基金持仓", "上期所库存", "人事层"):
        assert label in human_copy
    for raw_slug in ("fund_holdings", "shfe_inventory", "people_layer"):
        assert raw_slug not in human_copy


# ---------------------------------------------------------------------------
# Phase F1.1 — Chinese localization (``*_zh`` parallel fields)
# ---------------------------------------------------------------------------


def _contains_cjk(text: str) -> bool:
    """Cheap check: does ``text`` contain at least one CJK unified ideograph?

    The localization helper falls back to the raw English token when no
    Chinese gloss is registered, so a passing assertion here means we
    actually have a Chinese translation rather than a silent identity copy.
    """

    return any("一" <= ch <= "鿿" for ch in text or "")


def test_localization_zh_parallel_fields_present_on_live_data():
    """Phase F1.1: every F7/F8/F9 section emitting English enum tokens MUST
    have a parallel ``*_zh`` field with the same length and Chinese-bearing
    entries.

    This is a schema invariant — we don't pin specific industry names or
    cluster labels, only the structural contract:

    1. Raw token field is preserved (programmatic consumers unchanged).
    2. Parallel ``*_zh`` field exists alongside it.
    3. Length matches.
    4. Every entry in the parallel field is a non-empty string that
       contains at least one CJK character (so a missing-gloss fallback
       to the raw token would fail this assertion and surface the gap).

    Runs against the live committed ``data/public/alt_data_summary.json``
    so a regenerated artifact lacking the parallel fields trips this test
    in CI even before the export-script unit tests catch it.
    """

    summary_path = REPO_ROOT / "data" / "public" / "alt_data_summary.json"
    if not summary_path.exists():
        pytest.skip(
            "data/public/alt_data_summary.json missing -- run "
            "scripts/export_public_summary.py to regenerate."
        )

    payload = json.loads(summary_path.read_text(encoding="utf-8"))

    def _assert_parallel_list(parent: dict, raw_key: str, where: str) -> None:
        zh_key = f"{raw_key}_zh"
        raw = parent.get(raw_key)
        if raw is None:
            return  # field not present — nothing to assert
        assert isinstance(raw, list), f"{where}.{raw_key} must be a list"
        assert zh_key in parent, f"{where}.{zh_key} missing (parallel to {raw_key})"
        zh = parent[zh_key]
        assert isinstance(zh, list), f"{where}.{zh_key} must be a list"
        assert len(zh) == len(raw), (
            f"{where}: {raw_key} ({len(raw)}) and {zh_key} ({len(zh)}) "
            "must have equal length"
        )
        for idx, entry in enumerate(zh):
            assert isinstance(entry, str) and entry, (
                f"{where}.{zh_key}[{idx}] must be a non-empty string"
            )
            assert _contains_cjk(entry), (
                f"{where}.{zh_key}[{idx}]={entry!r} must contain a Chinese "
                "character (missing gloss fell back to raw token?)"
            )

    def _assert_parallel_scalar(parent: dict, raw_key: str, where: str) -> None:
        zh_key = f"{raw_key}_zh"
        raw = parent.get(raw_key)
        if not isinstance(raw, str) or not raw:
            return
        assert zh_key in parent, f"{where}.{zh_key} missing (parallel to {raw_key})"
        zh = parent[zh_key]
        assert isinstance(zh, str) and zh, f"{where}.{zh_key} must be non-empty"
        assert _contains_cjk(zh), (
            f"{where}.{zh_key}={zh!r} must contain a Chinese character"
        )

    # ---- F8: composite_cluster_aware ---------------------------------
    cluster_aware = payload.get("composite_cluster_aware") or {}
    for bucket_key in ("top_3_bullish", "top_3_bearish"):
        for idx, row in enumerate(cluster_aware.get(bucket_key, []) or []):
            assert isinstance(row, dict), (
                f"composite_cluster_aware.{bucket_key}[{idx}] must be a dict"
            )
            _assert_parallel_list(
                row,
                "supporting_clusters",
                f"composite_cluster_aware.{bucket_key}[{idx}]",
            )

    # ---- F6: cross_archive_themes ------------------------------------
    themes = payload.get("cross_archive_themes") or {}
    for bucket_key in ("top_3_high_conviction", "top_3_medium_conviction"):
        for idx, row in enumerate(themes.get(bucket_key, []) or []):
            _assert_parallel_list(
                row,
                "supporting_archives",
                f"cross_archive_themes.{bucket_key}[{idx}]",
            )

    # ---- F7: provider_correlation ------------------------------------
    corr = payload.get("provider_correlation") or {}
    _assert_parallel_list(corr, "providers", "provider_correlation")
    # redundancy_clusters is a list[list[str]]; structure check is custom.
    if "redundancy_clusters" in corr:
        clusters_raw = corr.get("redundancy_clusters") or []
        assert "redundancy_clusters_zh" in corr, (
            "provider_correlation.redundancy_clusters_zh missing"
        )
        clusters_zh = corr["redundancy_clusters_zh"]
        assert isinstance(clusters_zh, list)
        assert len(clusters_zh) == len(clusters_raw)
        for cluster_idx, (raw_cluster, zh_cluster) in enumerate(
            zip(clusters_raw, clusters_zh)
        ):
            assert len(raw_cluster) == len(zh_cluster), (
                f"provider_correlation.redundancy_clusters[{cluster_idx}] "
                f"and _zh must have equal length"
            )
            for member_idx, member in enumerate(zh_cluster):
                assert isinstance(member, str) and member, (
                    f"redundancy_clusters_zh[{cluster_idx}][{member_idx}] "
                    "must be a non-empty string"
                )
                assert _contains_cjk(member), (
                    f"redundancy_clusters_zh[{cluster_idx}][{member_idx}]"
                    f"={member!r} must contain a Chinese character"
                )

    # ---- providers.<X>.evidence_link ---------------------------------
    for name, provider_payload in (payload.get("providers") or {}).items():
        ev = provider_payload.get("evidence_link") or {}
        _assert_parallel_scalar(ev, "component", f"providers.{name}.evidence_link")
        _assert_parallel_scalar(ev, "source_mode", f"providers.{name}.evidence_link")

    # ---- policy_execution.departments[] ------------------------------
    policy_exec = (payload.get("providers") or {}).get("policy_execution") or {}
    for idx, dept in enumerate(policy_exec.get("departments") or []):
        _assert_parallel_scalar(
            dept,
            "department",
            f"providers.policy_execution.departments[{idx}]",
        )
        _assert_parallel_scalar(
            dept,
            "execution_status",
            f"providers.policy_execution.departments[{idx}]",
        )

    # ---- F9: theme_diversity.dominant_cluster ------------------------
    diversity = payload.get("theme_diversity") or {}
    for bucket_key in (
        "top_5_high_diversity",
        "top_5_medium_diversity",
        "top_5_low_diversity",
    ):
        for idx, row in enumerate(diversity.get(bucket_key, []) or []):
            _assert_parallel_scalar(
                row,
                "dominant_cluster",
                f"theme_diversity.{bucket_key}[{idx}]",
            )

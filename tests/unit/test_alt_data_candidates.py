"""Tests for the alt-data candidate task queue (Phase E3).

Covers:

- Generation thresholds for policy_radar (|avg_impact| + mentions) and
  SHFE (|weekly_change_pct|).
- Deduplication of repeat signals across reconcile() calls.
- State transitions: pending -> dismissed / snoozed / converted, plus
  auto-unsnooze when ``snoozed_until`` is in the past.
- JSON persistence using the atomic-rename pattern.
- Pruning of stale candidates with no recurring signal.
- HTTP endpoint shapes for list / refresh / convert / dismiss / snooze.
"""

from __future__ import annotations

import json
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api.v1.endpoints import research_workbench as rw_endpoint
from src.data.alternative.alt_data_manager import AltDataManager
from src.data.alternative.base_alt_provider import (
    AltDataCategory,
    AltDataRecord,
    BaseAltDataProvider,
)
from src.data.alternative.governance import AltDataSnapshotStore
from src.research import alt_data_candidates
from src.research.alt_data_candidates import (
    AltDataCandidate,
    CandidateStore,
    candidate_to_task_payload,
    generate_candidates_from_alt_data,
)


# ---------------------------------------------------------------------------
# Stub providers (mirror the fixtures used in test_alt_data_narrative.py)
# ---------------------------------------------------------------------------


class _StubPolicyProvider(BaseAltDataProvider):
    name = "policy_radar"
    category = AltDataCategory.POLICY

    def __init__(self, industry_signals: Dict[str, Dict[str, float]]):
        super().__init__()
        self._industry_signals = industry_signals
        self._latest_signal_payload = {
            "provider": "policy_radar",
            "source": "policy_radar",
            "category": "policy",
            "record_count": 12,
            "industry_signals": industry_signals,
            "source_health": {"fed": {"record_count": 5}},
        }

    def fetch(self, **kwargs):  # pragma: no cover
        return []

    def parse(self, raw_data):  # pragma: no cover
        return raw_data

    def normalize(self, parsed_data):  # pragma: no cover
        return []


class _StubMacroProvider(BaseAltDataProvider):
    name = "macro_hf"
    category = AltDataCategory.COMMODITY_INVENTORY

    def __init__(self, shfe_metals: List[Dict[str, float]]):
        super().__init__()
        self._shfe_metals = shfe_metals
        self._latest_signal_payload = {
            "provider": "macro_hf",
            "source": "macro_hf",
            "category": "commodity_inventory",
            "record_count": len(shfe_metals),
        }

    def fetch(self, **kwargs):  # pragma: no cover
        return []

    def parse(self, raw_data):  # pragma: no cover
        return raw_data

    def normalize(self, parsed_data):  # pragma: no cover
        return []

    def seed_history(self) -> List[AltDataRecord]:
        records: List[AltDataRecord] = []
        now = datetime.now().replace(microsecond=0)
        for index, spec in enumerate(self._shfe_metals):
            records.append(
                AltDataRecord(
                    timestamp=now - timedelta(minutes=index),
                    source=f"macro_hf:inventory:shfe:{spec['metal'].lower()}",
                    category=AltDataCategory.COMMODITY_INVENTORY,
                    raw_value={
                        "metal": spec["metal"],
                        "name": spec["name"],
                        "trend": spec.get("trend", "destocking"),
                        "weekly_change_pct": spec["weekly_change_pct"],
                        "latest_stock": spec.get("latest_stock", 100000),
                        "latest_date": spec.get("latest_date", "2026-05-15"),
                    },
                    normalized_score=0.5,
                    confidence=0.6,
                    tags=[spec["name"]],
                    metadata={"region": "SHFE", "label": spec["name"]},
                )
            )
        self._history = records
        return records


def _seed_manager(
    tmp_path: Path,
    *,
    industry_signals: Dict[str, Dict[str, float]],
    shfe_metals: List[Dict[str, float]],
) -> AltDataManager:
    providers: Dict[str, BaseAltDataProvider] = {}
    if industry_signals:
        providers["policy_radar"] = _StubPolicyProvider(industry_signals)
    if shfe_metals:
        providers["macro_hf"] = _StubMacroProvider(shfe_metals)

    store = AltDataSnapshotStore(tmp_path / "alt_data")
    manager = AltDataManager(providers=providers, snapshot_store=store)
    for name, provider in providers.items():
        manager.latest_signals[name] = provider._latest_signal_payload  # type: ignore[attr-defined]
    if "macro_hf" in providers:
        providers["macro_hf"].seed_history()  # type: ignore[attr-defined]
    return manager


@pytest.fixture()
def fresh_store(tmp_path):
    storage_path = tmp_path / "alt_data_candidates.json"
    store = CandidateStore(storage_path=storage_path)
    yield store
    alt_data_candidates.reset_candidate_store_for_tests(None)


# ---------------------------------------------------------------------------
# Generation thresholds
# ---------------------------------------------------------------------------


def test_policy_radar_generation_respects_impact_threshold(tmp_path):
    """Only industries with |avg_impact| >= 0.30 and mentions >= 3 qualify."""

    manager = _seed_manager(
        tmp_path,
        industry_signals={
            "新能源汽车": {"avg_impact": -0.35, "mentions": 8, "signal": "bearish"},
            "AI算力": {"avg_impact": 0.08, "mentions": 2, "signal": "neutral"},
            "光伏": {"avg_impact": -0.40, "mentions": 1, "signal": "bearish"},
            "5G": {"avg_impact": 0.40, "mentions": 5, "signal": "bullish"},
        },
        shfe_metals=[],
    )

    candidates = generate_candidates_from_alt_data(manager)
    industries = sorted(c.industry for c in candidates)

    assert "新能源汽车" in industries
    assert "5G" in industries
    assert "AI算力" not in industries  # below impact threshold
    assert "光伏" not in industries  # below mentions threshold


def test_shfe_generation_respects_weekly_change_threshold(tmp_path):
    """Only SHFE metals with |weekly_change_pct| >= 5% qualify."""

    manager = _seed_manager(
        tmp_path,
        industry_signals={},
        shfe_metals=[
            {"metal": "cu", "name": "铜", "weekly_change_pct": -7.5, "trend": "destocking"},
            {"metal": "al", "name": "铝", "weekly_change_pct": 3.2, "trend": "stable"},
            {"metal": "zn", "name": "锌", "weekly_change_pct": 6.1, "trend": "restocking"},
        ],
    )

    candidates = generate_candidates_from_alt_data(manager)
    metals = sorted(c.industry for c in candidates)

    assert "铜" in metals
    assert "锌" in metals
    assert "铝" not in metals  # below 5% threshold


def test_generation_combines_policy_and_macro_sources(tmp_path):
    manager = _seed_manager(
        tmp_path,
        industry_signals={
            "新能源汽车": {"avg_impact": -0.35, "mentions": 8, "signal": "bearish"},
        },
        shfe_metals=[
            {"metal": "cu", "name": "铜", "weekly_change_pct": -7.5, "trend": "destocking"},
        ],
    )
    candidates = generate_candidates_from_alt_data(manager)
    components = sorted({c.source_component for c in candidates})
    assert components == ["macro_hf", "policy_radar"]


# ---------------------------------------------------------------------------
# Deduplication & reconciliation
# ---------------------------------------------------------------------------


def test_reconcile_dedup_preserves_state(fresh_store, tmp_path):
    """Re-running reconcile() with the same signal doesn't duplicate rows."""

    manager = _seed_manager(
        tmp_path / "round1",
        industry_signals={
            "新能源汽车": {"avg_impact": -0.35, "mentions": 8, "signal": "bearish"},
        },
        shfe_metals=[],
    )
    first = generate_candidates_from_alt_data(manager)
    stats_1 = fresh_store.reconcile(first)
    assert stats_1["added"] == 1
    assert stats_1["updated"] == 0
    assert stats_1["total"] == 1

    # User dismisses the candidate.
    target_id = first[0].candidate_id
    fresh_store.dismiss(target_id)

    # Same signal recurs — should NOT re-create or revive the dismissed row.
    second = generate_candidates_from_alt_data(manager)
    stats_2 = fresh_store.reconcile(second)
    assert stats_2["added"] == 0
    assert stats_2["updated"] == 1
    assert stats_2["total"] == 1

    stored = fresh_store.get_candidate(target_id)
    assert stored is not None
    assert stored.state == "dismissed"


def test_reconcile_prunes_stale_candidates(tmp_path):
    """A candidate not seen in >stale_days is dropped on the next reconcile."""

    storage_path = tmp_path / "candidates.json"
    store = CandidateStore(storage_path=storage_path, stale_days=10)

    # Inject a stale candidate via reconcile with a faked "old" generated_at.
    old_iso = (datetime.now(tz=timezone.utc) - timedelta(days=20)).replace(microsecond=0).isoformat()
    stale_candidate = AltDataCandidate(
        candidate_id="altcand_policy_radar_policy_radar_industry_老行业",
        source_component="policy_radar",
        signal_type="policy_radar_industry",
        industry="老行业",
        headline="老旧候选",
        impact_score=-0.4,
        mentions=5,
        generated_at=old_iso,
        state="pending",
        last_seen_at=old_iso,
    )
    store.reconcile([stale_candidate])
    assert store.get_candidate(stale_candidate.candidate_id) is not None

    # Reconcile with an empty incoming list — stale candidate should be pruned.
    stats = store.reconcile([])
    assert stats["pruned"] == 1
    assert store.get_candidate(stale_candidate.candidate_id) is None


# ---------------------------------------------------------------------------
# State transitions
# ---------------------------------------------------------------------------


def test_dismiss_transitions_state(tmp_path):
    storage_path = tmp_path / "cands.json"
    store = CandidateStore(storage_path=storage_path)
    candidate = AltDataCandidate(
        candidate_id="altcand_policy_radar_policy_radar_industry_AI",
        source_component="policy_radar",
        signal_type="policy_radar_industry",
        industry="AI",
        headline="政策雷达：AI 多头",
        impact_score=0.4,
        mentions=5,
        generated_at=datetime.now(tz=timezone.utc).isoformat(),
    )
    store.reconcile([candidate])

    result = store.dismiss(candidate.candidate_id)
    assert result is not None
    assert result.state == "dismissed"
    pending = store.list_candidates(state="pending")
    assert pending == []


def test_snooze_auto_unblocks_after_expiry(tmp_path):
    storage_path = tmp_path / "cands.json"
    store = CandidateStore(storage_path=storage_path)
    now = datetime.now(tz=timezone.utc).replace(microsecond=0)
    candidate = AltDataCandidate(
        candidate_id="altcand_macro_hf_shfe_inventory_weekly_铜",
        source_component="macro_hf",
        signal_type="shfe_inventory_weekly",
        industry="铜",
        headline="SHFE 库存：铜 -7%",
        impact_score=-7.0,
        mentions=1,
        generated_at=now.isoformat(),
        last_seen_at=now.isoformat(),
    )
    store.reconcile([candidate], now=now)

    store.snooze(candidate.candidate_id, hours=1, now=now)
    snoozed = store.get_candidate(candidate.candidate_id)
    assert snoozed is not None and snoozed.state == "snoozed"
    assert snoozed.snoozed_until

    # Before expiry: still snoozed.
    pending_now = store.list_candidates(state="pending", now=now)
    assert pending_now == []

    # After expiry: auto-unsnooze flips it back to pending.
    future = now + timedelta(hours=2)
    pending_future = store.list_candidates(state="pending", now=future)
    pending_ids = {c.candidate_id for c in pending_future}
    assert candidate.candidate_id in pending_ids


def test_mark_converted_carries_task_id(tmp_path):
    storage_path = tmp_path / "cands.json"
    store = CandidateStore(storage_path=storage_path)
    now = datetime.now(tz=timezone.utc).isoformat()
    candidate = AltDataCandidate(
        candidate_id="altcand_policy_radar_policy_radar_industry_新能源",
        source_component="policy_radar",
        signal_type="policy_radar_industry",
        industry="新能源",
        headline="新能源",
        impact_score=-0.4,
        mentions=4,
        generated_at=now,
        last_seen_at=now,
    )
    store.reconcile([candidate])

    converted = store.mark_converted(candidate.candidate_id, "rw_abc123")
    assert converted is not None
    assert converted.state == "converted"
    assert converted.converted_task_id == "rw_abc123"

    # Same conversion path is idempotent — re-marking doesn't break invariants.
    repeat = store.mark_converted(candidate.candidate_id, "rw_abc123")
    assert repeat is not None and repeat.state == "converted"


# ---------------------------------------------------------------------------
# Persistence (atomic-write)
# ---------------------------------------------------------------------------


def test_persistence_atomic_write_round_trip(tmp_path):
    """Reconcile -> persist -> re-instantiate yields identical state."""

    storage_path = tmp_path / "candidates.json"
    store_a = CandidateStore(storage_path=storage_path)
    now = datetime.now(tz=timezone.utc).isoformat()
    candidate = AltDataCandidate(
        candidate_id="altcand_policy_radar_policy_radar_industry_AI",
        source_component="policy_radar",
        signal_type="policy_radar_industry",
        industry="AI",
        headline="AI",
        impact_score=0.4,
        mentions=5,
        generated_at=now,
        last_seen_at=now,
    )
    store_a.reconcile([candidate])
    store_a.dismiss(candidate.candidate_id)

    # File must be valid JSON and contain exactly one entry.
    assert storage_path.exists()
    with open(storage_path, "r", encoding="utf-8") as fp:
        payload = json.load(fp)
    assert isinstance(payload, list) and len(payload) == 1

    # Re-instantiate and confirm state survives.
    store_b = CandidateStore(storage_path=storage_path)
    rehydrated = store_b.get_candidate(candidate.candidate_id)
    assert rehydrated is not None
    assert rehydrated.state == "dismissed"


def test_persistence_uses_unique_target_dir_temp_files_for_dual_store(tmp_path, monkeypatch):
    """Concurrent store instances should not race on the same temp path."""

    storage_path = tmp_path / "candidates.json"
    store_a = CandidateStore(storage_path=storage_path)
    store_b = CandidateStore(storage_path=storage_path)
    now = datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()
    candidates = [
        AltDataCandidate(
            candidate_id="altcand_policy_radar_policy_radar_industry_AI",
            source_component="policy_radar",
            signal_type="policy_radar_industry",
            industry="AI",
            headline="AI",
            impact_score=0.4,
            mentions=5,
            generated_at=now,
            last_seen_at=now,
        ),
        AltDataCandidate(
            candidate_id="altcand_macro_hf_shfe_inventory_weekly_铜",
            source_component="macro_hf",
            signal_type="shfe_inventory_weekly",
            industry="铜",
            headline="铜库存去化",
            impact_score=-7.5,
            mentions=1,
            generated_at=now,
            last_seen_at=now,
        ),
    ]
    barrier = threading.Barrier(2)
    original_replace = Path.replace
    temp_paths: List[Path] = []
    errors: List[BaseException] = []

    def _delayed_replace(self: Path, target):
        if Path(target) == storage_path:
            temp_paths.append(Path(self))
            barrier.wait(timeout=5)
        return original_replace(self, target)

    monkeypatch.setattr(Path, "replace", _delayed_replace)

    def _write(store: CandidateStore, candidate: AltDataCandidate) -> None:
        try:
            store.reconcile([candidate])
        except BaseException as exc:  # pragma: no cover - assertion aid
            errors.append(exc)

    threads = [
        threading.Thread(target=_write, args=(store_a, candidates[0])),
        threading.Thread(target=_write, args=(store_b, candidates[1])),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=10)

    assert not any(thread.is_alive() for thread in threads)
    assert errors == []
    assert len(temp_paths) == 2
    assert len({path.name for path in temp_paths}) == 2
    assert {path.parent for path in temp_paths} == {storage_path.parent}
    assert not any(path.exists() for path in temp_paths)

    with open(storage_path, "r", encoding="utf-8") as fp:
        payload = json.load(fp)
    assert isinstance(payload, list)
    assert len(payload) == 1
    assert payload[0]["candidate_id"] in {candidate.candidate_id for candidate in candidates}


def test_candidate_to_task_payload_carries_tags_and_evidence():
    candidate = AltDataCandidate(
        candidate_id="altcand_policy_radar_policy_radar_industry_新能源汽车",
        source_component="policy_radar",
        signal_type="policy_radar_industry",
        industry="新能源汽车",
        headline="政策雷达：新能源汽车 偏空",
        impact_score=-0.35,
        mentions=8,
        generated_at=datetime.now(tz=timezone.utc).isoformat(),
        evidence_link={"component": "policy_radar", "snapshot_path": "cache/alt_data/providers/policy_radar.json"},
    )
    payload = candidate_to_task_payload(candidate)
    assert payload["type"] == "macro_mispricing"
    assert payload["status"] == "new"
    tags = payload["context"]["tags"]
    assert "alt-data:policy_radar" in tags
    assert "industry:新能源汽车" in tags
    assert payload["context"]["alt_data_candidate_id"] == candidate.candidate_id
    assert payload["snapshot"]["payload"]["alt_data_candidate_id"] == candidate.candidate_id


# ---------------------------------------------------------------------------
# HTTP endpoint shapes
# ---------------------------------------------------------------------------


def _build_client(monkeypatch, manager, store) -> TestClient:
    app = FastAPI()
    app.include_router(rw_endpoint.router, prefix="/research-workbench")

    monkeypatch.setattr(rw_endpoint, "get_alt_data_manager", lambda: manager)
    monkeypatch.setattr(rw_endpoint, "get_candidate_store", lambda: store)
    return TestClient(app)


def test_endpoint_refresh_then_list_returns_candidates(tmp_path, monkeypatch):
    manager = _seed_manager(
        tmp_path / "alt",
        industry_signals={
            "新能源汽车": {"avg_impact": -0.35, "mentions": 8, "signal": "bearish"},
        },
        shfe_metals=[
            {"metal": "cu", "name": "铜", "weekly_change_pct": -7.5, "trend": "destocking"},
        ],
    )
    storage_path = tmp_path / "candidates.json"
    store = CandidateStore(storage_path=storage_path)
    client = _build_client(monkeypatch, manager, store)

    resp = client.post("/research-workbench/alt-data-candidates/refresh")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    stats = body["data"]["stats"]
    assert stats["added"] == 2
    pending = body["data"]["pending"]
    assert len(pending) == 2
    components = sorted(item["source_component"] for item in pending)
    assert components == ["macro_hf", "policy_radar"]

    list_resp = client.get("/research-workbench/alt-data-candidates?state=pending")
    assert list_resp.status_code == 200
    list_body = list_resp.json()
    assert list_body["success"] is True
    assert list_body["total"] == 2


def test_endpoint_convert_creates_task_and_marks_candidate(tmp_path, monkeypatch):
    manager = _seed_manager(
        tmp_path / "alt",
        industry_signals={
            "新能源汽车": {"avg_impact": -0.35, "mentions": 8, "signal": "bearish"},
        },
        shfe_metals=[],
    )
    storage_path = tmp_path / "candidates.json"
    store = CandidateStore(storage_path=storage_path)
    client = _build_client(monkeypatch, manager, store)

    client.post("/research-workbench/alt-data-candidates/refresh")
    pending = store.list_candidates(state="pending")
    assert len(pending) == 1
    candidate_id = pending[0].candidate_id

    # Stub the workbench store so we don't mutate the real singleton.
    created: Dict[str, dict] = {"task": None}
    create_count = {"count": 0}
    fake_tasks: Dict[str, dict] = {}

    def _fake_create_task(payload):
        create_count["count"] += 1
        created["task"] = {"id": "rw_test_task", **payload}
        fake_tasks["rw_test_task"] = created["task"]
        return created["task"]

    def _fake_get_task(task_id):
        return fake_tasks.get(task_id)

    workbench = rw_endpoint._get_research_workbench()
    monkeypatch.setattr(
        workbench,
        "create_task",
        _fake_create_task,
    )
    monkeypatch.setattr(workbench, "get_task", _fake_get_task)

    resp = client.post(
        f"/research-workbench/alt-data-candidates/{candidate_id}/convert"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["task_id"] == "rw_test_task"
    assert body["data"]["candidate"]["state"] == "converted"
    assert created["task"] is not None
    assert created["task"]["title"].startswith("[Alt-Data]")
    assert "alt-data:policy_radar" in created["task"]["context"]["tags"]
    assert body["data"]["duplicate"] is False

    duplicate_resp = client.post(
        f"/research-workbench/alt-data-candidates/{candidate_id}/convert"
    )
    assert duplicate_resp.status_code == 200
    duplicate_body = duplicate_resp.json()
    assert duplicate_body["success"] is True
    assert duplicate_body["data"]["task_id"] == "rw_test_task"
    assert duplicate_body["data"]["duplicate"] is True
    assert create_count["count"] == 1

    dismiss_converted = client.post(
        f"/research-workbench/alt-data-candidates/{candidate_id}/dismiss"
    )
    assert dismiss_converted.status_code == 409
    assert "candidate is converted" in dismiss_converted.json()["detail"]

    snooze_converted = client.post(
        f"/research-workbench/alt-data-candidates/{candidate_id}/snooze",
        json={"hours": 2},
    )
    assert snooze_converted.status_code == 409
    assert "candidate is converted" in snooze_converted.json()["detail"]

    still_duplicate = client.post(
        f"/research-workbench/alt-data-candidates/{candidate_id}/convert"
    )
    assert still_duplicate.status_code == 200
    assert still_duplicate.json()["data"]["duplicate"] is True
    assert store.get_candidate(candidate_id).state == "converted"  # type: ignore[union-attr]


def test_endpoint_convert_rejects_dismissed_and_snoozed_candidates(tmp_path, monkeypatch):
    manager = _seed_manager(
        tmp_path / "alt",
        industry_signals={
            "新能源汽车": {"avg_impact": -0.35, "mentions": 8, "signal": "bearish"},
            "AI算力": {"avg_impact": 0.50, "mentions": 6, "signal": "bullish"},
        },
        shfe_metals=[],
    )
    storage_path = tmp_path / "candidates.json"
    store = CandidateStore(storage_path=storage_path)
    client = _build_client(monkeypatch, manager, store)
    client.post("/research-workbench/alt-data-candidates/refresh")
    ids = [c.candidate_id for c in store.list_candidates(state="pending")]
    assert len(ids) == 2

    def _unexpected_create_task(payload):  # pragma: no cover - should not be called
        raise AssertionError("convert should reject non-pending candidates before task creation")

    monkeypatch.setattr(
        rw_endpoint._get_research_workbench(),
        "create_task",
        _unexpected_create_task,
    )

    client.post(f"/research-workbench/alt-data-candidates/{ids[0]}/dismiss")
    dismissed_resp = client.post(
        f"/research-workbench/alt-data-candidates/{ids[0]}/convert"
    )
    assert dismissed_resp.status_code == 409
    assert "candidate is dismissed" in dismissed_resp.json()["detail"]
    assert store.get_candidate(ids[0]).state == "dismissed"  # type: ignore[union-attr]

    client.post(
        f"/research-workbench/alt-data-candidates/{ids[1]}/snooze",
        json={"hours": 2},
    )
    snoozed_resp = client.post(
        f"/research-workbench/alt-data-candidates/{ids[1]}/convert"
    )
    assert snoozed_resp.status_code == 409
    assert "candidate is snoozed" in snoozed_resp.json()["detail"]
    assert store.get_candidate(ids[1]).state == "snoozed"  # type: ignore[union-attr]


def test_endpoint_dismiss_and_snooze_shapes(tmp_path, monkeypatch):
    manager = _seed_manager(
        tmp_path / "alt",
        industry_signals={
            "新能源汽车": {"avg_impact": -0.35, "mentions": 8, "signal": "bearish"},
            "AI算力": {"avg_impact": 0.50, "mentions": 6, "signal": "bullish"},
        },
        shfe_metals=[],
    )
    storage_path = tmp_path / "candidates.json"
    store = CandidateStore(storage_path=storage_path)
    client = _build_client(monkeypatch, manager, store)
    client.post("/research-workbench/alt-data-candidates/refresh")
    ids = [c.candidate_id for c in store.list_candidates(state="pending")]
    assert len(ids) == 2

    dismiss_resp = client.post(
        f"/research-workbench/alt-data-candidates/{ids[0]}/dismiss"
    )
    assert dismiss_resp.status_code == 200
    assert dismiss_resp.json()["data"]["state"] == "dismissed"

    snooze_resp = client.post(
        f"/research-workbench/alt-data-candidates/{ids[1]}/snooze",
        json={"hours": 2},
    )
    assert snooze_resp.status_code == 200
    snooze_body = snooze_resp.json()
    assert snooze_body["data"]["state"] == "snoozed"
    assert snooze_body["data"]["snoozed_until"]

    list_resp = client.get("/research-workbench/alt-data-candidates?state=pending")
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 0

    not_found = client.post(
        "/research-workbench/alt-data-candidates/altcand_nope/dismiss"
    )
    assert not_found.status_code == 404

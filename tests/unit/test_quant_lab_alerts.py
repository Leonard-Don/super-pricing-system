from backend.app.core.persistence import PersistenceManager
from backend.app.services.quant_lab import QuantLabService
from backend.app.services.realtime_alerts import RealtimeAlertsStore
from backend.app.services.realtime_preferences import RealtimePreferencesStore
from src.research.workbench import ResearchWorkbenchStore

import backend.app.services.quant_lab as quant_lab_module


def _build_quant_lab_service(monkeypatch, tmp_path):
    persistence = PersistenceManager(sqlite_path=tmp_path / "infrastructure.sqlite3")
    monkeypatch.setattr(
        quant_lab_module,
        "realtime_alerts_store",
        RealtimeAlertsStore(storage_path=tmp_path / "realtime_alerts"),
    )
    monkeypatch.setattr(
        quant_lab_module,
        "realtime_preferences_store",
        RealtimePreferencesStore(storage_path=tmp_path / "realtime_preferences"),
    )
    monkeypatch.setattr(
        quant_lab_module,
        "research_workbench_store",
        ResearchWorkbenchStore(storage_path=tmp_path / "research_workbench"),
    )
    monkeypatch.setattr(quant_lab_module, "persistence_manager", persistence)
    service = QuantLabService(storage_root=tmp_path / "quant_lab")
    return service, persistence


def test_publish_alert_event_skips_persistence_when_disabled(monkeypatch, tmp_path):
    service, persistence = _build_quant_lab_service(monkeypatch, tmp_path)

    result = service.publish_alert_event(
        {
            "source_module": "manual",
            "rule_name": "Ephemeral alert",
            "symbol": "SPY",
            "severity": "warning",
            "message": "do not persist",
            "condition_summary": "manual smoke",
            "persist_event_record": False,
        },
        profile_id="ephemeral",
    )

    assert result["published_event"]["persist_event_record"] is False
    assert result["orchestration"]["summary"]["alert_history_events"] == 0
    assert result["orchestration"]["event_bus"]["history"] == []
    assert persistence.list_records(record_type="alert_event") == []
    assert persistence.list_records(record_type="alert_event_dispatch") == []


def test_publish_alert_event_persists_history_and_records_by_default(monkeypatch, tmp_path):
    service, persistence = _build_quant_lab_service(monkeypatch, tmp_path)

    result = service.publish_alert_event(
        {
            "source_module": "manual",
            "rule_name": "Persistent alert",
            "symbol": "QQQ",
            "severity": "critical",
            "message": "persist me",
            "condition_summary": "manual smoke",
            "persist_event_record": True,
        },
        profile_id="persistent",
    )

    assert result["published_event"]["persist_event_record"] is True
    assert result["orchestration"]["summary"]["alert_history_events"] == 1
    assert result["orchestration"]["event_bus"]["history"][0]["rule_name"] == "Persistent alert"
    assert len(persistence.list_records(record_type="alert_event")) == 1
    assert len(persistence.list_records(record_type="alert_event_dispatch")) == 1


def test_update_alert_orchestration_history_updates_round_trip(monkeypatch, tmp_path):
    service, _ = _build_quant_lab_service(monkeypatch, tmp_path)

    first = service.update_alert_orchestration(
        {
            "history_updates": [
                {
                    "id": "alert-1",
                    "source_module": "manual",
                    "rule_name": "Manual review",
                    "symbol": "SPY",
                    "review_status": "resolved",
                    "trigger_time": "2026-04-20T10:00:00",
                    "acknowledged_at": "2026-04-20T10:05:00",
                }
            ]
        },
        profile_id="history-roundtrip",
    )

    assert first["summary"]["alert_history_events"] == 1
    assert first["history_stats"]["summary"]["reviewed_events"] == 1
    assert first["event_bus"]["history"][0]["review_status"] == "resolved"

    second = service.update_alert_orchestration(
        {
            "history_updates": [
                {
                    "id": "alert-1",
                    "source_module": "manual",
                    "rule_name": "Manual review",
                    "symbol": "SPY",
                    "review_status": "false_positive",
                    "trigger_time": "2026-04-20T10:00:00",
                    "acknowledged_at": "2026-04-20T10:06:00",
                }
            ]
        },
        profile_id="history-roundtrip",
    )

    assert second["summary"]["alert_history_events"] == 1
    assert second["event_bus"]["history"][0]["review_status"] == "false_positive"
    assert second["history_stats"]["summary"]["false_positive_rate"] == 1.0

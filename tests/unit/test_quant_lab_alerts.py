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


def test_get_alert_orchestration_returns_zero_stats_for_unseen_profile(monkeypatch, tmp_path):
    service, _ = _build_quant_lab_service(monkeypatch, tmp_path)

    payload = service.get_alert_orchestration(profile_id="never-touched")

    assert payload["profile_id"] == "never-touched"
    assert payload["summary"]["alert_history_events"] == 0
    assert payload["summary"]["estimated_hit_rate"] == 0.0
    assert payload["summary"]["average_response_minutes"] is None
    assert payload["event_bus"]["history"] == []
    assert payload["history_stats"]["rule_stats"] == []
    assert payload["history_stats"]["module_stats"] == []
    assert payload["history_stats"]["pending_queue"] == []
    assert payload["composite_rules"] == []
    assert payload["channels"] == []


def test_update_alert_orchestration_history_entry_dict_prepends_to_history(monkeypatch, tmp_path):
    service, _ = _build_quant_lab_service(monkeypatch, tmp_path)

    first = service.update_alert_orchestration(
        {
            "history_entry": {
                "id": "alert-older",
                "source_module": "manual",
                "rule_name": "older",
                "symbol": "SPY",
                "trigger_time": "2026-04-19T09:00:00",
            }
        },
        profile_id="prepend",
    )
    assert first["summary"]["alert_history_events"] == 1

    second = service.update_alert_orchestration(
        {
            "history_entry": {
                "id": "alert-newer",
                "source_module": "manual",
                "rule_name": "newer",
                "symbol": "QQQ",
                "trigger_time": "2026-04-20T09:00:00",
            }
        },
        profile_id="prepend",
    )

    assert second["summary"]["alert_history_events"] == 2
    history_ids = [entry["id"] for entry in second["event_bus"]["history"]]
    assert history_ids[0] == "alert-newer"
    assert history_ids[1] == "alert-older"


def test_update_alert_orchestration_assigns_composite_rules_and_channels(monkeypatch, tmp_path):
    service, _ = _build_quant_lab_service(monkeypatch, tmp_path)

    result = service.update_alert_orchestration(
        {
            "composite_rules": [
                {"id": "rule-a", "name": "A", "condition_summary": "macro"},
            ],
            "channels": [
                {"id": "dry_run", "enabled": True, "label": "Dry"},
                {"id": "muted", "enabled": False, "label": "Muted"},
            ],
            "module_alerts": [
                {"id": "mod-1", "module": "macro", "label": "Macro alert"},
            ],
        },
        profile_id="assigns",
    )

    assert [rule["id"] for rule in result["composite_rules"]] == ["rule-a"]
    assert [channel["id"] for channel in result["channels"]] == ["dry_run", "muted"]
    assert [alert["id"] for alert in result["module_alerts"]] == ["mod-1"]
    assert result["summary"]["composite_rules"] == 1
    assert next(item for item in result["event_bus"]["modules"] if item["module"] == "custom")["count"] == 1


def test_publish_alert_event_isolates_profiles(monkeypatch, tmp_path):
    service, persistence = _build_quant_lab_service(monkeypatch, tmp_path)

    service.publish_alert_event(
        {
            "source_module": "manual",
            "rule_name": "alpha rule",
            "symbol": "SPY",
            "severity": "warning",
            "message": "alpha",
            "persist_event_record": True,
        },
        profile_id="alpha",
    )

    beta_view = service.get_alert_orchestration(profile_id="beta")
    alpha_view = service.get_alert_orchestration(profile_id="alpha")

    assert alpha_view["summary"]["alert_history_events"] == 1
    assert beta_view["summary"]["alert_history_events"] == 0
    assert beta_view["event_bus"]["history"] == []

    alert_events = persistence.list_records(record_type="alert_event")
    assert len(alert_events) == 1
    assert alert_events[0]["payload"]["profile_id"] == "alpha"


def test_publish_alert_event_normalizes_camelcase_aliases(monkeypatch, tmp_path):
    service, _ = _build_quant_lab_service(monkeypatch, tmp_path)

    result = service.update_alert_orchestration(
        {
            "history_updates": [
                {
                    "id": "alias-1",
                    "sourceModule": "macro",
                    "ruleName": "Aliased rule",
                    "symbol": "qqq",
                    "reviewStatus": "RESOLVED",
                    "triggerTime": "2026-04-20T10:00:00",
                    "acknowledgedAt": "2026-04-20T10:30:00",
                    "triggerValue": "1.25",
                }
            ]
        },
        profile_id="aliases",
    )

    entry = result["event_bus"]["history"][0]
    assert entry["source_module"] == "macro"
    assert entry["rule_name"] == "Aliased rule"
    assert entry["symbol"] == "QQQ"
    assert entry["review_status"] == "resolved"
    assert entry["acknowledged_at"] == "2026-04-20T10:30:00"
    assert entry["response_minutes"] == 30.0
    assert entry["trigger_value"] == 1.25


def test_publish_alert_event_normalizes_invalid_review_status_to_pending(monkeypatch, tmp_path):
    service, _ = _build_quant_lab_service(monkeypatch, tmp_path)

    result = service.update_alert_orchestration(
        {
            "history_updates": [
                {
                    "id": "bad-status",
                    "source_module": "manual",
                    "rule_name": "garbled",
                    "symbol": "SPY",
                    "review_status": "totally-wrong",
                    "trigger_time": "2026-04-20T10:00:00",
                    "acknowledged_at": "2026-04-20T10:05:00",
                }
            ]
        },
        profile_id="invalid-status",
    )

    entry = result["event_bus"]["history"][0]
    assert entry["review_status"] == "pending"
    assert entry["acknowledged_at"] is None
    assert entry["response_minutes"] is None
    assert result["history_stats"]["summary"]["pending_events"] == 1
    assert result["history_stats"]["summary"]["reviewed_events"] == 0


def test_publish_alert_event_matches_composite_rule_by_summary_tokens(monkeypatch, tmp_path):
    service, _ = _build_quant_lab_service(monkeypatch, tmp_path)

    service.update_alert_orchestration(
        {
            "composite_rules": [
                {
                    "id": "macro-quant",
                    "name": "macro+quant cross alert",
                    "condition_summary": "macro AND quant",
                }
            ]
        },
        profile_id="composite-tokens",
    )

    matched = service.publish_alert_event(
        {
            "source_module": "macro",
            "rule_name": "macro_quant_alert",
            "symbol": "SPY",
            "severity": "warning",
            "message": "shared macro and quant signal",
            "persist_event_record": False,
        },
        profile_id="composite-tokens",
    )
    no_match = service.publish_alert_event(
        {
            "source_module": "macro",
            "rule_name": "macro_only",
            "symbol": "SPY",
            "severity": "info",
            "message": "macro signal only",
            "persist_event_record": False,
        },
        profile_id="composite-tokens",
    )

    assert [rule["id"] for rule in matched["matched_rules"]] == ["macro-quant"]
    assert matched["published_event"]["matched_rule_ids"] == ["macro-quant"]
    assert no_match["matched_rules"] == []
    assert no_match["published_event"]["matched_rule_ids"] == []


def test_publish_alert_event_explicit_rule_ids_force_match(monkeypatch, tmp_path):
    service, _ = _build_quant_lab_service(monkeypatch, tmp_path)

    service.update_alert_orchestration(
        {
            "composite_rules": [
                {
                    "id": "forced-rule",
                    "name": "forced rule",
                    "condition_summary": "totally unrelated tokens",
                }
            ]
        },
        profile_id="explicit-ids",
    )

    result = service.publish_alert_event(
        {
            "source_module": "manual",
            "rule_name": "manual ping",
            "symbol": "SPY",
            "severity": "warning",
            "message": "no token overlap",
            "rule_ids": ["forced-rule"],
            "persist_event_record": False,
        },
        profile_id="explicit-ids",
    )

    assert [rule["id"] for rule in result["matched_rules"]] == ["forced-rule"]
    assert result["published_event"]["matched_rule_ids"] == ["forced-rule"]


def test_publish_alert_event_falls_back_to_orchestration_channels(monkeypatch, tmp_path):
    service, _ = _build_quant_lab_service(monkeypatch, tmp_path)

    service.update_alert_orchestration(
        {
            "channels": [
                {"id": "dry_run", "enabled": True, "label": "Dry"},
                {"id": "muted", "enabled": False, "label": "Muted"},
            ]
        },
        profile_id="channel-fallback",
    )

    result = service.publish_alert_event(
        {
            "source_module": "manual",
            "rule_name": "needs default channel",
            "symbol": "SPY",
            "severity": "warning",
            "message": "default channel test",
            "persist_event_record": False,
        },
        profile_id="channel-fallback",
    )

    notify_actions = [
        action for action in result["published_event"]["cascade_actions"]
        if action.get("type") == "notify_channel"
    ]
    assert [action["channel"] for action in notify_actions] == ["dry_run"]
    assert result["published_event"]["dispatched_channels"] == ["dry_run"]
    assert result["published_event"]["dispatch_status"] == "dispatched"


def test_update_alert_orchestration_drops_history_updates_without_identity(monkeypatch, tmp_path):
    service, persistence = _build_quant_lab_service(monkeypatch, tmp_path)

    result = service.update_alert_orchestration(
        {
            "history_updates": [
                {},
                {"id": "   "},
                "not-a-dict",
                None,
                {"id": "alert-real", "rule_name": "valid", "symbol": "SPY"},
            ]
        },
        profile_id="filter-empties",
    )

    assert result["summary"]["alert_history_events"] == 1
    history_ids = [entry["id"] for entry in result["event_bus"]["history"]]
    assert history_ids == ["alert-real"]
    assert not any(str(entry_id).startswith("alert_hist_unknown_") for entry_id in history_ids)


def test_update_alert_orchestration_dedupes_duplicate_identity_history_updates(monkeypatch, tmp_path):
    service, _ = _build_quant_lab_service(monkeypatch, tmp_path)

    result = service.update_alert_orchestration(
        {
            "history_updates": [
                {
                    "rule_name": "Macro alert",
                    "symbol": "SPY",
                    "trigger_time": "2026-04-20T10:00:00",
                    "review_status": "pending",
                },
                {
                    "rule_name": "Macro alert",
                    "symbol": "SPY",
                    "trigger_time": "2026-04-20T10:30:00",
                    "review_status": "resolved",
                },
                {
                    "ruleName": "Macro alert",
                    "symbol": "spy",
                    "trigger_time": "2026-04-20T11:00:00",
                    "review_status": "false_positive",
                },
                {
                    "rule_name": "Macro alert",
                    "symbol": "QQQ",
                    "trigger_time": "2026-04-20T10:00:00",
                    "review_status": "pending",
                },
            ]
        },
        profile_id="dedupe-identity",
    )

    assert result["summary"]["alert_history_events"] == 2
    pairs = sorted(
        (entry["rule_name"], entry["symbol"]) for entry in result["event_bus"]["history"]
    )
    assert pairs == [("Macro alert", "QQQ"), ("Macro alert", "SPY")]
    spy_entry = next(
        entry for entry in result["event_bus"]["history"] if entry["symbol"] == "SPY"
    )
    assert spy_entry["trigger_time"] == "2026-04-20T10:00:00"
    assert spy_entry["review_status"] == "pending"


def test_update_alert_orchestration_dedupes_id_bearing_history_updates_first_wins(monkeypatch, tmp_path):
    service, _ = _build_quant_lab_service(monkeypatch, tmp_path)

    result = service.update_alert_orchestration(
        {
            "history_updates": [
                {
                    "id": "alert-shared",
                    "rule_name": "Macro alert",
                    "symbol": "SPY",
                    "trigger_time": "2026-04-20T10:00:00",
                    "review_status": "pending",
                    "severity": "info",
                },
                {
                    "id": "alert-shared",
                    "rule_name": "Macro alert",
                    "symbol": "SPY",
                    "trigger_time": "2026-04-20T11:00:00",
                    "review_status": "resolved",
                    "acknowledged_at": "2026-04-20T11:05:00",
                    "severity": "critical",
                },
            ]
        },
        profile_id="dedupe-id-firstwins",
    )

    assert result["summary"]["alert_history_events"] == 1
    entry = result["event_bus"]["history"][0]
    assert entry["id"] == "alert-shared"
    assert entry["trigger_time"] == "2026-04-20T10:00:00"
    assert entry["review_status"] == "pending"
    assert entry["severity"] == "info"
    assert entry["acknowledged_at"] is None


def test_publish_alert_event_dedupes_cascade_actions(monkeypatch, tmp_path):
    service, _ = _build_quant_lab_service(monkeypatch, tmp_path)

    result = service.publish_alert_event(
        {
            "source_module": "manual",
            "rule_name": "dedup test",
            "symbol": "SPY",
            "severity": "warning",
            "message": "registered twice",
            "cascade_actions": [{"type": "notify_channel", "channel": "dry_run"}],
            "notify_channels": ["dry_run"],
            "persist_event_record": False,
        },
        profile_id="dedup",
    )

    notify_actions = [
        action for action in result["published_event"]["cascade_actions"]
        if action.get("type") == "notify_channel" and action.get("channel") == "dry_run"
    ]
    assert len(notify_actions) == 1
    assert result["published_event"]["dispatched_channels"] == ["dry_run"]

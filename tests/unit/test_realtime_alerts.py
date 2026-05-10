import json
import os

import pytest

from backend.app.services.realtime_alerts import (
    MAX_ALERT_HIT_HISTORY,
    RealtimeAlertsStore,
)


def test_realtime_alerts_store_normalizes_symbols_and_cooldown(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    updated = store.update_alerts({
        "alerts": [
            {
                "id": "alert-1",
                "symbol": " aapl ",
                "condition": "price_above",
                "threshold": "195.2",
                "cooldownMinutes": "20",
            },
            {
                "id": "alert-2",
                "symbol": "btc-usd",
                "condition": "relative_volume_above",
                "threshold": 2.5,
            },
        ],
        "alert_hit_history": [
            {"id": "hit-1", "symbol": "AAPL", "message": "AAPL 提醒已触发"},
        ],
    })

    assert updated["alerts"][0]["symbol"] == "AAPL"
    assert updated["alerts"][0]["threshold"] == 195.2
    assert updated["alerts"][0]["cooldownMinutes"] == 20
    assert updated["alerts"][1]["symbol"] == "BTC-USD"
    assert updated["alerts"][1]["cooldownMinutes"] == 15
    assert updated["alert_hit_history"] == [
        {"id": "hit-1", "symbol": "AAPL", "message": "AAPL 提醒已触发"},
    ]


def test_realtime_alerts_store_filters_invalid_items(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    updated = store.update_alerts({
        "alerts": [
            {"symbol": "", "condition": "price_above"},
            {"symbol": "AAPL", "condition": "not-supported"},
            {"symbol": "MSFT", "condition": "price_below", "threshold": 390},
        ]
    })

    assert updated == {
        "alerts": [
            {
                "symbol": "MSFT",
                "condition": "price_below",
                "threshold": 390.0,
                "tolerancePercent": 0.1,
                "cooldownMinutes": 15,
            }
        ],
        "alert_hit_history": [],
        "_warnings": [
            "alerts[0]: skipped (missing symbol)",
            "alerts[1]: skipped (invalid condition 'not-supported')",
        ],
    }


def test_realtime_alerts_store_isolated_by_profile_id(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    store.update_alerts({
        "alerts": [{"symbol": "AAPL", "condition": "price_above", "threshold": 200}],
        "alert_hit_history": [{"id": "hit-a", "symbol": "AAPL"}],
    }, profile_id="browser-a")
    store.update_alerts({
        "alerts": [{"symbol": "BTC-USD", "condition": "change_pct_above", "threshold": 5}],
        "alert_hit_history": [{"id": "hit-b", "symbol": "BTC-USD"}],
    }, profile_id="browser-b")

    assert store.get_alerts(profile_id="browser-a")["alerts"][0]["symbol"] == "AAPL"
    assert store.get_alerts(profile_id="browser-b")["alerts"][0]["symbol"] == "BTC-USD"
    assert store.get_alerts(profile_id="browser-a")["alert_hit_history"][0]["id"] == "hit-a"
    assert store.get_alerts(profile_id="browser-b")["alert_hit_history"][0]["id"] == "hit-b"


def test_realtime_alerts_store_limits_alert_hit_history(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    updated = store.update_alerts({
        "alerts": [],
        "alert_hit_history": [{"id": f"hit-{index}"} for index in range(120)],
    })

    assert len(updated["alert_hit_history"]) == 80
    assert updated["alert_hit_history"][0]["id"] == "hit-0"


def test_realtime_alerts_store_falls_back_when_threshold_tolerance_cooldown_invalid(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    updated = store.update_alerts({
        "alerts": [
            {
                "symbol": "AAPL",
                "condition": "price_above",
                "threshold": "not-a-number",
                "tolerancePercent": "huge",
                "cooldownMinutes": "later",
            }
        ]
    })

    alert = updated["alerts"][0]
    assert alert["threshold"] is None
    assert alert["tolerancePercent"] == 0.1
    assert alert["cooldownMinutes"] == 15


def test_realtime_alerts_store_rejects_boolean_threshold_tolerance_cooldown(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    updated = store.update_alerts({
        "alerts": [
            {
                "symbol": "AAPL",
                "condition": "price_above",
                "threshold": True,
                "tolerancePercent": False,
                "cooldownMinutes": True,
            }
        ]
    })

    alert = updated["alerts"][0]
    assert alert["threshold"] is None
    assert alert["tolerancePercent"] == 0.1
    assert alert["cooldownMinutes"] == 15


def test_realtime_alerts_store_preserves_numeric_zero_threshold_tolerance_cooldown(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    updated = store.update_alerts({
        "alerts": [
            {
                "symbol": "AAPL",
                "condition": "price_above",
                "threshold": 0,
                "tolerancePercent": 0,
                "cooldownMinutes": 0,
            }
        ]
    })

    alert = updated["alerts"][0]
    assert alert["threshold"] == 0.0
    assert alert["tolerancePercent"] == 0.0
    assert alert["cooldownMinutes"] == 0


def test_realtime_alerts_store_clamps_negative_cooldown_to_zero(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    updated = store.update_alerts({
        "alerts": [
            {
                "symbol": "AAPL",
                "condition": "price_above",
                "threshold": 100,
                "cooldownMinutes": -30,
            }
        ]
    })

    assert updated["alerts"][0]["cooldownMinutes"] == 0


def test_realtime_alerts_store_skips_non_dict_alerts_and_history_entries(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    updated = store.update_alerts({
        "alerts": [
            None,
            "this is not an alert",
            {"symbol": "AAPL", "condition": "price_above", "threshold": 100},
        ],
        "alert_hit_history": [
            None,
            42,
            "ignored",
            {"id": "hit-real", "symbol": "AAPL"},
        ],
    })

    assert [item["symbol"] for item in updated["alerts"]] == ["AAPL"]
    assert updated["alert_hit_history"] == [{"id": "hit-real", "symbol": "AAPL"}]
    assert "alerts[0]: skipped (not a dict)" in updated["_warnings"]
    assert "alerts[1]: skipped (not a dict)" in updated["_warnings"]


def test_realtime_alerts_store_returns_default_for_unknown_profile(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    payload = store.get_alerts(profile_id="never-saved-before")

    assert payload == {"alerts": [], "alert_hit_history": []}


def test_realtime_alerts_store_recovers_from_corrupt_profile_file(tmp_path):
    (tmp_path / "default.json").write_text("{not-valid-json", encoding="utf-8")

    store = RealtimeAlertsStore(storage_path=tmp_path)

    assert store.get_alerts() == {"alerts": [], "alert_hit_history": []}


def test_realtime_alerts_store_recovers_from_non_object_persisted_payload(tmp_path):
    (tmp_path / "default.json").write_text("[1, 2, 3]", encoding="utf-8")

    store = RealtimeAlertsStore(storage_path=tmp_path)

    assert store.get_alerts() == {"alerts": [], "alert_hit_history": []}


def test_realtime_alerts_store_normalizes_profile_id_aliases(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    store.update_alerts(
        {"alerts": [{"symbol": "AAPL", "condition": "price_above", "threshold": 1}]},
        profile_id="Browser/A!",
    )

    aliased = store.get_alerts(profile_id="browser-a")
    assert aliased["alerts"][0]["symbol"] == "AAPL"

    persisted_files = sorted(path.name for path in tmp_path.glob("*.json"))
    assert persisted_files == ["browser-a.json"]


def test_realtime_alerts_store_collapses_blank_profile_ids_to_default(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    store.update_alerts(
        {"alerts": [{"symbol": "AAPL", "condition": "price_above", "threshold": 5}]},
        profile_id="###",
    )
    store.update_alerts(
        {"alerts": [{"symbol": "MSFT", "condition": "price_below", "threshold": 10}]},
        profile_id="   ",
    )

    no_id = store.get_alerts()
    none_id = store.get_alerts(profile_id=None)
    junk_id = store.get_alerts(profile_id="$$$")

    assert no_id["alerts"][0]["symbol"] == "MSFT"
    assert none_id == no_id == junk_id

    persisted_files = sorted(path.name for path in tmp_path.glob("*.json"))
    assert persisted_files == ["default.json"]


def test_realtime_alerts_store_sanitizes_path_traversal_profile_id(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    unsafe_profile_id = "../escape/../profile"
    store.update_alerts(
        {"alerts": [{"symbol": "AAPL", "condition": "price_above", "threshold": 200}]},
        profile_id=unsafe_profile_id,
    )

    persisted = sorted(tmp_path.glob("*.json"))
    assert len(persisted) == 1
    safe_stem = persisted[0].stem
    assert safe_stem
    assert ".." not in safe_stem
    assert "/" not in safe_stem
    assert all(ch.isalnum() or ch in {"-", "_"} for ch in safe_stem)

    assert not (tmp_path.parent / "profile.json").exists()

    reloaded = store.get_alerts(profile_id=unsafe_profile_id)
    assert reloaded["alerts"][0]["symbol"] == "AAPL"
    assert reloaded["alerts"][0]["threshold"] == 200.0


def test_realtime_alerts_store_preserves_valid_optional_fields(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    updated = store.update_alerts({
        "alerts": [
            {
                "id": "alert-keep-me",
                "symbol": "aapl",
                "condition": "price_above",
                "threshold": 100,
                "note": "watch the open",
                "priority": "high",
                "tolerancePercent": 0.25,
                "cooldownMinutes": 5,
            }
        ],
        "alert_hit_history": [
            {
                "id": "hit-keep-me",
                "symbol": "AAPL",
                "triggerTime": "2026-05-09T01:23:45",
                "extra": {"reason": "manual"},
            }
        ],
    })

    alert = updated["alerts"][0]
    assert alert["id"] == "alert-keep-me"
    assert alert["note"] == "watch the open"
    assert alert["priority"] == "high"
    assert alert["symbol"] == "AAPL"
    assert alert["tolerancePercent"] == 0.25
    assert alert["cooldownMinutes"] == 5

    history_entry = updated["alert_hit_history"][0]
    assert history_entry["id"] == "hit-keep-me"
    assert history_entry["triggerTime"] == "2026-05-09T01:23:45"
    assert history_entry["extra"] == {"reason": "manual"}

    reloaded = store.get_alerts()
    assert reloaded["alerts"][0]["note"] == "watch the open"
    assert reloaded["alert_hit_history"][0]["extra"] == {"reason": "manual"}


def test_record_alert_hit_deduplicates_and_promotes_existing_id_to_front(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    store.record_alert_hit({"id": "hit-A", "symbol": "AAPL", "message": "older A"})
    store.record_alert_hit({"id": "hit-1", "symbol": "MSFT", "message": "older 1"})
    store.record_alert_hit({"id": "hit-B", "symbol": "GOOG", "message": "older B"})

    result = store.record_alert_hit({
        "id": "hit-1",
        "symbol": "MSFT",
        "message": "newer 1",
    })

    history_ids = [item["id"] for item in result["alert_hit_history"]]
    assert history_ids == ["hit-1", "hit-B", "hit-A"]
    assert result["alert_hit_history"][0]["message"] == "newer 1"
    assert sum(1 for item in result["alert_hit_history"] if item["id"] == "hit-1") == 1


def test_record_alert_hit_raises_for_non_dict_entry(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    with pytest.raises(ValueError):
        store.record_alert_hit(None)  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        store.record_alert_hit("not a dict")  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        store.record_alert_hit([{"id": "still-not-a-dict"}])  # type: ignore[arg-type]


def test_record_alert_hit_caps_history_at_max_size(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    for index in range(MAX_ALERT_HIT_HISTORY):
        store.record_alert_hit({"id": f"hit-{index}", "symbol": "AAPL"})

    result = store.record_alert_hit({"id": "hit-newest", "symbol": "AAPL"})

    assert len(result["alert_hit_history"]) == MAX_ALERT_HIT_HISTORY
    assert result["alert_hit_history"][0]["id"] == "hit-newest"
    history_ids = {item["id"] for item in result["alert_hit_history"]}
    assert "hit-0" not in history_ids
    assert "hit-1" in history_ids


def test_record_alert_hit_isolates_history_per_profile(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    store.record_alert_hit({"id": "hit-a", "symbol": "AAPL"}, profile_id="profile-a")
    store.record_alert_hit({"id": "hit-b", "symbol": "MSFT"}, profile_id="profile-b")

    a_history = store.get_alerts(profile_id="profile-a")["alert_hit_history"]
    b_history = store.get_alerts(profile_id="profile-b")["alert_hit_history"]

    assert [item["id"] for item in a_history] == ["hit-a"]
    assert [item["id"] for item in b_history] == ["hit-b"]


def test_record_alert_hit_defensively_copies_nested_metadata_against_input_mutation(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    tags = ["urgent", "watch"]
    extra = {"reason": "manual"}
    input_entry = {
        "id": "hit-defensive",
        "symbol": "AAPL",
        "tags": tags,
        "extra": extra,
    }

    result = store.record_alert_hit(input_entry)

    tags.append("post-call-leak")
    extra["leaked"] = True

    assert result["entry"]["tags"] == ["urgent", "watch"]
    assert result["entry"]["extra"] == {"reason": "manual"}
    assert result["alert_hit_history"][0]["tags"] == ["urgent", "watch"]
    assert result["alert_hit_history"][0]["extra"] == {"reason": "manual"}


def test_record_alert_hit_returned_entry_and_history_views_are_decoupled(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    result = store.record_alert_hit({
        "id": "hit-iso",
        "symbol": "AAPL",
        "tags": ["urgent"],
        "extra": {"reason": "manual"},
    })

    result["entry"]["tags"].append("escalated")
    result["entry"]["extra"]["follow_up"] = True

    assert result["alert_hit_history"][0]["tags"] == ["urgent"]
    assert result["alert_hit_history"][0]["extra"] == {"reason": "manual"}


def test_update_alerts_with_json_unsafe_nested_value_preserves_existing_file(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    store.update_alerts({
        "alerts": [
            {"symbol": "AAPL", "condition": "price_above", "threshold": 100},
        ],
        "alert_hit_history": [{"id": "hit-baseline", "symbol": "AAPL"}],
    })
    alerts_file = tmp_path / "default.json"
    baseline_text = alerts_file.read_text(encoding="utf-8")
    assert json.loads(baseline_text)["alerts"][0]["symbol"] == "AAPL"

    bad_payload = {
        "alerts": [
            {
                "symbol": "MSFT",
                "condition": "price_below",
                "threshold": 50,
                "tags": {"a", "b"},
            }
        ],
    }

    try:
        result = store.update_alerts(bad_payload)
    except (TypeError, ValueError):
        result = None

    surviving_text = alerts_file.read_text(encoding="utf-8")
    assert surviving_text, "alerts file was truncated to empty bytes"
    parsed = json.loads(surviving_text)
    assert isinstance(parsed, dict)
    assert isinstance(parsed.get("alerts"), list)

    if result is not None:
        json.dumps(result)


def test_update_alerts_preserves_existing_file_when_final_replace_fails(tmp_path, monkeypatch):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    store.update_alerts({
        "alerts": [
            {"symbol": "AAPL", "condition": "price_above", "threshold": 100},
        ],
        "alert_hit_history": [{"id": "hit-baseline", "symbol": "AAPL"}],
    })
    alerts_file = tmp_path / "default.json"
    baseline_text = alerts_file.read_text(encoding="utf-8")
    assert json.loads(baseline_text)["alerts"][0]["symbol"] == "AAPL"

    def failing_replace(src, dst):
        raise OSError("simulated atomic replace failure")

    monkeypatch.setattr(os, "replace", failing_replace)

    store.update_alerts({
        "alerts": [
            {"symbol": "MSFT", "condition": "price_below", "threshold": 50},
        ],
    })

    surviving_text = alerts_file.read_text(encoding="utf-8")
    assert surviving_text == baseline_text
    assert json.loads(surviving_text)["alerts"][0]["symbol"] == "AAPL"


def test_update_alerts_cleans_up_temp_sibling_when_final_replace_fails(tmp_path, monkeypatch):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    store.update_alerts({
        "alerts": [
            {"symbol": "AAPL", "condition": "price_above", "threshold": 100},
        ],
        "alert_hit_history": [{"id": "hit-baseline", "symbol": "AAPL"}],
    })
    alerts_file = tmp_path / "default.json"
    baseline_text = alerts_file.read_text(encoding="utf-8")

    def failing_replace(src, dst):
        raise OSError("simulated atomic replace failure")

    monkeypatch.setattr(os, "replace", failing_replace)

    store.update_alerts({
        "alerts": [
            {"symbol": "MSFT", "condition": "price_below", "threshold": 50},
        ],
    })

    assert alerts_file.read_text(encoding="utf-8") == baseline_text

    orphan_temp_siblings = list(tmp_path.glob(".default.json.*.tmp"))
    assert orphan_temp_siblings == [], (
        f"orphan temp siblings remained after failed replace: {orphan_temp_siblings}"
    )


def test_update_alerts_returned_view_decoupled_from_input_payload_mutation(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    tags = ["urgent", "watch"]
    extra = {"reason": "manual"}
    payload = {
        "alerts": [
            {
                "id": "alert-1",
                "symbol": "AAPL",
                "condition": "price_above",
                "threshold": 100,
                "tags": tags,
            }
        ],
        "alert_hit_history": [
            {"id": "hit-1", "symbol": "AAPL", "extra": extra},
        ],
    }

    result = store.update_alerts(payload)

    tags.append("post-call-leak")
    extra["leaked"] = True

    assert result["alerts"][0]["tags"] == ["urgent", "watch"]
    assert result["alert_hit_history"][0]["extra"] == {"reason": "manual"}


def test_get_alerts_returned_alerts_isolated_from_caller_mutation(tmp_path, monkeypatch):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    cached_payload = {
        "alerts": [
            {
                "id": "alert-iso",
                "symbol": "AAPL",
                "condition": "price_above",
                "threshold": 100.0,
                "tags": ["urgent", "watch"],
                "extra": {"reason": "manual"},
            }
        ],
        "alert_hit_history": [],
    }
    monkeypatch.setattr(store, "_load_alerts", lambda profile_id=None: cached_payload)

    first_view = store.get_alerts()
    first_view["alerts"][0]["tags"].append("post-call-leak")
    first_view["alerts"][0]["extra"]["leaked"] = True
    first_view["alerts"][0]["threshold"] = 9999

    second_view = store.get_alerts()
    assert second_view["alerts"][0]["tags"] == ["urgent", "watch"]
    assert second_view["alerts"][0]["extra"] == {"reason": "manual"}
    assert second_view["alerts"][0]["threshold"] == 100.0


def test_get_alerts_returned_history_isolated_from_caller_mutation(tmp_path, monkeypatch):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    cached_payload = {
        "alerts": [],
        "alert_hit_history": [
            {
                "id": "hit-iso",
                "symbol": "AAPL",
                "tags": ["urgent"],
                "extra": {"reason": "manual"},
            }
        ],
    }
    monkeypatch.setattr(store, "_load_alerts", lambda profile_id=None: cached_payload)

    first_view = store.get_alerts()
    first_view["alert_hit_history"][0]["tags"].append("escalated")
    first_view["alert_hit_history"][0]["extra"]["follow_up"] = True

    second_view = store.get_alerts()
    assert second_view["alert_hit_history"][0]["tags"] == ["urgent"]
    assert second_view["alert_hit_history"][0]["extra"] == {"reason": "manual"}


def test_record_alert_hit_preserves_falsy_non_none_trigger_time(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    zero_result = store.record_alert_hit({
        "id": "hit-zero",
        "symbol": "AAPL",
        "triggerTime": 0,
    })
    assert zero_result["entry"]["triggerTime"] == "0"

    false_result = store.record_alert_hit({
        "id": "hit-false",
        "symbol": "MSFT",
        "triggerTime": False,
    })
    assert false_result["entry"]["triggerTime"] == "False"


def test_record_alert_hit_falls_back_to_trigger_time_alias_only_when_trigger_time_missing(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    none_result = store.record_alert_hit({
        "id": "hit-alias-none",
        "symbol": "AAPL",
        "triggerTime": None,
        "trigger_time": "2026-05-09T01:23:45",
    })
    assert none_result["entry"]["triggerTime"] == "2026-05-09T01:23:45"

    empty_result = store.record_alert_hit({
        "id": "hit-alias-empty",
        "symbol": "MSFT",
        "triggerTime": "",
        "trigger_time": "2026-05-09T02:34:56",
    })
    assert empty_result["entry"]["triggerTime"] == "2026-05-09T02:34:56"


def test_record_alert_hit_preserves_falsy_non_none_trigger_time_alias(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    zero_alias = store.record_alert_hit({
        "id": "hit-alias-zero",
        "symbol": "AAPL",
        "triggerTime": None,
        "trigger_time": 0,
    })
    assert zero_alias["entry"]["triggerTime"] == "0"

    false_alias = store.record_alert_hit({
        "id": "hit-alias-false",
        "symbol": "MSFT",
        "triggerTime": "",
        "trigger_time": False,
    })
    assert false_alias["entry"]["triggerTime"] == "False"


def test_record_alert_hit_preserves_falsy_non_none_condition(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    zero_result = store.record_alert_hit({
        "id": "hit-cond-zero",
        "symbol": "AAPL",
        "condition": 0,
    })
    assert zero_result["entry"]["condition"] == "0"

    false_result = store.record_alert_hit({
        "id": "hit-cond-false",
        "symbol": "MSFT",
        "condition": False,
    })
    assert false_result["entry"]["condition"] == "False"


def test_record_alert_hit_preserves_falsy_non_none_message(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    zero_result = store.record_alert_hit({
        "id": "hit-msg-zero",
        "symbol": "AAPL",
        "message": 0,
    })
    assert zero_result["entry"]["message"] == "0"

    false_result = store.record_alert_hit({
        "id": "hit-msg-false",
        "symbol": "MSFT",
        "message": False,
    })
    assert false_result["entry"]["message"] == "False"


def test_record_alert_hit_collapses_blank_condition_and_message_to_none(tmp_path):
    store = RealtimeAlertsStore(storage_path=tmp_path)

    none_result = store.record_alert_hit({
        "id": "hit-blank-none",
        "symbol": "AAPL",
        "condition": None,
        "message": None,
    })
    assert none_result["entry"]["condition"] is None
    assert none_result["entry"]["message"] is None

    empty_result = store.record_alert_hit({
        "id": "hit-blank-empty",
        "symbol": "MSFT",
        "condition": "",
        "message": "",
    })
    assert empty_result["entry"]["condition"] is None
    assert empty_result["entry"]["message"] is None

    whitespace_result = store.record_alert_hit({
        "id": "hit-blank-ws",
        "symbol": "GOOG",
        "condition": "   ",
        "message": "\t\n  ",
    })
    assert whitespace_result["entry"]["condition"] is None
    assert whitespace_result["entry"]["message"] is None

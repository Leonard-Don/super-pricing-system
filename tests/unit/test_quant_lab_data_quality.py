import json
from types import SimpleNamespace

import pandas as pd

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
    return QuantLabService(storage_root=tmp_path / "quant_lab")


class _StaticProvider:
    def __init__(self, history):
        self._history = history

    def get_historical_data(self, _symbol):
        return self._history


class _BrokenProvider:
    def __init__(self, message):
        self._message = message

    def get_historical_data(self, _symbol):
        raise RuntimeError(self._message)


def test_get_data_quality_handles_missing_provider_factory(monkeypatch, tmp_path):
    service = _build_quant_lab_service(monkeypatch, tmp_path)
    service.data_manager.provider_factory = None

    result = service.get_data_quality()

    assert result["providers"] == []
    assert result["summary"] == {"available": 0, "unavailable": 0}
    assert result["backtest_quality_report"]["risk_level"] == "unknown"


def test_get_data_quality_builds_provider_health_audit_and_failover_log(monkeypatch, tmp_path):
    service = _build_quant_lab_service(monkeypatch, tmp_path)
    now = pd.Timestamp.now(tz="UTC")
    service.data_manager.provider_factory = SimpleNamespace(
        providers={
            "stable": _StaticProvider(
                pd.DataFrame(
                    {"close": range(90)},
                    index=pd.date_range(end=now, periods=90, freq="min"),
                )
            ),
            "stale": _StaticProvider(
                pd.DataFrame(
                    {"close": range(30)},
                    index=pd.date_range(end=now - pd.Timedelta(days=3), periods=30, freq="h"),
                )
            ),
            "empty": _StaticProvider(pd.DataFrame()),
            "broken": _BrokenProvider("network down"),
        }
    )

    result = service.get_data_quality()

    assert result["summary"]["available"] == 2
    assert result["summary"]["degraded"] == 1
    assert result["summary"]["down"] == 1
    assert result["summary"]["stale"] == 1
    assert result["audit_report"]["weakest_provider"]["provider"] == "broken"
    assert result["audit_report"]["findings"][0]["title"] == "Provider 可用性退化"
    assert result["audit_report"]["failover_hotspots"] == [
        {"provider": "empty", "count": 1},
        {"provider": "broken", "count": 1},
    ]
    assert result["backtest_quality_report"]["risk_level"] == "high"
    assert result["providers"][1]["audit_flags"] == ["stale_data", "low_completeness"]

    failover_log_path = tmp_path / "quant_lab" / "data_quality_failover_log.json"
    with open(failover_log_path, "r", encoding="utf-8") as file:
        persisted_log = json.load(file)

    assert len(result["failover_log"]) == 2
    assert persisted_log[0]["provider"] == "empty"
    assert persisted_log[1]["provider"] == "broken"

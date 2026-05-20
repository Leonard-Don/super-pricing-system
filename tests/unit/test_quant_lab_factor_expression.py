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


def test_factor_expression_uses_synthetic_history_when_provider_is_empty(monkeypatch, tmp_path):
    service = _build_quant_lab_service(monkeypatch, tmp_path)
    service.data_manager = SimpleNamespace(
        get_historical_data=lambda *args, **kwargs: pd.DataFrame(),
    )

    result = service.evaluate_factor_expression(
        {
            "symbol": "AAPL",
            "expression": "rank(close)",
            "period": "1y",
            "preview_rows": 10,
        }
    )

    assert result["data_diagnostics"]["source"] == "synthetic_market_fallback"
    assert result["data_diagnostics"]["degraded"] is True
    assert result["diagnostics"]["rows"] >= 40
    assert len(result["preview"]) == 10

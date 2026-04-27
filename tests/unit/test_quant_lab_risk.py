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


def test_analyze_risk_center_builds_summary_factor_and_attribution(monkeypatch, tmp_path):
    service = _build_quant_lab_service(monkeypatch, tmp_path)
    index = pd.date_range("2025-01-01", periods=90, freq="D")
    close_map = {
        "AAPL": pd.DataFrame({"close": 100 + pd.Series(range(90), index=index) * 0.8}, index=index),
        "MSFT": pd.DataFrame({"close": 120 + pd.Series(range(90), index=index) * 0.5}, index=index),
    }
    factors = pd.DataFrame(
        {
            "Mkt-RF": [0.001 + (i * 0.00001) for i in range(89)],
            "SMB": [0.0003] * 89,
            "HML": [-0.0002] * 89,
            "RMW": [0.0001] * 89,
            "CMA": [0.00015] * 89,
            "RF": [0.00005] * 89,
        },
        index=index[1:],
    )
    service.data_manager = SimpleNamespace(
        get_historical_data=lambda symbol, period=None: close_map.get(symbol, pd.DataFrame()),
    )
    service._risk_center_service._data_manager = service.data_manager
    service._risk_center_service._ff5_fetcher = lambda period: factors

    result = service.analyze_risk_center(
        {
            "symbols": ["aapl", "msft"],
            "weights": [7, 3],
            "period": "1y",
        }
    )

    assert result["symbols"] == ["AAPL", "MSFT"]
    assert result["weights"] == [0.7, 0.3]
    assert result["summary"]["data_points"] == 89
    assert result["summary"]["volatility"] >= 0.0
    assert "historical" in result["var_cvar"]
    assert len(result["rolling_metrics"]) > 0
    assert result["correlation_matrix"]["symbols"] == ["AAPL", "MSFT"]
    assert len(result["correlation_matrix"]["cells"]) == 4
    assert "loadings" in result["factor_decomposition"]
    assert len(result["factor_decomposition"]["risk_split"]) == 5
    assert len(result["stress_tests"]) == 3
    assert result["performance_attribution"]["benchmark"] == "equal_weight"
    assert len(result["performance_attribution"]["rows"]) == 2
    assert "allocation_effect" in result["performance_attribution"]["totals"]


def test_analyze_risk_center_aligns_weights_after_unusable_symbol(monkeypatch, tmp_path):
    service = _build_quant_lab_service(monkeypatch, tmp_path)
    index = pd.date_range("2025-01-01", periods=90, freq="D")
    close_map = {
        "AAPL": pd.DataFrame({"close": 100 + pd.Series(range(90), index=index) * 0.8}, index=index),
        "MSFT": pd.DataFrame({"close": 120 + pd.Series(range(90), index=index) * 0.5}, index=index),
        "NVDA": pd.DataFrame({"volume": [1_000_000] * 90}, index=index),
    }
    factors = pd.DataFrame(
        {
            "Mkt-RF": [0.001 + (i * 0.00001) for i in range(89)],
            "SMB": [0.0003] * 89,
            "HML": [-0.0002] * 89,
            "RMW": [0.0001] * 89,
            "CMA": [0.00015] * 89,
            "RF": [0.00005] * 89,
        },
        index=index[1:],
    )
    service.data_manager = SimpleNamespace(
        get_historical_data=lambda symbol, period=None: close_map.get(symbol, pd.DataFrame()),
    )
    service._risk_center_service._data_manager = service.data_manager
    service._risk_center_service._ff5_fetcher = lambda period: factors

    result = service.analyze_risk_center(
        {
            "symbols": ["AAPL", "MSFT", "NVDA"],
            "weights": [0.4, 0.35, 0.25],
            "period": "1y",
        }
    )

    assert result["loaded_symbols"] == ["AAPL", "MSFT"]
    assert result["weights"] == [0.5333, 0.4667]
    assert result["diagnostics"]["dropped_symbols"] == ["NVDA"]
    assert len(result["performance_attribution"]["rows"]) == 2


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

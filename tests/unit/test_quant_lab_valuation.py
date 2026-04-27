import json
from types import SimpleNamespace

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


def test_analyze_valuation_lab_builds_history_and_peer_matrix(monkeypatch, tmp_path):
    service = _build_quant_lab_service(monkeypatch, tmp_path)
    monkeypatch.setattr(quant_lab_module, "peer_candidate_pool", lambda symbol: ["AUTO1", "AUTO2", "AUTO3"])
    service.pricing_analyzer = SimpleNamespace(
        analyze=lambda symbol, period: {
            "valuation": {
                "current_price": 110.0,
                "fair_value": {"mid": 100.0},
                "dcf": {"intrinsic_value": 120.0},
                "monte_carlo": {"p10": 90.0, "p50": 105.0, "p90": 130.0},
            }
        },
        build_peer_comparison=lambda symbol, candidate_symbols, limit: {
            "target": {
                "symbol": symbol,
                "current_price": 110.0,
                "fair_value": 108.0,
                "premium_discount": 0.02,
                "pe_ratio": 0.18,
                "price_to_sales": 0.12,
                "is_target": True,
            },
            "peers": [
                {
                    "symbol": "MSFT",
                    "current_price": 95.0,
                    "fair_value": 100.0,
                    "premium_discount": -0.05,
                    "pe_ratio": 0.16,
                    "price_to_sales": 0.1,
                },
                {
                    "symbol": "NVDA",
                    "current_price": 140.0,
                    "fair_value": 118.0,
                    "premium_discount": 0.18,
                    "pe_ratio": 0.4,
                    "price_to_sales": 0.28,
                },
            ],
            "sector": "Technology",
            "industry": "Semiconductors",
        },
    )
    service._valuation_lab_service._pricing_analyzer = service.pricing_analyzer
    service._valuation_lab_service._peer_candidate_pool_fn = quant_lab_module.peer_candidate_pool
    service.data_manager = SimpleNamespace(
        get_fundamental_data=lambda symbol: {
            "MSFT": {"revenue_growth": 0.12, "earnings_growth": 0.14, "roe": 0.28, "profit_margin": 0.22},
            "NVDA": {"revenue_growth": 0.3, "earnings_growth": 0.35, "roe": 0.32, "profit_margin": 0.27},
            "AAPL": {"revenue_growth": 0.08, "earnings_growth": 0.1, "roe": 0.24, "profit_margin": 0.21},
        }.get(symbol, {}),
    )
    service._valuation_lab_service._data_manager = service.data_manager

    result = service.analyze_valuation_lab(
        {
            "symbol": "aapl",
            "period": "1y",
            "peer_symbols": ["msft", "nvda"],
            "peer_limit": 4,
        }
    )

    assert result["symbol"] == "AAPL"
    assert result["ensemble_valuation"]["fair_value"] == 110.0
    assert result["ensemble_valuation"]["gap_pct"] == 0.0
    assert result["valuation_history"][0]["market_price"] == 110.0
    assert result["peer_matrix"]["summary"]["peer_count"] == 2
    assert result["peer_matrix"]["summary"]["custom_peer_count"] == 2
    assert result["peer_matrix"]["sector"] == "Technology"
    assert result["peer_matrix"]["rows"][0]["symbol"] == "AAPL"
    assert result["peer_matrix"]["rows"][1]["peer_source"] == "custom"
    assert result["peer_matrix"]["rows"][1]["rank"] == 2

    history_path = tmp_path / "quant_lab" / "valuation_history" / "AAPL.json"
    with open(history_path, "r", encoding="utf-8") as file:
        persisted_history = json.load(file)

    assert persisted_history[0]["fair_value"] == 110.0
    assert persisted_history[0]["period"] == "1y"


def test_analyze_valuation_lab_prefers_lightweight_valuation_engine(monkeypatch, tmp_path):
    service = _build_quant_lab_service(monkeypatch, tmp_path)
    monkeypatch.setattr(quant_lab_module, "peer_candidate_pool", lambda symbol: ["AUTO1", "AUTO2"])

    def _unexpected_full_analysis(*_args, **_kwargs):
        raise AssertionError("full pricing analysis should not run for quant valuation lab")

    service.pricing_analyzer = SimpleNamespace(
        analyze=_unexpected_full_analysis,
        valuation_model=SimpleNamespace(
            analyze=lambda symbol: {
                "symbol": symbol,
                "current_price": 110.0,
                "fair_value": {"mid": 100.0},
                "dcf": {"intrinsic_value": 120.0},
                "monte_carlo": {"p10": 90.0, "p50": 105.0, "p90": 130.0},
            }
        ),
        build_peer_comparison=lambda symbol, candidate_symbols, limit: {
            "target": {
                "symbol": symbol,
                "current_price": 110.0,
                "fair_value": 108.0,
                "premium_discount": 0.02,
                "pe_ratio": 0.18,
                "price_to_sales": 0.12,
                "revenue_growth": 0.08,
                "earnings_growth": 0.1,
                "return_on_equity": 0.24,
                "profit_margin": 0.21,
                "is_target": True,
            },
            "peers": [
                {
                    "symbol": "MSFT",
                    "current_price": 95.0,
                    "fair_value": 100.0,
                    "premium_discount": -0.05,
                    "pe_ratio": 0.16,
                    "price_to_sales": 0.1,
                    "revenue_growth": 0.12,
                    "earnings_growth": 0.14,
                    "return_on_equity": 0.28,
                    "profit_margin": 0.22,
                },
            ],
            "sector": "Technology",
            "industry": "Software",
        },
    )
    service._valuation_lab_service._pricing_analyzer = service.pricing_analyzer
    service._valuation_lab_service._peer_candidate_pool_fn = quant_lab_module.peer_candidate_pool
    service.data_manager = SimpleNamespace(
        get_fundamental_data=lambda symbol: (_ for _ in ()).throw(
            AssertionError(f"unexpected extra fundamentals fetch for {symbol}")
        )
    )
    service._valuation_lab_service._data_manager = service.data_manager

    result = service.analyze_valuation_lab(
        {
            "symbol": "aapl",
            "period": "1y",
            "peer_symbols": ["msft"],
            "peer_limit": 3,
        }
    )

    assert result["symbol"] == "AAPL"
    assert result["analysis"]["valuation"]["current_price"] == 110.0
    assert result["peer_matrix"]["rows"][0]["symbol"] == "AAPL"
    assert result["peer_matrix"]["summary"]["peer_count"] == 1

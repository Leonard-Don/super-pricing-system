from types import SimpleNamespace

from backend.app.core.persistence import PersistenceManager
from backend.app.services.quant_lab import QuantLabService
from backend.app.services.realtime_alerts import RealtimeAlertsStore
from backend.app.services.realtime_preferences import RealtimePreferencesStore
from src.research.workbench import ResearchWorkbenchStore

import backend.app.services.quant_lab as quant_lab_module


def _build_quant_lab_service(monkeypatch, tmp_path, history=None):
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
    monkeypatch.setattr(
        quant_lab_module,
        "trade_manager",
        SimpleNamespace(get_history=lambda limit=500: list(history or [])[:limit]),
    )
    service = QuantLabService(storage_root=tmp_path / "quant_lab")
    return service


def test_get_trading_journal_enriches_trades_and_builds_reports(monkeypatch, tmp_path):
    service = _build_quant_lab_service(
        monkeypatch,
        tmp_path,
        history=[
            {
                "id": "trade-1",
                "timestamp": "2026-04-20T09:30:00",
                "symbol": "aapl",
                "action": "BUY",
                "total_amount": 18000,
                "pnl": 320.5,
            },
            {
                "id": "trade-2",
                "timestamp": "2026-04-20T14:00:00",
                "symbol": "msft",
                "action": "SELL",
                "total_amount": 1500,
                "pnl": -120.0,
            },
        ],
    )

    service.update_trading_journal(
        {
            "notes": {
                "trade-1": {
                    "notes": "momentum breakout",
                    "strategy_source": "signal",
                    "signal_strength": 0.8,
                }
            },
            "strategy_lifecycle": [
                {
                    "strategy": "Rotation Alpha",
                    "stage": "paper",
                    "status": "active",
                    "owner": "research",
                    "conviction": 0.65,
                    "next_action": "prepare live checklist",
                }
            ],
        },
        profile_id="desk-a",
    )

    result = service.get_trading_journal(profile_id="desk-a")

    assert result["summary"]["total_trades"] == 2
    assert result["summary"]["winning_trades"] == 1
    assert result["summary"]["losing_trades"] == 1
    assert result["summary"]["realized_pnl"] == 200.5
    assert result["trades"][0]["symbol"] == "AAPL"
    assert result["trades"][0]["strategy_source"] == "signal"
    assert result["trades"][0]["risk_bucket"] == "high"
    assert result["trades"][0]["reason_category"] == "signal_entry"
    assert result["trades"][1]["error_category"] == "noise_trade"
    assert result["daily_report"][0]["trade_count"] == 2
    assert result["loss_analysis"][0]["category"] == "noise_trade"
    assert result["strategy_lifecycle_summary"]["total"] == 1
    assert result["strategy_lifecycle"][0]["strategy"] == "Rotation Alpha"


def test_update_trading_journal_merges_notes_and_normalizes_lifecycle(monkeypatch, tmp_path):
    service = _build_quant_lab_service(
        monkeypatch,
        tmp_path,
        history=[
            {
                "id": "trade-3",
                "timestamp": "2026-04-20T10:00:00",
                "symbol": "spy",
                "action": "SELL",
                "total_amount": 6000,
                "pnl": -50.0,
            }
        ],
    )

    first = service.update_trading_journal(
        {
            "notes": {
                "trade-3": {
                    "notes": "first pass",
                    "strategy_source": "manual",
                }
            }
        },
        profile_id="desk-b",
    )
    second = service.update_trading_journal(
        {
            "notes": {
                "trade-3": {
                    "notes": "refined thesis",
                    "strategy_source": "hedge",
                    "reason_category": "risk_exit",
                }
            },
            "strategy_lifecycle": [
                {
                    "name": "Mean Reversion",
                    "stage": "retired",
                    "conviction": 72,
                }
            ],
        },
        profile_id="desk-b",
    )

    assert first["trades"][0]["notes"] == "first pass"
    assert second["trades"][0]["notes"] == "refined thesis"
    assert second["trades"][0]["strategy_source"] == "hedge"
    assert second["trades"][0]["reason_category"] == "risk_exit"
    assert second["strategy_lifecycle"][0]["strategy"] == "Mean Reversion"
    assert second["strategy_lifecycle"][0]["status"] == "closed"
    assert second["strategy_lifecycle"][0]["conviction"] == 0.72

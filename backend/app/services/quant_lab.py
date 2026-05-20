"""Unified quant feature extensions for the Quant Lab workspace."""

from __future__ import annotations

import json
import logging
import math
import os
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from backend.app.services.realtime_alerts import realtime_alerts_store
from backend.app.services.quant_lab_alerts import QuantLabAlertOrchestrationService
from backend.app.services.quant_lab_data_quality import QuantLabDataQualityService
from backend.app.services.quant_lab_trading_journal import QuantLabTradingJournalService
from backend.app.services.quant_lab_valuation import QuantLabValuationService
from backend.app.services.realtime_preferences import realtime_preferences_store
from backend.app.services.notification_service import notification_service
from backend.app.core.persistence import persistence_manager
from backend.app.api.v1.endpoints.pricing_support import peer_candidate_pool
from src.research.workbench import research_workbench_store
from src.analytics.factor_expression import FactorExpressionError, factor_expression_engine
from src.analytics.pricing_gap_analyzer import PricingGapAnalyzer
from src.data.data_manager import DataManager
from src.data.synthetic_market import build_synthetic_ohlcv_frame
from src.trading.trade_manager import trade_manager
from src.utils.config import PROJECT_ROOT

logger = logging.getLogger(__name__)


def _json_ready(value: Any) -> Any:
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, np.generic):
        return _json_ready(value.item())
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, (pd.Series, pd.Index)):
        return [_json_ready(item) for item in value.tolist()]
    if isinstance(value, pd.DataFrame):
        return [_json_ready(item) for item in value.to_dict("records")]
    if isinstance(value, tuple):
        return [_json_ready(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _json_ready(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_ready(item) for item in value]
    return value


_ALERT_HISTORY_IDENTITY_KEYS = ("id", "symbol", "rule_name", "ruleName")


def _normalize_alert_history_identity_value(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _alert_history_identity_key(entry: Dict[str, Any]) -> tuple[str, str, str]:
    entry_id = _normalize_alert_history_identity_value(entry.get("id"))
    symbol = _normalize_alert_history_identity_value(entry.get("symbol")).upper()
    rule_name = (
        _normalize_alert_history_identity_value(entry.get("rule_name"))
        or _normalize_alert_history_identity_value(entry.get("ruleName"))
    )
    return (entry_id, symbol, rule_name)


def _sanitize_alert_history_updates(payload: Any) -> Any:
    if not isinstance(payload, dict):
        return payload
    raw_updates = payload.get("history_updates")
    if not isinstance(raw_updates, list):
        return payload
    cleaned: list[Any] = []
    seen: set[tuple[str, str, str]] = set()
    for entry in raw_updates:
        if not isinstance(entry, dict):
            continue
        if not any(_normalize_alert_history_identity_value(entry.get(key)) for key in _ALERT_HISTORY_IDENTITY_KEYS):
            continue
        key = _alert_history_identity_key(entry)
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(entry)
    if len(cleaned) == len(raw_updates):
        return payload
    sanitized = dict(payload)
    sanitized["history_updates"] = cleaned
    return sanitized


def _resolve_quant_lab_storage_root(storage_root: str | Path | None = None) -> Path:
    if storage_root is not None:
        return Path(storage_root)

    env_storage_root = os.getenv("QUANT_LAB_STORAGE_ROOT")
    if env_storage_root:
        return Path(env_storage_root)

    return PROJECT_ROOT / "data" / "quant_lab"

class QuantLabService:
    """Backend service powering the Quant Lab workspace."""

    def __init__(self, storage_root: str | Path | None = None):
        self.data_manager = DataManager()
        self.pricing_analyzer = PricingGapAnalyzer()
        self.storage_root = _resolve_quant_lab_storage_root(storage_root)
        self.storage_root.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._trading_journal_service = QuantLabTradingJournalService(
            lock=self._lock,
            profile_file=self._profile_file,
            read_store=self._read_store,
            write_store=self._write_store,
            trade_manager=trade_manager,
        )
        self._alert_orchestration_service = QuantLabAlertOrchestrationService(
            lock=self._lock,
            profile_file=self._profile_file,
            read_store=self._read_store,
            write_store=self._write_store,
            realtime_alerts_store=realtime_alerts_store,
            realtime_preferences_store=realtime_preferences_store,
            notification_service=notification_service,
            persistence_manager=persistence_manager,
            research_workbench_store=research_workbench_store,
        )
        self._data_quality_service = QuantLabDataQualityService(
            data_manager=self.data_manager,
            storage_root=self.storage_root,
            read_store=self._read_store,
            write_store=self._write_store,
        )
        self._valuation_lab_service = QuantLabValuationService(
            data_manager=self.data_manager,
            pricing_analyzer=self.pricing_analyzer,
            storage_root=self.storage_root,
            read_store=self._read_store,
            write_store=self._write_store,
            peer_candidate_pool_fn=peer_candidate_pool,
        )

    def _load_market_history(
        self,
        symbol: str,
        *,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        interval: str = "1d",
        period: Optional[str] = None,
    ) -> pd.DataFrame:
        data = self.data_manager.get_historical_data(
            symbol=symbol,
            start_date=start_date,
            end_date=end_date,
            interval=interval,
            period=period,
        )
        if data is None or data.empty:
            if period or (start_date is None and end_date is None):
                return build_synthetic_ohlcv_frame(
                    symbol,
                    start_date=start_date,
                    end_date=end_date,
                    interval=interval,
                    period=period,
                )
        return data if data is not None else pd.DataFrame()

    def get_trading_journal(self, profile_id: str | None = None) -> Dict[str, Any]:
        return self._trading_journal_service.get_trading_journal(profile_id)

    def update_trading_journal(self, payload: Dict[str, Any], profile_id: str | None = None) -> Dict[str, Any]:
        return self._trading_journal_service.update_trading_journal(payload, profile_id)

    def get_alert_orchestration(self, profile_id: str | None = None) -> Dict[str, Any]:
        return self._alert_orchestration_service.get_alert_orchestration(profile_id)

    def update_alert_orchestration(self, payload: Dict[str, Any], profile_id: str | None = None) -> Dict[str, Any]:
        sanitized = _sanitize_alert_history_updates(payload)
        return self._alert_orchestration_service.update_alert_orchestration(sanitized, profile_id)

    def apply_alert_action(self, payload: Dict[str, Any], profile_id: str | None = None) -> Dict[str, Any]:
        return self._alert_orchestration_service.apply_alert_action(payload, profile_id)

    def publish_alert_event(self, payload: Dict[str, Any], profile_id: str | None = None) -> Dict[str, Any]:
        return self._alert_orchestration_service.publish_alert_event(payload, profile_id)

    def get_data_quality(self) -> Dict[str, Any]:
        return self._data_quality_service.get_data_quality()

    def analyze_valuation_lab(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self._valuation_lab_service.analyze_valuation_lab(payload)

    def evaluate_factor_expression(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        symbol = str(payload.get("symbol") or "").strip().upper()
        expression = str(payload.get("expression") or "").strip()
        period = str(payload.get("period") or "1y")
        preview_rows = max(5, min(int(payload.get("preview_rows") or 30), 120))
        if not symbol:
            raise ValueError("symbol is required")
        if not expression:
            raise ValueError("expression is required")

        data = self._load_market_history(symbol=symbol, period=period)
        if data.empty:
            raise ValueError("no market data available for factor expression")
        try:
            result = factor_expression_engine.evaluate(data, expression, preview_rows=preview_rows)
        except FactorExpressionError as exc:
            raise ValueError(str(exc)) from exc

        return _json_ready(
            {
                "symbol": symbol,
                "period": period,
                "data_diagnostics": {
                    "source": data.attrs.get("source", "historical_provider"),
                    "degraded": bool(data.attrs.get("degraded", False)),
                    "synthetic": bool(data.attrs.get("synthetic", False)),
                    "reason": data.attrs.get("degraded_reason", ""),
                },
                "expression": result.expression,
                "latest_value": result.latest_value,
                "preview": result.preview,
                "diagnostics": result.diagnostics,
                "supported_functions": [
                    "rank",
                    "zscore",
                    "sma",
                    "ema",
                    "rolling_mean",
                    "rolling_std",
                    "pct_change",
                    "delay",
                    "abs",
                    "min",
                    "max",
                    "clip",
                    "log",
                ],
            }
        )

    def _profile_file(self, name: str, profile_id: str | None) -> Path:
        normalized_profile = str(profile_id or "default").strip().lower().replace("/", "-")
        folder = self.storage_root / name
        folder.mkdir(parents=True, exist_ok=True)
        return folder / f"{normalized_profile}.json"

    def _read_store(self, filepath: Path, default: Any) -> Any:
        try:
            if filepath.exists():
                with open(filepath, "r", encoding="utf-8") as file:
                    return json.load(file)
        except Exception as exc:  # pragma: no cover - disk corruption edge
            logger.warning("Failed to read %s: %s", filepath, exc)
        return default

    def _write_store(self, filepath: Path, payload: Any) -> None:
        with open(filepath, "w", encoding="utf-8") as file:
            json.dump(_json_ready(payload), file, ensure_ascii=False, indent=2)


quant_lab_service = QuantLabService()

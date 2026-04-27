"""Unified quant feature extensions for the Quant Lab workspace."""

from __future__ import annotations

import json
import logging
import math
import os
import threading
from datetime import datetime
from itertools import product
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from backend.app.services.realtime_alerts import realtime_alerts_store
from backend.app.services.quant_lab_alerts import QuantLabAlertOrchestrationService
from backend.app.services.quant_lab_data_quality import QuantLabDataQualityService
from backend.app.services.quant_lab_industry_rotation import QuantLabIndustryRotationService
from backend.app.services.quant_lab_risk import QuantLabRiskService
from backend.app.services.quant_lab_trading_journal import QuantLabTradingJournalService
from backend.app.services.quant_lab_valuation import QuantLabValuationService
from backend.app.services.realtime_preferences import realtime_preferences_store
from backend.app.services.notification_service import notification_service
from backend.app.core.persistence import persistence_manager
from backend.app.api.v1.endpoints.pricing_support import peer_candidate_pool
from src.research.workbench import research_workbench_store
from src.analytics.asset_pricing import _fetch_ff5_factors
from src.analytics.factor_expression import FactorExpressionError, factor_expression_engine
from src.analytics.pricing_gap_analyzer import PricingGapAnalyzer
from src.backtest.backtester import Backtester
from src.backtest.batch_backtester import BayesianParameterOptimizer, WalkForwardAnalyzer
from src.data.data_manager import DataManager
from src.data.synthetic_market import build_synthetic_ohlcv_frame
from src.strategy.advanced_strategies import (
    ATRTrailingStop,
    MACDStrategy,
    MeanReversionStrategy,
    MomentumStrategy,
    StochasticOscillator,
    VWAPStrategy,
)
from src.strategy.strategies import (
    BollingerBands,
    BuyAndHold,
    MovingAverageCrossover,
    MultiFactorStrategy,
    RSIStrategy,
    TurtleTradingStrategy,
)
from src.strategy.strategy_validator import StrategyValidator
from src.trading.trade_manager import trade_manager
from src.utils.config import PROJECT_ROOT
from src.utils.data_validation import normalize_backtest_results

logger = logging.getLogger(__name__)


STRATEGY_CLASSES = {
    "moving_average": MovingAverageCrossover,
    "rsi": RSIStrategy,
    "bollinger_bands": BollingerBands,
    "buy_and_hold": BuyAndHold,
    "macd": MACDStrategy,
    "mean_reversion": MeanReversionStrategy,
    "vwap": VWAPStrategy,
    "momentum": MomentumStrategy,
    "stochastic": StochasticOscillator,
    "atr_trailing_stop": ATRTrailingStop,
    "turtle_trading": TurtleTradingStrategy,
    "multi_factor": MultiFactorStrategy,
}

def _to_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        numeric = float(value)
        if math.isnan(numeric) or math.isinf(numeric):
            return default
        return numeric
    except (TypeError, ValueError):
        return default


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
        self._risk_center_service = QuantLabRiskService(
            data_manager=self.data_manager,
            ff5_fetcher=_fetch_ff5_factors,
        )
        self._industry_rotation_service = QuantLabIndustryRotationService(
            lock=self._lock,
            data_manager_getter=lambda: self.data_manager,
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

    def optimize_strategy(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        symbol = str(payload.get("symbol") or "").strip().upper()
        strategy_name = str(payload.get("strategy") or "").strip()
        if not symbol:
            raise ValueError("symbol is required")
        if strategy_name not in STRATEGY_CLASSES:
            raise ValueError(f"unsupported strategy: {strategy_name}")

        start_date = _to_datetime(payload.get("start_date"))
        end_date = _to_datetime(payload.get("end_date"))
        initial_capital = _safe_float(payload.get("initial_capital"), 10000.0)
        commission = _safe_float(payload.get("commission"), 0.001)
        slippage = _safe_float(payload.get("slippage"), 0.001)
        density = max(2, min(int(payload.get("density") or 3), 6))
        optimization_metric = str(payload.get("optimization_metric") or "sharpe_ratio")
        optimization_method = str(payload.get("optimization_method") or "grid")
        optimization_budget = payload.get("optimization_budget")
        train_ratio = min(max(_safe_float(payload.get("train_ratio"), 0.7), 0.55), 0.9)

        data = self._load_market_history(
            symbol=symbol,
            start_date=start_date,
            end_date=end_date,
        )
        if data.empty or len(data) < 80:
            raise ValueError("insufficient data for optimization")

        base_params = self._validated_parameters(strategy_name, payload.get("parameters") or {})
        parameter_grid = payload.get("parameter_grid") or self._build_parameter_grid(strategy_name, base_params, density=density)
        parameter_candidates = self._build_parameter_candidates(strategy_name, parameter_grid)
        candidate_budget = max(1, min(int(optimization_budget or len(parameter_candidates) or 1), max(len(parameter_candidates), 1)))

        split_index = max(30, min(len(data) - 20, int(len(data) * train_ratio)))
        train_data = data.iloc[:split_index].copy()
        validation_data = data.iloc[split_index:].copy()
        if validation_data.empty:
            validation_data = data.iloc[-min(30, len(data)) :].copy()

        observations: List[Dict[str, Any]] = []

        def evaluator(params: Dict[str, Any]) -> tuple[Dict[str, Any], float]:
            metrics = self._run_backtest_metrics(
                symbol=symbol,
                strategy_name=strategy_name,
                params=params,
                data=train_data,
                initial_capital=initial_capital,
                commission=commission,
                slippage=slippage,
            )
            score = _safe_float(metrics.get(optimization_metric), float("-inf"))
            observations.append({
                "parameters": dict(params),
                "metrics": metrics,
                "score": score,
            })
            return metrics, score

        if optimization_method == "bayesian" and len(parameter_candidates) > 1:
            optimizer = BayesianParameterOptimizer(
                initial_samples=min(5, candidate_budget),
                max_evaluations=candidate_budget,
            )
            optimized = optimizer.optimize(parameter_candidates, evaluator)
            best_parameters = optimized["parameters"]
            best_train_metrics = optimized["train_metrics"]
        else:
            for candidate in parameter_candidates[:candidate_budget]:
                evaluator(candidate)
            if not observations:
                raise ValueError("no optimization candidates were evaluated")
            best_observation = max(observations, key=lambda item: item["score"])
            best_parameters = best_observation["parameters"]
            best_train_metrics = best_observation["metrics"]

        validation_metrics = self._run_backtest_metrics(
            symbol=symbol,
            strategy_name=strategy_name,
            params=best_parameters,
            data=validation_data,
            initial_capital=initial_capital,
            commission=commission,
            slippage=slippage,
        )
        full_sample_metrics = self._run_backtest_metrics(
            symbol=symbol,
            strategy_name=strategy_name,
            params=best_parameters,
            data=data,
            initial_capital=initial_capital,
            commission=commission,
            slippage=slippage,
        )

        walk_forward = None
        if payload.get("run_walk_forward", True):
            analyzer = WalkForwardAnalyzer(
                train_period=max(40, int(payload.get("train_period") or 126)),
                test_period=max(10, int(payload.get("test_period") or 42)),
                step_size=max(5, int(payload.get("step_size") or 21)),
            )
            walk_forward = analyzer.analyze(
                data=data,
                strategy_factory=lambda parameters=None: self._create_strategy(strategy_name, parameters or {}),
                backtester_factory=lambda: Backtester(
                    initial_capital=initial_capital,
                    commission=commission,
                    slippage=slippage,
                ),
                parameter_grid=parameter_grid,
                optimization_metric=optimization_metric,
                optimization_method=optimization_method,
                optimization_budget=candidate_budget,
                monte_carlo_simulations=max(50, int(payload.get("monte_carlo_simulations") or 150)),
            )

        leaderboard = sorted(
            observations,
            key=lambda item: item["score"],
            reverse=True,
        )
        heatmap = self._build_heatmap(parameter_grid, leaderboard, optimization_metric)
        stability = self._build_parameter_stability(best_parameters, leaderboard)

        return _json_ready(
            {
                "symbol": symbol,
                "strategy": strategy_name,
                "optimization_metric": optimization_metric,
                "optimization_method": optimization_method,
                "candidate_count": len(parameter_candidates),
                "evaluated_candidates": len(observations),
                "generated_grid": parameter_grid,
                "best_parameters": best_parameters,
                "best_train_metrics": best_train_metrics,
                "validation_metrics": validation_metrics,
                "full_sample_metrics": full_sample_metrics,
                "parameter_stability": stability,
                "leaderboard": leaderboard[:20],
                "heatmap": heatmap,
                "walk_forward": walk_forward,
                "validation_backtest_request": {
                    "symbol": symbol,
                    "strategy": strategy_name,
                    "parameters": best_parameters,
                    "start_date": payload.get("start_date"),
                    "end_date": payload.get("end_date"),
                    "initial_capital": initial_capital,
                    "commission": commission,
                    "slippage": slippage,
                },
            }
        )

    def analyze_risk_center(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self._risk_center_service.analyze_risk_center(payload)

    def get_trading_journal(self, profile_id: str | None = None) -> Dict[str, Any]:
        return self._trading_journal_service.get_trading_journal(profile_id)

    def update_trading_journal(self, payload: Dict[str, Any], profile_id: str | None = None) -> Dict[str, Any]:
        return self._trading_journal_service.update_trading_journal(payload, profile_id)

    def get_alert_orchestration(self, profile_id: str | None = None) -> Dict[str, Any]:
        return self._alert_orchestration_service.get_alert_orchestration(profile_id)

    def update_alert_orchestration(self, payload: Dict[str, Any], profile_id: str | None = None) -> Dict[str, Any]:
        return self._alert_orchestration_service.update_alert_orchestration(payload, profile_id)

    def publish_alert_event(self, payload: Dict[str, Any], profile_id: str | None = None) -> Dict[str, Any]:
        return self._alert_orchestration_service.publish_alert_event(payload, profile_id)

    def get_data_quality(self) -> Dict[str, Any]:
        return self._data_quality_service.get_data_quality()

    def analyze_valuation_lab(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self._valuation_lab_service.analyze_valuation_lab(payload)

    def run_industry_rotation_lab(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self._industry_rotation_service.run_industry_rotation_lab(payload)

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

    def _validated_parameters(self, strategy_name: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        is_valid, error_message, cleaned = StrategyValidator.validate_strategy_params(strategy_name, parameters or {})
        if not is_valid:
            raise ValueError(error_message)
        return cleaned

    def _create_strategy(self, strategy_name: str, cleaned_params: Dict[str, Any]):
        strategy_class = STRATEGY_CLASSES[strategy_name]
        if strategy_name == "moving_average":
            return strategy_class(fast_period=cleaned_params["fast_period"], slow_period=cleaned_params["slow_period"])
        if strategy_name == "rsi":
            return strategy_class(
                period=cleaned_params["period"],
                oversold=cleaned_params["oversold"],
                overbought=cleaned_params["overbought"],
            )
        if strategy_name == "bollinger_bands":
            return strategy_class(period=cleaned_params["period"], num_std=cleaned_params["num_std"])
        if strategy_name == "macd":
            return strategy_class(
                fast_period=cleaned_params["fast_period"],
                slow_period=cleaned_params["slow_period"],
                signal_period=cleaned_params["signal_period"],
            )
        if strategy_name == "mean_reversion":
            return strategy_class(
                lookback_period=cleaned_params["lookback_period"],
                entry_threshold=cleaned_params["entry_threshold"],
            )
        if strategy_name == "vwap":
            return strategy_class(period=cleaned_params["period"])
        if strategy_name == "momentum":
            return strategy_class(
                fast_window=cleaned_params["fast_window"],
                slow_window=cleaned_params["slow_window"],
            )
        if strategy_name == "stochastic":
            return strategy_class(
                k_period=cleaned_params["k_period"],
                d_period=cleaned_params["d_period"],
                oversold=cleaned_params["oversold"],
                overbought=cleaned_params["overbought"],
            )
        if strategy_name == "atr_trailing_stop":
            return strategy_class(
                atr_period=cleaned_params["atr_period"],
                atr_multiplier=cleaned_params["atr_multiplier"],
            )
        if strategy_name == "turtle_trading":
            return strategy_class(
                entry_period=cleaned_params["entry_period"],
                exit_period=cleaned_params["exit_period"],
            )
        if strategy_name == "multi_factor":
            return strategy_class(
                momentum_window=cleaned_params["momentum_window"],
                mean_reversion_window=cleaned_params["mean_reversion_window"],
                volume_window=cleaned_params["volume_window"],
                volatility_window=cleaned_params["volatility_window"],
                entry_threshold=cleaned_params["entry_threshold"],
                exit_threshold=cleaned_params["exit_threshold"],
            )
        return strategy_class()

    def _run_backtest_metrics(
        self,
        *,
        symbol: str,
        strategy_name: str,
        params: Dict[str, Any],
        data: pd.DataFrame,
        initial_capital: float,
        commission: float,
        slippage: float,
    ) -> Dict[str, Any]:
        strategy = self._create_strategy(strategy_name, self._validated_parameters(strategy_name, params))
        result = Backtester(
            initial_capital=initial_capital,
            commission=commission,
            slippage=slippage,
        ).run(strategy, data.copy())
        result["symbol"] = symbol
        result["strategy"] = strategy_name
        result["parameters"] = params
        normalized = normalize_backtest_results(result)
        metrics = normalized.get("metrics", {})
        metrics.setdefault("final_value", normalized.get("final_value"))
        metrics.setdefault("total_return", normalized.get("total_return"))
        metrics.setdefault("sharpe_ratio", normalized.get("sharpe_ratio"))
        metrics.setdefault("max_drawdown", normalized.get("max_drawdown"))
        return metrics

    def _build_parameter_grid(
        self,
        strategy_name: str,
        base_params: Dict[str, Any],
        *,
        density: int,
    ) -> Dict[str, List[Any]]:
        rules = StrategyValidator.STRATEGY_RULES.get(strategy_name, [])
        grid: Dict[str, List[Any]] = {}
        for rule in rules:
            anchor = base_params.get(rule.name, rule.default)
            if rule.min_value is None or rule.max_value is None:
                grid[rule.name] = [anchor]
                continue
            if density <= 1:
                values = [anchor]
            elif rule.type is int:
                values = np.linspace(rule.min_value, rule.max_value, num=density)
                values = sorted({int(round(value)) for value in values} | {int(anchor)})
            else:
                values = np.linspace(rule.min_value, rule.max_value, num=density)
                values = sorted({round(float(value), 4) for value in values} | {round(float(anchor), 4)})
            grid[rule.name] = list(values)
        return grid

    def _build_parameter_candidates(self, strategy_name: str, parameter_grid: Dict[str, List[Any]]) -> List[Dict[str, Any]]:
        if not parameter_grid:
            return [{}]
        keys = list(parameter_grid.keys())
        raw_candidates = [dict(zip(keys, values)) for values in product(*(parameter_grid[key] for key in keys))]
        candidates = []
        for candidate in raw_candidates:
            is_valid, _, cleaned = StrategyValidator.validate_strategy_params(strategy_name, candidate)
            if is_valid:
                candidates.append(cleaned)
        if not candidates:
            return [{}]
        if len(candidates) <= 180:
            return candidates
        indices = np.linspace(0, len(candidates) - 1, num=180, dtype=int)
        return [candidates[int(index)] for index in sorted(set(indices.tolist()))]

    def _build_heatmap(
        self,
        parameter_grid: Dict[str, List[Any]],
        leaderboard: List[Dict[str, Any]],
        optimization_metric: str,
    ) -> Dict[str, Any]:
        keys = list(parameter_grid.keys())
        if not keys:
            return {"type": "scalar", "metric": optimization_metric, "cells": []}
        if len(keys) == 1:
            key = keys[0]
            return {
                "type": "line",
                "metric": optimization_metric,
                "cells": [
                    {
                        "x": row["parameters"].get(key),
                        "value": row["metrics"].get(optimization_metric),
                    }
                    for row in leaderboard
                ],
            }
        key_x, key_y = keys[:2]
        value_map = {
            (row["parameters"].get(key_x), row["parameters"].get(key_y)): row["metrics"].get(optimization_metric)
            for row in leaderboard
        }
        cells = []
        for y in parameter_grid.get(key_y, []):
            for x in parameter_grid.get(key_x, []):
                cells.append({"x": x, "y": y, "value": value_map.get((x, y))})
        return {
            "type": "matrix",
            "metric": optimization_metric,
            "x_key": key_x,
            "y_key": key_y,
            "x_values": parameter_grid.get(key_x, []),
            "y_values": parameter_grid.get(key_y, []),
            "cells": cells,
        }

    def _build_parameter_stability(
        self,
        best_parameters: Dict[str, Any],
        leaderboard: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        top_slice = leaderboard[: min(len(leaderboard), 10)]
        if not top_slice:
            return {"score": 0.0, "notes": []}
        notes = []
        dispersion_scores = []
        for key, best_value in best_parameters.items():
            values = [_safe_float(item["parameters"].get(key), _safe_float(best_value)) for item in top_slice]
            if not values:
                continue
            spread = float(np.std(values))
            mean_value = abs(float(np.mean(values))) or 1.0
            relative_spread = min(spread / mean_value, 1.0)
            dispersion_scores.append(1.0 - relative_spread)
            notes.append(
                {
                    "parameter": key,
                    "best_value": best_value,
                    "top_band_spread": round(spread, 4),
                    "stability_score": round(1.0 - relative_spread, 4),
                }
            )
        score = float(np.mean(dispersion_scores)) if dispersion_scores else 0.0
        return {"score": round(score, 4), "notes": notes}

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

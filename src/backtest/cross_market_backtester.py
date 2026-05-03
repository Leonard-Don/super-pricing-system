"""Cross-market backtesting engine."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from src.backtest import _allocation, _diagnostics, _results
from src.backtest.base_backtester import BaseBacktester
from src.data.data_manager import DataManager
from src.trading.cross_market import (
    AssetUniverse,
    CrossMarketStrategy,
    SpreadZScoreStrategy,
    CointegrationReversionStrategy,
)


class CrossMarketBacktester(BaseBacktester):
    """Backtest long-short cross-market baskets on daily data."""

    STRATEGIES = {
        "spread_zscore": SpreadZScoreStrategy,
        "cointegration_reversion": CointegrationReversionStrategy,
    }

    def __init__(
        self,
        data_manager: Optional[DataManager] = None,
        initial_capital: float = 100000.0,
        commission: float = 0.001,
        slippage: float = 0.001,
    ):
        super().__init__(
            initial_capital=initial_capital,
            commission=commission,
            slippage=slippage,
        )
        self.data_manager = data_manager or DataManager()

    def run(
        self,
        assets: List[Dict[str, object]],
        strategy_name: str,
        template_context: Optional[Dict[str, Any]] = None,
        allocation_constraints: Optional[Dict[str, Any]] = None,
        parameters: Optional[Dict[str, Any]] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        construction_mode: str = "equal_weight",
        min_history_days: int = 60,
        min_overlap_ratio: float = 0.7,
    ) -> Dict[str, Any]:
        if strategy_name not in self.STRATEGIES:
            raise ValueError(f"Unsupported cross-market strategy: {strategy_name}")
        if construction_mode not in {"equal_weight", "ols_hedge"}:
            raise ValueError(f"Unsupported construction_mode: {construction_mode}")
        if min_history_days < 10:
            raise ValueError("min_history_days must be at least 10")
        if not 0 < float(min_overlap_ratio) <= 1:
            raise ValueError("min_overlap_ratio must be between 0 and 1")

        base_universe = AssetUniverse(assets)
        universe, constraint_overlay = self._apply_allocation_constraints(
            base_universe,
            allocation_constraints or {},
        )
        alignment = self._build_price_matrix(
            universe=universe,
            start_date=start_date,
            end_date=end_date,
            min_history_days=min_history_days,
            min_overlap_ratio=min_overlap_ratio,
        )
        price_matrix = alignment["aligned_price_matrix"]

        strategy: CrossMarketStrategy = self.STRATEGIES[strategy_name]()
        signal_frame = strategy.generate_cross_signals(
            price_matrix=price_matrix,
            asset_specs=universe.get_assets(),
            parameters={
                **(parameters or {}),
                "construction_mode": construction_mode,
            },
        )
        results = self._build_results(
            universe=universe,
            price_matrix=price_matrix,
            signal_frame=signal_frame,
            data_alignment=alignment,
            strategy_name=strategy_name,
            parameters=parameters or {},
            construction_mode=construction_mode,
            constraint_overlay=constraint_overlay,
        )
        results["strategy"] = strategy_name
        results["parameters"] = parameters or {}
        results["asset_specs"] = universe.as_dicts()
        results["asset_universe"] = universe.summary()
        results["constraint_overlay"] = constraint_overlay
        if template_context:
            results["template_context"] = template_context
            results["allocation_overlay"] = self._build_allocation_overlay(
                template_context=template_context,
                effective_assets=universe.as_dicts(),
            )
        results["price_matrix_summary"] = {
            "asset_count": len(price_matrix.columns),
            "row_count": len(price_matrix),
            "symbols": list(price_matrix.columns),
            "start_date": price_matrix.index[0].strftime("%Y-%m-%d"),
            "end_date": price_matrix.index[-1].strftime("%Y-%m-%d"),
        }
        return results

    @staticmethod
    def _rebalance_side_weights(
        weights: np.ndarray,
        *,
        min_weight: Optional[float],
        max_weight: Optional[float],
    ) -> np.ndarray:
        return _allocation.rebalance_side_weights(
            weights, min_weight=min_weight, max_weight=max_weight
        )

    def _apply_allocation_constraints(
        self,
        universe: AssetUniverse,
        allocation_constraints: Dict[str, Any],
    ) -> tuple[AssetUniverse, Dict[str, Any]]:
        return _allocation.apply_allocation_constraints(self, universe, allocation_constraints)

    @staticmethod
    def _build_allocation_overlay(
        *,
        template_context: Dict[str, Any],
        effective_assets: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        return _allocation.build_allocation_overlay(
            template_context=template_context,
            effective_assets=effective_assets,
        )

    def _build_price_matrix(
        self,
        universe: AssetUniverse,
        start_date: Optional[datetime],
        end_date: Optional[datetime],
        min_history_days: int,
        min_overlap_ratio: float,
    ) -> Dict[str, Any]:
        return _results.build_price_matrix(
            self,
            universe,
            start_date,
            end_date,
            min_history_days,
            min_overlap_ratio,
        )

    def _build_results(
        self,
        universe: AssetUniverse,
        price_matrix: pd.DataFrame,
        signal_frame: pd.DataFrame,
        data_alignment: Dict[str, Any],
        strategy_name: str,
        parameters: Dict[str, Any],
        construction_mode: str,
        constraint_overlay: Dict[str, Any],
    ) -> Dict[str, Any]:
        return _results.build_results(
            self,
            universe,
            price_matrix,
            signal_frame,
            data_alignment,
            strategy_name,
            parameters,
            construction_mode,
            constraint_overlay,
        )

    def _build_cointegration_diagnostics(
        self,
        *,
        price_matrix: pd.DataFrame,
        long_assets: List[Any],
        short_assets: List[Any],
    ) -> Dict[str, Any]:
        return _diagnostics.build_cointegration_diagnostics(
            self,
            price_matrix=price_matrix,
            long_assets=long_assets,
            short_assets=short_assets,
        )

    _estimate_cointegration = staticmethod(_diagnostics.estimate_cointegration)

    _extract_liquidity_stats = staticmethod(_diagnostics.extract_liquidity_stats)

    _build_calendar_diagnostics = staticmethod(_diagnostics.build_calendar_diagnostics)

    _build_beta_neutrality = staticmethod(_diagnostics.build_beta_neutrality)

    def _build_trades(self, signal_frame: pd.DataFrame, portfolio: pd.DataFrame) -> List[Dict[str, Any]]:
        return _results.build_trades(self, signal_frame, portfolio)

    _suggest_rebalance_cadence = staticmethod(_results.suggest_rebalance_cadence)

    _normalize_daily_close = staticmethod(_results.normalize_daily_close)

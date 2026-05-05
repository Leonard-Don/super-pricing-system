"""Single-asset execution engine extracted from ``backtester``.

Encapsulates pure trade-mechanics logic (signal interpretation, position
sizing application, cost modelling, portfolio path construction). The
:class:`Backtester` orchestrator in ``backtester.py`` composes this engine
with market-data prep, metric computation and reporting.

This module is internal — external callers should continue to import
:class:`Backtester` from ``src.backtest.backtester``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from .impact_model import estimate_market_impact_rate, normalize_market_impact_model
from .position_sizer import BasePositionSizer, SizingContext
from .risk_manager import RiskAction, RiskContext, RiskManager

logger = logging.getLogger(__name__)


@dataclass
class ExecutionConfig:
    """Configuration for the single-asset execution engine."""

    allow_fractional_shares: bool = False
    signal_mode: str = "auto"  # auto | event | target
    fixed_commission: float = 0.0
    min_commission: float = 0.0
    market_impact_bps: float = 0.0
    market_impact_model: str = "constant"
    impact_reference_notional: float = 100000.0
    impact_coefficient: float = 1.0
    permanent_impact_bps: float = 0.0


class SingleAssetExecutionEngine:
    """Execute single-asset strategy signals into a portfolio path.

    The engine supports two signal semantics:
    - ``event``: legacy buy/hold/sell events in ``{-1, 0, 1}``
    - ``target``: target long exposure in ``[0, 1]`` per bar
    """

    def __init__(
        self,
        *,
        initial_capital: float,
        commission: float,
        slippage: float,
        config: ExecutionConfig,
    ):
        self.initial_capital = float(initial_capital)
        self.commission = float(commission)
        self.slippage = float(slippage)
        self.config = config
        self.config.market_impact_model = normalize_market_impact_model(self.config.market_impact_model)

    def execute(
        self,
        *,
        data: pd.DataFrame,
        signals: pd.Series,
        sizer: BasePositionSizer,
        risk_mgr: Optional[RiskManager],
        stop_loss_pct: Optional[float],
        take_profit_pct: Optional[float],
        max_holding_days: Optional[int],
    ) -> Dict[str, Any]:
        signal_mode = self._resolve_signal_mode(signals)
        if signal_mode == "target":
            execution = self._execute_target_exposure(
                data=data,
                signals=signals,
                sizer=sizer,
                risk_mgr=risk_mgr,
                max_holding_days=max_holding_days,
            )
        else:
            execution = self._execute_event_signals(
                data=data,
                signals=signals,
                sizer=sizer,
                risk_mgr=risk_mgr,
                stop_loss_pct=stop_loss_pct,
                take_profit_pct=take_profit_pct,
                max_holding_days=max_holding_days,
            )
        execution["resolved_signal_mode"] = signal_mode
        return execution

    def _resolve_signal_mode(self, signals: pd.Series) -> str:
        if self.config.signal_mode in {"event", "target"}:
            return self.config.signal_mode

        clean = pd.Series(signals).dropna()
        if clean.empty:
            return "event"

        unique_values = set(np.round(clean.astype(float), 8).tolist())
        if unique_values.issubset({-1.0, 0.0, 1.0}):
            return "event"
        return "target"

    def _normalize_shares(self, shares: float) -> float:
        if shares <= 0:
            return 0.0
        if self.config.allow_fractional_shares:
            return float(shares)
        return float(int(shares))

    def _prepare_execution_context(self, data: pd.DataFrame) -> Dict[str, np.ndarray]:
        prices = pd.to_numeric(data["close"], errors="coerce").replace([np.inf, -np.inf], np.nan)
        returns = prices.pct_change().replace([np.inf, -np.inf], np.nan)
        fallback_volatility = float(returns.std()) if returns.dropna().size else 0.02
        fallback_volatility = max(fallback_volatility, 0.005)
        rolling_volatility = (
            returns.rolling(20, min_periods=2).std().fillna(fallback_volatility).to_numpy(dtype=float)
        )

        if "volume" in data.columns:
            volumes = pd.to_numeric(data["volume"], errors="coerce").clip(lower=0)
            dollar_volume = (prices * volumes).replace([np.inf, -np.inf], np.nan)
            fallback_notional = (
                float(dollar_volume.dropna().median())
                if dollar_volume.dropna().size
                else float(self.config.impact_reference_notional or 100000.0)
            )
            fallback_notional = max(fallback_notional, float(self.config.impact_reference_notional or 100000.0), 1.0)
            avg_daily_notional = (
                dollar_volume.rolling(20, min_periods=1).mean().fillna(fallback_notional).to_numpy(dtype=float)
            )
        else:
            fallback_notional = max(float(self.config.impact_reference_notional or 100000.0), 1.0)
            avg_daily_notional = np.full(len(data), fallback_notional, dtype=float)

        return {
            "avg_daily_notional": avg_daily_notional,
            "volatility": rolling_volatility,
        }

    def _execution_cost_profile(
        self,
        *,
        price: float,
        shares: float,
        bar_index: int,
        market_context: Dict[str, np.ndarray],
    ) -> Dict[str, float | str]:
        trade_notional = abs(float(price or 0.0) * float(shares or 0.0))
        impact = estimate_market_impact_rate(
            trade_notional,
            market_impact_bps=self.config.market_impact_bps,
            model=self.config.market_impact_model,
            avg_daily_notional=float(market_context["avg_daily_notional"][bar_index]),
            volatility=float(market_context["volatility"][bar_index]),
            impact_coefficient=self.config.impact_coefficient,
            permanent_impact_bps=self.config.permanent_impact_bps,
            reference_notional=self.config.impact_reference_notional,
        )
        total_slippage_rate = float(self.slippage) + float(impact["impact_rate"])
        return {
            **impact,
            "trade_notional": trade_notional,
            "total_slippage_rate": total_slippage_rate,
            "estimated_market_impact_cost": trade_notional * float(impact["impact_rate"]),
            "estimated_total_slippage_cost": trade_notional * total_slippage_rate,
        }

    def _commission_cost(self, notional: float) -> float:
        if notional <= 0:
            return 0.0
        commission_cost = (notional * self.commission) + float(self.config.fixed_commission or 0.0)
        return float(max(commission_cost, float(self.config.min_commission or 0.0)))

    def _build_portfolio(
        self,
        *,
        data: pd.DataFrame,
        signal_array: np.ndarray,
        price_array: np.ndarray,
        position_array: np.ndarray,
        cash_array: np.ndarray,
        holdings_array: np.ndarray,
        total_array: np.ndarray,
    ) -> pd.DataFrame:
        portfolio = pd.DataFrame(
            {
                "price": price_array,
                "signal": signal_array,
                "position": position_array,
                "cash": cash_array,
                "holdings": holdings_array,
                "total": total_array,
            },
            index=data.index,
        )
        portfolio["returns"] = portfolio["total"].pct_change()
        return portfolio

    def _execute_event_signals(
        self,
        *,
        data: pd.DataFrame,
        signals: pd.Series,
        sizer: BasePositionSizer,
        risk_mgr: Optional[RiskManager],
        stop_loss_pct: Optional[float],
        take_profit_pct: Optional[float],
        max_holding_days: Optional[int],
    ) -> Dict[str, Any]:
        price_array = data["close"].astype(float).to_numpy()
        signal_array = signals.astype(int).to_numpy()
        bar_count = len(price_array)
        position_array = np.zeros(bar_count, dtype=float)
        cash_array = np.zeros(bar_count, dtype=float)
        holdings_array = np.zeros(bar_count, dtype=float)
        total_array = np.zeros(bar_count, dtype=float)

        trades: List[Dict[str, Any]] = []
        trade_pnls: List[float] = []
        current_position = 0.0
        current_cash = self.initial_capital
        avg_cost_basis = 0.0
        current_entry_date = None
        peak_equity = self.initial_capital
        prev_total = self.initial_capital
        market_context = self._prepare_execution_context(data)

        for i, (price, signal) in enumerate(zip(price_array, signal_array)):
            current_equity = current_cash + current_position * price
            daily_ret = (
                (current_equity - prev_total) / prev_total if prev_total > 0 else 0.0
            )
            peak_equity = max(peak_equity, current_equity)

            if risk_mgr is not None:
                risk_ctx = RiskContext(
                    bar_index=i,
                    current_price=price,
                    current_date=data.index[i],
                    position_size=float(current_position),
                    entry_price=avg_cost_basis,
                    entry_date=current_entry_date,
                    current_equity=current_equity,
                    peak_equity=peak_equity,
                    initial_capital=self.initial_capital,
                    daily_return=daily_ret,
                    recent_trade_pnls=trade_pnls.copy(),
                )
                decision = risk_mgr.evaluate(risk_ctx)
                if decision.action == RiskAction.FORCE_EXIT and current_position > 0:
                    signal = -1
                elif decision.action == RiskAction.BLOCK_ENTRY and signal == 1:
                    signal = 0
            else:
                if current_position > 0 and avg_cost_basis > 0:
                    unrealized_return = (price - avg_cost_basis) / avg_cost_basis
                    if stop_loss_pct is not None and unrealized_return <= -stop_loss_pct:
                        signal = -1
                    elif (
                        current_entry_date is not None
                        and max_holding_days is not None
                        and (data.index[i] - current_entry_date).days >= max_holding_days
                    ):
                        signal = -1
                    elif (
                        take_profit_pct is not None
                        and unrealized_return >= take_profit_pct
                    ):
                        signal = -1

            if signal == 1 and current_position == 0:
                sizing_ctx = SizingContext(
                    current_equity=current_equity,
                    current_price=price,
                    signal_strength=1.0,
                    commission=self.commission,
                    slippage=self.slippage,
                    risk_scale_factor=(
                        risk_mgr.get_position_scale() if risk_mgr else 1.0
                    ),
                    allow_fractional=self.config.allow_fractional_shares,
                )
                sizing_result = sizer.calculate(sizing_ctx)
                shares = self._normalize_shares(sizing_result.shares)

                if shares > 0:
                    execution_cost = self._execution_cost_profile(
                        price=price,
                        shares=shares,
                        bar_index=i,
                        market_context=market_context,
                    )
                    gross_cost = shares * price * (1 + float(execution_cost["total_slippage_rate"]))
                    commission_cost = self._commission_cost(gross_cost)
                    total_cost = gross_cost + commission_cost
                    if total_cost <= current_cash:
                        current_cash -= total_cost
                        current_position = shares
                        current_entry_date = data.index[i]
                        avg_cost_basis = total_cost / shares if shares else 0.0
                        trades.append(
                            {
                                "date": data.index[i],
                                "type": "BUY",
                                "price": price,
                                "shares": shares,
                                "cost": total_cost,
                                "pnl": 0.0,
                                "market_impact_rate": execution_cost["impact_rate"],
                                "execution_slippage_rate": execution_cost["total_slippage_rate"],
                                "estimated_market_impact_cost": execution_cost["estimated_market_impact_cost"],
                                "estimated_total_slippage_cost": execution_cost["estimated_total_slippage_cost"],
                                "impact_model": execution_cost["model"],
                                "participation_rate": execution_cost["participation_rate"],
                                "impact_liquidity_proxy": execution_cost["liquidity_proxy"],
                                "impact_volatility_estimate": execution_cost["volatility_estimate"],
                            }
                        )
            elif signal == -1 and current_position > 0:
                execution_cost = self._execution_cost_profile(
                    price=price,
                    shares=current_position,
                    bar_index=i,
                    market_context=market_context,
                )
                gross_revenue = current_position * price * (1 - float(execution_cost["total_slippage_rate"]))
                commission_cost = self._commission_cost(gross_revenue)
                total_revenue = gross_revenue - commission_cost
                total_cost_basis = current_position * avg_cost_basis
                pnl = total_revenue - total_cost_basis
                current_cash += total_revenue
                trade_pnls.append(pnl)
                trades.append(
                    {
                        "date": data.index[i],
                        "type": "SELL",
                        "price": price,
                        "shares": current_position,
                        "revenue": total_revenue,
                        "pnl": pnl,
                        "market_impact_rate": execution_cost["impact_rate"],
                        "execution_slippage_rate": execution_cost["total_slippage_rate"],
                        "estimated_market_impact_cost": execution_cost["estimated_market_impact_cost"],
                        "estimated_total_slippage_cost": execution_cost["estimated_total_slippage_cost"],
                        "impact_model": execution_cost["model"],
                        "participation_rate": execution_cost["participation_rate"],
                        "impact_liquidity_proxy": execution_cost["liquidity_proxy"],
                        "impact_volatility_estimate": execution_cost["volatility_estimate"],
                    }
                )
                current_position = 0.0
                avg_cost_basis = 0.0
                current_entry_date = None

            position_array[i] = float(current_position)
            cash_array[i] = float(current_cash)
            holdings_array[i] = float(current_position * price)
            total_array[i] = float(current_cash + current_position * price)
            prev_total = total_array[i]

        return {
            "portfolio": self._build_portfolio(
                data=data,
                signal_array=signal_array,
                price_array=price_array,
                position_array=position_array,
                cash_array=cash_array,
                holdings_array=holdings_array,
                total_array=total_array,
            ),
            "trades": trades,
        }

    def _execute_target_exposure(
        self,
        *,
        data: pd.DataFrame,
        signals: pd.Series,
        sizer: BasePositionSizer,
        risk_mgr: Optional[RiskManager],
        max_holding_days: Optional[int],
    ) -> Dict[str, Any]:
        price_array = data["close"].astype(float).to_numpy()
        signal_array = signals.astype(float).to_numpy()
        bar_count = len(price_array)
        position_array = np.zeros(bar_count, dtype=float)
        cash_array = np.zeros(bar_count, dtype=float)
        holdings_array = np.zeros(bar_count, dtype=float)
        total_array = np.zeros(bar_count, dtype=float)

        trades: List[Dict[str, Any]] = []
        trade_pnls: List[float] = []
        current_position = 0.0
        current_cash = self.initial_capital
        avg_cost_basis = 0.0
        current_entry_date = None
        peak_equity = self.initial_capital
        prev_total = self.initial_capital
        market_context = self._prepare_execution_context(data)

        for i, (price, raw_signal) in enumerate(zip(price_array, signal_array)):
            current_equity = current_cash + current_position * price
            daily_ret = (
                (current_equity - prev_total) / prev_total if prev_total > 0 else 0.0
            )
            peak_equity = max(peak_equity, current_equity)

            target_exposure = float(np.clip(raw_signal, 0.0, 1.0))
            current_exposure = (
                (current_position * price) / current_equity
                if current_equity > 0 and price > 0
                else 0.0
            )

            if risk_mgr is not None:
                risk_ctx = RiskContext(
                    bar_index=i,
                    current_price=price,
                    current_date=data.index[i],
                    position_size=float(current_position),
                    entry_price=avg_cost_basis,
                    entry_date=current_entry_date,
                    current_equity=current_equity,
                    peak_equity=peak_equity,
                    initial_capital=self.initial_capital,
                    daily_return=daily_ret,
                    recent_trade_pnls=trade_pnls.copy(),
                )
                decision = risk_mgr.evaluate(risk_ctx)
                if decision.action == RiskAction.FORCE_EXIT:
                    target_exposure = 0.0
                elif decision.action == RiskAction.BLOCK_ENTRY:
                    target_exposure = min(target_exposure, current_exposure)

            if (
                max_holding_days is not None
                and current_position > 0
                and current_entry_date is not None
                and (data.index[i] - current_entry_date).days >= max_holding_days
            ):
                target_exposure = 0.0

            sizing_ctx = SizingContext(
                current_equity=current_equity,
                current_price=price,
                signal_strength=target_exposure,
                commission=self.commission,
                slippage=self.slippage,
                risk_scale_factor=(risk_mgr.get_position_scale() if risk_mgr else 1.0),
                allow_fractional=self.config.allow_fractional_shares,
            )
            desired_position = self._normalize_shares(sizer.calculate(sizing_ctx).shares)
            position_delta = desired_position - current_position

            if position_delta > 0:
                shares_to_buy = position_delta
                execution_cost = self._execution_cost_profile(
                    price=price,
                    shares=shares_to_buy,
                    bar_index=i,
                    market_context=market_context,
                )
                gross_cost = shares_to_buy * price * (1 + float(execution_cost["total_slippage_rate"]))
                commission_cost = self._commission_cost(gross_cost)
                total_cost = gross_cost + commission_cost
                if total_cost <= current_cash and shares_to_buy > 0:
                    previous_position = current_position
                    current_cash -= total_cost
                    current_position += shares_to_buy
                    if previous_position <= 0:
                        current_entry_date = data.index[i]
                    previous_cost_basis = previous_position * avg_cost_basis
                    avg_cost_basis = (
                        (previous_cost_basis + total_cost) / current_position
                        if current_position > 0
                        else 0.0
                    )
                    trades.append(
                        {
                            "date": data.index[i],
                            "type": "BUY",
                            "price": price,
                            "shares": shares_to_buy,
                            "cost": total_cost,
                            "pnl": 0.0,
                            "market_impact_rate": execution_cost["impact_rate"],
                            "execution_slippage_rate": execution_cost["total_slippage_rate"],
                            "estimated_market_impact_cost": execution_cost["estimated_market_impact_cost"],
                            "estimated_total_slippage_cost": execution_cost["estimated_total_slippage_cost"],
                            "impact_model": execution_cost["model"],
                            "participation_rate": execution_cost["participation_rate"],
                            "impact_liquidity_proxy": execution_cost["liquidity_proxy"],
                            "impact_volatility_estimate": execution_cost["volatility_estimate"],
                        }
                    )
            elif position_delta < 0 and current_position > 0:
                shares_to_sell = min(abs(position_delta), current_position)
                execution_cost = self._execution_cost_profile(
                    price=price,
                    shares=shares_to_sell,
                    bar_index=i,
                    market_context=market_context,
                )
                gross_revenue = shares_to_sell * price * (1 - float(execution_cost["total_slippage_rate"]))
                commission_cost = self._commission_cost(gross_revenue)
                total_revenue = gross_revenue - commission_cost
                pnl = total_revenue - (shares_to_sell * avg_cost_basis)
                current_cash += total_revenue
                current_position -= shares_to_sell
                trade_pnls.append(pnl)
                trades.append(
                    {
                        "date": data.index[i],
                        "type": "SELL",
                            "price": price,
                            "shares": shares_to_sell,
                            "revenue": total_revenue,
                            "pnl": pnl,
                            "market_impact_rate": execution_cost["impact_rate"],
                            "execution_slippage_rate": execution_cost["total_slippage_rate"],
                            "estimated_market_impact_cost": execution_cost["estimated_market_impact_cost"],
                            "estimated_total_slippage_cost": execution_cost["estimated_total_slippage_cost"],
                            "impact_model": execution_cost["model"],
                            "participation_rate": execution_cost["participation_rate"],
                            "impact_liquidity_proxy": execution_cost["liquidity_proxy"],
                            "impact_volatility_estimate": execution_cost["volatility_estimate"],
                        }
                    )
                if current_position <= 0:
                    current_position = 0.0
                    avg_cost_basis = 0.0
                    current_entry_date = None

            position_array[i] = float(current_position)
            cash_array[i] = float(current_cash)
            holdings_array[i] = float(current_position * price)
            total_array[i] = float(current_cash + current_position * price)
            prev_total = total_array[i]

        return {
            "portfolio": self._build_portfolio(
                data=data,
                signal_array=signal_array,
                price_array=price_array,
                position_array=position_array,
                cash_array=cash_array,
                holdings_array=holdings_array,
                total_array=total_array,
            ),
            "trades": trades,
        }

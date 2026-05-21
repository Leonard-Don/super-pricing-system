"""
Backtest engine for testing trading strategies.

This module hosts the high-level :class:`Backtester` orchestrator. The
single-asset execution engine that turns signals into a portfolio path lives
in ``_execution_engine`` to keep this file focused on data preparation,
metric computation and reporting.
"""

import logging
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from ._execution_engine import ExecutionConfig, SingleAssetExecutionEngine
from .base_backtester import BaseBacktester
from .impact_model import (
    normalize_market_impact_model,
    summarize_execution_costs,
)
from .market_rules import a_share_price_limit_pct, is_a_share
from .metrics import (
    calculate_annualized_return,
    calculate_calmar_ratio,
    calculate_cvar,
    calculate_expectancy,
    calculate_max_drawdown,
    calculate_max_drawdown_duration,
    calculate_omega_ratio,
    calculate_recovery_factor,
    calculate_sharpe_ratio,
    calculate_sortino_ratio,
    calculate_var,
    calculate_volatility,
)
from .position_sizer import BasePositionSizer, FixedFractionSizer
from .risk_manager import RiskManager
from .signal_adapter import SignalAdapter

logger = logging.getLogger(__name__)


# Backwards-compatible re-exports for any callers that imported these from
# ``src.backtest.backtester`` directly.
__all__ = [
    "Backtester",
    "ExecutionConfig",
    "SingleAssetExecutionEngine",
]


class Backtester(BaseBacktester):
    """Single-asset event-driven backtesting engine.

    Supports optional *RiskManager* and *PositionSizer* components.  When
    not provided, the engine falls back to the legacy behaviour (fixed
    fraction sizing, simple stop-loss/take-profit).
    """

    def __init__(
        self,
        initial_capital: float = 100000,
        commission: float = 0.001,
        slippage: float = 0.001,
        stop_loss_pct: Optional[float] = None,
        take_profit_pct: Optional[float] = None,
        risk_manager: Optional[RiskManager] = None,
        position_sizer: Optional[BasePositionSizer] = None,
        allow_fractional_shares: bool = False,
        signal_mode: str = "auto",
        fixed_commission: float = 0.0,
        min_commission: float = 0.0,
        market_impact_bps: float = 0.0,
        market_impact_model: str = "constant",
        impact_reference_notional: float = 100000.0,
        impact_coefficient: float = 1.0,
        permanent_impact_bps: float = 0.0,
        max_holding_days: Optional[int] = None,
        symbol: Optional[str] = None,
    ):
        """
        Initialize backtester

        Args:
            initial_capital: Starting capital
            commission: Commission rate (e.g., 0.001 = 0.1%)
            slippage: Slippage rate
            stop_loss_pct: Stop-loss percentage (legacy shortcut; ignored
                           when a *risk_manager* is supplied).
            take_profit_pct: Take-profit percentage (legacy shortcut).
            risk_manager: Optional :class:`RiskManager` for advanced risk
                          control.  When provided, ``stop_loss_pct`` and
                          ``take_profit_pct`` are ignored.
            position_sizer: Optional :class:`BasePositionSizer`.  When
                            ``None``, a :class:`FixedFractionSizer` using
                            the ``position_size`` argument of :meth:`run`
                            is created on each call.
        """
        super().__init__(
            initial_capital=initial_capital,
            commission=commission,
            slippage=slippage,
        )
        self.stop_loss_pct = stop_loss_pct
        self.take_profit_pct = take_profit_pct
        self.risk_manager = risk_manager
        self.position_sizer = position_sizer
        self.max_holding_days = max_holding_days
        self.execution_config = ExecutionConfig(
            allow_fractional_shares=allow_fractional_shares,
            signal_mode=signal_mode,
            fixed_commission=fixed_commission,
            min_commission=min_commission,
            market_impact_bps=market_impact_bps,
            market_impact_model=normalize_market_impact_model(market_impact_model),
            impact_reference_notional=impact_reference_notional,
            impact_coefficient=impact_coefficient,
            permanent_impact_bps=permanent_impact_bps,
            enforce_t_plus_1=is_a_share(symbol or ""),
            price_limit_pct=a_share_price_limit_pct(symbol or ""),
        )

    def run(
        self, strategy: Any, data: pd.DataFrame, position_size: float = 1.0
    ) -> Dict[str, Any]:
        """
        Run backtest

        Args:
            strategy: Strategy object with generate_signals method
            data: DataFrame with OHLCV data
            position_size: Position size as fraction of capital (1.0 = 100%)

        Returns:
            Dictionary with backtest results
        """
        if data.empty:
            logger.error("No data provided for backtest")
            return {}

        data = self._prepare_market_data(data)
        if data.empty:
            logger.error("No valid price data remaining after cleaning")
            return {}

        # Generate and normalize signals
        signals = SignalAdapter.normalize_single_asset(
            strategy.generate_signals(data),
            index=data.index,
            signal_mode=self.execution_config.signal_mode,
        )

        # Prepare sizer (use run-time position_size when no explicit sizer)
        sizer = self.position_sizer or FixedFractionSizer(fraction=position_size)

        # Prepare risk manager
        risk_mgr = self.risk_manager
        if risk_mgr is not None:
            risk_mgr.reset()

        execution = self._execute_signals(
            data=data,
            signals=signals.values,
            sizer=sizer,
            risk_mgr=risk_mgr,
        )

        portfolio = execution["portfolio"]
        trades = execution["trades"]

        # Calculate metrics
        results = self._calculate_metrics(portfolio, trades)
        results["portfolio"] = portfolio
        results["trades"] = trades
        results["execution_costs"] = summarize_execution_costs(trades)
        results["execution_diagnostics"] = {
            "configured_signal_mode": self.execution_config.signal_mode,
            "resolved_signal_mode": execution.get("resolved_signal_mode", self.execution_config.signal_mode),
            "allow_fractional_shares": self.execution_config.allow_fractional_shares,
            "risk_manager": type(risk_mgr).__name__ if risk_mgr is not None else None,
            "position_sizer": type(sizer).__name__ if sizer is not None else None,
            "stop_loss_pct": self.stop_loss_pct,
            "take_profit_pct": self.take_profit_pct,
            "max_holding_days": self.max_holding_days,
            "fixed_commission": self.execution_config.fixed_commission,
            "min_commission": self.execution_config.min_commission,
            "market_impact_bps": self.execution_config.market_impact_bps,
            "market_impact_model": self.execution_config.market_impact_model,
            "impact_reference_notional": self.execution_config.impact_reference_notional,
            "impact_coefficient": self.execution_config.impact_coefficient,
            "permanent_impact_bps": self.execution_config.permanent_impact_bps,
        }

        self.results = results
        return results

    def _execute_signals(
        self,
        *,
        data: pd.DataFrame,
        signals: pd.Series,
        sizer: BasePositionSizer,
        risk_mgr: Optional[RiskManager],
    ) -> Dict[str, Any]:
        """Run the execution loop against a precomputed signal series."""
        engine = SingleAssetExecutionEngine(
            initial_capital=self.initial_capital,
            commission=self.commission,
            slippage=self.slippage,
            config=self.execution_config,
        )
        return engine.execute(
            data=data,
            signals=signals,
            sizer=sizer,
            risk_mgr=risk_mgr,
            stop_loss_pct=self.stop_loss_pct,
            take_profit_pct=self.take_profit_pct,
            max_holding_days=self.max_holding_days,
        )

    def _prepare_market_data(self, data: pd.DataFrame) -> pd.DataFrame:
        """Drop incomplete bars so NaN market data cannot zero out the portfolio."""
        cleaned = data.copy()

        if "close" not in cleaned.columns:
            logger.error("Backtest data is missing required 'close' column")
            return pd.DataFrame()

        numeric_cols = [col for col in ["open", "high", "low", "close", "volume"] if col in cleaned.columns]
        for col in numeric_cols:
            cleaned[col] = pd.to_numeric(cleaned[col], errors="coerce")

        before = len(cleaned)
        cleaned = cleaned[np.isfinite(cleaned["close"])]
        cleaned = cleaned[cleaned["close"] > 0]
        dropped = before - len(cleaned)

        if dropped > 0:
            logger.info("Dropped %s incomplete market bars before backtest execution", dropped)

        return cleaned

    def _calculate_metrics(
        self, portfolio: pd.DataFrame, trades: list
    ) -> Dict[str, Any]:
        """Calculate performance metrics"""
        total_return = (
            portfolio["total"].iloc[-1] - self.initial_capital
        ) / self.initial_capital

        # Calculate annualized return
        days = len(portfolio)
        annualized_return = calculate_annualized_return(total_return, days)

        # Get daily returns series
        returns = portfolio["returns"].dropna()

        # Calculate Sharpe ratio
        sharpe_ratio = calculate_sharpe_ratio(returns)

        # Calculate max drawdown
        portfolio_values = portfolio["total"].values
        max_drawdown = calculate_max_drawdown(portfolio_values)

        # Trade statistics
        num_trades = len(trades)
        buy_trades = [t for t in trades if t["type"] == "BUY"]
        sell_trades = [t for t in trades if t["type"] == "SELL"]

        completed_trade_pnls, completed_trade_returns, has_open_position = (
            self._extract_completed_trade_statistics(trades, portfolio)
        )

        winning_trades = [pnl for pnl in completed_trade_pnls if pnl > 0]
        losing_trades = [pnl for pnl in completed_trade_pnls if pnl < 0]

        # Calculate win rate based on completed trades only
        total_completed_trades = len(completed_trade_pnls)
        win_rate = (
            len(winning_trades) / total_completed_trades if total_completed_trades > 0 else 0
        )

        # Calculate profit factor (gross profit / gross loss)
        gross_profit = sum(winning_trades) if winning_trades else 0
        gross_loss = abs(sum(losing_trades)) if losing_trades else 0
        profit_factor = (
            gross_profit / gross_loss
            if gross_loss > 0
            else (float("inf") if gross_profit > 0 else 0)
        )

        # Calculate best and worst trades
        best_trade = (
            max(completed_trade_pnls) if completed_trade_pnls else 0
        )
        worst_trade = (
            min(completed_trade_pnls) if completed_trade_pnls else 0
        )

        # Calculate net profit
        net_profit = portfolio["total"].iloc[-1] - self.initial_capital

        # Calculate consecutive wins/losses
        consecutive_wins = 0
        consecutive_losses = 0
        max_consecutive_wins = 0
        max_consecutive_losses = 0

        for trade_pnl in completed_trade_pnls:
            if trade_pnl > 0:
                consecutive_wins += 1
                consecutive_losses = 0
                max_consecutive_wins = max(max_consecutive_wins, consecutive_wins)
            elif trade_pnl < 0:
                consecutive_losses += 1
                consecutive_wins = 0
                max_consecutive_losses = max(max_consecutive_losses, consecutive_losses)
            else:
                consecutive_wins = 0
                consecutive_losses = 0

        # Calculate average trade
        avg_trade = (
            sum(completed_trade_pnls) / len(completed_trade_pnls)
            if completed_trade_pnls
            else 0
        )
        expectancy = calculate_expectancy(completed_trade_pnls)

        # Calculate Sortino ratio (downside deviation)
        sortino_ratio = calculate_sortino_ratio(returns)

        # Calculate Calmar ratio (annual return / max drawdown)
        calmar_ratio = calculate_calmar_ratio(annualized_return, max_drawdown)

        # Calculate annualized volatility
        volatility = calculate_volatility(returns)
        
        # Calculate Value at Risk (95% confidence)
        var_95 = calculate_var(returns)

        # Calculate CVaR / Expected Shortfall (95% confidence)
        cvar_95 = calculate_cvar(returns)

        # Calculate Omega Ratio
        omega_ratio = calculate_omega_ratio(returns)

        # Calculate max drawdown duration
        max_dd_duration, max_underwater = calculate_max_drawdown_duration(
            portfolio_values
        )
        recovery_factor = calculate_recovery_factor(net_profit, max_drawdown)
        execution_costs = summarize_execution_costs(trades)

        metrics = {
            "initial_capital": self.initial_capital,
            "final_value": portfolio["total"].iloc[-1],
            "total_return": total_return,
            "annualized_return": annualized_return,
            "volatility": volatility,
            "sharpe_ratio": sharpe_ratio,
            "sortino_ratio": sortino_ratio,
            "calmar_ratio": calmar_ratio,
            "max_drawdown": max_drawdown,
            "max_drawdown_duration": max_dd_duration,
            "max_underwater_period": max_underwater,
            "var_95": var_95,
            "cvar_95": cvar_95,
            "omega_ratio": omega_ratio,
            "num_trades": num_trades,
            "num_buy_trades": len(buy_trades),
            "num_sell_trades": len(sell_trades),
            "win_rate": win_rate,
            "profit_factor": profit_factor,
            "best_trade": best_trade,
            "worst_trade": worst_trade,
            "net_profit": net_profit,
            "gross_profit": gross_profit,
            "gross_loss": gross_loss,
            "avg_trade": avg_trade,
            "expectancy": expectancy,
            "recovery_factor": recovery_factor,
            "max_consecutive_wins": max_consecutive_wins,
            "max_consecutive_losses": max_consecutive_losses,
            "total_completed_trades": total_completed_trades,
            "has_open_position": has_open_position,  # 标记是否有未平仓头寸
            "execution_costs": execution_costs,
        }

        return metrics

    def _extract_completed_trade_statistics(
        self, trades: List[Dict[str, Any]], portfolio: pd.DataFrame
    ) -> tuple[List[float], List[float], bool]:
        """Match BUY and SELL lots so partial rebalances produce correct trade stats."""
        open_lots: List[Dict[str, float]] = []
        completed_trade_pnls: List[float] = []
        completed_trade_returns: List[float] = []

        for trade in trades:
            trade_type = str(trade.get("type", "")).upper()
            shares = float(trade.get("shares", 0) or 0)
            if shares <= 0:
                continue

            if trade_type == "BUY":
                entry_value = float(
                    trade.get("cost")
                    or (float(trade.get("price", 0) or 0) * shares)
                )
                open_lots.append(
                    {
                        "shares": shares,
                        "cost_per_share": entry_value / shares if shares else 0.0,
                    }
                )
                continue

            if trade_type != "SELL":
                logger.warning("发现未知交易类型: %s", trade)
                continue

            revenue_value = float(
                trade.get("revenue")
                or (float(trade.get("price", 0) or 0) * shares)
            )
            exit_price_per_share = revenue_value / shares if shares else 0.0
            remaining = shares

            while remaining > 1e-12 and open_lots:
                lot = open_lots[0]
                matched = min(remaining, lot["shares"])
                entry_value = matched * lot["cost_per_share"]
                exit_value = matched * exit_price_per_share
                pnl = exit_value - entry_value
                completed_trade_pnls.append(float(pnl))
                completed_trade_returns.append(
                    float(pnl / entry_value) if entry_value else 0.0
                )

                lot["shares"] -= matched
                remaining -= matched
                if lot["shares"] <= 1e-12:
                    open_lots.pop(0)

        has_open_position = any(lot["shares"] > 1e-12 for lot in open_lots)
        if has_open_position and not portfolio.empty:
            current_price = float(portfolio["price"].iloc[-1])
            unrealized_pnl = sum(
                lot["shares"] * (current_price - lot["cost_per_share"])
                for lot in open_lots
            )
            logger.debug(
                "检测到未平仓头寸: 当前价格=%.2f, 未实现盈亏=%.2f",
                current_price,
                unrealized_pnl,
            )
        return completed_trade_pnls, completed_trade_returns, has_open_position

    def plot_results(self, show: bool = True):
        """Plot backtest results"""
        if not self.results or "portfolio" not in self.results:
            logger.error("No results to plot")
            return

        import matplotlib.pyplot as plt

        portfolio = self.results["portfolio"]

        fig, axes = plt.subplots(3, 1, figsize=(12, 10))

        # Plot portfolio value
        axes[0].plot(portfolio.index, portfolio["total"], label="Portfolio Value")
        axes[0].axhline(
            y=self.initial_capital, color="r", linestyle="--", label="Initial Capital"
        )
        axes[0].set_ylabel("Portfolio Value ($)")
        axes[0].set_title("Portfolio Performance")
        axes[0].legend()
        axes[0].grid(True)

        # Plot price and signals
        axes[1].plot(portfolio.index, portfolio["price"], label="Price", alpha=0.7)

        # Mark buy signals
        buy_signals = portfolio[portfolio["signal"] == 1]
        if not buy_signals.empty:
            axes[1].scatter(
                buy_signals.index,
                buy_signals["price"],
                color="green",
                marker="^",
                s=100,
                label="Buy",
            )

        # Mark sell signals
        sell_signals = portfolio[portfolio["signal"] == -1]
        if not sell_signals.empty:
            axes[1].scatter(
                sell_signals.index,
                sell_signals["price"],
                color="red",
                marker="v",
                s=100,
                label="Sell",
            )

        axes[1].set_ylabel("Price ($)")
        axes[1].set_title("Price and Trading Signals")
        axes[1].legend()
        axes[1].grid(True)

        # Plot returns
        axes[2].plot(
            portfolio.index, portfolio["returns"].cumsum(), label="Cumulative Returns"
        )
        axes[2].set_ylabel("Cumulative Returns")
        axes[2].set_xlabel("Date")
        axes[2].set_title("Cumulative Returns")
        axes[2].legend()
        axes[2].grid(True)

        plt.tight_layout()

        if show:
            plt.show()

        return fig

    def print_summary(self):
        """Print summary of backtest results"""
        if not self.results:
            logger.error("No results to display")
            return

        metrics = self.results

        print("\n" + "=" * 60)
        print("BACKTEST RESULTS")
        print("=" * 60)
        print(f"Initial Capital:       ${metrics['initial_capital']:,.2f}")
        print(f"Final Value:           ${metrics['final_value']:,.2f}")
        print(f"Net Profit:            ${metrics['net_profit']:,.2f}")
        print(f"Total Return:          {metrics['total_return']:.2%}")
        print(f"Annualized Return:     {metrics['annualized_return']:.2%}")
        print("-" * 60)
        print("RISK METRICS")
        print("-" * 60)
        print(f"Sharpe Ratio:          {metrics['sharpe_ratio']:.2f}")
        print(f"Sortino Ratio:         {metrics['sortino_ratio']:.2f}")
        print(f"Calmar Ratio:          {metrics['calmar_ratio']:.2f}")
        print(f"Max Drawdown:          {metrics['max_drawdown']:.2%}")
        print(f"Max DD Duration:       {metrics.get('max_drawdown_duration', 0)} bars")
        print(f"Max Underwater:        {metrics.get('max_underwater_period', 0)} bars")
        print(f"Value at Risk (95%):   {metrics['var_95']:.2%}")
        print(f"CVaR / ES (95%):       {metrics.get('cvar_95', 0):.2%}")
        print(f"Omega Ratio:           {metrics.get('omega_ratio', 0):.2f}")
        print("-" * 60)
        print("TRADE STATISTICS")
        print("-" * 60)
        print(f"Total Trades:          {metrics['num_trades']}")
        print(f"Completed Trades:      {metrics['total_completed_trades']}")
        print(f"Win Rate:              {metrics['win_rate']:.2%}")
        print(f"Profit Factor:         {metrics['profit_factor']:.2f}")
        print(f"Average Trade:         ${metrics['avg_trade']:,.2f}")
        print(f"Best Trade:            ${metrics['best_trade']:,.2f}")
        print(f"Worst Trade:           ${metrics['worst_trade']:,.2f}")
        print(f"Max Consecutive Wins:  {metrics['max_consecutive_wins']}")
        print(f"Max Consecutive Losses: {metrics['max_consecutive_losses']}")
        print(f"Gross Profit:          ${metrics['gross_profit']:,.2f}")
        print(f"Gross Loss:            ${metrics['gross_loss']:,.2f}")
        print("=" * 60)

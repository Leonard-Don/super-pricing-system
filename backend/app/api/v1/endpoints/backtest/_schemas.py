"""backtest 包内本地 Pydantic schema。

主 schema 仍在 ``backend.app.schemas.backtest``——这里只放仅由 backtest 路由消费的派生模型。

注意：这个文件不要使用 ``from __future__ import annotations``。Pydantic v2 解析继承
``BacktestRequest`` 等基类时需要把 forward-ref 字符串还原为实际类型，依赖类在模块命名
空间里立即可见。
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from backend.app.schemas.backtest import BacktestRequest


class CompareStrategyConfig(BaseModel):
    name: str
    parameters: Dict[str, Any] = {}


class CompareRequest(BaseModel):
    symbol: str
    strategies: Optional[List[str]] = None
    strategy_configs: Optional[List[CompareStrategyConfig]] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    initial_capital: float = 10000.0
    commission: float = 0.001
    slippage: float = 0.001
    fixed_commission: float = 0.0
    min_commission: float = 0.0
    market_impact_bps: float = 0.0
    market_impact_model: str = "constant"
    impact_reference_notional: float = 100000.0
    impact_coefficient: float = 1.0
    permanent_impact_bps: float = 0.0
    max_holding_days: Optional[int] = None


class MonteCarloBacktestRequest(BacktestRequest):
    simulations: int = 1000
    horizon_days: Optional[int] = None
    seed: Optional[int] = 42


class SignificanceCompareRequest(CompareRequest):
    baseline_strategy: Optional[str] = None
    bootstrap_samples: int = 1000
    seed: Optional[int] = 42


class MultiPeriodBacktestRequest(BacktestRequest):
    intervals: List[str] = ["1d", "1wk", "1mo"]


class MarketImpactScenarioConfig(BaseModel):
    label: Optional[str] = None
    market_impact_model: str = "constant"
    market_impact_bps: float = 0.0
    impact_reference_notional: Optional[float] = None
    impact_coefficient: float = 1.0
    permanent_impact_bps: float = 0.0


class MarketImpactAnalysisRequest(BacktestRequest):
    scenarios: Optional[List[MarketImpactScenarioConfig]] = None
    sample_trade_values: List[float] = [10000, 50000, 100000, 250000]


class ReportRequest(BaseModel):
    """报告生成请求"""
    symbol: str
    strategy: str
    backtest_result: Optional[Dict[str, Any]] = None
    parameters: Optional[Dict[str, Any]] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    initial_capital: float = 10000
    commission: float = 0.001
    slippage: float = 0.001

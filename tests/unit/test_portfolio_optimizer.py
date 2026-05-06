"""PortfolioOptimizer / DynamicRebalancer / StrategyWeightOptimizer characterization tests.

锁定 ``src/strategy/portfolio_optimizer.py`` 中三个公开类的当前数值/结构契约：

- ``PortfolioOptimizer``: 5 种优化方法 + 协方差/相关性矩阵 + 有效前沿。
- ``DynamicRebalancer``: 阈值判断 + 交易量计算。
- ``StrategyWeightOptimizer``: 基于回测/信号的权重优化 + 加权信号合成 + 策略对比。

测试目标是把现有 14% 覆盖率拉高，并在未来重构（拆 helper、调权重、改优化方法）
时提供回归网。所有数值断言带容差，避免锁过 SLSQP 的浮点抖动。
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from src.strategy.portfolio_optimizer import (
    DynamicRebalancer,
    PortfolioOptimizer,
    StrategyWeightOptimizer,
)


# ---------- fixtures ----------


@pytest.fixture
def synthetic_returns() -> pd.DataFrame:
    """3 资产 504 天（约 2 年）合成日收益率，固定 seed 保证可复现。

    构造：A 高收益高波动、B 中等、C 低波动低收益。约略不相关，
    便于优化算法找到分散组合。
    """
    rng = np.random.default_rng(seed=42)
    n_days = 504
    a = rng.normal(loc=0.0008, scale=0.020, size=n_days)
    b = rng.normal(loc=0.0005, scale=0.012, size=n_days)
    c = rng.normal(loc=0.0002, scale=0.006, size=n_days)
    return pd.DataFrame({"A": a, "B": b, "C": c})


@pytest.fixture
def optimizer() -> PortfolioOptimizer:
    return PortfolioOptimizer(risk_free_rate=0.02)


# ---------- PortfolioOptimizer.__init__ ----------


def test_default_constraints_when_none_passed():
    opt = PortfolioOptimizer()
    assert opt.risk_free_rate == 0.02
    assert opt.constraints == {"min_weight": 0.0, "max_weight": 1.0}
    assert opt.optimal_weights is None
    assert opt.expected_return is None
    assert opt.expected_volatility is None
    assert opt.sharpe_ratio is None


def test_custom_constraints_override():
    opt = PortfolioOptimizer(risk_free_rate=0.03, constraints={"min_weight": 0.05, "max_weight": 0.5})
    assert opt.risk_free_rate == 0.03
    assert opt.constraints == {"min_weight": 0.05, "max_weight": 0.5}


# ---------- calculate_portfolio_stats ----------


def test_calculate_portfolio_stats_equal_weight_3_assets(optimizer, synthetic_returns):
    weights = np.array([1 / 3, 1 / 3, 1 / 3])
    ret, vol, sharpe = optimizer.calculate_portfolio_stats(weights, synthetic_returns)
    # 用样本均值（即实际计算输入）作为期望值，再校验年化结构与夏普公式
    expected_ret = float((synthetic_returns.mean() * 252 * weights).sum())
    assert ret == pytest.approx(expected_ret, rel=1e-9)
    assert vol > 0
    assert sharpe == pytest.approx((ret - 0.02) / vol, rel=1e-9)


def test_calculate_portfolio_stats_full_weight_single_asset(optimizer, synthetic_returns):
    # 全压资产 A
    weights = np.array([1.0, 0.0, 0.0])
    ret, vol, _ = optimizer.calculate_portfolio_stats(weights, synthetic_returns)
    a_mean = synthetic_returns["A"].mean() * 252
    a_vol = np.sqrt(synthetic_returns["A"].var() * 252)
    assert ret == pytest.approx(a_mean, rel=1e-9)
    assert vol == pytest.approx(a_vol, rel=1e-6)


# ---------- optimize_max_sharpe ----------


def test_optimize_max_sharpe_returns_expected_shape(optimizer, synthetic_returns):
    result = optimizer.optimize_max_sharpe(synthetic_returns)
    assert result["success"] is True
    assert set(result["weights"].keys()) == {"A", "B", "C"}
    assert sum(result["weights"].values()) == pytest.approx(1.0, abs=1e-4)
    assert all(0 <= w <= 1.0 + 1e-9 for w in result["weights"].values())
    assert result["optimization_method"] == "max_sharpe"
    assert "expected_return" in result and "expected_volatility" in result and "sharpe_ratio" in result


def test_optimize_max_sharpe_persists_state_on_success(optimizer, synthetic_returns):
    result = optimizer.optimize_max_sharpe(synthetic_returns)
    assert result["success"]
    assert optimizer.optimal_weights is not None
    assert optimizer.expected_return is not None
    assert optimizer.expected_volatility is not None
    assert optimizer.sharpe_ratio is not None


def test_optimize_max_sharpe_with_short_allows_negative(optimizer, synthetic_returns):
    result = optimizer.optimize_max_sharpe(synthetic_returns, include_short=True)
    assert result["success"]
    # 允许做空时，权重区间 [-1, 1]
    assert all(-1 - 1e-9 <= w <= 1 + 1e-9 for w in result["weights"].values())


# ---------- optimize_min_variance ----------


def test_optimize_min_variance_prefers_low_vol_asset(optimizer, synthetic_returns):
    result = optimizer.optimize_min_variance(synthetic_returns)
    assert result["success"]
    assert sum(result["weights"].values()) == pytest.approx(1.0, abs=1e-4)
    # 在 3 资产中，低波动的 C 应当承担相对最高权重
    assert result["weights"]["C"] >= result["weights"]["A"]
    assert result["weights"]["C"] >= result["weights"]["B"]
    assert result["optimization_method"] == "min_variance"


# ---------- optimize_risk_parity ----------


def test_optimize_risk_parity_returns_risk_contributions(optimizer, synthetic_returns):
    result = optimizer.optimize_risk_parity(synthetic_returns)
    assert result["success"]
    assert "risk_contributions" in result
    assert set(result["risk_contributions"].keys()) == {"A", "B", "C"}
    assert sum(result["weights"].values()) == pytest.approx(1.0, abs=1e-4)
    assert result["optimization_method"] == "risk_parity"
    # 风险平价应当让所有资产风险贡献接近相等
    contribs = list(result["risk_contributions"].values())
    spread = max(contribs) - min(contribs)
    assert spread < 0.05  # 总风险贡献跨度宽松上限


# ---------- optimize_target_return ----------


def test_optimize_target_return_hits_target_when_feasible(optimizer, synthetic_returns):
    mean_returns = synthetic_returns.mean() * 252
    target = float(mean_returns.mean())  # 选择中间收益率作为可行目标
    result = optimizer.optimize_target_return(synthetic_returns, target_return=target)
    assert result["success"]
    assert result["expected_return"] == pytest.approx(target, abs=1e-3)
    assert result["target_return"] == target
    assert result["optimization_method"] == "target_return"


# ---------- generate_efficient_frontier ----------


def test_generate_efficient_frontier_shape(optimizer, synthetic_returns):
    frontier = optimizer.generate_efficient_frontier(synthetic_returns, n_points=10)
    assert isinstance(frontier, list)
    assert 1 <= len(frontier) <= 10  # 部分目标可能不可行
    assert all({"return", "volatility", "sharpe"} <= set(p.keys()) for p in frontier)
    # 收益率单调上升（按构造方式 — 注意优化失败的目标点会被略过）
    rets = [p["return"] for p in frontier]
    assert rets == sorted(rets, reverse=False) or len(rets) <= 1


# ---------- optimize_strategy_weights ----------


@pytest.mark.parametrize("method", ["max_sharpe", "min_variance", "risk_parity"])
def test_optimize_strategy_weights_dispatches_to_correct_method(optimizer, synthetic_returns, method):
    result = optimizer.optimize_strategy_weights(synthetic_returns, method=method)
    assert result["optimization_method"] == method
    assert result["success"]


def test_optimize_strategy_weights_unknown_method_raises(optimizer, synthetic_returns):
    with pytest.raises(ValueError, match="未知的优化方法"):
        optimizer.optimize_strategy_weights(synthetic_returns, method="fancy_quant")


# ---------- correlation / covariance helpers ----------


def test_get_correlation_matrix_is_symmetric_and_unit_diagonal(optimizer, synthetic_returns):
    corr = optimizer.get_correlation_matrix(synthetic_returns)
    assert isinstance(corr, pd.DataFrame)
    assert corr.shape == (3, 3)
    np.testing.assert_allclose(np.diag(corr.values), [1.0, 1.0, 1.0], atol=1e-9)
    np.testing.assert_allclose(corr.values, corr.values.T, atol=1e-9)


def test_get_covariance_matrix_annualization_factor(optimizer, synthetic_returns):
    cov_daily = optimizer.get_covariance_matrix(synthetic_returns, annualized=False)
    cov_yearly = optimizer.get_covariance_matrix(synthetic_returns, annualized=True)
    np.testing.assert_allclose(cov_yearly.values / 252, cov_daily.values, atol=1e-12)


# ---------- DynamicRebalancer ----------


def test_dynamic_rebalancer_init_defaults():
    rb = DynamicRebalancer()
    assert rb.rebalance_threshold == 0.05
    assert rb.rebalance_frequency == "monthly"
    assert isinstance(rb.optimizer, PortfolioOptimizer)


def test_dynamic_rebalancer_check_under_threshold_returns_false():
    rb = DynamicRebalancer(rebalance_threshold=0.05)
    assert rb.check_rebalance_needed(
        current_weights={"A": 0.50, "B": 0.30, "C": 0.20},
        target_weights={"A": 0.52, "B": 0.31, "C": 0.17},
    ) is False


def test_dynamic_rebalancer_check_over_threshold_returns_true():
    rb = DynamicRebalancer(rebalance_threshold=0.05)
    assert rb.check_rebalance_needed(
        current_weights={"A": 0.40, "B": 0.30, "C": 0.30},
        target_weights={"A": 0.50, "B": 0.30, "C": 0.20},
    ) is True


def test_dynamic_rebalancer_check_missing_asset_uses_zero():
    rb = DynamicRebalancer(rebalance_threshold=0.05)
    # current 中没有 D，按 0 计算：abs(0 - 0.10) = 0.10 > 0.05 → 触发
    assert rb.check_rebalance_needed(
        current_weights={"A": 0.50, "B": 0.40},
        target_weights={"A": 0.50, "B": 0.40, "D": 0.10},
    ) is True


def test_dynamic_rebalancer_calculate_trades_basic():
    rb = DynamicRebalancer()
    trades = rb.calculate_trades(
        current_weights={"A": 0.50, "B": 0.50},
        target_weights={"A": 0.30, "B": 0.70},
        portfolio_value=100_000,
    )
    assert trades["A"] == pytest.approx(-20_000)  # 减仓
    assert trades["B"] == pytest.approx(20_000)   # 加仓


def test_dynamic_rebalancer_calculate_trades_handles_new_asset():
    rb = DynamicRebalancer()
    trades = rb.calculate_trades(
        current_weights={"A": 1.0},
        target_weights={"A": 0.6, "B": 0.4},
        portfolio_value=100_000,
    )
    assert trades["A"] == pytest.approx(-40_000)
    assert trades["B"] == pytest.approx(40_000)


def test_dynamic_rebalancer_calculate_trades_handles_dropped_asset():
    rb = DynamicRebalancer()
    trades = rb.calculate_trades(
        current_weights={"A": 0.5, "B": 0.5},
        target_weights={"A": 1.0},
        portfolio_value=100_000,
    )
    assert trades["A"] == pytest.approx(50_000)
    assert trades["B"] == pytest.approx(-50_000)


# ---------- StrategyWeightOptimizer ----------


@pytest.fixture
def strategy_weight_optimizer() -> StrategyWeightOptimizer:
    return StrategyWeightOptimizer(risk_free_rate=0.02, min_weight=0.0, max_weight=0.5)


def test_strategy_optimizer_init_defaults():
    swo = StrategyWeightOptimizer()
    assert swo.optimizer.risk_free_rate == 0.02
    assert swo.optimizer.constraints == {"min_weight": 0.0, "max_weight": 0.5}
    assert swo.optimal_weights == {}
    assert swo.optimization_history == []


def test_optimize_from_backtest_results_rejects_single_strategy(strategy_weight_optimizer):
    result = strategy_weight_optimizer.optimize_from_backtest_results(
        backtest_results={"only_one": {"returns": pd.Series([0.01, 0.02, -0.01])}},
    )
    assert result == {"success": False, "error": "策略数量不足"}


def test_optimize_from_backtest_results_rejects_short_history(strategy_weight_optimizer):
    short = pd.Series([0.01, -0.01, 0.02])  # < 30 天
    result = strategy_weight_optimizer.optimize_from_backtest_results(
        backtest_results={"a": {"returns": short}, "b": {"returns": short}},
    )
    assert result == {"success": False, "error": "历史数据不足"}


def test_optimize_from_backtest_results_skips_missing_returns(strategy_weight_optimizer):
    rng = np.random.default_rng(seed=7)
    long_a = pd.Series(rng.normal(0.001, 0.01, 60))
    long_b = pd.Series(rng.normal(0.0005, 0.008, 60))
    result = strategy_weight_optimizer.optimize_from_backtest_results(
        backtest_results={
            "a": {"returns": long_a},
            "b": {"returns": long_b},
            "no_returns": {"metrics": {}},  # 跳过
            "null_returns": {"returns": None},  # 跳过
        },
    )
    assert result["success"]
    assert set(result["weights"].keys()) == {"a", "b"}


def test_optimize_from_backtest_results_records_history_on_success(strategy_weight_optimizer):
    rng = np.random.default_rng(seed=11)
    long_a = pd.Series(rng.normal(0.001, 0.01, 60))
    long_b = pd.Series(rng.normal(0.0005, 0.008, 60))
    strategy_weight_optimizer.optimize_from_backtest_results(
        backtest_results={"a": {"returns": long_a}, "b": {"returns": long_b}},
        method="max_sharpe",
    )
    assert len(strategy_weight_optimizer.optimization_history) == 1
    assert strategy_weight_optimizer.optimization_history[0]["method"] == "max_sharpe"
    assert "weights" in strategy_weight_optimizer.optimization_history[0]
    assert "sharpe" in strategy_weight_optimizer.optimization_history[0]
    # optimal_weights 保留为最近一次成功优化结果
    assert set(strategy_weight_optimizer.optimal_weights.keys()) == {"a", "b"}


def test_optimize_from_signals_runs_end_to_end(strategy_weight_optimizer):
    rng = np.random.default_rng(seed=21)
    n = 80
    dates = pd.date_range("2024-01-01", periods=n)
    price_data = pd.DataFrame(
        {"close": 100 * np.cumprod(1 + rng.normal(0.0005, 0.01, n))},
        index=dates,
    )
    signals = {
        "trend": pd.Series(rng.choice([-1, 0, 1], size=n), index=dates),
        "mean_reversion": pd.Series(rng.choice([-1, 0, 1], size=n), index=dates),
    }
    result = strategy_weight_optimizer.optimize_from_signals(signals, price_data)
    assert "success" in result


def test_optimize_from_signals_short_history_rejected(strategy_weight_optimizer):
    dates = pd.date_range("2024-01-01", periods=10)
    price_data = pd.DataFrame({"close": [100] * 10}, index=dates)
    signals = {"a": pd.Series([1] * 10, index=dates), "b": pd.Series([-1] * 10, index=dates)}
    result = strategy_weight_optimizer.optimize_from_signals(signals, price_data)
    assert result == {"success": False, "error": "有效策略数量不足"}


def test_get_weighted_signal_uses_equal_weights_when_unoptimized(strategy_weight_optimizer):
    n = 5
    dates = pd.date_range("2024-01-01", periods=n)
    signals = {
        "a": pd.Series([1, 1, 0, -1, 0], index=dates),
        "b": pd.Series([1, 0, 0, -1, -1], index=dates),
    }
    out = strategy_weight_optimizer.get_weighted_signal(signals)
    # 等权 0.5/0.5 → 平均后 [1, 0.5, 0, -1, -0.5] → 离散化（>0.3 / <-0.3）
    # 注意：weighted_signals 在 total_weight=1 时 /= 1，仍然 [1, 0.5, 0, -1, -0.5]
    assert list(out.values) == [1, 1, 0, -1, -1]


def test_get_weighted_signal_uses_optimal_weights_when_set(strategy_weight_optimizer):
    n = 4
    dates = pd.date_range("2024-01-01", periods=n)
    signals = {
        "a": pd.Series([1, 1, -1, 0], index=dates),
        "b": pd.Series([0, 1, -1, 1], index=dates),
    }
    strategy_weight_optimizer.optimal_weights = {"a": 0.8, "b": 0.2}
    out = strategy_weight_optimizer.get_weighted_signal(signals)
    # weighted_signals = [0.8*1+0.2*0, 0.8*1+0.2*1, 0.8*-1+0.2*-1, 0.8*0+0.2*1]
    #                  = [0.8, 1.0, -1.0, 0.2]
    # /= total_weight=1.0 → 不变
    # 离散化：>0.3 → 1, <-0.3 → -1, else 0
    assert list(out.values) == [1, 1, -1, 0]


def test_compare_strategies_returns_metrics_per_strategy(strategy_weight_optimizer):
    rng = np.random.default_rng(seed=33)
    df = pd.DataFrame(
        {
            "strat_a": rng.normal(0.001, 0.01, 100),
            "strat_b": rng.normal(0.0005, 0.008, 100),
        }
    )
    out = strategy_weight_optimizer.compare_strategies(df)
    assert isinstance(out, pd.DataFrame) or isinstance(out, list)
    # compare_strategies 返回 list[dict] 或 DataFrame，文件实现里返回 list,
    # 锁定其包含每个策略的关键指标
    rows = out.to_dict("records") if isinstance(out, pd.DataFrame) else out
    strats = {row["strategy"] for row in rows}
    assert strats == {"strat_a", "strat_b"}
    for row in rows:
        assert {"annual_return", "annual_volatility", "sharpe_ratio", "max_drawdown"} <= set(row.keys())


def test_compare_strategies_skips_short_history(strategy_weight_optimizer):
    df = pd.DataFrame(
        {
            "good": np.random.default_rng(0).normal(0, 0.01, 100),
            "too_short": [0.01] * 5 + [np.nan] * 95,
        }
    )
    out = strategy_weight_optimizer.compare_strategies(df)
    rows = out.to_dict("records") if isinstance(out, pd.DataFrame) else out
    strats = {row["strategy"] for row in rows}
    assert "good" in strats
    assert "too_short" not in strats

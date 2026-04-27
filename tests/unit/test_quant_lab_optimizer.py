import json
from types import SimpleNamespace

import numpy as np
import pandas as pd

from backend.app.services.quant_lab import QuantLabService

import backend.app.services.quant_lab as quant_lab_module


def _historical_frame(periods=140):
    dates = pd.date_range("2024-01-01", periods=periods, freq="B")
    close = np.linspace(100, 140, periods)
    return pd.DataFrame(
        {
            "open": close,
            "high": close + 1,
            "low": close - 1,
            "close": close,
            "volume": np.full(periods, 1_000_000),
        },
        index=dates,
    )


def test_optimize_strategy_sanitizes_non_finite_metrics(monkeypatch, tmp_path):
    service = QuantLabService(storage_root=tmp_path / "quant_lab")
    service.data_manager = SimpleNamespace(
        get_historical_data=lambda **_kwargs: _historical_frame(),
    )

    def _fake_run_backtest_metrics(**_kwargs):
        return {
            "final_value": 12500.0,
            "total_return": 0.25,
            "sharpe_ratio": np.float64(np.inf),
            "max_drawdown": -0.08,
            "sortino_ratio": float("-inf"),
        }

    class FakeWalkForwardAnalyzer:
        def __init__(self, *args, **kwargs):
            self.args = args
            self.kwargs = kwargs

        def analyze(self, **_kwargs):
            return {
                "aggregate_metrics": {
                    "parameter_stability": float("nan"),
                },
                "window_results": [
                    {
                        "window_index": 0,
                        "selected_parameters": {"fast_period": 5, "slow_period": 20},
                        "score": np.float64(np.inf),
                        "train_metrics": {"sharpe_ratio": float("-inf")},
                    }
                ],
            }

    monkeypatch.setattr(service, "_run_backtest_metrics", _fake_run_backtest_metrics)
    monkeypatch.setattr(quant_lab_module, "WalkForwardAnalyzer", FakeWalkForwardAnalyzer)

    result = service.optimize_strategy(
        {
            "symbol": "AAPL",
            "strategy": "moving_average",
            "parameters": {"fast_period": 5, "slow_period": 20},
            "parameter_grid": {
                "fast_period": [5],
                "slow_period": [20],
            },
            "run_walk_forward": True,
        }
    )

    assert result["best_train_metrics"]["sharpe_ratio"] is None
    assert result["best_train_metrics"]["sortino_ratio"] is None
    assert result["leaderboard"][0]["score"] is None
    assert result["heatmap"]["cells"][0]["value"] is None
    assert result["walk_forward"]["aggregate_metrics"]["parameter_stability"] is None
    assert result["walk_forward"]["window_results"][0]["score"] is None
    assert result["walk_forward"]["window_results"][0]["train_metrics"]["sharpe_ratio"] is None

    serialized = json.dumps(result, allow_nan=False)

    assert "\"leaderboard\"" in serialized

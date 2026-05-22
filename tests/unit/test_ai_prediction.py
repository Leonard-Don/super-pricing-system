"""Smoke + behaviour tests for the AI price predictors.

Relocated from ``tests/`` root into ``tests/unit/`` so CI (which collects
``tests/unit tests/integration``) actually runs it. Rewritten as plain pytest
functions: deterministic seeded mock data, no ``print``/``__main__`` script
scaffolding, and assertions that pin the *corrected* causal + reproducible
behaviour of ``LSTMPredictor``.
"""
import numpy as np
import pandas as pd
import pytest

from src.analytics.lstm_predictor import TF_AVAILABLE, LSTMPredictor
from src.analytics.predictor import PricePredictor


def create_mock_data(days: int = 100, seed: int = 42) -> pd.DataFrame:
    """Deterministic OHLCV mock data (seeded so tests are reproducible)."""
    rng = np.random.default_rng(seed)
    dates = pd.date_range(end=pd.Timestamp("2025-01-01"), periods=days)
    return pd.DataFrame(
        {
            "close": np.linspace(100, 150, days) + rng.normal(0, 1, days),
            "high": np.linspace(102, 152, days) + rng.normal(0, 1, days),
            "low": np.linspace(98, 148, days) + rng.normal(0, 1, days),
            "volume": rng.integers(1000, 5000, days).astype(float),
        },
        index=dates,
    )


def test_random_forest_recursive():
    """Random Forest recursive prediction returns a well-formed 5-day forecast."""
    predictor = PricePredictor()
    data = create_mock_data()

    predictor.train(data, "TEST_SYM_RF")
    result = predictor.predict_next_days(data, days=5, symbol="TEST_SYM_RF")

    assert len(result["predicted_prices"]) == 5
    assert len(result["dates"]) == 5
    assert result["prediction_summary"]["trend"] in ["bullish", "bearish", "neutral"]


def test_lstm_prediction():
    """LSTM prediction returns a well-formed 5-day forecast."""
    predictor = LSTMPredictor(sequence_length=10)
    data = create_mock_data()

    predictor.train(data, "TEST_SYM_LSTM")
    result = predictor.predict(data, "TEST_SYM_LSTM", days=5)

    assert len(result["predicted_prices"]) == 5
    assert len(result["dates"]) == 5


@pytest.mark.skipif(
    not TF_AVAILABLE, reason="TensorFlow not installed; LSTM real-path code cannot run"
)
def test_lstm_prediction_is_reproducible():
    """Corrected behaviour: with a fixed ``random_state`` the LSTM trains
    deterministically, so two runs on identical data agree exactly.

    Before the fix the model was unseeded and this assertion would fail.
    """
    data = create_mock_data()

    p1 = LSTMPredictor(sequence_length=10, random_state=2024)
    p1.train(data, "TEST_SYM_LSTM_REPRO_1")
    r1 = p1.predict(data, "TEST_SYM_LSTM_REPRO_1", days=5)

    p2 = LSTMPredictor(sequence_length=10, random_state=2024)
    p2.train(data, "TEST_SYM_LSTM_REPRO_2")
    r2 = p2.predict(data, "TEST_SYM_LSTM_REPRO_2", days=5)

    # Both must take the real LSTM path (not the mock/fallback path).
    assert r1["model_type"] == "LSTM"
    assert r2["model_type"] == "LSTM"
    assert r1["predicted_prices"] == r2["predicted_prices"]

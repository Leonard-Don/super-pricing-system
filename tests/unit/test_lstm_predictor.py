"""TDD coverage for numerical-correctness fixes in ``LSTMPredictor``.

Three bugs are pinned here:

(a) Lookahead bias via non-causal scaling — the ``MinMaxScaler`` must be fit
    on the training slice ONLY, never the full dataset (the validation
    window's min/max must not leak into ``data_min_`` / ``data_max_``).
(b) Lookahead bias via backfill — ``_prepare_features`` must forward-fill
    only; ``bfill`` would pull future values backward into NaN gaps.
(c) Unseeded training — two ``train()`` runs with the same ``random_state``
    must produce identical predictions.

Tests synthesise small deterministic data; no network, no real I/O beyond the
predictor's own ``saved_models`` scratch directory.
"""
import numpy as np
import pandas as pd
import pytest

from src.analytics.lstm_predictor import TF_AVAILABLE, LSTMPredictor

# Whole module is meaningless without TensorFlow (mock paths skip the code
# under test). Skip cleanly rather than silently passing in fallback mode.
pytestmark = pytest.mark.skipif(
    not TF_AVAILABLE, reason="TensorFlow not installed; LSTM real-path code cannot run"
)


def _trending_ohlcv(days: int = 140, seed: int = 7) -> pd.DataFrame:
    """Deterministic OHLCV frame with a mild upward drift and noise."""
    rng = np.random.default_rng(seed)
    close = np.linspace(100.0, 150.0, days) + rng.normal(0, 0.8, days)
    high = close + np.abs(rng.normal(1.0, 0.3, days))
    low = close - np.abs(rng.normal(1.0, 0.3, days))
    volume = rng.integers(1_000, 5_000, days).astype(float)
    dates = pd.date_range(end=pd.Timestamp("2025-01-01"), periods=days)
    return pd.DataFrame(
        {"close": close, "high": high, "low": low, "volume": volume}, index=dates
    )


# --------------------------------------------------------------------------
# Bug (b): _prepare_features must forward-fill only — no backfill.
# --------------------------------------------------------------------------
def test_prepare_features_does_not_backfill_future_values():
    """A NaN gap must never be filled from a *later* row.

    We inject a hole in ``volume`` at an interior row. ``bfill`` would copy
    the next (future) volume backward; a causal ``ffill`` copies the prior
    (past) volume forward. We assert the gap row equals the PAST value.
    """
    df = _trending_ohlcv()
    gap_pos = 60  # interior row, well past the rolling-window warm-up
    prior_volume = float(df["volume"].iloc[gap_pos - 1])
    future_volume = float(df["volume"].iloc[gap_pos + 1])
    # Sanity: the two neighbours differ, so the test can actually distinguish
    # forward-fill from backfill.
    assert prior_volume != future_volume

    df.iloc[gap_pos, df.columns.get_loc("volume")] = np.nan

    predictor = LSTMPredictor(sequence_length=10)
    prepared = predictor._prepare_features(df)

    gap_label = df.index[gap_pos]
    assert gap_label in prepared.index, "gap row was unexpectedly dropped"
    filled = float(prepared.loc[gap_label, "volume"])
    # Causal fill: must take the PAST value, never the FUTURE value.
    assert filled == prior_volume, (
        f"expected forward-fill from past ({prior_volume}), "
        f"got {filled} (future value is {future_volume})"
    )


def test_prepare_features_volume_ratio_is_causal_under_gap():
    """The derived ``volume_ratio`` for the gap row must not see the future.

    ``volume_ratio = volume / trailing-20d-mean(volume)``. When the gap row's
    raw ``volume`` is NaN the ratio is also NaN, and ``_prepare_features``
    fills that NaN by forward-filling the *ratio column*. So the gap row's
    ratio must equal the most recent PRIOR finite ratio — and must never
    equal a value derived from a later row. ``bfill`` would instead copy a
    future ratio backward.
    """
    df = _trending_ohlcv()
    gap_pos = 70
    df.iloc[gap_pos, df.columns.get_loc("volume")] = np.nan

    predictor = LSTMPredictor(sequence_length=10)
    prepared = predictor._prepare_features(df)

    # Replicate the implementation's order of operations exactly: compute the
    # ratio on the RAW (NaN-containing) volume, then forward-fill the column.
    raw_vol = df["volume"]
    raw_ma20 = raw_vol.rolling(window=20).mean()
    raw_ratio = raw_vol / (raw_ma20 + 1e-10)
    causal_ffilled = raw_ratio.ffill()
    leaky_bfilled = raw_ratio.bfill()

    gap_label = df.index[gap_pos]
    assert gap_label in prepared.index
    got = float(prepared.loc[gap_label, "volume_ratio"])
    # Sanity: forward- and back-fill genuinely disagree at the gap row, so
    # this test can distinguish causal from non-causal behaviour.
    assert causal_ffilled.loc[gap_label] != leaky_bfilled.loc[gap_label]

    assert got == pytest.approx(float(causal_ffilled.loc[gap_label])), (
        "volume_ratio gap row should forward-fill the prior ratio"
    )
    assert got != pytest.approx(float(leaky_bfilled.loc[gap_label])), (
        "volume_ratio gap row leaked a future (back-filled) ratio"
    )


# --------------------------------------------------------------------------
# Bug (a): the scaler must be fit on the TRAINING slice only.
# --------------------------------------------------------------------------
def _expected_training_slice_bounds(predictor: LSTMPredictor, df: pd.DataFrame):
    """Replicate train()'s preprocessing to learn what the *training* feature
    rows are, then return their per-feature (min, max).

    The scaler is fit before sequencing; the rows that feed the training
    sequences are ``feature_data[: split_idx + sequence_length]`` where
    ``split_idx = int(len(X) * 0.8)`` and
    ``len(X) = len(feature_data) - sequence_length``.
    """
    data = predictor._prepare_features(df)
    feature_data = data[predictor.feature_columns].values
    target_data = data["next_return"].values
    valid_mask = ~np.isnan(target_data)
    feature_data = feature_data[valid_mask]

    n_sequences = len(feature_data) - predictor.sequence_length
    split_idx = int(n_sequences * 0.8)
    train_rows = feature_data[: split_idx + predictor.sequence_length]
    return train_rows.min(axis=0), train_rows.max(axis=0), feature_data


def test_scaler_is_fit_on_training_slice_only():
    """Inject an extreme volume spike inside the validation window.

    A non-causal ``fit_transform`` over the whole dataset would absorb the
    spike into ``data_max_``. A correct, causal fit on the training slice
    must NOT see it — so the fitted scaler's bounds equal the training-slice
    bounds, strictly tighter than the full-dataset bounds.
    """
    df = _trending_ohlcv()
    # Spike volume hard in the final rows (the validation window).
    df.iloc[-3:, df.columns.get_loc("volume")] = 5_000_000.0

    predictor = LSTMPredictor(sequence_length=10)
    train_min, train_max, full_feature_data = _expected_training_slice_bounds(
        predictor, df
    )
    full_max = full_feature_data.max(axis=0)

    # The spike must make the full-dataset bounds genuinely wider than the
    # training-slice bounds for at least one feature — otherwise this test
    # cannot distinguish a causal fit from a leaky one.
    assert np.any(full_max > train_max + 1e-9), (
        "synthetic data failed to create a validation-only extreme"
    )

    predictor.train(df, "SCALER_CAUSAL_TEST")
    scaler = predictor.scalers["SCALER_CAUSAL_TEST"]

    # The fitted scaler must reflect the TRAINING slice, not the full set.
    np.testing.assert_allclose(scaler.data_min_, train_min, rtol=1e-9, atol=1e-9)
    np.testing.assert_allclose(scaler.data_max_, train_max, rtol=1e-9, atol=1e-9)

    # And explicitly: it must NOT equal the leaky full-dataset bounds.
    assert not np.allclose(scaler.data_max_, full_max), (
        "scaler.data_max_ matches the full-dataset max — validation data leaked"
    )


# --------------------------------------------------------------------------
# Bug (c): identical random_state → reproducible predictions.
# --------------------------------------------------------------------------
def test_training_is_reproducible_with_fixed_random_state():
    """Two predictors trained on identical data with the same ``random_state``
    must produce bit-identical predictions."""
    df = _trending_ohlcv()

    p1 = LSTMPredictor(sequence_length=10, random_state=123)
    p1.train(df, "REPRO_TEST_A")
    pred1 = p1.predict(df, "REPRO_TEST_A", days=5)

    p2 = LSTMPredictor(sequence_length=10, random_state=123)
    p2.train(df, "REPRO_TEST_B")
    pred2 = p2.predict(df, "REPRO_TEST_B", days=5)

    assert pred1["model_type"] == "LSTM", f"fell back to {pred1['model_type']}"
    assert pred2["model_type"] == "LSTM", f"fell back to {pred2['model_type']}"
    assert pred1["predicted_prices"] == pred2["predicted_prices"], (
        f"non-reproducible: {pred1['predicted_prices']} != "
        f"{pred2['predicted_prices']}"
    )

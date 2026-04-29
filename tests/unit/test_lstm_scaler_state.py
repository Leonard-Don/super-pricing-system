import numpy as np
import pytest
from sklearn.preprocessing import MinMaxScaler

from src.analytics.lstm_scaler_state import (
    deserialize_minmax_scaler,
    safe_model_key,
    serialize_minmax_scaler,
)


def test_minmax_scaler_round_trip_without_pickle():
    scaler = MinMaxScaler(feature_range=(-1, 1))
    source = np.array([[1.0, 10.0], [2.0, 20.0], [4.0, 40.0]])
    scaler.fit(source)

    restored = deserialize_minmax_scaler(serialize_minmax_scaler(scaler))

    target = np.array([[3.0, 30.0]])
    assert np.allclose(restored.transform(target), scaler.transform(target))


def test_minmax_scaler_payload_rejects_missing_required_state():
    payload = serialize_minmax_scaler(MinMaxScaler().fit(np.array([[1.0], [2.0]])))
    payload.pop("scale_")

    with pytest.raises(ValueError, match="Missing MinMaxScaler field"):
        deserialize_minmax_scaler(payload)


def test_safe_model_key_removes_path_separators():
    assert safe_model_key("../AAPL/../../NVDA") == ".._AAPL_.._.._NVDA"

"""JSON-safe persistence helpers for fitted sklearn scalers."""

from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.preprocessing import MinMaxScaler


def safe_model_key(symbol: str) -> str:
    """Return a filesystem-safe key for a market symbol."""
    return "".join(ch if ch.isalnum() or ch in {"-", "_", "."} else "_" for ch in str(symbol or "unknown"))


def serialize_minmax_scaler(scaler: MinMaxScaler) -> dict[str, Any]:
    """Serialize a fitted MinMaxScaler without using pickle."""
    array_fields = (
        "scale_",
        "min_",
        "data_min_",
        "data_max_",
        "data_range_",
    )
    payload: dict[str, Any] = {
        "class": "MinMaxScaler",
        "feature_range": list(getattr(scaler, "feature_range", (-1, 1))),
        "copy": bool(getattr(scaler, "copy", True)),
        "clip": bool(getattr(scaler, "clip", False)),
    }
    for field_name in array_fields:
        value = getattr(scaler, field_name, None)
        if value is not None:
            payload[field_name] = np.asarray(value, dtype=float).tolist()

    for field_name in ("n_features_in_", "n_samples_seen_"):
        value = getattr(scaler, field_name, None)
        if value is not None:
            payload[field_name] = int(value)

    return payload


def deserialize_minmax_scaler(payload: dict[str, Any]) -> MinMaxScaler:
    """Rebuild a fitted MinMaxScaler from JSON-safe state."""
    if payload.get("class") != "MinMaxScaler":
        raise ValueError("Unsupported scaler payload")

    feature_range = payload.get("feature_range", [-1, 1])
    if not isinstance(feature_range, list) or len(feature_range) != 2:
        raise ValueError("Invalid MinMaxScaler feature_range")

    scaler = MinMaxScaler(
        feature_range=(float(feature_range[0]), float(feature_range[1])),
        copy=bool(payload.get("copy", True)),
        clip=bool(payload.get("clip", False)),
    )
    for field_name in ("scale_", "min_", "data_min_", "data_max_", "data_range_"):
        if field_name not in payload:
            raise ValueError(f"Missing MinMaxScaler field: {field_name}")
        setattr(scaler, field_name, np.asarray(payload[field_name], dtype=float))

    for field_name in ("n_features_in_", "n_samples_seen_"):
        if field_name in payload:
            setattr(scaler, field_name, int(payload[field_name]))

    return scaler

"""Deterministic OHLCV fallback data for local research workflows."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

import numpy as np
import pandas as pd


def _interval_frequency(interval: str) -> str:
    normalized = str(interval or "1d").strip().lower()
    return {
        "1m": "min",
        "5m": "5min",
        "15m": "15min",
        "30m": "30min",
        "1h": "h",
        "1d": "D",
        "1wk": "W",
        "1w": "W",
        "1mo": "ME",
        "1mth": "ME",
    }.get(normalized, "D")


def _default_periods(interval: str, period: Optional[str]) -> int:
    normalized_interval = str(interval or "1d").strip().lower()
    normalized_period = str(period or "").strip().lower()
    if normalized_interval in {"1m", "5m", "15m", "30m"}:
        return 240
    if normalized_interval in {"1h"}:
        return 360
    if normalized_interval in {"1wk", "1w"}:
        return 156
    if normalized_interval in {"1mo", "1mth"}:
        return 72
    if normalized_period.endswith("mo"):
        try:
            return max(60, min(int(normalized_period[:-2]) * 21, 756))
        except ValueError:
            return 252
    if normalized_period.endswith("y"):
        try:
            return max(120, min(int(normalized_period[:-1]) * 252, 1260))
        except ValueError:
            return 252
    if normalized_period.endswith("d"):
        try:
            return max(40, min(int(normalized_period[:-1]), 756))
        except ValueError:
            return 252
    return 252


def _coerce_datetime(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    timestamp = pd.Timestamp(value)
    if timestamp.tzinfo is not None:
        timestamp = timestamp.tz_convert(None)
    return timestamp.to_pydatetime()


def build_synthetic_ohlcv_frame(
    symbol: str,
    *,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    interval: str = "1d",
    period: Optional[str] = None,
    periods: Optional[int] = None,
) -> pd.DataFrame:
    """Build a stable, clearly marked OHLCV frame when live history is empty."""

    normalized_symbol = str(symbol or "SYNTH").strip().upper() or "SYNTH"
    safe_interval = str(interval or "1d").strip().lower()
    frequency = _interval_frequency(safe_interval)
    end = _coerce_datetime(end_date) or datetime.now()
    start = _coerce_datetime(start_date)
    safe_periods = max(40, min(int(periods or _default_periods(safe_interval, period)), 1260))

    if start is not None and start < end:
        index = pd.date_range(start=start, end=end, freq=frequency)
        if len(index) < 40:
            index = pd.date_range(end=end, periods=40, freq=frequency)
    else:
        if safe_interval in {"1m", "5m", "15m", "30m", "1h"} and end_date is None:
            end = datetime.now()
        elif end_date is None:
            end = datetime.now() - timedelta(days=1)
        index = pd.date_range(end=end, periods=safe_periods, freq=frequency)

    if len(index) > 1260:
        index = index[-1260:]

    seed = sum((position + 1) * ord(char) for position, char in enumerate(normalized_symbol))
    rng = np.random.default_rng(seed)
    count = len(index)
    base_price = 60.0 + float(seed % 180)
    drift = np.linspace(0.0, count * 0.055, count)
    seasonal = np.sin(np.linspace(0.0, 8.0, count)) * max(base_price * 0.018, 1.0)
    noise = rng.normal(0.0, max(base_price * 0.0025, 0.15), count).cumsum() * 0.08
    close = np.maximum(base_price + drift + seasonal + noise, 1.0)
    open_price = close * (1.0 + rng.normal(0.0, 0.002, count))
    high = np.maximum(open_price, close) * (1.002 + rng.random(count) * 0.006)
    low = np.minimum(open_price, close) * (0.998 - rng.random(count) * 0.005)
    volume = rng.integers(800_000, 3_600_000, count)

    frame = pd.DataFrame(
        {
            "open": open_price,
            "high": high,
            "low": low,
            "close": close,
            "volume": volume,
        },
        index=index,
    )
    frame.index.name = "date"
    frame["returns"] = frame["close"].pct_change().fillna(0.0)
    frame.attrs.update(
        {
            "source": "synthetic_market_fallback",
            "degraded": True,
            "synthetic": True,
            "degraded_reason": "historical provider returned no market data",
            "symbol": normalized_symbol,
            "interval": safe_interval,
            "period": period or "",
        }
    )
    return frame

import pandas as pd

from backend.app.services.quant_lab import QuantLabService


def _price_frame(values, start="2024-01-01"):
    dates = pd.date_range(start=start, periods=len(values), freq="B")
    prices = pd.Series(values, index=dates)
    return pd.DataFrame(
        {
            "open": prices,
            "high": prices,
            "low": prices,
            "close": prices,
            "volume": 1_000_000,
        }
    )


class DummyIndustryDataManager:
    def __init__(self, frames):
        self.frames = frames

    def get_historical_data(self, symbol, start_date=None, end_date=None, interval="1d", period=None):
        frame = self.frames.get(symbol, pd.DataFrame()).copy()
        if frame.empty:
            return frame
        if start_date is not None:
            frame = frame[frame.index >= pd.Timestamp(start_date)]
        if end_date is not None:
            frame = frame[frame.index <= pd.Timestamp(end_date)]
        return frame


def test_quant_lab_service_industry_rotation_falls_back_to_cached_payload(tmp_path):
    frames = {
        "XLK": _price_frame([100, 102, 103, 105, 108, 110, 112, 114, 116, 118, 119, 121]),
        "XLV": _price_frame([100, 99, 99, 100, 100, 101, 102, 102, 103, 103, 104, 104]),
        "ICLN": _price_frame([100, 101, 103, 104, 106, 108, 109, 110, 112, 113, 114, 116]),
        "XLF": _price_frame([100, 100, 99, 99, 98, 98, 97, 97, 96, 96, 95, 95]),
        "SPY": _price_frame([100, 101, 102, 103, 104, 104, 105, 106, 107, 108, 109, 110]),
    }
    service = QuantLabService(storage_root=tmp_path / "quant_lab")
    service.data_manager = DummyIndustryDataManager(frames)

    payload = {
        "start_date": "2024-01-01",
        "end_date": "2024-01-31",
        "rebalance_freq": "monthly",
        "top_industries": 2,
        "stocks_per_industry": 1,
        "weight_method": "equal",
        "initial_capital": 1000000,
        "commission": 0.001,
        "slippage": 0.001,
        "prefer_fast_path": True,
    }

    first = service.run_industry_rotation_lab(payload)
    assert first["execution"]["mode"] == "proxy_fast_path"

    def _raise_failure(_payload, *, fast_path=False):
        raise RuntimeError("upstream failed")

    service._industry_rotation_service._run_industry_rotation_backtest = _raise_failure
    fallback = service.run_industry_rotation_lab({**payload, "prefer_fast_path": False})

    assert fallback["execution"]["mode"] == "cached"
    assert fallback["execution"]["degraded"] is True
    assert fallback["execution"]["fallback_reason"] == "primary_rotation_failed"

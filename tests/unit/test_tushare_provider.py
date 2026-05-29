"""Unit tests for TushareProvider and cross-source unit normalization.

Two concerns live here:
1. TushareProvider behavior (symbol normalization, quote/fundamental derivation) —
   the original provider tests.
2. Cross-source volume/amount unit normalization (volume -> shares 股,
   amount -> yuan 元), added when fixing the 100x fallback jump.

All synthetic data; no network access.
"""

import os
import sys
import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

import pandas as pd
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from src.data.providers.base_provider import BaseDataProvider, DataProviderError  # noqa: E402
from src.data.providers.tushare_provider import TushareProvider  # noqa: E402
from src.data.providers.yahoo_provider import YahooFinanceProvider  # noqa: E402
from src.data.providers import akshare_provider as akshare_mod  # noqa: E402
from src.data.providers.akshare_provider import AKShareProvider  # noqa: E402


# ---------------------------------------------------------------------------
# Original TushareProvider behavior tests
# ---------------------------------------------------------------------------

def test_tushare_provider_normalizes_a_share_history(monkeypatch):
    calls = {}

    def fake_pro_api(token, timeout=30):
        calls["token"] = token
        calls["timeout"] = timeout
        return SimpleNamespace()

    def fake_pro_bar(**kwargs):
        calls["pro_bar"] = kwargs
        return pd.DataFrame(
            [
                {
                    "trade_date": "20240103",
                    "open": 12.0,
                    "high": 13.0,
                    "low": 11.5,
                    "close": 12.5,
                    "pre_close": 12.1,
                    "change": 0.4,
                    "pct_chg": 3.31,
                    "vol": 1000,
                    "amount": 2500.0,
                },
                {
                    "trade_date": "20240102",
                    "open": 10.0,
                    "high": 12.0,
                    "low": 9.5,
                    "close": 12.1,
                    "pre_close": 10.0,
                    "change": 2.1,
                    "pct_chg": 21.0,
                    "vol": 900,
                    "amount": 1800.0,
                },
            ]
        )

    monkeypatch.setattr("src.data.providers.tushare_provider.ts.pro_api", fake_pro_api)
    monkeypatch.setattr("src.data.providers.tushare_provider.ts.pro_bar", fake_pro_bar)

    provider = TushareProvider(api_key="TOKEN", config={"timeout": 7})
    frame = provider.get_historical_data(
        "600519.SS",
        start_date=datetime(2024, 1, 1),
        end_date=datetime(2024, 1, 31),
    )

    assert calls["token"] == "TOKEN"
    assert calls["timeout"] == 7
    assert calls["pro_bar"]["ts_code"] == "600519.SH"
    assert calls["pro_bar"]["freq"] == "D"
    assert calls["pro_bar"]["adj"] == "qfq"
    assert list(frame.index.strftime("%Y-%m-%d")) == ["2024-01-02", "2024-01-03"]
    assert list(frame.columns[:5]) == ["open", "high", "low", "close", "pre_close"]
    assert "volume" in frame.columns
    assert "returns" in frame.columns


def test_tushare_provider_rejects_non_a_share_symbols_without_network(monkeypatch):
    def fail_pro_bar(**kwargs):  # pragma: no cover - assertion guard
        raise AssertionError("non-A-share symbols should be rejected before network calls")

    monkeypatch.setattr("src.data.providers.tushare_provider.ts.pro_bar", fail_pro_bar)

    provider = TushareProvider(api_key="TOKEN")
    frame = provider.get_historical_data("AAPL")

    assert frame.empty


def test_tushare_provider_requires_token_for_fetches():
    provider = TushareProvider(api_key=None)

    with pytest.raises(DataProviderError, match="Tushare token is required"):
        provider.get_historical_data("000001.SZ")


def test_tushare_latest_quote_uses_recent_history(monkeypatch):
    provider = TushareProvider(api_key="TOKEN")
    history = pd.DataFrame(
        {
            "open": [9.5, 10.0],
            "high": [10.2, 10.8],
            "low": [9.2, 9.9],
            "close": [10.0, 10.5],
            "volume": [100, 120],
        },
        index=pd.to_datetime(["2024-01-02", "2024-01-03"]),
    )

    monkeypatch.setattr(provider, "get_historical_data", lambda *args, **kwargs: history)

    quote = provider.get_latest_quote("000001")

    assert quote["symbol"] == "000001.SZ"
    assert quote["price"] == 10.5
    assert quote["change"] == 0.5
    assert quote["change_percent"] == 5.0
    assert quote["source"] == "tushare"


def test_tushare_fundamental_data_merges_daily_basic_and_stock_basic(monkeypatch):
    class FakeApi:
        def daily_basic(self, **kwargs):
            return pd.DataFrame(
                [
                    {
                        "ts_code": "000001.SZ",
                        "trade_date": "20240103",
                        "close": 10.5,
                        "turnover_rate": 1.2,
                        "volume_ratio": 0.9,
                        "pe": 6.5,
                        "pb": 0.8,
                        "ps": 1.1,
                        "dv_ratio": 4.2,
                        "total_mv": 1200000.0,
                        "circ_mv": 900000.0,
                    }
                ]
            )

        def stock_basic(self, **kwargs):
            return pd.DataFrame(
                [
                    {
                        "ts_code": "000001.SZ",
                        "name": "平安银行",
                        "industry": "银行",
                        "market": "主板",
                        "list_date": "19910403",
                    }
                ]
            )

    provider = TushareProvider(api_key="TOKEN")
    monkeypatch.setattr(provider, "_get_api", lambda: FakeApi())

    payload = provider.get_fundamental_data("000001")

    assert payload["symbol"] == "000001.SZ"
    assert payload["company_name"] == "平安银行"
    assert payload["industry"] == "银行"
    assert payload["pe_ratio"] == 6.5
    assert payload["pb_ratio"] == 0.8
    assert payload["source"] == "tushare"


# ---------------------------------------------------------------------------
# Unit normalization: shared helpers
# ---------------------------------------------------------------------------

class _FactorProvider(BaseDataProvider):
    """Concrete provider with custom unit factors for exercising base helpers."""

    name = "factortest"
    VOLUME_TO_SHARES = 100
    AMOUNT_TO_YUAN = 1000

    def get_historical_data(self, symbol, start_date=None, end_date=None, interval="1d"):
        return pd.DataFrame()

    def get_latest_quote(self, symbol):
        return {}


def _frame(**cols):
    n = len(next(iter(cols.values())))
    return pd.DataFrame(cols, index=pd.date_range("2026-01-01", periods=n))


class UnitNormalizationBaseTests(unittest.TestCase):
    """Phase 1: base-class normalization primitives."""

    def test_apply_unit_normalization_scales_volume_and_amount(self):  # T1
        out = _FactorProvider()._apply_unit_normalization(
            _frame(volume=[10, 20], amount=[5.0, 6.0])
        )
        self.assertEqual(list(out["volume"]), [1000, 2000])       # x100
        self.assertEqual(list(out["amount"]), [5000.0, 6000.0])   # x1000

    def test_apply_unit_normalization_leaves_ratio_columns_untouched(self):  # T2
        out = _FactorProvider()._apply_unit_normalization(
            _frame(
                volume=[10], amount=[5.0],
                pct_change=[1.5], turnover_rate=[0.4],
                volume_ratio=[1.2], returns=[0.01],
            )
        )
        self.assertEqual(list(out["pct_change"]), [1.5])
        self.assertEqual(list(out["turnover_rate"]), [0.4])
        self.assertEqual(list(out["volume_ratio"]), [1.2])
        self.assertEqual(list(out["returns"]), [0.01])

    def test_apply_unit_normalization_noop_when_factors_are_one(self):  # T3
        class _PlainProvider(_FactorProvider):
            VOLUME_TO_SHARES = 1.0
            AMOUNT_TO_YUAN = 1.0

        out = _PlainProvider()._apply_unit_normalization(
            _frame(volume=[10, 20], amount=[5.0, 6.0])
        )
        self.assertEqual(list(out["volume"]), [10, 20])
        self.assertEqual(list(out["amount"]), [5.0, 6.0])

    def test_apply_unit_normalization_handles_missing_amount(self):  # T4
        out = _FactorProvider()._apply_unit_normalization(_frame(volume=[10]))
        self.assertEqual(list(out["volume"]), [1000])
        self.assertNotIn("amount", out.columns)

    def test_apply_unit_normalization_handles_empty_frame(self):  # T4b
        self.assertTrue(_FactorProvider()._apply_unit_normalization(pd.DataFrame()).empty)

    def test_normalize_quote_units_scales_dict(self):  # T1-quote
        q = _FactorProvider()._normalize_quote_units(
            {"symbol": "X", "volume": 10, "amount": 5.0}
        )
        self.assertEqual(q["volume"], 1000)
        self.assertEqual(q["amount"], 5000.0)

    def test_normalize_quote_units_tolerates_missing_keys(self):  # T1-quote-edge
        q = _FactorProvider()._normalize_quote_units({"symbol": "X"})
        self.assertEqual(q, {"symbol": "X"})


class TushareNormalizationTests(unittest.TestCase):
    """Phase 2: tushare history + derived quote land in shares + yuan."""

    def test_history_frame_normalized_to_shares_and_yuan(self):  # T5
        provider = TushareProvider(api_key="dummy")
        raw = pd.DataFrame(
            {
                "trade_date": ["20260528"],
                "ts_code": ["000001.SZ"],
                "open": [10.0], "high": [10.5], "low": [9.9], "close": [10.2],
                "vol": [1000.0],    # 1000 手
                "amount": [500.0],  # 500 千元
            }
        )
        out = provider._normalize_history_frame(raw)
        self.assertEqual(float(out["volume"].iloc[0]), 100000.0)  # 1000 x 100 股
        self.assertEqual(float(out["amount"].iloc[0]), 500000.0)  # 500 x 1000 元

    def test_quote_derives_normalized_units_without_double_scaling(self):  # T6
        provider = TushareProvider(api_key="dummy")
        normalized = pd.DataFrame(
            {
                "open": [10.0], "high": [10.5], "low": [9.9], "close": [10.2],
                "pre_close": [10.3], "change": [-0.1], "pct_change": [-0.97],
                "volume": [100000.0], "amount": [500000.0],
            },
            index=pd.to_datetime(["2026-05-28"]),
        )
        with patch.object(provider, "get_historical_data", return_value=normalized):
            quote = provider.get_latest_quote("000001.SZ")
        self.assertEqual(quote["volume"], 100000)     # already shares
        self.assertEqual(quote["amount"], 500000.0)   # already yuan


class AKShareNormalizationTests(unittest.TestCase):
    """Phase 3: akshare spot quote normalized (volume手->股, amount already 元)."""

    def test_quote_units_normalized(self):  # T7
        provider = AKShareProvider()
        spot = pd.DataFrame(
            {
                "代码": ["000001"], "名称": ["平安银行"],
                "最新价": [10.2], "涨跌额": [-0.1], "涨跌幅": [-0.97],
                "成交量": [1000],       # 手
                "成交额": [500000.0],   # 元
                "最高": [10.5], "最低": [9.9], "今开": [10.0], "昨收": [10.3],
            }
        )
        with patch.object(akshare_mod, "AKSHARE_AVAILABLE", True), \
                patch.object(provider, "_get_all_stocks_spot", return_value=spot):
            quote = provider.get_latest_quote("000001")
        self.assertNotIn("error", quote)
        self.assertEqual(quote["volume"], 100000)     # 1000 手 x 100
        self.assertEqual(quote["amount"], 500000.0)   # 元, unchanged


class CrossSourceConsistencyTests(unittest.TestCase):
    """Phase 4: the regression that motivated this change."""

    def test_tushare_and_yahoo_volume_same_scale(self):  # T8
        # Same real-world activity: 9007 手 == 900700 股.
        ts_out = TushareProvider(api_key="dummy")._normalize_history_frame(
            pd.DataFrame(
                {
                    "trade_date": ["20260528"], "ts_code": ["000001.SZ"],
                    "open": [10.0], "high": [10.5], "low": [9.9], "close": [10.2],
                    "vol": [9007.0], "amount": [1000.0],
                }
            )
        )
        y_out = YahooFinanceProvider()._standardize_dataframe(
            pd.DataFrame(
                {"Open": [10.0], "High": [10.5], "Low": [9.9], "Close": [10.2], "Volume": [900700]},
                index=pd.to_datetime(["2026-05-28"]),
            )
        )
        self.assertEqual(
            float(ts_out["volume"].iloc[0]), float(y_out["volume"].iloc[0])
        )


if __name__ == "__main__":
    unittest.main()

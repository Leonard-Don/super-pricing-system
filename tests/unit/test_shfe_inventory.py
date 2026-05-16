"""Unit tests for the SHFE inventory adapter (Phase B).

The adapter calls ``akshare.futures_inventory_em(symbol=...)`` under the hood;
all tests stub akshare so they never hit the network.
"""

from __future__ import annotations

import sys
from types import SimpleNamespace

import pandas as pd
import pytest

from src.data.alternative.macro_hf.shfe_inventory import (
    SHFE_METALS,
    SHFEInventoryProvider,
)


def _frame(stocks):
    """Build an akshare-shaped DataFrame from a list of inventory values."""
    rows = []
    for i, stock in enumerate(stocks):
        rows.append({"日期": f"2026-03-{i + 1:02d}", "库存": int(stock)})
    df = pd.DataFrame(rows)
    df["增减"] = df["库存"].diff()
    return df


@pytest.fixture
def patch_akshare(monkeypatch):
    """Patch akshare.futures_inventory_em via a sys.modules stub."""

    calls: list[str] = []

    def _factory(symbol_to_df, exception=None):
        def _futures_inventory_em(symbol: str = ""):
            calls.append(symbol)
            if exception is not None:
                raise exception
            if symbol in symbol_to_df:
                return symbol_to_df[symbol]
            return pd.DataFrame()

        fake_module = SimpleNamespace(futures_inventory_em=_futures_inventory_em)
        monkeypatch.setitem(sys.modules, "akshare", fake_module)
        return calls

    return _factory


def test_get_inventory_returns_live_payload(patch_akshare):
    df = _frame([100, 105, 110, 108, 107, 106, 100])  # weekly change negative
    patch_akshare({"沪铜": df})

    provider = SHFEInventoryProvider()
    payload = provider.get_inventory("copper")

    assert payload["metal"] == "copper"
    assert payload["source_mode"] == "live"
    assert payload["lag_days"] == 1
    assert payload["coverage"] == 1.0
    assert payload["data"] is not None
    inv = payload["data"]
    assert inv["latest_stock"] == 100
    # week_ago = day 1 stock (since 7 rows, iloc[-6] = day 2 value=105)
    assert inv["week_ago_stock"] == 105
    # weekly_change_pct = (100 - 105) / 105 * 100 ≈ -4.76
    assert inv["weekly_change_pct"] == round((100 - 105) / 105 * 100, 2)
    assert inv["data_points"] == 7


def test_get_inventory_unknown_metal_returns_error(patch_akshare):
    patch_akshare({})  # akshare won't actually be called
    provider = SHFEInventoryProvider()
    out = provider.get_inventory("unobtainium")
    assert "error" in out
    assert "不支持" in out["error"]


def test_get_inventory_empty_dataframe_graceful(patch_akshare):
    patch_akshare({"沪铜": pd.DataFrame()})
    provider = SHFEInventoryProvider()
    out = provider.get_inventory("copper")
    assert out["data"] is None
    assert "error" in out


def test_get_inventory_akshare_exception_is_degraded(patch_akshare):
    patch_akshare({}, exception=RuntimeError("network down"))
    provider = SHFEInventoryProvider()
    out = provider.get_inventory("copper")
    assert out["data"] is None
    assert "akshare 调用失败" in out["error"]


def test_analyze_inventory_trend_destocking(patch_akshare):
    # weekly_change_pct < -2 → destocking, signal=1
    df = _frame([100, 100, 100, 100, 100, 100, 90])
    patch_akshare({"沪铜": df})

    provider = SHFEInventoryProvider()
    trend = provider.analyze_inventory_trend("copper")
    assert trend["trend"] == "destocking"
    assert trend["signal"] == 1
    assert trend["region"] == "SHFE"
    assert trend["source_mode"] == "live"
    assert trend["confidence"] > 0


def test_analyze_inventory_trend_restocking(patch_akshare):
    # weekly_change_pct > +2 → restocking, signal=-1
    df = _frame([100, 100, 100, 100, 100, 100, 115])
    patch_akshare({"沪铜": df})

    provider = SHFEInventoryProvider()
    trend = provider.analyze_inventory_trend("copper")
    assert trend["trend"] == "restocking"
    assert trend["signal"] == -1


def test_analyze_inventory_trend_stable(patch_akshare):
    df = _frame([100, 100, 100, 100, 100, 100, 101])  # +1% weekly
    patch_akshare({"沪铜": df})

    provider = SHFEInventoryProvider()
    trend = provider.analyze_inventory_trend("copper")
    assert trend["trend"] == "stable"
    assert trend["signal"] == 0


def test_analyze_inventory_trend_falls_back_when_data_missing(patch_akshare):
    patch_akshare({"沪铜": pd.DataFrame()})

    provider = SHFEInventoryProvider()
    trend = provider.analyze_inventory_trend("copper")
    assert trend["trend"] == "unknown"
    assert trend["signal"] == 0
    assert trend["region"] == "SHFE"
    assert trend["coverage"] == 0.0
    # 失败时 source_mode 报真实情况 (curated 兜底, 不冒充 live)
    assert trend["source_mode"] == "curated"


def test_get_all_metals_summary_partial(patch_akshare):
    # Only copper and aluminium return data; zinc/nickel come back empty.
    df = _frame([200, 200, 200, 200, 200, 200, 190])  # -5%
    patch_akshare(
        {
            "沪铜": df,
            "沪铝": df,
            # 沪锌, 镍 missing → empty DataFrame default
        }
    )

    provider = SHFEInventoryProvider()
    summary = provider.get_all_metals_summary()
    assert set(summary.keys()) == set(SHFE_METALS.keys())
    assert summary["copper"]["signal"] == 1  # destocking
    assert summary["aluminium"]["signal"] == 1
    assert summary["zinc"]["trend"] == "unknown"
    assert summary["nickel"]["trend"] == "unknown"


def test_get_supported_metals_lists_all_four():
    provider = SHFEInventoryProvider()
    assert set(provider.get_supported_metals()) == {
        "copper",
        "aluminium",
        "zinc",
        "nickel",
    }

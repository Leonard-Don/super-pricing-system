"""Unit tests for the block_trades alt-data provider.

The provider calls AkShare's block-trade disclosure endpoints:

- ``stock_dzjy_sctj()`` for market-wide daily block-trade totals
- ``stock_dzjy_mrtj(start_date=, end_date=)`` for per-ticker rolling-window rows

All tests stub ``akshare`` through ``sys.modules`` so the suite never touches
the network.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pandas as pd
import pytest

from src.data.alternative.alt_data_manager import AltDataManager
from src.data.alternative.base_alt_provider import AltDataCategory
from src.data.alternative.block_trades import BlockTradesProvider
from src.data.alternative.block_trades import provider as provider_module

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "scripts"))

import export_public_summary as export_module  # noqa: E402


def _today_iso() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _days_ago_iso(days: int) -> str:
    return (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")


def _make_summary_frame(rows: list[dict[str, Any]]) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "交易日期": row["trade_date"],
                "大宗交易成交总额": row.get("total", 0.0),
                "溢价成交总额": row.get("premium", 0.0),
                "折价成交总额": row.get("discount", 0.0),
            }
            for row in rows
        ]
    )


def _make_rollup_frame(rows: list[dict[str, Any]]) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "交易日期": row["trade_date"],
                "证券代码": row["ticker"],
                "证券简称": row.get("name", ""),
                "成交价": row.get("price", 0.0),
                "收盘价": row.get("close", 0.0),
                "成交总额": row.get("value", 0.0),
                "折溢率": row.get("premium_pct", 0.0),
                "成交笔数": row.get("n_trades", 1),
                # Leak-test columns: provider must drop brokerage-seat detail
                # before records/signals are emitted.
                "买方营业部": row.get("buyer_seat", "Sensitive Buyer Desk"),
                "卖方营业部": row.get("seller_seat", "Sensitive Seller Desk"),
            }
            for row in rows
        ]
    )


@pytest.fixture
def patch_akshare(monkeypatch: pytest.MonkeyPatch):
    state: dict[str, Any] = {"calls": []}

    def _factory(
        *,
        summary_df: pd.DataFrame | None = None,
        rollup_df: pd.DataFrame | None = None,
        summary_error: Exception | None = None,
        rollup_error: Exception | None = None,
    ) -> dict[str, Any]:
        def _summary() -> pd.DataFrame:
            state["calls"].append({"endpoint": "summary"})
            if summary_error:
                raise summary_error
            return summary_df if summary_df is not None else pd.DataFrame()

        def _rollup(start_date: str = "", end_date: str = "") -> pd.DataFrame:
            state["calls"].append(
                {"endpoint": "rollup", "start_date": start_date, "end_date": end_date}
            )
            if rollup_error:
                raise rollup_error
            return rollup_df if rollup_df is not None else pd.DataFrame()

        fake_module = SimpleNamespace(
            stock_dzjy_sctj=_summary,
            stock_dzjy_mrtj=_rollup,
        )
        monkeypatch.setitem(sys.modules, "akshare", fake_module)
        return state

    return _factory


def test_default_manager_registers_block_trades_provider() -> None:
    manager = AltDataManager()

    provider = manager.get_provider("block_trades")

    assert isinstance(provider, BlockTradesProvider)
    assert provider.category is AltDataCategory.INSIDER_FLOW


def test_happy_path_aggregates_market_ticker_and_industry_slices(
    patch_akshare,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    today = _today_iso()
    yesterday = _days_ago_iso(1)
    state = patch_akshare(
        summary_df=_make_summary_frame(
            [
                {
                    "trade_date": today,
                    "total": 3.0e8,
                    "premium": 2.0e8,
                    "discount": 1.0e8,
                }
            ]
        ),
        rollup_df=_make_rollup_frame(
            [
                {
                    "trade_date": today,
                    "ticker": "600519",
                    "name": "贵州茅台",
                    "value": 2.0e8,
                    "premium_pct": 3.0,
                    "n_trades": 2,
                },
                {
                    "trade_date": yesterday,
                    "ticker": "600519",
                    "name": "贵州茅台",
                    "value": 0.5e8,
                    "premium_pct": -1.0,
                    "n_trades": 1,
                },
                {
                    "trade_date": today,
                    "ticker": "300750",
                    "name": "宁德时代",
                    "value": 1.0e8,
                    "premium_pct": -2.0,
                    "n_trades": 1,
                },
            ]
        ),
    )
    monkeypatch.setattr(
        provider_module,
        "resolve_ticker_industry",
        lambda ticker: {"600519": "白酒", "300750": "新能源汽车"}.get(ticker),
    )

    provider = BlockTradesProvider()
    raw = provider.fetch()
    parsed = provider.parse(raw)
    records = provider.normalize(parsed)
    signal = provider.to_signal(records)

    endpoints = [call["endpoint"] for call in state["calls"]]
    assert endpoints == ["summary", "rollup"]

    record_types = {(record.metadata or {}).get("record_type") for record in records}
    assert record_types == {
        "block_trade_daily_summary",
        "ticker_block_trade_aggregate",
        "industry_block_trade_signal",
    }

    ticker_rows = {
        row["ticker"]: row
        for row in parsed
        if row["record_type"] == "ticker_block_trade_aggregate"
    }
    assert ticker_rows["600519"]["n_trades_in_window"] == 3
    assert ticker_rows["600519"]["net_flow"] == pytest.approx(1.5e8)
    assert ticker_rows["600519"]["dominant_side"] == "buy"
    assert ticker_rows["300750"]["net_flow"] == pytest.approx(-1.0e8)
    assert ticker_rows["300750"]["dominant_side"] == "sell"

    industry_rows = {
        row["industry"]: row
        for row in parsed
        if row["record_type"] == "industry_block_trade_signal"
    }
    assert industry_rows["白酒"]["net_flow_billion"] == pytest.approx(1.5)
    assert industry_rows["新能源汽车"]["net_flow_billion"] == pytest.approx(-1.0)

    assert signal["last_trade_date"] == today
    assert signal["total_daily_value_billion"] == pytest.approx(3.0)
    assert signal["avg_premium_pct"] == pytest.approx(33.3333)
    assert signal["signal"] == 1
    assert signal["confidence"] == pytest.approx(0.72)
    assert signal["top_inflow_industries"][0]["industry"] == "白酒"
    assert signal["top_outflow_industries"][0]["industry"] == "新能源汽车"
    assert signal["top_n_concentrated_tickers"][0]["ticker"] == "600519"

    daily_record = next(
        record
        for record in records
        if (record.metadata or {}).get("record_type") == "block_trade_daily_summary"
    )
    assert daily_record.category is AltDataCategory.INSIDER_FLOW
    assert daily_record.source == "block_trades:block_trade_daily_summary"
    assert daily_record.metadata["source_mode"] == "public_disclosure"
    assert daily_record.metadata["lag_days"] == 1
    assert daily_record.metadata["coverage"] == pytest.approx(1.0)

    blob = json.dumps(
        {
            "parsed": parsed,
            "records": [record.to_dict() for record in records],
            "signal": signal,
        },
        ensure_ascii=False,
    )
    assert "买方营业部" not in blob
    assert "卖方营业部" not in blob
    assert "Sensitive Buyer Desk" not in blob
    assert "Sensitive Seller Desk" not in blob


def test_partial_response_still_surfaces_daily_summary(patch_akshare) -> None:
    today = _today_iso()
    patch_akshare(
        summary_df=_make_summary_frame(
            [{"trade_date": today, "total": 1.2e8, "premium": 0.3e8, "discount": 0.9e8}]
        ),
        rollup_error=RuntimeError("akshare 500"),
    )

    provider = BlockTradesProvider()
    signal = provider.run_pipeline()

    assert signal["partial_response"] is True
    assert signal["total_slices_responded"] == 1
    assert signal["last_trade_date"] == today
    assert signal["total_daily_value_billion"] == pytest.approx(1.2)
    assert signal["top_inflow_industries"] == []
    assert signal["confidence"] == pytest.approx(0.36)


def test_empty_response_graceful_degradation(patch_akshare) -> None:
    patch_akshare(
        summary_error=RuntimeError("exchange offline"),
        rollup_error=RuntimeError("exchange offline"),
    )

    provider = BlockTradesProvider()
    signal = provider.run_pipeline()

    assert signal["record_count"] == 0
    assert signal["confidence"] == 0.0
    assert signal["top_inflow_industries"] == []
    assert signal["top_outflow_industries"] == []
    assert signal["top_n_concentrated_tickers"] == []
    assert signal.get("low_coverage") is True
    assert signal["total_slices_responded"] == 0


def test_unexpected_rollup_schema_drops_gracefully(patch_akshare) -> None:
    patch_akshare(
        summary_df=_make_summary_frame([{"trade_date": _today_iso(), "total": 1.0e8}]),
        rollup_df=pd.DataFrame(
            [
                {
                    "bad_date": _today_iso(),
                    "bad_ticker": "600519",
                    "bad_value": 1.0e8,
                }
            ]
        ),
    )

    provider = BlockTradesProvider()
    raw = provider.fetch()
    by_slice = {slice_payload["slice"]: slice_payload for slice_payload in raw}

    assert by_slice["daily_ticker_rollup"]["error"] == "unexpected_schema"
    assert by_slice["daily_ticker_rollup"]["rows"] == []


def test_public_summary_block_trades_section_populated(tmp_path: Path) -> None:
    providers_dir = tmp_path / "providers"
    providers_dir.mkdir()
    snapshot = {
        "provider": "block_trades",
        "signal": {
            "source": "block_trades",
            "category": "insider_flow",
            "strength": 0.45,
            "score": 0.12,
            "confidence": 0.72,
            "record_count": 6,
            "last_trade_date": "2026-05-17",
            "total_daily_value_billion": 12.5,
            "avg_premium_pct": 2.4,
            "top_inflow_industries": [
                {"industry": "白酒", "net_flow_billion": 2.2, "n_tickers_traded": 3}
            ],
            "top_outflow_industries": [
                {"industry": "新能源汽车", "net_flow_billion": -1.4, "n_tickers_traded": 2}
            ],
            "top_n_concentrated_tickers": [
                {
                    "ticker": "600519",
                    "stock_name": "贵州茅台",
                    "industry": "白酒",
                    "n_trades_in_window": 5,
                    "net_flow_billion": 1.8,
                    "dominant_side": "buy",
                }
            ],
            "timestamp": "2026-05-17T08:00:00.000000",
        },
        "snapshot_timestamp": "2026-05-17T08:00:00.000000",
        "refresh_status": {"provider": "block_trades"},
        "records": [
            {
                "raw_value": {
                    "record_type": "ticker_block_trade_aggregate",
                    "ticker": "600519",
                    "买方营业部": "Sensitive Buyer Desk",
                }
            }
        ],
    }
    (providers_dir / "block_trades.json").write_text(
        json.dumps(snapshot), encoding="utf-8"
    )

    payload = export_module.build_public_summary(
        providers_dir,
        generated_at="2026-05-17T08:30:00+00:00",
        include_components_health=False,
    )
    block = payload["providers"]["block_trades"]

    assert block["last_trade_date"] == "2026-05-17"
    assert block["total_daily_value_billion"] == pytest.approx(12.5)
    assert block["avg_premium_pct"] == pytest.approx(2.4)
    assert block["top_inflow_industries"][0]["industry"] == "白酒"
    assert block["top_outflow_industries"][0]["industry"] == "新能源汽车"
    assert block["top_concentrated_tickers"][0]["ticker"] == "600519"
    assert block["evidence_link"] == {
        "component": "block_trades",
        "component_zh": "大宗交易",
        "source_mode": "public_disclosure",
        "source_mode_zh": "公开披露",
        "source": "SSE/SZSE aggregate block-trade disclosures",
        "audit_ref": "block-trades-provider",
        "last_refresh_at": "2026-05-17T08:00:00.000000",
        "redaction": "aggregate_only_no_brokerage_seats",
    }
    assert "snapshot_path" not in block["evidence_link"]
    assert "records" not in block["evidence_link"]

    blob = json.dumps(payload, ensure_ascii=False)
    assert "Sensitive Buyer Desk" not in blob
    assert "买方营业部" not in blob
    assert "cache/alt_data/providers" not in blob

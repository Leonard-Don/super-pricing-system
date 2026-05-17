"""Unit tests for the northbound (HSGT) alt-data provider (Phase F3).

The provider talks to three AkShare endpoints:

- ``stock_hsgt_hist_em(symbol="北向资金")`` — daily netflow history
- ``stock_hsgt_hold_stock_em(market=..., indicator=...)`` — per-stock holdings
- ``stock_hsgt_board_rank_em(symbol=..., indicator=...)`` — industry rank

All tests stub akshare via ``sys.modules`` so the suite never touches
the network — same pattern as ``tests/unit/test_fund_holdings_provider.py``
and ``tests/unit/test_shfe_inventory.py``.
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

from src.data.alternative.base_alt_provider import AltDataCategory
from src.data.alternative.northbound import NorthboundProvider

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "scripts"))

import export_public_summary as export_module  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_history_frame(rows: list[dict[str, Any]]) -> pd.DataFrame:
    """Build an akshare-shaped HSGT history frame (newest entries last).

    ``rows`` items expect ``date`` (str ``YYYY-MM-DD``) and
    ``netflow`` (float, 亿 CNY).
    """

    records = [
        {
            "日期": r["date"],
            "当日成交净买额": r["netflow"],
            "历史累计净买额": r.get("cumulative", 0.0),
        }
        for r in rows
    ]
    return pd.DataFrame(records)


def _make_holdings_frame(rows: list[dict[str, Any]]) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "股票代码": r["ticker"],
                "股票名称": r.get("name", ""),
                "所属行业": r.get("industry", ""),
                "持股市值": r.get("holding_value", 0.0),
                "今日净买额": r.get("netbuy", 0.0),
            }
            for r in rows
        ]
    )


def _make_industry_frame(rows: list[dict[str, Any]]) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "名称": r["industry"],
                "北向净买入": r["netbuy"],
            }
            for r in rows
        ]
    )


def _today_iso() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _days_ago_iso(days: int) -> str:
    return (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")


@pytest.fixture
def patch_akshare(monkeypatch):
    """Patch the three HSGT akshare functions via a sys.modules stub."""

    state: dict[str, Any] = {"calls": []}

    def _factory(
        *,
        hist_df: pd.DataFrame | None = None,
        holdings_df: pd.DataFrame | None = None,
        industry_df: pd.DataFrame | None = None,
        hist_error: Exception | None = None,
        holdings_error: Exception | None = None,
        industry_error: Exception | None = None,
    ):
        def _hist(symbol: str = "北向资金") -> pd.DataFrame:
            state["calls"].append({"endpoint": "hist", "symbol": symbol})
            if hist_error:
                raise hist_error
            return hist_df if hist_df is not None else pd.DataFrame()

        def _hold(market: str = "沪股通", indicator: str = "5日排行") -> pd.DataFrame:
            state["calls"].append(
                {"endpoint": "hold", "market": market, "indicator": indicator}
            )
            if holdings_error:
                raise holdings_error
            return holdings_df if holdings_df is not None else pd.DataFrame()

        def _board(symbol: str = "北向资金增持行业板块排行", indicator: str = "今日") -> pd.DataFrame:
            state["calls"].append(
                {"endpoint": "board", "symbol": symbol, "indicator": indicator}
            )
            if industry_error:
                raise industry_error
            return industry_df if industry_df is not None else pd.DataFrame()

        fake_module = SimpleNamespace(
            stock_hsgt_hist_em=_hist,
            stock_hsgt_hold_stock_em=_hold,
            stock_hsgt_board_rank_em=_board,
        )
        monkeypatch.setitem(sys.modules, "akshare", fake_module)
        return state

    return _factory


# ---------------------------------------------------------------------------
# Provider behavioural tests
# ---------------------------------------------------------------------------


def test_happy_path_emits_record_types_across_slices(patch_akshare):
    """5 days of history + 3 industry rows + 2 holding rows → records cover all 3 types."""

    hist_rows = [
        {"date": _days_ago_iso(4), "netflow": 12.3, "cumulative": 100.0},
        {"date": _days_ago_iso(3), "netflow": -5.1, "cumulative": 94.9},
        {"date": _days_ago_iso(2), "netflow": 8.7, "cumulative": 103.6},
        {"date": _days_ago_iso(1), "netflow": 22.5, "cumulative": 126.1},
        {"date": _today_iso(), "netflow": 35.4, "cumulative": 161.5},
    ]
    holding_rows = [
        {
            "ticker": "600519",
            "name": "贵州茅台",
            "industry": "白酒",
            "holding_value": 1.23e11,
            "netbuy": 2.5e8,
        },
        {
            "ticker": "300750",
            "name": "宁德时代",
            "industry": "新能源汽车",
            "holding_value": 8.7e10,
            "netbuy": -1.2e8,
        },
    ]
    industry_rows = [
        {"industry": "白酒", "netbuy": 15.2},
        {"industry": "新能源汽车", "netbuy": -8.4},
        {"industry": "半导体", "netbuy": 12.8},
    ]

    state = patch_akshare(
        hist_df=_make_history_frame(hist_rows),
        holdings_df=_make_holdings_frame(holding_rows),
        industry_df=_make_industry_frame(industry_rows),
    )

    provider = NorthboundProvider()
    raw = provider.fetch()
    parsed = provider.parse(raw)
    records = provider.normalize(parsed)
    signal = provider.to_signal(records)

    # Three endpoints called once each.
    endpoints = [c["endpoint"] for c in state["calls"]]
    assert set(endpoints) == {"hist", "hold", "board"}

    # Records span all three record_types.
    record_types = {(r.metadata or {}).get("record_type") for r in records}
    assert record_types == {"netflow_daily", "top_holding_stock", "industry_netflow_agg"}

    # Latest daily netflow is the most recent row (35.4 亿 inflow).
    assert signal["last_trade_date"] == _today_iso()
    assert signal["daily_netflow_cny_billion"] == pytest.approx(35.4)

    # Cumulative 30d = sum of all 5 daily rows (within 30-day window).
    expected_cumulative = round(12.3 + (-5.1) + 8.7 + 22.5 + 35.4, 4)
    assert signal["cumulative_30d_cny_billion"] == pytest.approx(expected_cumulative)

    # Top inflow / outflow industries from the rank frame.
    top_inflow = [item["industry"] for item in signal["top_inflow_industries"]]
    top_outflow = [item["industry"] for item in signal["top_outflow_industries"]]
    assert "白酒" in top_inflow
    assert "半导体" in top_inflow
    assert "新能源汽车" in top_outflow

    # Direction = inflow when latest > 0; signal = +1 when latest > 5 亿 deadband.
    assert signal["signal"] == 1
    assert signal["source_mode_summary"]["dominant"] == "public_disclosure"


def test_outflow_day_handled_correctly(patch_akshare):
    """Latest day is a negative netflow → direction=out, signal=-1."""

    hist_rows = [
        {"date": _days_ago_iso(1), "netflow": 10.0, "cumulative": 100.0},
        # Today's row is the most recent and is heavily negative.
        {"date": _today_iso(), "netflow": -45.7, "cumulative": 54.3},
    ]
    patch_akshare(
        hist_df=_make_history_frame(hist_rows),
        holdings_df=pd.DataFrame(),
        industry_df=pd.DataFrame(),
    )

    provider = NorthboundProvider()
    signal = provider.run_pipeline()

    assert signal["last_trade_date"] == _today_iso()
    assert signal["daily_netflow_cny_billion"] == pytest.approx(-45.7)
    assert signal["signal"] == -1
    # cumulative_30d = 10.0 + (-45.7) = -35.7
    assert signal["cumulative_30d_cny_billion"] == pytest.approx(-35.7)


def test_empty_response_graceful_degradation(patch_akshare):
    """All three endpoints raise → low_coverage signal, no records, no crash."""

    patch_akshare(
        hist_error=RuntimeError("hkex offline"),
        holdings_error=RuntimeError("hkex offline"),
        industry_error=RuntimeError("hkex offline"),
    )

    provider = NorthboundProvider()
    signal = provider.run_pipeline()

    assert signal["record_count"] == 0
    assert signal["confidence"] == 0.0
    assert signal["top_inflow_industries"] == []
    assert signal["top_outflow_industries"] == []
    assert signal["daily_netflow_cny_billion"] == 0.0
    assert signal.get("low_coverage") is True
    assert signal["total_slices_responded"] == 0


def test_partial_response_marks_partial_flag(patch_akshare):
    """Only daily history responds → partial_response=True; signal still surfaces."""

    hist_rows = [
        {"date": _today_iso(), "netflow": 18.0, "cumulative": 88.0},
    ]
    patch_akshare(
        hist_df=_make_history_frame(hist_rows),
        holdings_error=RuntimeError("hkex 500"),
        industry_error=RuntimeError("hkex 500"),
    )

    provider = NorthboundProvider()
    signal = provider.run_pipeline()

    assert signal["partial_response"] is True
    assert signal["total_slices_responded"] == 1
    # We still know today's netflow even with two endpoints dark.
    assert signal["daily_netflow_cny_billion"] == pytest.approx(18.0)
    # Top inflow industries empty since industry endpoint failed.
    assert signal["top_inflow_industries"] == []


def test_record_schema_carries_metadata_contract(patch_akshare):
    """Per-record metadata mirrors the brief contract.

    - ``source_mode="public_disclosure"``
    - ``lag_days=1``
    - ``category="foreign_capital_flow"``
    - ``record_type`` ∈ {netflow_daily, top_holding_stock, industry_netflow_agg}
    """

    patch_akshare(
        hist_df=_make_history_frame(
            [{"date": _today_iso(), "netflow": 7.5, "cumulative": 50.0}]
        ),
        holdings_df=_make_holdings_frame(
            [
                {
                    "ticker": "600519",
                    "name": "贵州茅台",
                    "industry": "白酒",
                    "holding_value": 1.0e11,
                    "netbuy": 1.0e8,
                }
            ]
        ),
        industry_df=_make_industry_frame([{"industry": "白酒", "netbuy": 5.5}]),
    )

    provider = NorthboundProvider()
    raw = provider.fetch()
    parsed = provider.parse(raw)
    records = provider.normalize(parsed)

    assert records, "expected at least one record"

    by_type: dict[str, Any] = {}
    for rec in records:
        rt = (rec.metadata or {}).get("record_type")
        by_type.setdefault(rt, rec)

    assert {"netflow_daily", "top_holding_stock", "industry_netflow_agg"}.issubset(
        by_type.keys()
    )

    # Daily record sanity
    daily = by_type["netflow_daily"]
    assert daily.category is AltDataCategory.FOREIGN_CAPITAL_FLOW
    assert daily.metadata["source_mode"] == "public_disclosure"
    assert daily.metadata["lag_days"] == 1
    assert daily.metadata["category"] == "foreign_capital_flow"
    assert daily.source == "northbound:netflow_daily"
    assert daily.raw_value["direction"] == "in"

    # Industry aggregate sanity
    industry = by_type["industry_netflow_agg"]
    assert industry.metadata["industry"] == "白酒"
    assert industry.source == "northbound:industry_netflow_agg"

    # Top-holding sanity — ticker prefix normalisation already covered in parse.
    holding = by_type["top_holding_stock"]
    assert holding.raw_value["ticker"] == "600519"
    assert holding.metadata["ticker"] == "600519"


def test_unexpected_history_schema_drops_gracefully(patch_akshare):
    """Akshare rotating history column names → empty rows + warning, not a crash."""

    rogue = pd.DataFrame(
        [
            {"some_other_date_col": "2026-05-17", "foo_netflow": 10.0},
        ]
    )
    patch_akshare(
        hist_df=rogue,
        holdings_df=pd.DataFrame(),
        industry_df=pd.DataFrame(),
    )

    provider = NorthboundProvider()
    raw = provider.fetch()
    # First slice (daily history) should report unexpected_schema.
    by_slice = {s["slice"]: s for s in raw}
    assert by_slice["daily_history"]["error"] == "unexpected_schema"
    assert by_slice["daily_history"]["rows"] == []


def test_industry_aggregation_correct_after_parse(patch_akshare):
    """Per-industry netflow rows survive parse → industry_netflow_agg records."""

    industry_rows = [
        {"industry": "白酒", "netbuy": 22.0},
        {"industry": "新能源汽车", "netbuy": -15.5},
        {"industry": "半导体", "netbuy": 17.3},
        {"industry": "医药", "netbuy": -4.1},
        {"industry": "银行", "netbuy": 9.2},
    ]
    patch_akshare(
        hist_df=_make_history_frame(
            [{"date": _today_iso(), "netflow": 30.0, "cumulative": 100.0}]
        ),
        holdings_df=pd.DataFrame(),
        industry_df=_make_industry_frame(industry_rows),
    )

    provider = NorthboundProvider()
    raw = provider.fetch()
    parsed = provider.parse(raw)

    industry_parsed = [r for r in parsed if r["record_type"] == "industry_netflow_agg"]
    assert len(industry_parsed) == 5
    # Spot check signed magnitudes
    by_name = {r["industry"]: r for r in industry_parsed}
    assert by_name["白酒"]["netbuy_cny_billion"] == pytest.approx(22.0)
    assert by_name["新能源汽车"]["direction"] == "out"
    assert by_name["半导体"]["direction"] == "in"

    # Signal pulls the top-N by signed magnitude.
    signal = provider.to_signal(provider.normalize(parsed))
    inflow_names = [item["industry"] for item in signal["top_inflow_industries"]]
    outflow_names = [item["industry"] for item in signal["top_outflow_industries"]]
    # 白酒 (22) and 半导体 (17.3) should be top inflow; 新能源汽车 (-15.5) top outflow.
    assert inflow_names[0] == "白酒"
    assert "半导体" in inflow_names
    assert outflow_names[0] == "新能源汽车"


def test_run_pipeline_persists_history(patch_akshare):
    """A successful run extends ``_history`` and sets ``_last_update``."""

    patch_akshare(
        hist_df=_make_history_frame(
            [{"date": _today_iso(), "netflow": 12.0, "cumulative": 50.0}]
        ),
        holdings_df=_make_holdings_frame(
            [
                {
                    "ticker": "000858",
                    "name": "五粮液",
                    "industry": "白酒",
                    "holding_value": 5.0e10,
                    "netbuy": 5.0e7,
                }
            ]
        ),
        industry_df=_make_industry_frame([{"industry": "白酒", "netbuy": 6.0}]),
    )

    provider = NorthboundProvider()
    signal = provider.run_pipeline()
    assert signal["record_count"] >= 1
    assert len(provider._history) >= 1
    assert provider._last_update is not None


# ---------------------------------------------------------------------------
# Public summary export integration
# ---------------------------------------------------------------------------


def test_public_summary_northbound_section_populated(tmp_path: Path):
    """Distiller writes the northbound block — aggregates only, no per-stock leakage."""

    providers_dir = tmp_path / "providers"
    providers_dir.mkdir()

    snapshot = {
        "provider": "northbound",
        "signal": {
            "source": "northbound",
            "category": "foreign_capital_flow",
            "strength": 0.62,
            "score": 0.5,
            "confidence": 0.62,
            "record_count": 30,
            "last_trade_date": "2026-05-17",
            "daily_netflow_cny_billion": 35.4,
            "cumulative_30d_cny_billion": 412.7,
            "top_inflow_industries": [
                {"industry": "白酒", "netbuy_cny_billion": 22.0, "direction": "in"},
                {"industry": "半导体", "netbuy_cny_billion": 17.3, "direction": "in"},
                {"industry": "银行", "netbuy_cny_billion": 9.2, "direction": "in"},
            ],
            "top_outflow_industries": [
                {
                    "industry": "新能源汽车",
                    "netbuy_cny_billion": -15.5,
                    "direction": "out",
                },
                {"industry": "医药", "netbuy_cny_billion": -4.1, "direction": "out"},
            ],
            "source_mode_summary": {
                "counts": {"public_disclosure": 30},
                "dominant": "public_disclosure",
            },
            "timestamp": "2026-05-17T08:00:00.000000",
        },
        "snapshot_timestamp": "2026-05-17T08:00:00.000000",
        "refresh_status": {"provider": "northbound"},
        # leak-test: must not appear in output
        "provider_info": {"last_update": "2026-05-17T08:00:00", "secret_token": "deadbeef"},
        "records": [
            {
                "raw_value": {
                    "record_type": "top_holding_stock",
                    "ticker": "600519",
                    "stock_name": "贵州茅台",
                    "holding_value_cny": 1.23e11,
                }
            }
        ],
    }
    (providers_dir / "northbound.json").write_text(
        json.dumps(snapshot), encoding="utf-8"
    )

    payload = export_module.build_public_summary(
        providers_dir,
        generated_at="2026-05-17T08:30:00+00:00",
        include_components_health=False,
    )
    nb = payload["providers"]["northbound"]

    assert nb["last_trade_date"] == "2026-05-17"
    assert nb["daily_netflow_cny_billion"] == pytest.approx(35.4)
    assert nb["cumulative_30d_cny_billion"] == pytest.approx(412.7)
    assert len(nb["top_inflow_industries"]) == 3
    assert len(nb["top_outflow_industries"]) == 2
    assert nb["top_inflow_industries"][0]["industry"] == "白酒"
    assert nb["top_outflow_industries"][0]["industry"] == "新能源汽车"

    # Per-stock detail and runtime envelope must not surface anywhere.
    blob = json.dumps(payload, ensure_ascii=False)
    assert "secret_token" not in blob
    assert "deadbeef" not in blob
    assert "600519" not in blob  # per-stock detail kept out of public summary
    assert "贵州茅台" not in blob
    assert "provider_info" not in nb
    assert "refresh_status" not in nb

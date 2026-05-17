"""Unit tests for the fund_holdings alt-data provider (Phase F2).

The provider calls ``akshare.fund_portfolio_hold_em(...)`` under the hood;
all tests stub akshare via ``sys.modules`` so the suite never hits the
network — same pattern as ``tests/unit/test_shfe_inventory.py``.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pandas as pd
import pytest

from src.data.alternative.fund_holdings import (
    CATALOG_VERSION,
    TOP_50_FUND_CATALOG,
    FundHoldingsProvider,
    get_top_50_codes,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "scripts"))

import export_public_summary as export_module  # noqa: E402

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_holdings_frame(
    rows: list[dict[str, Any]],
    quarter: str = "2026年1季度",
    columns: dict[str, str] | None = None,
) -> pd.DataFrame:
    """Build an akshare-shaped 十大持仓股 frame from row dicts.

    ``rows`` items expect ``ticker`` (str), ``name`` (str),
    ``weight_pct`` (float). Column names match the akshare 2026 release;
    pass ``columns`` to override and exercise the schema-flexibility
    branch.
    """

    column_map = columns or {
        "code": "股票代码",
        "name": "股票名称",
        "weight": "占净值比例",
        "quarter": "季度",
    }

    records = []
    for row in rows:
        records.append(
            {
                column_map["code"]: row["ticker"],
                column_map["name"]: row.get("name", ""),
                column_map["weight"]: row.get("weight_pct", 0.0),
                column_map["quarter"]: quarter,
            }
        )
    return pd.DataFrame(records)


@pytest.fixture
def patch_akshare(monkeypatch):
    """Patch ``akshare.fund_portfolio_hold_em`` via a sys.modules stub."""

    calls: list[dict[str, Any]] = []

    def _factory(
        symbol_to_df: dict[str, pd.DataFrame],
        *,
        per_symbol_exception: dict[str, Exception] | None = None,
        default_df: pd.DataFrame | None = None,
    ):
        def _fund_portfolio_hold_em(symbol: str = "", date: str = ""):
            calls.append({"symbol": symbol, "date": date})
            if per_symbol_exception and symbol in per_symbol_exception:
                raise per_symbol_exception[symbol]
            if symbol in symbol_to_df:
                return symbol_to_df[symbol]
            if default_df is not None:
                return default_df
            return pd.DataFrame()

        fake_module = SimpleNamespace(fund_portfolio_hold_em=_fund_portfolio_hold_em)
        monkeypatch.setitem(sys.modules, "akshare", fake_module)
        return calls

    return _factory


# ---------------------------------------------------------------------------
# Provider behavioural tests
# ---------------------------------------------------------------------------


def test_catalog_shape_meets_minimum_size():
    """Catalog must surface at least 30 unique fund codes (defensive bound)."""

    codes = get_top_50_codes()
    assert len(codes) >= 30, f"Catalog shrunk to {len(codes)} unique codes — refresh needed"
    assert len(codes) == len(set(codes)), "Catalog must have unique codes"
    assert all(len(code) == 6 for code in codes), "All codes must be 6-digit strings"
    assert CATALOG_VERSION  # non-empty


def test_happy_path_aggregates_holdings_across_funds(patch_akshare):
    """50 funds x overlapping top-10 -> per-ticker concentration metrics."""

    # Build holdings: 600519 (贵州茅台) held by 3 funds; 300750 (宁德时代) held by
    # 2 funds; everything else held by 1 fund each.
    holdings_per_fund: dict[str, pd.DataFrame] = {}
    catalog_codes = get_top_50_codes()
    # First 3 funds hold 600519; first 2 also hold 300750.
    holdings_per_fund[catalog_codes[0]] = _make_holdings_frame(
        [
            {"ticker": "600519", "name": "贵州茅台", "weight_pct": 8.5},
            {"ticker": "300750", "name": "宁德时代", "weight_pct": 7.2},
            {"ticker": "000858", "name": "五粮液", "weight_pct": 6.1},
        ]
    )
    holdings_per_fund[catalog_codes[1]] = _make_holdings_frame(
        [
            {"ticker": "600519", "name": "贵州茅台", "weight_pct": 9.1},
            {"ticker": "300750", "name": "宁德时代", "weight_pct": 6.8},
        ]
    )
    holdings_per_fund[catalog_codes[2]] = _make_holdings_frame(
        [{"ticker": "600519", "name": "贵州茅台", "weight_pct": 8.0}]
    )
    # Remaining funds: each gets a unique ticker so they don't pile up.
    for idx, code in enumerate(catalog_codes[3:], start=3):
        unique_ticker = f"{600000 + idx:06d}"
        holdings_per_fund[code] = _make_holdings_frame(
            [{"ticker": unique_ticker, "name": f"标的{idx}", "weight_pct": 5.0}]
        )

    calls = patch_akshare(holdings_per_fund)

    provider = FundHoldingsProvider()
    raw = provider.fetch()
    assert calls[0]["symbol"] == catalog_codes[0]
    assert "date" in calls[0]
    assert "indicator" not in calls[0]
    parsed = provider.parse(raw)
    records = provider.normalize(parsed)
    signal = provider.to_signal(records)

    # Top ticker should be 600519 (3 funds, ~25.6% combined weight).
    assert parsed[0]["ticker"] == "600519"
    assert parsed[0]["holding_fund_count"] == 3
    assert parsed[0]["total_aum_weight_pct"] == pytest.approx(8.5 + 9.1 + 8.0, rel=1e-3)
    assert parsed[0]["top_holder_fund_code"] == catalog_codes[1]  # 9.1% > 8.5% > 8.0%

    # Second ticker: 300750 (2 funds).
    assert parsed[1]["ticker"] == "300750"
    assert parsed[1]["holding_fund_count"] == 2

    # Signal carries the top concentration list.
    leaderboard = signal["top_concentration_tickers"]
    assert leaderboard[0]["ticker"] == "600519"
    assert leaderboard[0]["holding_fund_count"] == 3
    assert signal["total_funds_covered"] == len(catalog_codes)
    assert signal["total_funds_requested"] == len(catalog_codes)
    assert signal["confidence"] > 0.65  # full coverage → max confidence
    assert signal["catalog_version"] == CATALOG_VERSION
    assert signal["source_mode_summary"]["dominant"] == "public_disclosure"


def test_partial_response_degrades_confidence(patch_akshare):
    """When only 30 / 50 funds respond, confidence drops below 0.7."""

    catalog_codes = get_top_50_codes()
    responding_codes = catalog_codes[:30]
    failing_codes = catalog_codes[30:]

    holdings_per_fund = {
        code: _make_holdings_frame(
            [{"ticker": "600519", "name": "贵州茅台", "weight_pct": 7.0}]
        )
        for code in responding_codes
    }
    exceptions = {code: RuntimeError("akshare offline") for code in failing_codes}
    patch_akshare(holdings_per_fund, per_symbol_exception=exceptions)

    provider = FundHoldingsProvider()
    signal = provider.run_pipeline()

    # Confidence should reflect partial coverage (<0.7 ceiling).
    assert signal["confidence"] < 0.7
    assert signal["confidence"] > 0.0
    assert signal["partial_response"] is True
    assert signal["total_funds_responded"] == 30


def test_empty_response_graceful_degradation(patch_akshare):
    """Zero responding funds → signal stays valid with confidence 0."""

    catalog_codes = get_top_50_codes()
    exceptions = {code: RuntimeError("network") for code in catalog_codes}
    patch_akshare({}, per_symbol_exception=exceptions)

    provider = FundHoldingsProvider()
    signal = provider.run_pipeline()

    assert signal["record_count"] == 0
    assert signal["confidence"] == 0.0
    assert signal["top_concentration_tickers"] == []
    assert signal.get("low_coverage") is True


def test_per_ticker_record_schema(patch_akshare):
    """Records carry the expected fund_concentration_ticker fields."""

    catalog_codes = get_top_50_codes()
    holdings_per_fund = {
        catalog_codes[0]: _make_holdings_frame(
            [{"ticker": "600519", "name": "贵州茅台", "weight_pct": 7.5}]
        ),
        catalog_codes[1]: _make_holdings_frame(
            [{"ticker": "600519", "name": "贵州茅台", "weight_pct": 6.0}]
        ),
    }
    patch_akshare(
        holdings_per_fund,
        per_symbol_exception={
            code: RuntimeError("offline") for code in catalog_codes[2:]
        },
    )

    provider = FundHoldingsProvider()
    raw = provider.fetch()
    parsed = provider.parse(raw)
    records = provider.normalize(parsed)

    assert records, "Expected at least one record"
    rec = records[0]
    raw_value = rec.raw_value
    assert raw_value["record_type"] == "fund_concentration_ticker"
    assert raw_value["ticker"] == "600519"
    assert raw_value["holding_fund_count"] == 2
    assert raw_value["total_aum_weight_pct"] == pytest.approx(13.5)
    assert raw_value["top_holder_fund_code"] == catalog_codes[0]
    assert raw_value["top_holder_weight_pct"] == pytest.approx(7.5)
    # Metadata mirrors the task brief contract.
    metadata = rec.metadata
    assert metadata["source_mode"] == "public_disclosure"
    assert metadata["lag_days"] == 15
    assert metadata["category"] == "institutional_flow"
    assert metadata["catalog_version"] == CATALOG_VERSION
    # Source name lives on the record so SOURCE_TIER_RULES can target it.
    assert rec.source == "fund_holdings:concentration"


def test_ticker_normalization_handles_prefixed_codes(patch_akshare):
    """``SH600519`` / ``sz000858`` / numeric tickers normalize to 6-digit strings."""

    catalog_codes = get_top_50_codes()
    df = _make_holdings_frame(
        [
            {"ticker": "SH600519", "name": "贵州茅台", "weight_pct": 5.0},
            {"ticker": "sz000858", "name": "五粮液", "weight_pct": 4.0},
            {"ticker": 300750, "name": "宁德时代", "weight_pct": 3.5},
        ]
    )
    patch_akshare(
        {catalog_codes[0]: df},
        per_symbol_exception={
            code: RuntimeError("not in test") for code in catalog_codes[1:]
        },
    )

    provider = FundHoldingsProvider()
    raw = provider.fetch()
    parsed = provider.parse(raw)
    tickers = sorted({row["ticker"] for row in parsed})
    assert tickers == ["000858", "300750", "600519"]


def test_unexpected_schema_drops_gracefully(patch_akshare):
    """Akshare rotating column names → empty rows + warning, not a crash."""

    catalog_codes = get_top_50_codes()
    rogue_df = pd.DataFrame(
        [
            {"some_other_code_column": "600519", "occupancy": 8.5},
        ]
    )
    patch_akshare(
        {catalog_codes[0]: rogue_df},
        per_symbol_exception={
            code: RuntimeError("offline") for code in catalog_codes[1:]
        },
    )

    provider = FundHoldingsProvider()
    raw = provider.fetch()
    # First fund's rows should be empty due to unexpected schema.
    assert raw[0]["rows"] == []
    assert raw[0]["error"] == "unexpected_schema"


def test_run_pipeline_persists_history(patch_akshare):
    """A successful run extends ``_history`` for downstream evidence queries."""

    catalog_codes = get_top_50_codes()
    holdings_per_fund = {
        catalog_codes[i]: _make_holdings_frame(
            [{"ticker": "600519", "name": "贵州茅台", "weight_pct": 5.5}]
        )
        for i in range(10)
    }
    patch_akshare(
        holdings_per_fund,
        per_symbol_exception={
            code: RuntimeError("offline") for code in catalog_codes[10:]
        },
    )

    provider = FundHoldingsProvider()
    signal = provider.run_pipeline()
    assert signal["record_count"] >= 1
    # History is now populated and last_update is set.
    assert len(provider._history) >= 1
    assert provider._last_update is not None


def test_provider_info_surfaces_catalog_version():
    """``get_provider_info`` carries the curated catalog metadata."""

    provider = FundHoldingsProvider()
    info = provider.get_provider_info()
    assert info["catalog_version"] == CATALOG_VERSION
    assert info["catalog_size"] == len(get_top_50_codes())


# ---------------------------------------------------------------------------
# Public summary export integration
# ---------------------------------------------------------------------------


def test_public_summary_fund_holdings_section_populated(tmp_path: Path):
    """Distiller writes fund_holdings into the public summary correctly."""

    providers_dir = tmp_path / "providers"
    providers_dir.mkdir()

    snapshot = {
        "provider": "fund_holdings",
        "signal": {
            "source": "fund_holdings",
            "category": "insider_flow",
            "strength": 0.42,
            "score": 0.42,
            "confidence": 0.7,
            "record_count": 25,
            "total_funds_covered": 50,
            "total_funds_requested": 50,
            "catalog_version": "2026-Q1",
            "top_concentration_tickers": [
                {
                    "ticker": "600519",
                    "stock_name": "贵州茅台",
                    "holding_fund_count": 18,
                    "total_aum_weight_pct": 87.5,
                    "top_holder_fund_code": "110011",
                },
                {
                    "ticker": "300750",
                    "stock_name": "宁德时代",
                    "holding_fund_count": 16,
                    "total_aum_weight_pct": 72.4,
                    "top_holder_fund_code": "001475",
                },
            ],
            "source_mode_summary": {
                "counts": {"public_disclosure": 25},
                "dominant": "public_disclosure",
            },
            "timestamp": "2026-05-17T03:00:00.000000",
        },
        "snapshot_timestamp": "2026-05-17T03:00:00.000000",
        "refresh_status": {"provider": "fund_holdings"},
        # leak-test: must not appear in output
        "provider_info": {"last_update": "2026-05-17T03:00:00", "secret_key": "deadbeef"},
    }
    (providers_dir / "fund_holdings.json").write_text(
        json.dumps(snapshot), encoding="utf-8"
    )

    payload = export_module.build_public_summary(
        providers_dir,
        generated_at="2026-05-17T03:30:00+00:00",
        include_components_health=False,
    )
    fh = payload["providers"]["fund_holdings"]
    assert fh["catalog_version"] == "2026-Q1"
    assert fh["total_funds_covered"] == 50
    assert fh["total_funds_requested"] == 50
    leaderboard = fh["top_concentration_tickers"]
    assert leaderboard[0]["ticker"] == "600519"
    assert leaderboard[0]["holding_fund_count"] == 18
    assert leaderboard[1]["ticker"] == "300750"
    assert "top_holder_fund_code" not in leaderboard[0]

    # No sensitive leakage from the runtime envelope or per-fund attribution.
    blob = json.dumps(payload, ensure_ascii=False)
    assert "secret_key" not in blob
    assert "deadbeef" not in blob
    assert "top_holder_fund_code" not in blob
    assert "provider_info" not in fh
    assert "refresh_status" not in fh

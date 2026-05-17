"""北向资金 (northbound flows) alt-data provider.

Disclosure context
------------------

The Hong Kong Stock Exchange publishes the *daily aggregate* netflow of
foreign capital into A-shares via the 沪深港通 (Stock Connect, HSGT)
program. Three slices are useful for the macro-mispricing engine:

1. **Daily total netflow** (CNY ¥亿) — T+0 release. Positive = foreign
   capital inflow; negative = outflow.
2. **Per-stock current holdings** — the top names by aggregate northbound
   value. These are public via HKEx End-Of-Day disclosure files.
3. **Industry aggregation** — same per-stock holdings rolled up by sector.

Pipeline shape
--------------

Follows the standard ``BaseAltDataProvider`` four-stage contract:

- :meth:`fetch` calls AkShare's HSGT endpoints. The locked dependency line
  exposes ``stock_hsgt_hist_em(symbol="北向资金")`` for the daily history,
  ``stock_hsgt_hold_stock_em(market=…, indicator=…)`` for per-stock
  holdings, and ``stock_hsgt_board_rank_em(symbol=…, indicator=…)`` for
  industry-level netflow ranking. Each endpoint is called inside an
  isolated try/except so a single network blip on any one of them
  degrades to an empty payload rather than tanking the whole run.
- :meth:`parse` collapses the three frames into a unified, deterministic
  list of dicts tagged with ``record_type`` so :meth:`normalize` can
  branch on it.
- :meth:`normalize` emits one ``AltDataRecord`` per ``record_type``
  (``netflow_daily``, ``top_holding_stock``, ``industry_netflow_agg``)
  with ``category=AltDataCategory.FOREIGN_CAPITAL_FLOW``.
- :meth:`to_signal` collapses to a top-line summary: latest daily
  netflow, 30-day cumulative, and the top-N industry inflow/outflow
  lists used by the public-summary export.

Source mode
-----------

``source_mode="public_disclosure"``, ``lag_days=1`` (HSGT publishes the
day's net buy by T+1 morning; we mark records with a 1-day lag to keep
the freshness-weighted evidence honest). ``confidence`` peaks at 0.75
when all three slices return data; degrades when one of them is empty.

Test seam
---------

Akshare is imported lazily inside the per-slice fetch helpers so the
unit tests can stub the module via ``sys.modules`` — same pattern as
``tests/unit/test_fund_holdings_provider.py`` and
``tests/unit/test_shfe_inventory.py``. Tests pin the modern
``stock_hsgt_*`` function names so a future API drift does not pass
silently.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, cast

import pandas as pd

from ..base_alt_provider import AltDataCategory, AltDataRecord, BaseAltDataProvider

logger = logging.getLogger(__name__)


# Confidence cap when all three slices (daily, top-holdings, industry) return
# data. Capped at 0.75 because HSGT is *public* disclosure with a 1-day lag —
# downstream weighted-evidence should weight it slightly above live exchange
# tickers but below the curated people_layer.
_MAX_CONFIDENCE = 0.75

# How many top-holding stocks to keep when ranking the per-stock view. The
# public summary export only ever ships *aggregate* industry rollups — the
# per-stock list is kept in runtime records for narrative / debugging use.
DEFAULT_TOP_HOLDING_LIMIT = 100

# Top-N industries we surface on the public summary's inflow / outflow lists.
PUBLIC_TOP_INDUSTRY_LIMIT = 5

# Cumulative-window for the public summary's "cumulative_30d_cny_billion" field.
CUMULATIVE_WINDOW_DAYS = 30

# Akshare historical-frame column candidates. Names match the
# stock_hsgt_hist_em release as of the locked dependency line; if upstream
# rotates the column names we surface a warning and degrade to an empty
# payload rather than fabricating values.
_HIST_COLUMN_DATE_CANDIDATES = ("日期", "date", "datetime")
_HIST_COLUMN_NETFLOW_CANDIDATES = (
    "当日成交净买额",
    "当日资金流入",
    "净流入",
    "north_net_flow",
)
_HIST_COLUMN_CUMULATIVE_CANDIDATES = ("历史累计净买额", "累计净买额")

# Per-stock holdings frame columns.
_HOLD_COLUMN_TICKER_CANDIDATES = ("股票代码", "代码")
_HOLD_COLUMN_NAME_CANDIDATES = ("股票名称", "名称")
_HOLD_COLUMN_INDUSTRY_CANDIDATES = ("所属行业", "所属板块", "行业")
_HOLD_COLUMN_HOLDING_VALUE_CANDIDATES = (
    "持股市值",
    "今日持股-市值",
    "持股市值-万",
    "持股市值-亿",
)
_HOLD_COLUMN_NETBUY_CANDIDATES = ("今日净买额", "净买额", "今日成交净买额")

# Industry-rank frame columns.
_INDUSTRY_COLUMN_NAME_CANDIDATES = ("名称", "行业名称", "板块名称")
_INDUSTRY_COLUMN_NETBUY_CANDIDATES = ("北向净买入", "净买入", "今日净买入", "净流入")


def _first_column_match(df: pd.DataFrame, candidates: tuple[str, ...]) -> str | None:
    """Return the first column name in ``df`` that matches the candidate list."""

    for name in candidates:
        if name in df.columns:
            return name
    return None


def _normalize_ticker(raw: Any) -> str:
    """Normalize an A-share ticker into a 6-digit string.

    Akshare returns CN-A tickers either as strings (``"600519"`` /
    ``"SH600519"``) or numbers depending on the upstream cleaning pass.
    """

    if raw is None:
        return ""
    if isinstance(raw, (int, float)) and not pd.isna(raw):
        return f"{int(raw):06d}"
    text = str(raw).strip()
    if not text or text.lower() in {"nan", "none"}:
        return ""
    if text[:2].upper() in {"SH", "SZ", "BJ"}:
        text = text[2:]
    if text.isdigit() and len(text) <= 6:
        text = text.zfill(6)
    return text


def _safe_float(raw: Any) -> float:
    """Coerce a possibly-string number into a finite float (returns 0.0 on failure)."""

    if raw is None:
        return 0.0
    if isinstance(raw, str):
        cleaned = raw.strip().rstrip("%").replace(",", "").strip()
        if not cleaned:
            return 0.0
        try:
            return float(cleaned)
        except ValueError:
            return 0.0
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return 0.0
    if pd.isna(value):
        return 0.0
    return value


def _coerce_iso_date(raw: Any) -> str:
    """Coerce a date-like cell into ``YYYY-MM-DD`` (empty string on failure)."""

    if raw is None:
        return ""
    if hasattr(raw, "strftime"):
        try:
            return raw.strftime("%Y-%m-%d")  # type: ignore[no-any-return]
        except Exception:  # pragma: no cover - defensive
            pass
    text = str(raw).strip()
    if not text or text.lower() in {"nan", "none"}:
        return ""
    # Common shapes: ``2026-05-17``, ``2026/05/17``, ``20260517``.
    text = text.replace("/", "-")
    if len(text) == 8 and text.isdigit():
        return f"{text[:4]}-{text[4:6]}-{text[6:]}"
    return text[:10]


def _call_hist_api(ak: Any) -> pd.DataFrame:
    """Call AkShare's HSGT historical netflow API with a legacy fallback."""

    fn = getattr(ak, "stock_hsgt_hist_em", None)
    if callable(fn):
        try:
            df = cast(pd.DataFrame | None, fn(symbol="北向资金"))
        except Exception as exc:
            raise AttributeError(f"stock_hsgt_hist_em failed: {exc}") from exc
        return df if df is not None else pd.DataFrame()

    # Legacy adapter — present in older akshare releases. We keep it so a
    # locally-pinned older install does not silently swallow the error.
    legacy = getattr(ak, "stock_em_hsgt_hist_em", None)
    if callable(legacy):
        return cast(pd.DataFrame, legacy(symbol="北向资金"))

    raise AttributeError(
        "akshare northbound API unavailable: expected stock_hsgt_hist_em"
    )


def _call_top_holdings_api(ak: Any) -> pd.DataFrame:
    """Call AkShare's per-stock northbound holdings API."""

    fn = getattr(ak, "stock_hsgt_hold_stock_em", None)
    if callable(fn):
        try:
            df = cast(
                pd.DataFrame | None,
                fn(market="北向", indicator="今日排行"),
            )
        except Exception:
            # Some akshare versions only accept 沪股通/深股通 as ``market``.
            # Try the canonical Shanghai path so we still get *some* coverage.
            try:
                df = cast(
                    pd.DataFrame | None,
                    fn(market="沪股通", indicator="今日排行"),
                )
            except Exception as exc:
                raise AttributeError(
                    f"stock_hsgt_hold_stock_em failed: {exc}"
                ) from exc
        return df if df is not None else pd.DataFrame()

    legacy = getattr(ak, "stock_em_hsgt_stock_statistics_em", None)
    if callable(legacy):
        return cast(pd.DataFrame, legacy())

    raise AttributeError(
        "akshare northbound holdings API unavailable: expected stock_hsgt_hold_stock_em"
    )


def _call_industry_rank_api(ak: Any) -> pd.DataFrame:
    """Call AkShare's industry-level northbound netflow rank API."""

    fn = getattr(ak, "stock_hsgt_board_rank_em", None)
    if callable(fn):
        try:
            df = cast(
                pd.DataFrame | None,
                fn(symbol="北向资金增持行业板块排行", indicator="今日"),
            )
        except Exception as exc:
            raise AttributeError(
                f"stock_hsgt_board_rank_em failed: {exc}"
            ) from exc
        return df if df is not None else pd.DataFrame()

    raise AttributeError(
        "akshare industry-rank API unavailable: expected stock_hsgt_board_rank_em"
    )


class NorthboundProvider(BaseAltDataProvider):
    """Aggregate northbound (HSGT foreign capital) flows into AltDataRecords."""

    name = "northbound"
    category = AltDataCategory.FOREIGN_CAPITAL_FLOW
    # Twice daily — once at midday for current-day flow state, once at close
    # for the final tally. The midday read carries lower confidence (intra-day
    # snapshot) but lets the macro-mispricing engine react before T+1.
    update_interval = 60 * 60 * 12

    DEFAULT_DAYS_BACK = 60
    DEFAULT_RECORDS_LIMIT = 50

    def __init__(self, config: dict[str, Any] | None = None):
        super().__init__(config)
        self.days_back = int(self.config.get("days_back", self.DEFAULT_DAYS_BACK))
        self.top_holding_limit = int(
            self.config.get("top_holding_limit", DEFAULT_TOP_HOLDING_LIMIT)
        )

    # ------------------------------------------------------------------
    # Step 1: fetch
    # ------------------------------------------------------------------

    def fetch(self, **kwargs: Any) -> list[dict[str, Any]]:
        """Fetch the three HSGT slices: daily history, top holdings, industry rank.

        ``kwargs``:

        - ``days_back``: optional int truncating the daily history window.
        - ``top_holding_limit``: optional int truncating the per-stock holdings list.
        """

        days_back = int(kwargs.get("days_back") or self.days_back)
        top_limit = int(kwargs.get("top_holding_limit") or self.top_holding_limit)

        try:
            import akshare as ak  # type: ignore  # noqa: F401
        except ImportError:
            self.logger.error("akshare not installed; northbound cannot fetch")
            return [
                {"slice": "daily_history", "rows": [], "error": "akshare_not_installed"},
                {"slice": "top_holdings", "rows": [], "error": "akshare_not_installed"},
                {"slice": "industry_rank", "rows": [], "error": "akshare_not_installed"},
            ]

        return [
            self._fetch_daily_history(days_back),
            self._fetch_top_holdings(top_limit),
            self._fetch_industry_rank(),
        ]

    def _fetch_daily_history(self, days_back: int) -> dict[str, Any]:
        """Pull the historical daily netflow frame and trim to the recent window."""

        try:
            import akshare as ak  # type: ignore
        except ImportError:
            return {"slice": "daily_history", "rows": [], "error": "akshare_not_installed"}

        try:
            df = _call_hist_api(ak)
        except Exception as exc:
            self.logger.warning("northbound daily_history fetch failed: %s", exc)
            return {
                "slice": "daily_history",
                "rows": [],
                "error": f"akshare_error:{exc.__class__.__name__}",
            }

        if df is None or getattr(df, "empty", True):
            return {"slice": "daily_history", "rows": [], "error": "empty_response"}

        date_col = _first_column_match(df, _HIST_COLUMN_DATE_CANDIDATES)
        netflow_col = _first_column_match(df, _HIST_COLUMN_NETFLOW_CANDIDATES)
        cum_col = _first_column_match(df, _HIST_COLUMN_CUMULATIVE_CANDIDATES)

        if date_col is None or netflow_col is None:
            self.logger.warning(
                "northbound daily_history: unexpected columns %s",
                list(df.columns),
            )
            return {"slice": "daily_history", "rows": [], "error": "unexpected_schema"}

        cutoff = datetime.now().date() - timedelta(days=days_back)
        rows: list[dict[str, Any]] = []
        for _, row in df.iterrows():
            iso_date = _coerce_iso_date(row.get(date_col))
            if not iso_date:
                continue
            try:
                parsed_date = datetime.strptime(iso_date, "%Y-%m-%d").date()
            except ValueError:
                continue
            if parsed_date < cutoff:
                continue
            rows.append(
                {
                    "trade_date": iso_date,
                    "daily_netflow_cny_billion": _safe_float(row.get(netflow_col)),
                    "cumulative_netflow_cny_billion": _safe_float(row.get(cum_col))
                    if cum_col
                    else 0.0,
                }
            )

        # Newest first — consumers want today's row at position 0.
        rows.sort(key=lambda r: r["trade_date"], reverse=True)
        return {"slice": "daily_history", "rows": rows, "error": ""}

    def _fetch_top_holdings(self, limit: int) -> dict[str, Any]:
        """Pull per-stock current holdings and trim to ``limit`` rows."""

        try:
            import akshare as ak  # type: ignore
        except ImportError:
            return {"slice": "top_holdings", "rows": [], "error": "akshare_not_installed"}

        try:
            df = _call_top_holdings_api(ak)
        except Exception as exc:
            self.logger.warning("northbound top_holdings fetch failed: %s", exc)
            return {
                "slice": "top_holdings",
                "rows": [],
                "error": f"akshare_error:{exc.__class__.__name__}",
            }

        if df is None or getattr(df, "empty", True):
            return {"slice": "top_holdings", "rows": [], "error": "empty_response"}

        ticker_col = _first_column_match(df, _HOLD_COLUMN_TICKER_CANDIDATES)
        name_col = _first_column_match(df, _HOLD_COLUMN_NAME_CANDIDATES)
        industry_col = _first_column_match(df, _HOLD_COLUMN_INDUSTRY_CANDIDATES)
        value_col = _first_column_match(df, _HOLD_COLUMN_HOLDING_VALUE_CANDIDATES)
        netbuy_col = _first_column_match(df, _HOLD_COLUMN_NETBUY_CANDIDATES)

        if ticker_col is None or value_col is None:
            self.logger.warning(
                "northbound top_holdings: unexpected columns %s",
                list(df.columns),
            )
            return {"slice": "top_holdings", "rows": [], "error": "unexpected_schema"}

        rows: list[dict[str, Any]] = []
        for _, row in df.head(limit).iterrows():
            ticker = _normalize_ticker(row.get(ticker_col))
            if not ticker:
                continue
            rows.append(
                {
                    "ticker": ticker,
                    "stock_name": str(row.get(name_col, "")).strip() if name_col else "",
                    "industry": str(row.get(industry_col, "")).strip()
                    if industry_col
                    else "",
                    "holding_value_cny": _safe_float(row.get(value_col)),
                    "today_netbuy_cny": _safe_float(row.get(netbuy_col))
                    if netbuy_col
                    else 0.0,
                }
            )

        return {"slice": "top_holdings", "rows": rows, "error": ""}

    def _fetch_industry_rank(self) -> dict[str, Any]:
        """Pull the per-industry northbound netflow rank frame."""

        try:
            import akshare as ak  # type: ignore
        except ImportError:
            return {"slice": "industry_rank", "rows": [], "error": "akshare_not_installed"}

        try:
            df = _call_industry_rank_api(ak)
        except Exception as exc:
            self.logger.warning("northbound industry_rank fetch failed: %s", exc)
            return {
                "slice": "industry_rank",
                "rows": [],
                "error": f"akshare_error:{exc.__class__.__name__}",
            }

        if df is None or getattr(df, "empty", True):
            return {"slice": "industry_rank", "rows": [], "error": "empty_response"}

        name_col = _first_column_match(df, _INDUSTRY_COLUMN_NAME_CANDIDATES)
        netbuy_col = _first_column_match(df, _INDUSTRY_COLUMN_NETBUY_CANDIDATES)

        if name_col is None or netbuy_col is None:
            self.logger.warning(
                "northbound industry_rank: unexpected columns %s",
                list(df.columns),
            )
            return {"slice": "industry_rank", "rows": [], "error": "unexpected_schema"}

        rows: list[dict[str, Any]] = []
        for _, row in df.iterrows():
            name = str(row.get(name_col, "")).strip()
            if not name:
                continue
            rows.append(
                {
                    "industry": name,
                    "netbuy_cny_billion": _safe_float(row.get(netbuy_col)),
                }
            )
        return {"slice": "industry_rank", "rows": rows, "error": ""}

    # ------------------------------------------------------------------
    # Step 2: parse
    # ------------------------------------------------------------------

    def parse(self, raw_data: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Flatten the three slices into a unified record_type-tagged list."""

        by_slice = {entry.get("slice"): entry for entry in raw_data}
        daily = by_slice.get("daily_history", {})
        holdings = by_slice.get("top_holdings", {})
        industry = by_slice.get("industry_rank", {})

        slices_responded = sum(
            1
            for entry in (daily, holdings, industry)
            if entry and not entry.get("error")
        )
        coverage = round(slices_responded / 3.0, 4)

        parsed: list[dict[str, Any]] = []

        # 1) Daily netflow rows
        for row in daily.get("rows", []) or []:
            netflow = float(row.get("daily_netflow_cny_billion", 0.0) or 0.0)
            parsed.append(
                {
                    "record_type": "netflow_daily",
                    "trade_date": str(row.get("trade_date", "")),
                    "daily_netflow_cny_billion": round(netflow, 4),
                    "cumulative_netflow_cny_billion": round(
                        float(row.get("cumulative_netflow_cny_billion", 0.0) or 0.0), 4
                    ),
                    "direction": "in" if netflow >= 0 else "out",
                    "coverage": coverage,
                }
            )

        # 2) Top-holding rows (capped — per-stock detail is *not* exported to
        # the public summary, but we retain it in runtime records so narrative
        # / debugging consumers can see what's driving the aggregate).
        for row in holdings.get("rows", []) or []:
            parsed.append(
                {
                    "record_type": "top_holding_stock",
                    "ticker": str(row.get("ticker", "")),
                    "stock_name": str(row.get("stock_name", "")),
                    "industry": str(row.get("industry", "")),
                    "holding_value_cny": round(
                        float(row.get("holding_value_cny", 0.0) or 0.0), 2
                    ),
                    "today_netbuy_cny": round(
                        float(row.get("today_netbuy_cny", 0.0) or 0.0), 2
                    ),
                    "coverage": coverage,
                }
            )

        # 3) Industry aggregation rows
        for row in industry.get("rows", []) or []:
            netbuy = float(row.get("netbuy_cny_billion", 0.0) or 0.0)
            parsed.append(
                {
                    "record_type": "industry_netflow_agg",
                    "industry": str(row.get("industry", "")),
                    "netbuy_cny_billion": round(netbuy, 4),
                    "direction": "in" if netbuy >= 0 else "out",
                    "coverage": coverage,
                }
            )

        return parsed

    # ------------------------------------------------------------------
    # Step 3: normalize
    # ------------------------------------------------------------------

    def normalize(self, parsed_data: list[dict[str, Any]]) -> list[AltDataRecord]:
        if not parsed_data:
            return []

        coverage = float(parsed_data[0].get("coverage", 0.0))
        confidence = round(min(_MAX_CONFIDENCE, max(0.0, coverage) * _MAX_CONFIDENCE), 4)

        # Latest daily netflow drives the normalized_score for daily rows;
        # industry rows use their own netbuy magnitude. We compute the
        # max-abs daily netflow over the parsed window so daily scores stay
        # comparable across runs.
        daily_rows = [r for r in parsed_data if r.get("record_type") == "netflow_daily"]
        max_abs_daily = max(
            (abs(float(r.get("daily_netflow_cny_billion", 0.0) or 0.0)) for r in daily_rows),
            default=1.0,
        ) or 1.0

        industry_rows = [
            r for r in parsed_data if r.get("record_type") == "industry_netflow_agg"
        ]
        max_abs_industry = max(
            (abs(float(r.get("netbuy_cny_billion", 0.0) or 0.0)) for r in industry_rows),
            default=1.0,
        ) or 1.0

        now = datetime.now()
        records: list[AltDataRecord] = []
        limit = self.DEFAULT_RECORDS_LIMIT
        for row in parsed_data[:limit]:
            record_type = str(row.get("record_type") or "")
            if record_type == "netflow_daily":
                netflow = float(row.get("daily_netflow_cny_billion", 0.0) or 0.0)
                score = max(-0.95, min(0.95, netflow / max_abs_daily * 0.95))
                tags = [
                    "northbound",
                    "netflow_daily",
                    "foreign_capital_flow",
                    str(row.get("direction") or "in"),
                ]
                ticker_label = ""
                headline_industry = ""
            elif record_type == "top_holding_stock":
                # Per-stock score is intentionally muted — these are *snapshot*
                # holdings, not netflow. We surface them for narrative only.
                score = 0.0
                tags = [
                    "northbound",
                    "top_holding_stock",
                    "foreign_capital_flow",
                    str(row.get("ticker") or ""),
                ]
                ticker_label = str(row.get("ticker") or "")
                headline_industry = str(row.get("industry") or "")
            elif record_type == "industry_netflow_agg":
                netbuy = float(row.get("netbuy_cny_billion", 0.0) or 0.0)
                score = max(-0.95, min(0.95, netbuy / max_abs_industry * 0.95))
                tags = [
                    "northbound",
                    "industry_netflow_agg",
                    "foreign_capital_flow",
                    str(row.get("industry") or ""),
                    str(row.get("direction") or "in"),
                ]
                ticker_label = ""
                headline_industry = str(row.get("industry") or "")
            else:
                continue

            records.append(
                AltDataRecord(
                    timestamp=now,
                    source=f"northbound:{record_type}",
                    category=AltDataCategory.FOREIGN_CAPITAL_FLOW,
                    raw_value=dict(row),
                    normalized_score=round(score, 4),
                    confidence=confidence,
                    tags=tags,
                    metadata={
                        "record_type": record_type,
                        "ticker": ticker_label,
                        "industry": headline_industry,
                        "source_mode": "public_disclosure",
                        "fallback_reason": "" if coverage > 0 else "no_slice_responded",
                        "lag_days": 1,
                        "coverage": round(coverage, 4),
                        "category": "foreign_capital_flow",
                    },
                )
            )
        return records

    # ------------------------------------------------------------------
    # Step 4: to_signal
    # ------------------------------------------------------------------

    def to_signal(self, records: list[AltDataRecord]) -> dict[str, Any]:
        if not records:
            return {
                "source": self.name,
                "category": self.category.value,
                "signal": 0,
                "strength": 0.0,
                "confidence": 0.0,
                "record_count": 0,
                "last_trade_date": "",
                "daily_netflow_cny_billion": 0.0,
                "cumulative_30d_cny_billion": 0.0,
                "top_inflow_industries": [],
                "top_outflow_industries": [],
                "source_mode_summary": {
                    "counts": {"public_disclosure": 0},
                    "dominant": "public_disclosure",
                },
                "timestamp": datetime.now().isoformat(),
            }

        daily_records = [
            r for r in records
            if (r.metadata or {}).get("record_type") == "netflow_daily"
        ]
        industry_records = [
            r for r in records
            if (r.metadata or {}).get("record_type") == "industry_netflow_agg"
        ]

        # Daily ordering: newest first by ``trade_date`` in the raw_value.
        daily_records_sorted = sorted(
            daily_records,
            key=lambda r: (r.raw_value or {}).get("trade_date", ""),
            reverse=True,
        )
        latest_daily = daily_records_sorted[0] if daily_records_sorted else None
        last_trade_date = (
            (latest_daily.raw_value or {}).get("trade_date", "") if latest_daily else ""
        )
        latest_netflow = (
            float(
                (latest_daily.raw_value or {}).get("daily_netflow_cny_billion", 0.0)
                or 0.0
            )
            if latest_daily
            else 0.0
        )

        # Rolling 30-day cumulative: sum the trailing 30 entries.
        cumulative_30d = round(
            sum(
                float((r.raw_value or {}).get("daily_netflow_cny_billion", 0.0) or 0.0)
                for r in daily_records_sorted[:CUMULATIVE_WINDOW_DAYS]
            ),
            4,
        )

        # Industry inflow / outflow leaderboards. Sorted by netbuy magnitude
        # so the top-N reflects strongest signed conviction.
        industry_payloads: list[dict[str, Any]] = []
        for r in industry_records:
            raw = r.raw_value if isinstance(r.raw_value, dict) else {}
            industry_payloads.append(
                {
                    "industry": str(raw.get("industry") or ""),
                    "netbuy_cny_billion": round(
                        float(raw.get("netbuy_cny_billion", 0.0) or 0.0), 4
                    ),
                    "direction": str(raw.get("direction") or ""),
                }
            )

        top_inflow = sorted(
            (i for i in industry_payloads if i["netbuy_cny_billion"] > 0),
            key=lambda item: -item["netbuy_cny_billion"],
        )[:PUBLIC_TOP_INDUSTRY_LIMIT]
        top_outflow = sorted(
            (i for i in industry_payloads if i["netbuy_cny_billion"] < 0),
            key=lambda item: item["netbuy_cny_billion"],
        )[:PUBLIC_TOP_INDUSTRY_LIMIT]

        confidences = [float(r.confidence) for r in records if r.confidence > 0]
        avg_confidence = (
            round(sum(confidences) / len(confidences), 4) if confidences else 0.0
        )

        # Signal sign: latest daily netflow direction, with a 5 亿 deadband to
        # avoid flipping on noise.
        if latest_netflow > 5.0:
            signal = 1
        elif latest_netflow < -5.0:
            signal = -1
        else:
            signal = 0

        strength = round(min(1.0, abs(latest_netflow) / 50.0), 4) if latest_netflow else 0.0

        return {
            "source": self.name,
            "category": self.category.value,
            "signal": signal,
            "strength": strength,
            "score": round(latest_netflow / max(abs(latest_netflow) or 1.0, 50.0), 4),
            "confidence": avg_confidence,
            "record_count": len(records),
            "last_trade_date": last_trade_date,
            "daily_netflow_cny_billion": round(latest_netflow, 4),
            "cumulative_30d_cny_billion": cumulative_30d,
            "top_inflow_industries": top_inflow,
            "top_outflow_industries": top_outflow,
            "source_mode_summary": {
                "counts": {"public_disclosure": len(records)},
                "dominant": "public_disclosure",
            },
            "timestamp": datetime.now().isoformat(),
        }

    # ------------------------------------------------------------------
    # Pipeline override — degrade gracefully when akshare is offline
    # ------------------------------------------------------------------

    def run_pipeline(self, **kwargs: Any) -> dict[str, Any]:
        """Override to surface low-coverage / no-data cases without raising.

        Mirrors :class:`FundHoldingsProvider.run_pipeline` so the two
        public-disclosure providers fail the same way for operators.
        """

        try:
            raw_data = self.fetch(**kwargs)
        except Exception as exc:
            self.logger.error("northbound fetch crashed: %s", exc, exc_info=True)
            return self.to_signal([])

        parsed = self.parse(raw_data)
        records = self.normalize(parsed)

        self._history.extend(records)
        self._history = self._history[-500:]
        self._last_update = datetime.now()

        signal = self.to_signal(records)
        slices_responded = sum(
            1 for entry in raw_data if entry and not entry.get("error")
        )
        signal["total_slices_responded"] = slices_responded
        signal["partial_response"] = 0 < slices_responded < 3
        if slices_responded == 0:
            signal["low_coverage"] = True
        return signal


__all__ = [
    "NorthboundProvider",
]

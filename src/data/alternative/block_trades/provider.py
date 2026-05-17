"""大宗交易 (block trades) alt-data provider.

Disclosure context
------------------

The Shanghai & Shenzhen exchanges publish every block trade (大宗交易)
within their respective T+1 disclosure windows. The combined view is a
useful institutional-flow proxy complementary to ``fund_holdings``
(quarterly) and ``northbound`` (foreign T+1):

1. **Market-wide daily summary** — total notional, premium vs discount
   share of the day's tape. Sourced from
   ``ak.stock_dzjy_sctj()``.
2. **Per-ticker windowed aggregate** — over a rolling window (default
   5 trading days) we aggregate trade count, buy-side notional, sell-side
   notional, net flow and the dominant trading side per ticker. Sourced
   from ``ak.stock_dzjy_mrtj(start_date=, end_date=)`` for the trade-by-
   trade rollup, with the per-trade premium/discount sign used to bucket
   buys vs sells.
3. **Industry rollup** — per-ticker aggregates rolled up via the
   ``ticker_industry`` resolver into a per-industry net-flow / signal
   table. Tickers that don't map to a canonical industry are excluded
   from the industry slice but still flow into the per-ticker slice.

Pipeline shape
--------------

Follows the standard ``BaseAltDataProvider`` four-stage contract:

- :meth:`fetch` calls the AkShare endpoints described above inside
  isolated try/except blocks. A single endpoint failure degrades the
  affected slice to an empty payload rather than tanking the whole run.
- :meth:`parse` flattens the three frames into a unified, deterministic
  list of dicts tagged with ``record_type`` so :meth:`normalize` can
  branch on it.
- :meth:`normalize` emits one ``AltDataRecord`` per ``record_type``
  (``block_trade_daily_summary``, ``ticker_block_trade_aggregate``,
  ``industry_block_trade_signal``) with ``category=AltDataCategory.INSIDER_FLOW``.
- :meth:`to_signal` collapses to a top-line summary: latest trade-date,
  total daily notional, top-N inflow / outflow industries, and the
  top-N concentrated tickers (repeat-trade pattern).

Source mode
-----------

``source_mode="public_disclosure"``, ``lag_days=1``. ``confidence`` peaks
at 0.72 when all three slices return data; degrades when one of them is
empty. Slightly below ``northbound``'s 0.75 cap because the per-trade
seat-level disclosure is noisier (single anonymous-account trades can
swing per-ticker rollups, hence the rolling-window aggregation).

Sanitization
------------

The provider intentionally **drops** the per-trade ``买方营业部`` /
``卖方营业部`` (buyer/seller seat) columns before they ever reach an
``AltDataRecord``. The seat-level detail is the most legally-sensitive
part of the SSE/SZSE disclosure (it identifies the brokerage trader
who handled the block) and exposing it in our public summary would
defeat the aggregate-only contract that the rest of the alt-data
pipeline follows. Parsed records only carry per-ticker aggregates with
no seat-level provenance.

Test seam
---------

Akshare is imported lazily inside the per-slice fetch helpers so the
unit tests can stub the module via ``sys.modules`` — same pattern as
``tests/unit/test_northbound_provider.py``,
``tests/unit/test_fund_holdings_provider.py`` and
``tests/unit/test_shfe_inventory.py``. Tests pin the modern
``stock_dzjy_*`` function names so a future API drift does not pass
silently.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, cast

import pandas as pd

from ..base_alt_provider import AltDataCategory, AltDataRecord, BaseAltDataProvider
from ..ticker_industry import resolve_ticker_industry

logger = logging.getLogger(__name__)


# Confidence cap for the perfect-coverage case (all 3 slices responded).
# Slightly below northbound's 0.75 because per-trade rollups are
# inherently noisier than HSGT daily aggregates.
_MAX_CONFIDENCE = 0.72

# Window (trading days) over which we aggregate per-ticker block-trade
# flow. 5 keeps the signal responsive without letting a single noisy
# trade dominate -- mirror of the rolling-window approach already used
# in the northbound cumulative-30d slice.
DEFAULT_WINDOW_TRADING_DAYS = 5

# Number of *calendar* days we look back when calling
# ``stock_dzjy_mrtj`` -- the akshare endpoint expects YYYYMMDD strings,
# and weekends + market holidays mean we ask for more calendar days
# than trading days to guarantee the window is fully covered.
DEFAULT_LOOKBACK_CALENDAR_DAYS = 10

# Top-N tickers / industries we surface in the to_signal output and
# (sanitised) public summary. 5 mirrors the constant in scripts/
# export_public_summary.py for the northbound provider.
PUBLIC_TOP_LIMIT = 5
DEFAULT_RECORDS_LIMIT = 80

# ----- Akshare column candidates ------------------------------------------------
# The akshare adapter has been observed to lightly rotate column names
# between minor versions (most commonly swapping 证券代码 <-> 股票代码).
# We accept either spelling so a 1.18.x → 1.19.x upgrade does not break
# the provider silently.

_SCTJ_DATE_CANDIDATES = ("交易日期", "日期", "date")
_SCTJ_TOTAL_VALUE_CANDIDATES = ("大宗交易成交总额", "成交总额", "总成交额")
_SCTJ_PREMIUM_VALUE_CANDIDATES = ("溢价成交总额",)
_SCTJ_DISCOUNT_VALUE_CANDIDATES = ("折价成交总额",)

_MRTJ_DATE_CANDIDATES = ("交易日期", "日期", "date")
_MRTJ_TICKER_CANDIDATES = ("证券代码", "股票代码", "代码")
_MRTJ_NAME_CANDIDATES = ("证券简称", "股票名称", "名称")
_MRTJ_PRICE_CANDIDATES = ("成交价", "成交均价", "均价")
_MRTJ_VALUE_CANDIDATES = ("成交总额", "成交额")
_MRTJ_PREMIUM_PCT_CANDIDATES = ("折溢率", "折溢价率", "溢价率")
_MRTJ_TRADE_COUNT_CANDIDATES = ("成交笔数", "笔数")
_MRTJ_CLOSE_CANDIDATES = ("收盘价",)


def _first_column_match(df: pd.DataFrame, candidates: tuple[str, ...]) -> str | None:
    """Return the first column name in ``df`` that matches the candidate list."""

    for name in candidates:
        if name in df.columns:
            return name
    return None


def _normalize_ticker(raw: Any) -> str:
    """Normalize an A-share ticker into a 6-digit string (matches the cross-provider helper)."""

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
            return ""
    text = str(raw).strip()
    if not text or text.lower() in {"nan", "none"}:
        return ""
    text = text.replace("/", "-")
    if len(text) == 8 and text.isdigit():
        return f"{text[:4]}-{text[4:6]}-{text[6:]}"
    return text[:10]


def _yyyymmdd(value: datetime) -> str:
    return value.strftime("%Y%m%d")


def _call_sctj_api(ak: Any) -> pd.DataFrame:
    """Call AkShare's market-wide block-trade summary endpoint."""

    fn = getattr(ak, "stock_dzjy_sctj", None)
    if callable(fn):
        try:
            df = cast(pd.DataFrame | None, fn())
        except Exception as exc:
            raise AttributeError(f"stock_dzjy_sctj failed: {exc}") from exc
        return df if df is not None else pd.DataFrame()
    raise AttributeError(
        "akshare block-trade market summary API unavailable: expected stock_dzjy_sctj"
    )


def _call_mrtj_api(ak: Any, start_date: str, end_date: str) -> pd.DataFrame:
    """Call AkShare's per-day per-ticker block-trade rollup endpoint.

    ``start_date`` / ``end_date`` are YYYYMMDD strings as expected by the
    upstream signature.
    """

    fn = getattr(ak, "stock_dzjy_mrtj", None)
    if callable(fn):
        try:
            df = cast(
                pd.DataFrame | None,
                fn(start_date=start_date, end_date=end_date),
            )
        except Exception as exc:
            raise AttributeError(f"stock_dzjy_mrtj failed: {exc}") from exc
        return df if df is not None else pd.DataFrame()
    raise AttributeError(
        "akshare block-trade daily-stats API unavailable: expected stock_dzjy_mrtj"
    )


class BlockTradesProvider(BaseAltDataProvider):
    """Aggregate SSE / SZSE block-trade (大宗交易) disclosures into AltDataRecords."""

    name = "block_trades"
    category = AltDataCategory.INSIDER_FLOW
    # Twice-daily mirror of ``northbound`` — block-trade disclosures roll
    # in throughout the post-close window and the next-morning rebroadcast.
    update_interval = 60 * 60 * 12

    def __init__(self, config: dict[str, Any] | None = None):
        super().__init__(config)
        self.window_trading_days = int(
            self.config.get("window_trading_days", DEFAULT_WINDOW_TRADING_DAYS)
        )
        self.lookback_calendar_days = int(
            self.config.get("lookback_calendar_days", DEFAULT_LOOKBACK_CALENDAR_DAYS)
        )

    # ------------------------------------------------------------------
    # Step 1: fetch
    # ------------------------------------------------------------------

    def fetch(self, **kwargs: Any) -> list[dict[str, Any]]:
        """Fetch the two block-trade slices: market summary, daily ticker rollup.

        ``kwargs``:

        - ``lookback_calendar_days``: optional int overriding the default
          per-ticker rollup window (calendar days; the provider truncates
          to the most recent ``window_trading_days`` trading days that
          actually returned rows).
        - ``window_trading_days``: optional int overriding the rolling-
          window size used for per-ticker aggregation.
        """

        lookback = int(
            kwargs.get("lookback_calendar_days") or self.lookback_calendar_days
        )
        window = int(
            kwargs.get("window_trading_days") or self.window_trading_days
        )

        try:
            import akshare as ak  # type: ignore  # noqa: F401
        except ImportError:
            self.logger.error("akshare not installed; block_trades cannot fetch")
            return [
                {"slice": "daily_summary", "rows": [], "error": "akshare_not_installed"},
                {"slice": "daily_ticker_rollup", "rows": [], "error": "akshare_not_installed"},
            ]

        return [
            self._fetch_daily_summary(),
            self._fetch_daily_ticker_rollup(lookback, window),
        ]

    def _fetch_daily_summary(self) -> dict[str, Any]:
        """Pull the market-wide daily block-trade summary frame."""

        try:
            import akshare as ak  # type: ignore
        except ImportError:
            return {"slice": "daily_summary", "rows": [], "error": "akshare_not_installed"}

        try:
            df = _call_sctj_api(ak)
        except Exception as exc:
            self.logger.warning("block_trades daily_summary fetch failed: %s", exc)
            return {
                "slice": "daily_summary",
                "rows": [],
                "error": f"akshare_error:{exc.__class__.__name__}",
            }

        if df is None or getattr(df, "empty", True):
            return {"slice": "daily_summary", "rows": [], "error": "empty_response"}

        date_col = _first_column_match(df, _SCTJ_DATE_CANDIDATES)
        total_col = _first_column_match(df, _SCTJ_TOTAL_VALUE_CANDIDATES)
        premium_col = _first_column_match(df, _SCTJ_PREMIUM_VALUE_CANDIDATES)
        discount_col = _first_column_match(df, _SCTJ_DISCOUNT_VALUE_CANDIDATES)

        if date_col is None or total_col is None:
            self.logger.warning(
                "block_trades daily_summary: unexpected columns %s",
                list(df.columns),
            )
            return {"slice": "daily_summary", "rows": [], "error": "unexpected_schema"}

        rows: list[dict[str, Any]] = []
        for _, row in df.iterrows():
            iso_date = _coerce_iso_date(row.get(date_col))
            if not iso_date:
                continue
            total_value = _safe_float(row.get(total_col))
            premium_value = _safe_float(row.get(premium_col)) if premium_col else 0.0
            discount_value = _safe_float(row.get(discount_col)) if discount_col else 0.0
            rows.append(
                {
                    "trade_date": iso_date,
                    "total_value_yuan": total_value,
                    "premium_value_yuan": premium_value,
                    "discount_value_yuan": discount_value,
                }
            )

        # Newest first so the parse step can pluck row[0] as "the latest tape".
        rows.sort(key=lambda r: r["trade_date"], reverse=True)
        return {"slice": "daily_summary", "rows": rows, "error": ""}

    def _fetch_daily_ticker_rollup(
        self, lookback_calendar_days: int, window_trading_days: int
    ) -> dict[str, Any]:
        """Pull the per-day per-ticker block-trade rollup over the recent window.

        We hit ``stock_dzjy_mrtj`` once with a date-range request because
        the upstream endpoint supports a multi-day query natively — this
        avoids N HTTP round-trips and stays within the akshare
        polite-rate ceiling. The provider then post-filters down to the
        ``window_trading_days`` most recent trade dates that actually
        returned rows (handles holidays gracefully).
        """

        try:
            import akshare as ak  # type: ignore
        except ImportError:
            return {
                "slice": "daily_ticker_rollup",
                "rows": [],
                "error": "akshare_not_installed",
            }

        end = datetime.now()
        start = end - timedelta(days=max(1, lookback_calendar_days))

        try:
            df = _call_mrtj_api(ak, _yyyymmdd(start), _yyyymmdd(end))
        except Exception as exc:
            self.logger.warning("block_trades daily_ticker_rollup fetch failed: %s", exc)
            return {
                "slice": "daily_ticker_rollup",
                "rows": [],
                "error": f"akshare_error:{exc.__class__.__name__}",
            }

        if df is None or getattr(df, "empty", True):
            return {
                "slice": "daily_ticker_rollup",
                "rows": [],
                "error": "empty_response",
                "window_trading_days": window_trading_days,
            }

        date_col = _first_column_match(df, _MRTJ_DATE_CANDIDATES)
        ticker_col = _first_column_match(df, _MRTJ_TICKER_CANDIDATES)
        name_col = _first_column_match(df, _MRTJ_NAME_CANDIDATES)
        price_col = _first_column_match(df, _MRTJ_PRICE_CANDIDATES)
        value_col = _first_column_match(df, _MRTJ_VALUE_CANDIDATES)
        premium_col = _first_column_match(df, _MRTJ_PREMIUM_PCT_CANDIDATES)
        trade_count_col = _first_column_match(df, _MRTJ_TRADE_COUNT_CANDIDATES)
        close_col = _first_column_match(df, _MRTJ_CLOSE_CANDIDATES)

        if date_col is None or ticker_col is None or value_col is None:
            self.logger.warning(
                "block_trades daily_ticker_rollup: unexpected columns %s",
                list(df.columns),
            )
            return {
                "slice": "daily_ticker_rollup",
                "rows": [],
                "error": "unexpected_schema",
                "window_trading_days": window_trading_days,
            }

        rows: list[dict[str, Any]] = []
        for _, row in df.iterrows():
            iso_date = _coerce_iso_date(row.get(date_col))
            if not iso_date:
                continue
            ticker = _normalize_ticker(row.get(ticker_col))
            if not ticker:
                continue
            value = _safe_float(row.get(value_col))
            premium_pct = (
                _safe_float(row.get(premium_col)) if premium_col else 0.0
            )
            avg_price = _safe_float(row.get(price_col)) if price_col else 0.0
            close = _safe_float(row.get(close_col)) if close_col else 0.0
            n_trades = (
                int(_safe_float(row.get(trade_count_col)))
                if trade_count_col
                else 1
            )
            stock_name = (
                str(row.get(name_col, "")).strip() if name_col else ""
            )
            rows.append(
                {
                    "trade_date": iso_date,
                    "ticker": ticker,
                    "stock_name": stock_name,
                    "avg_price": avg_price,
                    "close_price": close,
                    "premium_pct": premium_pct,
                    "trade_value_yuan": value,
                    "n_trades": max(1, n_trades),
                }
            )

        # Truncate to the most recent ``window_trading_days`` calendar
        # dates that actually appear in the rollup (holiday-safe).
        unique_dates = sorted({row["trade_date"] for row in rows}, reverse=True)
        kept_dates = set(unique_dates[:window_trading_days])
        rows = [row for row in rows if row["trade_date"] in kept_dates]

        return {
            "slice": "daily_ticker_rollup",
            "rows": rows,
            "error": "",
            "window_trading_days": window_trading_days,
        }

    # ------------------------------------------------------------------
    # Step 2: parse
    # ------------------------------------------------------------------

    def parse(self, raw_data: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Flatten the slices into a unified record_type-tagged list.

        Per-ticker aggregation buckets:

        - ``n_trades_in_window``: sum of ``n_trades`` across the window
        - ``total_buy_value`` / ``total_sell_value``: notional bucketed by
          per-trade premium sign (premium >= 0 → buy-side conviction;
          discount < 0 → forced-sell)
        - ``net_flow``: ``total_buy_value - total_sell_value``
        - ``dominant_side``: ``"buy"`` / ``"sell"`` / ``"mixed"`` based on
          the larger absolute side, with ``"mixed"`` when |net_flow| <
          10% of total flow (deadband prevents flipping on noise)
        """

        by_slice = {entry.get("slice"): entry for entry in raw_data}
        summary = by_slice.get("daily_summary", {})
        rollup = by_slice.get("daily_ticker_rollup", {})

        slices_responded = sum(
            1 for entry in (summary, rollup) if entry and not entry.get("error")
        )
        coverage = round(slices_responded / 2.0, 4)

        parsed: list[dict[str, Any]] = []

        # --- 1) daily summary rows ---------------------------------------
        for row in summary.get("rows", []) or []:
            total = float(row.get("total_value_yuan", 0.0) or 0.0)
            premium = float(row.get("premium_value_yuan", 0.0) or 0.0)
            discount = float(row.get("discount_value_yuan", 0.0) or 0.0)
            denom = total if total > 0 else (premium + discount)
            avg_premium_pct = (
                round((premium - discount) / denom * 100.0, 4) if denom > 0 else 0.0
            )
            parsed.append(
                {
                    "record_type": "block_trade_daily_summary",
                    "trade_date": str(row.get("trade_date", "")),
                    "total_volume_billion": round(total / 1.0e8, 4),
                    "total_value_billion": round(total / 1.0e8, 4),
                    "premium_value_billion": round(premium / 1.0e8, 4),
                    "discount_value_billion": round(discount / 1.0e8, 4),
                    "avg_premium_pct": avg_premium_pct,
                    "coverage": coverage,
                }
            )

        # --- 2) per-ticker windowed aggregate ---------------------------
        ticker_buckets: dict[str, dict[str, Any]] = {}
        rollup_rows = rollup.get("rows", []) or []
        for row in rollup_rows:
            ticker = str(row.get("ticker", ""))
            if not ticker:
                continue
            value = float(row.get("trade_value_yuan", 0.0) or 0.0)
            premium_pct = float(row.get("premium_pct", 0.0) or 0.0)
            n_trades = int(row.get("n_trades", 1) or 1)
            bucket = ticker_buckets.setdefault(
                ticker,
                {
                    "ticker": ticker,
                    "stock_name": row.get("stock_name", ""),
                    "n_trades_in_window": 0,
                    "total_buy_value": 0.0,
                    "total_sell_value": 0.0,
                    "trade_dates": set(),
                    "avg_premium_pct_sum": 0.0,
                    "avg_premium_pct_count": 0,
                    "latest_trade_date": "",
                },
            )
            bucket["n_trades_in_window"] += n_trades
            if premium_pct >= 0:
                bucket["total_buy_value"] += value
            else:
                bucket["total_sell_value"] += value
            bucket["trade_dates"].add(row.get("trade_date", ""))
            bucket["avg_premium_pct_sum"] += premium_pct
            bucket["avg_premium_pct_count"] += 1
            if not bucket.get("stock_name"):
                bucket["stock_name"] = row.get("stock_name", "")
            trade_date = str(row.get("trade_date", ""))
            if trade_date > bucket["latest_trade_date"]:
                bucket["latest_trade_date"] = trade_date

        for bucket in ticker_buckets.values():
            ticker = bucket["ticker"]
            industry = resolve_ticker_industry(ticker) or ""
            buy_value = float(bucket["total_buy_value"])
            sell_value = float(bucket["total_sell_value"])
            net_flow = buy_value - sell_value
            total_flow = buy_value + sell_value
            if total_flow > 0 and abs(net_flow) / total_flow < 0.10:
                dominant_side = "mixed"
            else:
                dominant_side = "buy" if net_flow >= 0 else "sell"
            avg_premium = (
                bucket["avg_premium_pct_sum"] / bucket["avg_premium_pct_count"]
                if bucket["avg_premium_pct_count"] > 0
                else 0.0
            )
            parsed.append(
                {
                    "record_type": "ticker_block_trade_aggregate",
                    "ticker": ticker,
                    "stock_name": bucket["stock_name"],
                    "industry": industry,
                    "n_trades_in_window": int(bucket["n_trades_in_window"]),
                    "trade_dates_count": len(bucket["trade_dates"]),
                    "total_buy_value": round(buy_value, 2),
                    "total_sell_value": round(sell_value, 2),
                    "net_flow": round(net_flow, 2),
                    "dominant_side": dominant_side,
                    "avg_premium_pct": round(avg_premium, 4),
                    "latest_trade_date": bucket["latest_trade_date"],
                    "coverage": coverage,
                }
            )

        # --- 3) industry rollup ---------------------------------------
        industry_buckets: dict[str, dict[str, Any]] = {}
        for item in parsed:
            if item.get("record_type") != "ticker_block_trade_aggregate":
                continue
            industry = str(item.get("industry") or "").strip()
            if not industry:
                continue
            net = float(item.get("net_flow", 0.0))
            bucket = industry_buckets.setdefault(
                industry,
                {
                    "industry": industry,
                    "n_tickers_traded": 0,
                    "net_flow_yuan": 0.0,
                },
            )
            bucket["n_tickers_traded"] += 1
            bucket["net_flow_yuan"] += net

        for industry, bucket in industry_buckets.items():
            net_yuan = float(bucket["net_flow_yuan"])
            if net_yuan > 0:
                direction = "inflow"
            elif net_yuan < 0:
                direction = "outflow"
            else:
                direction = "flat"
            parsed.append(
                {
                    "record_type": "industry_block_trade_signal",
                    "industry": industry,
                    "n_tickers_traded": int(bucket["n_tickers_traded"]),
                    "net_flow_billion": round(net_yuan / 1.0e8, 4),
                    "signal_direction": direction,
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

        # Max |net_flow| over the per-ticker aggregates so per-ticker
        # scores stay comparable across runs.
        max_abs_ticker_net = max(
            (
                abs(float(r.get("net_flow", 0.0) or 0.0))
                for r in parsed_data
                if r.get("record_type") == "ticker_block_trade_aggregate"
            ),
            default=1.0,
        ) or 1.0
        max_abs_industry_net = max(
            (
                abs(float(r.get("net_flow_billion", 0.0) or 0.0))
                for r in parsed_data
                if r.get("record_type") == "industry_block_trade_signal"
            ),
            default=1.0,
        ) or 1.0

        now = datetime.now()
        records: list[AltDataRecord] = []
        for row in parsed_data[:DEFAULT_RECORDS_LIMIT]:
            record_type = str(row.get("record_type") or "")
            if record_type == "block_trade_daily_summary":
                # Daily summary is *aggregate* tape — score reflects
                # premium share of the day. Range [-1, +1] where +1 means
                # every yuan of notional traded at a premium.
                avg_premium = float(row.get("avg_premium_pct", 0.0) or 0.0)
                score = max(-0.95, min(0.95, avg_premium / 100.0))
                tags = [
                    "block_trades",
                    "block_trade_daily_summary",
                    "insider_flow",
                    str(row.get("trade_date") or ""),
                ]
                ticker_label = ""
                industry_label = ""
            elif record_type == "ticker_block_trade_aggregate":
                net_flow = float(row.get("net_flow", 0.0) or 0.0)
                score = max(-0.95, min(0.95, net_flow / max_abs_ticker_net * 0.95))
                tags = [
                    "block_trades",
                    "ticker_block_trade_aggregate",
                    "insider_flow",
                    str(row.get("ticker") or ""),
                    str(row.get("dominant_side") or "mixed"),
                ]
                ticker_label = str(row.get("ticker") or "")
                industry_label = str(row.get("industry") or "")
            elif record_type == "industry_block_trade_signal":
                net_billion = float(row.get("net_flow_billion", 0.0) or 0.0)
                score = max(
                    -0.95,
                    min(0.95, net_billion / max_abs_industry_net * 0.95),
                )
                tags = [
                    "block_trades",
                    "industry_block_trade_signal",
                    "insider_flow",
                    str(row.get("industry") or ""),
                    str(row.get("signal_direction") or "flat"),
                ]
                ticker_label = ""
                industry_label = str(row.get("industry") or "")
            else:
                continue

            records.append(
                AltDataRecord(
                    timestamp=now,
                    source=f"block_trades:{record_type}",
                    category=AltDataCategory.INSIDER_FLOW,
                    raw_value=dict(row),
                    normalized_score=round(score, 4),
                    confidence=confidence,
                    tags=tags,
                    metadata={
                        "record_type": record_type,
                        "ticker": ticker_label,
                        "industry": industry_label,
                        "source_mode": "public_disclosure",
                        "fallback_reason": "" if coverage > 0 else "no_slice_responded",
                        "lag_days": 1,
                        "coverage": round(coverage, 4),
                        "category": "insider_flow",
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
                "total_daily_value_billion": 0.0,
                "top_inflow_industries": [],
                "top_outflow_industries": [],
                "top_n_concentrated_tickers": [],
                "source_mode_summary": {
                    "counts": {"public_disclosure": 0},
                    "dominant": "public_disclosure",
                },
                "timestamp": datetime.now().isoformat(),
            }

        # Sort each subset deterministically by their date / magnitude so
        # the top-N slices that feed the sanitised public summary are
        # stable across runs.
        daily_records = [
            r for r in records
            if (r.metadata or {}).get("record_type") == "block_trade_daily_summary"
        ]
        ticker_records = [
            r for r in records
            if (r.metadata or {}).get("record_type") == "ticker_block_trade_aggregate"
        ]
        industry_records = [
            r for r in records
            if (r.metadata or {}).get("record_type") == "industry_block_trade_signal"
        ]

        daily_records_sorted = sorted(
            daily_records,
            key=lambda r: (r.raw_value or {}).get("trade_date", ""),
            reverse=True,
        )
        latest_daily = daily_records_sorted[0] if daily_records_sorted else None
        last_trade_date = (
            (latest_daily.raw_value or {}).get("trade_date", "") if latest_daily else ""
        )
        total_daily_value_billion = (
            float(
                (latest_daily.raw_value or {}).get("total_value_billion", 0.0) or 0.0
            )
            if latest_daily
            else 0.0
        )
        latest_avg_premium = (
            float(
                (latest_daily.raw_value or {}).get("avg_premium_pct", 0.0) or 0.0
            )
            if latest_daily
            else 0.0
        )

        # Industry inflow / outflow leaderboards.
        industry_payloads: list[dict[str, Any]] = []
        for r in industry_records:
            raw = r.raw_value if isinstance(r.raw_value, dict) else {}
            industry_payloads.append(
                {
                    "industry": str(raw.get("industry") or ""),
                    "net_flow_billion": round(
                        float(raw.get("net_flow_billion", 0.0) or 0.0), 4
                    ),
                    "n_tickers_traded": int(raw.get("n_tickers_traded", 0) or 0),
                    "signal_direction": str(raw.get("signal_direction") or "flat"),
                }
            )
        top_inflow = sorted(
            (i for i in industry_payloads if i["net_flow_billion"] > 0),
            key=lambda item: -item["net_flow_billion"],
        )[:PUBLIC_TOP_LIMIT]
        top_outflow = sorted(
            (i for i in industry_payloads if i["net_flow_billion"] < 0),
            key=lambda item: item["net_flow_billion"],
        )[:PUBLIC_TOP_LIMIT]

        # Top-N concentrated tickers: sort by trade count first (repeat-
        # buyer pattern), then by |net_flow| as tiebreak.
        ticker_payloads: list[dict[str, Any]] = []
        for r in ticker_records:
            raw = r.raw_value if isinstance(r.raw_value, dict) else {}
            ticker_payloads.append(
                {
                    "ticker": str(raw.get("ticker") or ""),
                    "stock_name": str(raw.get("stock_name") or ""),
                    "industry": str(raw.get("industry") or ""),
                    "n_trades_in_window": int(raw.get("n_trades_in_window", 0) or 0),
                    "net_flow_billion": round(
                        float(raw.get("net_flow", 0.0) or 0.0) / 1.0e8, 4
                    ),
                    "dominant_side": str(raw.get("dominant_side") or "mixed"),
                }
            )
        top_concentrated = sorted(
            ticker_payloads,
            key=lambda item: (
                -int(item["n_trades_in_window"]),
                -abs(float(item["net_flow_billion"])),
                item["ticker"],
            ),
        )[:PUBLIC_TOP_LIMIT]

        confidences = [float(r.confidence) for r in records if r.confidence > 0]
        avg_confidence = (
            round(sum(confidences) / len(confidences), 4) if confidences else 0.0
        )

        # Signal sign uses the latest day's avg_premium share with a 1.5%
        # deadband (matches the magnitude of normal-day premium share on
        # SSE/SZSE tape).
        if latest_avg_premium > 1.5:
            signal = 1
        elif latest_avg_premium < -1.5:
            signal = -1
        else:
            signal = 0
        strength = round(min(1.0, abs(latest_avg_premium) / 5.0), 4)

        return {
            "source": self.name,
            "category": self.category.value,
            "signal": signal,
            "strength": strength,
            "score": round(latest_avg_premium / 100.0, 4),
            "confidence": avg_confidence,
            "record_count": len(records),
            "last_trade_date": last_trade_date,
            "total_daily_value_billion": round(total_daily_value_billion, 4),
            "avg_premium_pct": round(latest_avg_premium, 4),
            "top_inflow_industries": top_inflow,
            "top_outflow_industries": top_outflow,
            "top_n_concentrated_tickers": top_concentrated,
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

        Mirrors :class:`NorthboundProvider.run_pipeline` so the three
        public-disclosure providers fail the same way for operators.
        """

        try:
            raw_data = self.fetch(**kwargs)
        except Exception as exc:
            self.logger.error("block_trades fetch crashed: %s", exc, exc_info=True)
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
        signal["partial_response"] = 0 < slices_responded < 2
        if slices_responded == 0:
            signal["low_coverage"] = True
        return signal


__all__ = [
    "BlockTradesProvider",
]

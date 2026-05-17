"""公募基金持仓 alt-data provider.

Disclosure context
------------------

A curated public-fund catalog publishes 季报 / 年报 holdings with top
underlying positions during the regular disclosure window. The combined
view — "this CN-A ticker is held by N catalog funds with a summed
reported position weight" — is a useful institutional-flow proxy:
集中加仓 surfaces as a rising ``holding_fund_count``; 集中减仓 as the
inverse.

Pipeline shape
--------------

Follows the standard ``BaseAltDataProvider`` four-stage contract:

- :meth:`fetch` calls
  ``ak.fund_portfolio_hold_em(symbol=code, date=year)`` (AkShare's
  天天基金 portfolio-holdings endpoint in the locked dependency line)
  once per fund in the curated catalog (default 50-name catalog). Errors per
  fund are caught locally so a single 404 doesn't tank the run; the
  ``confidence`` lowers proportionally to coverage instead.
- :meth:`parse` flattens the per-fund frames into ``(ticker, fund_code,
  weight_pct)`` tuples and aggregates them into per-ticker concentration
  metrics: ``holding_fund_count``, ``total_aum_weight_pct``,
  ``top_holder_fund_code``.
- :meth:`normalize` emits one ``AltDataRecord`` per ticker with
  ``record_type="fund_concentration_ticker"`` (carried through ``tags``
  so downstream evidence rendering can distinguish it from policy /
  inventory records).
- :meth:`to_signal` collapses the per-ticker records into a top-N
  concentration leaderboard plus an aggregate measure of how many
  公募 are at the same 拥挤交易 (crowded-trade) edge.

Source mode
-----------

``source_mode="public_disclosure"``, ``lag_days=15`` (a conservative
quarterly-disclosure freshness heuristic rather than a claim that every
report type is filed within 15 days). ``confidence`` starts at 0.7 when all
50 catalog funds returned data; degrades linearly with coverage (e.g.
30/50 -> 0.42). The provider never fabricates holdings if a fund returns no
rows — empty frames flow through as zero contribution.

Test seam
---------

Akshare is imported lazily inside :meth:`_fetch_one_fund` so the unit
tests can stub the module via ``sys.modules`` (matching the SHFE
adapter's pattern in ``tests/unit/test_shfe_inventory.py``). The tests
stub ``fund_portfolio_hold_em``, the API present in the locked AkShare
line, so they exercise the runtime dispatch surface without live HTTP.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, cast

import pandas as pd

from ..base_alt_provider import AltDataCategory, AltDataRecord, BaseAltDataProvider
from .fund_catalog import (
    CATALOG_VERSION,
    TOP_50_FUND_CATALOG,
    get_focus_for_code,
    get_top_50_codes,
)

logger = logging.getLogger(__name__)


# Columns the akshare 十大持仓股 frame is expected to contain. Names match
# the 2026 release of the akshare adapter; if upstream rotates the column
# names we surface a warning and degrade to zero rows for that fund.
_AKSHARE_COLUMN_TICKER_CANDIDATES = ("股票代码", "代码")
_AKSHARE_COLUMN_NAME_CANDIDATES = ("股票名称", "名称")
_AKSHARE_COLUMN_WEIGHT_CANDIDATES = ("占净值比例", "占净值比", "持仓占比")
_AKSHARE_COLUMN_QUARTER_CANDIDATES = ("季度", "报告期")


# Confidence cap for the perfect-coverage case (all 50 funds returned data).
# Lower than 1.0 because we explicitly want the public-disclosure nature
# (quarterly cadence, 15-day lag) to be visible in downstream
# weighted-evidence calculations alongside live exchange data.
_MAX_CONFIDENCE = 0.7

# The smallest number of fund responses required to even emit records.
# Below this the run is treated as 'no_data' rather than 'partial'.
_MIN_FUNDS_FOR_AGGREGATION = 5


def _first_column_match(df: pd.DataFrame, candidates: tuple[str, ...]) -> str | None:
    """Return the first column name in ``df`` that matches the candidate list."""

    for name in candidates:
        if name in df.columns:
            return name
    return None


def _normalize_ticker(raw: Any) -> str:
    """Normalize the akshare ticker column to a 6-digit string.

    Akshare returns Chinese-A tickers either as ``"600519"`` strings or as
    ``600519`` integers, depending on the upstream cleaning pass. We
    coerce to a 6-character zero-padded string so downstream aggregation
    keys are consistent.
    """

    if raw is None:
        return ""
    if isinstance(raw, (int, float)) and not pd.isna(raw):
        return f"{int(raw):06d}"
    text = str(raw).strip()
    if not text or text.lower() in {"nan", "none"}:
        return ""
    # Strip any prefix akshare sometimes adds (e.g. "SH600519" / "sz000858").
    if text[:2].upper() in {"SH", "SZ", "BJ"}:
        text = text[2:]
    if text.isdigit() and len(text) <= 6:
        text = text.zfill(6)
    return text


def _safe_weight(raw: Any) -> float:
    """Coerce a holdings weight value into a finite float (percent).

    Akshare reports the weight either as a number (e.g. ``8.43``) or as a
    string with a ``%`` suffix. We strip the percent sign and tolerate
    blank cells.
    """

    if raw is None:
        return 0.0
    if isinstance(raw, str):
        cleaned = raw.strip().rstrip("%").strip()
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


def _candidate_disclosure_years(reference: datetime | None = None) -> list[str]:
    """Return current and previous disclosure years for AkShare holdings lookup."""

    year = (reference or datetime.now()).year
    return [str(year), str(year - 1)]


def _call_akshare_holdings_api(ak: Any, code: str) -> pd.DataFrame:
    """Call the AkShare portfolio-holdings function available in requirements.lock.

    ``fund_portfolio_hold_em`` is the current AkShare 1.18.x surface. We keep
    a legacy fallback for older local environments, but tests pin the current
    function name so a future API drift does not pass silently.
    """

    portfolio_fn = getattr(ak, "fund_portfolio_hold_em", None)
    if callable(portfolio_fn):
        last_exception: Exception | None = None
        last_empty: pd.DataFrame | None = None
        for year in _candidate_disclosure_years():
            try:
                df = cast(pd.DataFrame | None, portfolio_fn(symbol=code, date=year))
            except Exception as exc:  # akshare wraps network/schema errors broadly
                last_exception = exc
                continue
            if df is None or getattr(df, "empty", True):
                last_empty = pd.DataFrame() if df is None else df
                continue
            return df
        if last_empty is not None:
            return last_empty
        if last_exception is not None:
            raise last_exception
        return pd.DataFrame()

    legacy_fn = getattr(ak, "fund_em_open_fund_info", None)
    if callable(legacy_fn):
        return cast(pd.DataFrame, legacy_fn(symbol=code, indicator="十大持仓股"))

    raise AttributeError("akshare fund holdings API unavailable: expected fund_portfolio_hold_em")


class FundHoldingsProvider(BaseAltDataProvider):

    """Aggregate 公募基金 reported holdings into per-ticker concentration metrics."""

    name = "fund_holdings"
    category = AltDataCategory.INSIDER_FLOW
    # Weekly cadence — matches the quarterly disclosure window's worst-case
    # noise floor while still surfacing mid-quarter manual catalog edits.
    update_interval = 7 * 24 * 3600

    DEFAULT_TOP_HOLDERS_LIMIT = 10
    DEFAULT_RECORDS_LIMIT = 50

    def __init__(self, config: dict[str, Any] | None = None):
        super().__init__(config)
        # The catalog is intentionally read at construction time so the
        # provider info surface (``catalog_version``, ``catalog_size``)
        # stays static for the life of the process.
        self.catalog = list(TOP_50_FUND_CATALOG)
        self.catalog_codes = get_top_50_codes()
        self.catalog_version = CATALOG_VERSION

    # ------------------------------------------------------------------
    # Step 1: fetch
    # ------------------------------------------------------------------

    def fetch(self, **kwargs: Any) -> list[dict[str, Any]]:
        """Fetch the top-10 holdings frame for every catalog fund.

        ``kwargs``:

        - ``codes``: optional iterable of fund codes overriding the catalog;
          when supplied, all entries must be 6-digit strings (the
          fund_catalog helper docstring spells out the format).
        - ``top_holdings_limit``: optional int truncating the per-fund top-N
          to fewer than the akshare default (10). Useful for tests.
        """

        requested = kwargs.get("codes")
        if requested:
            codes = [str(code).strip() for code in requested if str(code).strip()]
        else:
            codes = list(self.catalog_codes)

        limit = int(kwargs.get("top_holdings_limit") or self.DEFAULT_TOP_HOLDERS_LIMIT)

        try:
            import akshare as ak  # type: ignore  # noqa: F401
        except ImportError:
            self.logger.error("akshare not installed; fund_holdings cannot fetch")
            return [
                {
                    "code": code,
                    "rows": [],
                    "error": "akshare_not_installed",
                    "quarter": "",
                }
                for code in codes
            ]

        results: list[dict[str, Any]] = []
        for code in codes:
            payload = self._fetch_one_fund(code, limit)
            results.append(payload)
        return results

    def _fetch_one_fund(self, code: str, limit: int) -> dict[str, Any]:
        """Fetch the 十大持仓股 frame for one fund and tag with metadata.

        Catches all upstream exceptions (akshare can raise everything from
        ``HTTPError`` to ``KeyError`` depending on the failure mode) and
        downgrades to an empty payload with the error captured for the
        downstream confidence calculation.
        """

        try:
            import akshare as ak  # type: ignore
        except ImportError:
            return {
                "code": code,
                "rows": [],
                "error": "akshare_not_installed",
                "quarter": "",
            }

        try:
            df = _call_akshare_holdings_api(ak, code)
        except Exception as exc:
            self.logger.warning("fund_holdings %s: akshare call failed: %s", code, exc)
            return {
                "code": code,
                "rows": [],
                "error": f"akshare_error:{exc.__class__.__name__}",
                "quarter": "",
            }

        if df is None or getattr(df, "empty", True):
            return {"code": code, "rows": [], "error": "empty_response", "quarter": ""}

        ticker_col = _first_column_match(df, _AKSHARE_COLUMN_TICKER_CANDIDATES)
        weight_col = _first_column_match(df, _AKSHARE_COLUMN_WEIGHT_CANDIDATES)
        name_col = _first_column_match(df, _AKSHARE_COLUMN_NAME_CANDIDATES)
        quarter_col = _first_column_match(df, _AKSHARE_COLUMN_QUARTER_CANDIDATES)

        if ticker_col is None or weight_col is None:
            self.logger.warning(
                "fund_holdings %s: unexpected columns %s",
                code,
                list(df.columns),
            )
            return {
                "code": code,
                "rows": [],
                "error": "unexpected_schema",
                "quarter": "",
            }

        # Most-recent reporting period only — akshare returns a multi-quarter
        # frame for some funds, so we filter by the latest "季度" value.
        if quarter_col:
            try:
                quarters = df[quarter_col].dropna().astype(str)
            except Exception:
                quarters = pd.Series(dtype=str)
            if not quarters.empty:
                latest_quarter = str(sorted(quarters.unique())[-1])
                df = df[df[quarter_col].astype(str) == latest_quarter]
            else:
                latest_quarter = ""
        else:
            latest_quarter = ""

        rows: list[dict[str, Any]] = []
        for _, row in df.head(limit).iterrows():
            ticker = _normalize_ticker(row.get(ticker_col))
            if not ticker:
                continue
            weight = _safe_weight(row.get(weight_col))
            stock_name = str(row.get(name_col, "")).strip() if name_col else ""
            rows.append(
                {
                    "ticker": ticker,
                    "stock_name": stock_name,
                    "weight_pct": weight,
                }
            )

        return {
            "code": code,
            "rows": rows,
            "error": "",
            "quarter": latest_quarter,
        }

    # ------------------------------------------------------------------
    # Step 2: parse — aggregate to per-ticker concentration
    # ------------------------------------------------------------------

    def parse(self, raw_data: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Collapse per-fund holdings into per-ticker aggregates.

        Output rows look like:

        ``{ticker: "600519", holding_fund_count: 18, total_aum_weight_pct:
        87.5, top_holder_fund_code: "110011", stock_name: "贵州茅台",
        contributing_funds: [...]}``

        The aggregation is intentionally simple: we sum the per-fund
        weight contributions (each in percent of fund AUM) into a single
        ``total_aum_weight_pct`` measure that downstream consumers can
        interpret as "combined cross-fund weight". This is a proxy for
        concentration density, not absolute RMB exposure — that would
        require multiplying each weight by fund AUM, which is not on the
        十大持仓股 endpoint.
        """

        responded_funds = [item for item in raw_data if not item.get("error")]
        total_requested = len(raw_data) or 1
        coverage = len(responded_funds) / total_requested

        ticker_buckets: dict[str, dict[str, Any]] = {}
        for payload in responded_funds:
            fund_code = str(payload.get("code", "")).strip()
            quarter = str(payload.get("quarter", "") or "")
            for row in payload.get("rows", []):
                ticker = row["ticker"]
                weight = float(row.get("weight_pct", 0.0) or 0.0)
                bucket = ticker_buckets.setdefault(
                    ticker,
                    {
                        "ticker": ticker,
                        "stock_name": row.get("stock_name", ""),
                        "holding_fund_count": 0,
                        "total_aum_weight_pct": 0.0,
                        "top_holder_fund_code": fund_code,
                        "top_holder_weight_pct": weight,
                        "contributing_funds": [],
                        "quarter": quarter,
                    },
                )
                bucket["holding_fund_count"] += 1
                bucket["total_aum_weight_pct"] += weight
                bucket["contributing_funds"].append(
                    {
                        "fund_code": fund_code,
                        "fund_focus": get_focus_for_code(fund_code),
                        "weight_pct": weight,
                    }
                )
                if weight > bucket["top_holder_weight_pct"]:
                    bucket["top_holder_weight_pct"] = weight
                    bucket["top_holder_fund_code"] = fund_code
                if not bucket.get("stock_name"):
                    bucket["stock_name"] = row.get("stock_name", "")

        parsed: list[dict[str, Any]] = []
        for bucket in ticker_buckets.values():
            bucket["coverage"] = round(coverage, 4)
            bucket["total_aum_weight_pct"] = round(bucket["total_aum_weight_pct"], 4)
            bucket["top_holder_weight_pct"] = round(bucket["top_holder_weight_pct"], 4)
            parsed.append(bucket)

        # Sort by holding_fund_count desc, then weight desc, then ticker so
        # downstream evidence rendering and tests see a deterministic order.
        parsed.sort(
            key=lambda item: (
                -int(item.get("holding_fund_count", 0)),
                -float(item.get("total_aum_weight_pct", 0.0)),
                item.get("ticker", ""),
            )
        )
        return parsed

    # ------------------------------------------------------------------
    # Step 3: normalize — emit AltDataRecord per ticker
    # ------------------------------------------------------------------

    def normalize(self, parsed_data: list[dict[str, Any]]) -> list[AltDataRecord]:
        if not parsed_data:
            return []

        # ``coverage`` is identical across rows (computed in parse from the
        # shared denominator); pull from the first row for the metadata.
        coverage = float(parsed_data[0].get("coverage", 0.0))
        confidence = round(min(_MAX_CONFIDENCE, max(0.0, coverage) * _MAX_CONFIDENCE), 4)

        max_fund_count = max(
            (int(row.get("holding_fund_count", 0)) for row in parsed_data),
            default=1,
        )
        # Normalize the concentration score to [-1, 1]: more funds holding
        # the same ticker = more positive score (institutional pile-on).
        # We clamp at +0.95 so the floor never returns hard +1 (which would
        # mask the public-disclosure lag in confidence-weighted evidence).
        now = datetime.now()
        records: list[AltDataRecord] = []
        limit = self.DEFAULT_RECORDS_LIMIT
        for row in parsed_data[:limit]:
            ticker = row["ticker"]
            fund_count = int(row.get("holding_fund_count", 0))
            total_weight = float(row.get("total_aum_weight_pct", 0.0))
            normalized_score = min(0.95, fund_count / max(max_fund_count, 1) * 0.95)
            records.append(
                AltDataRecord(
                    timestamp=now,
                    source="fund_holdings:concentration",
                    category=AltDataCategory.INSIDER_FLOW,
                    raw_value={
                        "ticker": ticker,
                        "stock_name": row.get("stock_name", ""),
                        "record_type": "fund_concentration_ticker",
                        "holding_fund_count": fund_count,
                        "total_aum_weight_pct": total_weight,
                        "top_holder_fund_code": row.get("top_holder_fund_code", ""),
                        "top_holder_weight_pct": float(row.get("top_holder_weight_pct", 0.0)),
                        "contributing_funds": row.get("contributing_funds", [])[:8],
                        "quarter": row.get("quarter", ""),
                    },
                    normalized_score=round(normalized_score, 4),
                    confidence=confidence,
                    tags=[
                        ticker,
                        "fund_holdings",
                        "fund_concentration_ticker",
                        "institutional_flow",
                    ],
                    metadata={
                        "symbol": ticker,
                        "ticker": ticker,
                        "company": row.get("stock_name", "") or ticker,
                        "record_type": "fund_concentration_ticker",
                        "source_mode": "public_disclosure",
                        "fallback_reason": "" if coverage > 0 else "no_fund_responded",
                        "lag_days": 15,
                        "coverage": round(coverage, 4),
                        "catalog_version": self.catalog_version,
                        "category": "institutional_flow",
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
                "total_funds_covered": 0,
                "total_funds_requested": len(self.catalog_codes),
                "top_concentration_tickers": [],
                "fund_count": 0,
                "source_mode_summary": {
                    "counts": {"public_disclosure": 0},
                    "dominant": "public_disclosure",
                },
                "catalog_version": self.catalog_version,
                "timestamp": datetime.now().isoformat(),
            }

        # Use the per-record metadata as the consistent source-of-truth for
        # coverage / lag / confidence (they are identical across records for
        # a given run).
        first_meta = records[0].metadata or {}
        coverage = float(first_meta.get("coverage", 0.0))
        total_requested = max(len(self.catalog_codes), 1)
        total_covered = round(coverage * total_requested)

        # Top-N leaderboard for the public-summary export and the narrative.
        top_records = sorted(
            records,
            key=lambda r: (
                -int((r.raw_value or {}).get("holding_fund_count", 0)),
                -float((r.raw_value or {}).get("total_aum_weight_pct", 0.0)),
                (r.raw_value or {}).get("ticker", ""),
            ),
        )
        top_tickers = []
        for record in top_records[:10]:
            raw = record.raw_value if isinstance(record.raw_value, dict) else {}
            top_tickers.append(
                {
                    "ticker": raw.get("ticker", ""),
                    "stock_name": raw.get("stock_name", ""),
                    "holding_fund_count": int(raw.get("holding_fund_count", 0)),
                    "total_aum_weight_pct": round(
                        float(raw.get("total_aum_weight_pct", 0.0)), 4
                    ),
                    "top_holder_fund_code": raw.get("top_holder_fund_code", ""),
                }
            )

        confidences = [float(r.confidence) for r in records if r.confidence > 0]
        avg_confidence = round(sum(confidences) / len(confidences), 4) if confidences else 0.0
        avg_concentration = round(
            sum(float(r.normalized_score) for r in records) / len(records), 4
        )
        signal = 1 if avg_concentration >= 0.35 else 0

        return {
            "source": self.name,
            "category": self.category.value,
            "signal": signal,
            "strength": round(abs(avg_concentration), 4),
            "score": avg_concentration,
            "confidence": avg_confidence,
            "record_count": len(records),
            "total_funds_covered": total_covered,
            "total_funds_requested": total_requested,
            "top_concentration_tickers": top_tickers,
            "fund_count": total_covered,
            "source_mode_summary": {
                "counts": {"public_disclosure": len(records)},
                "dominant": "public_disclosure",
            },
            "catalog_version": self.catalog_version,
            "timestamp": datetime.now().isoformat(),
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def get_provider_info(self) -> dict[str, Any]:
        info = super().get_provider_info()
        info["catalog_version"] = self.catalog_version
        info["catalog_size"] = len(self.catalog_codes)
        return info

    def run_pipeline(self, **kwargs: Any) -> dict[str, Any]:
        """Override to surface the empty / partial fund response cases.

        The base implementation collapses zero-record runs into the
        ``to_signal([])`` empty payload. We replicate that here but also
        annotate the result so ops dashboards can detect "akshare returned
        nothing" vs "akshare disagrees on schema" without parsing the log.
        """

        try:
            raw_data = self.fetch(**kwargs)
        except Exception as exc:
            self.logger.error("fund_holdings fetch crashed: %s", exc, exc_info=True)
            return self.to_signal([])

        parsed = self.parse(raw_data)
        records = self.normalize(parsed)

        # Mirror base behaviour: persist history + last_update.
        self._history.extend(records)
        self._history = self._history[-500:]
        self._last_update = datetime.now()

        signal = self.to_signal(records)
        responded_fund_count = sum(
            1 for entry in raw_data if entry and not entry.get("error")
        )
        signal["total_funds_responded"] = responded_fund_count
        signal["partial_response"] = (
            responded_fund_count > 0
            and responded_fund_count < len(raw_data)
        )
        if responded_fund_count < _MIN_FUNDS_FOR_AGGREGATION:
            # Mark the signal as low-coverage so the public-summary and
            # narrative downstream can degrade gracefully.
            signal["low_coverage"] = True
        return signal


__all__ = [
    "FundHoldingsProvider",
]

"""Tushare Pro provider for China A-share market data."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta
from typing import Any, ClassVar

import pandas as pd

from .base_provider import BaseDataProvider, DataProviderError

logger = logging.getLogger(__name__)

try:
    import tushare as ts

    TUSHARE_AVAILABLE = True
except ImportError:  # pragma: no cover - exercised only when optional dep is absent
    ts = None
    TUSHARE_AVAILABLE = False
    logger.warning("Tushare not installed. Install with: pip install tushare")


class TushareProvider(BaseDataProvider):
    """China A-share OHLCV and valuation data via Tushare Pro."""

    name = "tushare"
    priority = 0
    rate_limit = 120
    requires_api_key = True
    default_probe_symbol = "000001.SZ"

    # Tushare 原生单位: 成交量=手(100股), 成交额=千元。归一到 股/元。
    # 历史经 _standardize_dataframe 自动折算; quote 派生自历史, 无需额外处理。
    VOLUME_TO_SHARES = 100
    AMOUNT_TO_YUAN = 1000

    _INTERVAL_TO_FREQ: ClassVar[dict[str, str]] = {
        "1m": "1min",
        "5m": "5min",
        "15m": "15min",
        "30m": "30min",
        "60m": "60min",
        "1h": "60min",
        "1d": "D",
        "1wk": "W",
        "1mo": "M",
    }

    def __init__(self, api_key: str | None = None, config: dict[str, Any] | None = None):
        super().__init__(api_key=api_key, config=config)
        self.timeout = int(self.config.get("timeout", 30))
        self.adjust = str(self.config.get("adjust", "qfq") or "qfq")
        self._api = None

    @classmethod
    def normalize_ts_code(cls, symbol: str) -> str | None:
        """Return a Tushare ts_code for A-share symbols, otherwise None."""
        normalized = str(symbol or "").strip().upper()
        if not normalized:
            return None

        yahoo_match = re.fullmatch(r"(\d{6})\.SS", normalized)
        if yahoo_match:
            return f"{yahoo_match.group(1)}.SH"

        if re.fullmatch(r"\d{6}\.(SH|SZ|BJ)", normalized):
            return normalized

        prefixed_match = re.fullmatch(r"(SH|SZ|BJ)(\d{6})", normalized)
        if prefixed_match:
            return f"{prefixed_match.group(2)}.{prefixed_match.group(1)}"

        if re.fullmatch(r"\d{6}", normalized):
            if normalized.startswith(("6", "9")):
                return f"{normalized}.SH"
            if normalized.startswith(("0", "2", "3")):
                return f"{normalized}.SZ"
            if normalized.startswith(("4", "8")):
                return f"{normalized}.BJ"

        return None

    def _get_api(self):
        if not TUSHARE_AVAILABLE:
            raise DataProviderError("Tushare is not installed")
        if not self.api_key:
            raise DataProviderError("Tushare token is required")
        if self._api is None:
            self._api = ts.pro_api(self.api_key, timeout=self.timeout)
        return self._api

    def _resolve_freq(self, interval: str) -> str:
        freq = self._INTERVAL_TO_FREQ.get(str(interval or "1d"))
        if not freq:
            raise DataProviderError(f"Unsupported Tushare interval: {interval}")
        return freq

    @staticmethod
    def _date_arg(value: datetime | None) -> str:
        return value.strftime("%Y%m%d") if value is not None else ""

    @staticmethod
    def _safe_float(value: Any, default: float | None = None) -> float | None:
        if value in (None, ""):
            return default
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return default
        if pd.isna(numeric):
            return default
        return numeric

    @staticmethod
    def _safe_int(value: Any, default: int | None = None) -> int | None:
        numeric = TushareProvider._safe_float(value)
        return int(numeric) if numeric is not None else default

    def _normalize_history_frame(self, df: pd.DataFrame) -> pd.DataFrame:
        if df is None or df.empty:
            return pd.DataFrame()

        normalized = df.copy()
        normalized = normalized.rename(
            columns={
                "trade_date": "date",
                "trade_time": "date",
                "ts_code": "symbol",
                "vol": "volume",
                "pct_chg": "pct_change",
            }
        )

        if "date" not in normalized.columns:
            return pd.DataFrame()

        date_values = normalized["date"].astype(str)
        if date_values.str.fullmatch(r"\d{8}").all():
            normalized["date"] = pd.to_datetime(date_values, format="%Y%m%d")
        else:
            normalized["date"] = pd.to_datetime(normalized["date"], errors="coerce")
        normalized = normalized.dropna(subset=["date"]).set_index("date").sort_index()

        for column in [
            "open",
            "high",
            "low",
            "close",
            "pre_close",
            "change",
            "pct_change",
            "volume",
            "amount",
            "turnover_rate",
            "volume_ratio",
        ]:
            if column in normalized.columns:
                normalized[column] = pd.to_numeric(normalized[column], errors="coerce")

        normalized = self._standardize_dataframe(normalized)
        normalized.index.name = "date"
        return normalized

    def get_historical_data(
        self,
        symbol: str,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        interval: str = "1d",
    ) -> pd.DataFrame:
        ts_code = self.normalize_ts_code(symbol)
        if ts_code is None:
            return pd.DataFrame()

        if end_date is None:
            end_date = datetime.now()
        if start_date is None:
            start_date = end_date - timedelta(days=365)

        try:
            data = ts.pro_bar(
                ts_code=ts_code,
                api=self._get_api(),
                start_date=self._date_arg(start_date),
                end_date=self._date_arg(end_date),
                freq=self._resolve_freq(interval),
                adj=self.adjust,
            )
            frame = self._normalize_history_frame(data)
            logger.debug("[Tushare] Fetched %s rows for %s", len(frame), ts_code)
            return frame
        except DataProviderError:
            raise
        except Exception as exc:
            logger.error("[Tushare] Error fetching %s: %s", ts_code, exc)
            raise DataProviderError(f"Failed to fetch data from Tushare: {exc}") from exc

    def get_latest_quote(self, symbol: str) -> dict[str, Any]:
        ts_code = self.normalize_ts_code(symbol)
        if ts_code is None:
            return {"symbol": symbol, "error": "Unsupported non-A-share symbol", "source": self.name}

        try:
            history = self.get_historical_data(
                ts_code,
                start_date=datetime.now() - timedelta(days=15),
                end_date=datetime.now(),
                interval="1d",
            )
            if history.empty:
                return {"symbol": ts_code, "error": "No quote data", "source": self.name}

            latest = history.iloc[-1]
            previous = history.iloc[-2] if len(history) > 1 else None
            price = self._safe_float(latest.get("close"), 0.0) or 0.0
            previous_close = self._safe_float(latest.get("pre_close"))
            if previous_close is None and previous is not None:
                previous_close = self._safe_float(previous.get("close"))
            change = self._safe_float(latest.get("change"))
            if change is None and previous_close not in (None, 0):
                change = price - previous_close
            change_percent = self._safe_float(latest.get("pct_change"))
            if change_percent is None and change is not None and previous_close not in (None, 0):
                change_percent = (change / previous_close) * 100

            timestamp = history.index[-1].to_pydatetime() if len(history.index) else datetime.now()
            return {
                "symbol": ts_code,
                "price": price,
                "change": change,
                "change_percent": change_percent,
                "volume": self._safe_int(latest.get("volume"), 0),
                "amount": self._safe_float(latest.get("amount"), 0.0),
                "high": self._safe_float(latest.get("high"), 0.0),
                "low": self._safe_float(latest.get("low"), 0.0),
                "open": self._safe_float(latest.get("open"), 0.0),
                "previous_close": previous_close,
                "timestamp": timestamp,
                "source": self.name,
            }
        except Exception as exc:
            logger.error("[Tushare] Error getting quote for %s: %s", ts_code, exc)
            return {"symbol": ts_code, "error": str(exc), "source": self.name}

    def get_fundamental_data(self, symbol: str) -> dict[str, Any]:
        ts_code = self.normalize_ts_code(symbol)
        if ts_code is None:
            return {"symbol": symbol, "error": "Unsupported non-A-share symbol", "source": self.name}

        try:
            api = self._get_api()
            end_date = datetime.now()
            start_date = end_date - timedelta(days=45)
            basic = api.daily_basic(
                ts_code=ts_code,
                start_date=self._date_arg(start_date),
                end_date=self._date_arg(end_date),
                fields=(
                    "ts_code,trade_date,close,turnover_rate,volume_ratio,pe,pb,ps,"
                    "dv_ratio,total_mv,circ_mv"
                ),
            )
            profile = api.stock_basic(
                ts_code=ts_code,
                fields="ts_code,name,industry,market,list_date",
            )

            row: dict[str, Any] = {}
            if basic is not None and not basic.empty:
                basic = basic.sort_values("trade_date")
                row.update(basic.iloc[-1].to_dict())
            if profile is not None and not profile.empty:
                row.update(profile.iloc[0].to_dict())

            if not row:
                return {"symbol": ts_code, "error": "No fundamental data", "source": self.name}

            return {
                "symbol": ts_code,
                "company_name": row.get("name", ""),
                "industry": row.get("industry", ""),
                "market": row.get("market", ""),
                "list_date": row.get("list_date", ""),
                "close": self._safe_float(row.get("close"), 0.0),
                "turnover_rate": self._safe_float(row.get("turnover_rate"), 0.0),
                "volume_ratio": self._safe_float(row.get("volume_ratio"), 0.0),
                "pe_ratio": self._safe_float(row.get("pe"), 0.0),
                "pb_ratio": self._safe_float(row.get("pb"), 0.0),
                "ps_ratio": self._safe_float(row.get("ps"), 0.0),
                "dividend_yield": self._safe_float(row.get("dv_ratio"), 0.0),
                "market_cap": self._safe_float(row.get("total_mv"), 0.0),
                "float_market_cap": self._safe_float(row.get("circ_mv"), 0.0),
                "trade_date": row.get("trade_date"),
                "source": self.name,
            }
        except Exception as exc:
            logger.error("[Tushare] Error getting fundamentals for %s: %s", ts_code, exc)
            return {"symbol": ts_code, "error": str(exc), "source": self.name}

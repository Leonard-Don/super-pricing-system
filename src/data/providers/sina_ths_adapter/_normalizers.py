"""Pure normalization helpers for the Sina/THS industry adapter."""

from __future__ import annotations

import re
from typing import Any, Dict, List

import pandas as pd


def numeric_series_or_default(
    df: pd.DataFrame,
    column: str,
    default: float = 0.0,
) -> pd.Series:
    if column in df.columns:
        return pd.to_numeric(df[column], errors="coerce").fillna(default)
    return pd.Series(default, index=df.index, dtype="float64")


def boolean_series_or_default(
    df: pd.DataFrame,
    column: str,
    default: bool = False,
) -> pd.Series:
    if column not in df.columns:
        return pd.Series(default, index=df.index, dtype=bool)

    def normalize(value: Any) -> bool:
        if pd.isna(value):
            return bool(default)
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "y"}
        return bool(value)

    return df[column].map(normalize).astype(bool)


def build_name_aliases(raw_name: str) -> List[str]:
    normalized = str(raw_name or "").strip()
    if not normalized:
        return []

    aliases = {normalized}

    # Clean listing prefixes such as N/C/U/W/*ST/ST.
    prefix_clean = re.sub(r"^[NCUW\*]*(ST)?", "", normalized, flags=re.IGNORECASE).strip()
    if prefix_clean:
        aliases.add(prefix_clean)

    # Clean STAR/registration suffixes such as "-U", "-W", "-A".
    suffix_clean = re.sub(r"-[A-Z]+$", "", normalized, flags=re.IGNORECASE).strip()
    if suffix_clean:
        aliases.add(suffix_clean)

    combined_clean = re.sub(r"-[A-Z]+$", "", prefix_clean, flags=re.IGNORECASE).strip()
    if combined_clean:
        aliases.add(combined_clean)

    return [alias for alias in aliases if alias]


def normalize_sina_stock_rows(stocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    normalized_rows: List[Dict[str, Any]] = []
    for stock in stocks or []:
        symbol = str(stock.get("code") or stock.get("symbol") or "").strip()
        if not symbol:
            continue
        normalized_rows.append(
            {
                "symbol": symbol,
                "code": symbol,
                "name": stock.get("name", ""),
                "change_pct": stock.get("change_pct", 0),
                "market_cap": stock.get("mktcap", 0) * 10000,
                "volume": stock.get("volume", 0),
                "amount": stock.get("amount", 0),
                "pe_ratio": stock.get("pe_ratio", 0),
                "pb_ratio": stock.get("pb_ratio", 0),
            }
        )
    return normalized_rows

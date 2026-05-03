"""Internal trend / mini-trend helpers for IndustryAnalyzer.

Helpers that turn industry classification + historical index data into
the OHLC trend series shown in the detail dialog, plus the small
``mini_trend`` lookup that powers ranking sparklines.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from src.utils.config import PROJECT_ROOT

logger = logging.getLogger(__name__)

_TREND_ALIAS_CACHE: Optional[Dict[str, str]] = None


def load_trend_aliases() -> Dict[str, str]:
    global _TREND_ALIAS_CACHE
    if _TREND_ALIAS_CACHE is not None:
        return _TREND_ALIAS_CACHE

    alias_file = PROJECT_ROOT / "data" / "industry" / "trend_aliases.json"
    try:
        with open(alias_file, "r", encoding="utf-8") as file:
            payload = json.load(file)
            if isinstance(payload, dict):
                _TREND_ALIAS_CACHE = {
                    str(key).strip(): str(value).strip()
                    for key, value in payload.items()
                    if key and value
                }
                return _TREND_ALIAS_CACHE
    except FileNotFoundError:
        logger.warning("Industry trend alias file not found: %s", alias_file)
    except Exception as exc:
        logger.warning("Failed to load industry trend aliases: %s", exc)

    _TREND_ALIAS_CACHE = {}
    return _TREND_ALIAS_CACHE


def load_industry_trend_series(
    analyzer: Any,
    industry_name: str,
    days: int = 30,
) -> List[Dict[str, Any]]:
    """加载行业指数趋势序列，用于详情页走势展示。"""
    if analyzer.provider is None or not hasattr(analyzer.provider, "get_industry_classification") or not hasattr(analyzer.provider, "get_industry_index"):
        return []

    try:
        normalized_name = str(industry_name or "").strip()
        trend_aliases = load_trend_aliases()

        def resolve_industry_code() -> str:
            candidate_frames = []
            primary_df = analyzer.provider.get_industry_classification()
            if primary_df is not None and not primary_df.empty:
                candidate_frames.append(primary_df)
            akshare_provider = getattr(analyzer.provider, "akshare", None)
            if akshare_provider is not None and hasattr(akshare_provider, "get_industry_classification"):
                akshare_df = akshare_provider.get_industry_classification()
                if akshare_df is not None and not akshare_df.empty:
                    candidate_frames.insert(0, akshare_df)

            search_names = [normalized_name]
            aliased_name = trend_aliases.get(normalized_name)
            if aliased_name and aliased_name not in search_names:
                search_names.append(aliased_name)

            for frame in candidate_frames:
                if "industry_name" not in frame.columns or "industry_code" not in frame.columns:
                    continue
                working_df = frame.copy()
                working_df["industry_name"] = working_df["industry_name"].astype(str).str.strip()
                for search_name in search_names:
                    exact_match = working_df[working_df["industry_name"] == search_name]
                    if not exact_match.empty:
                        return str(exact_match.iloc[0].get("industry_code", "")).strip()
                for search_name in search_names:
                    contains_match = working_df[working_df["industry_name"].str.contains(search_name, na=False)]
                    if not contains_match.empty:
                        return str(contains_match.iloc[0].get("industry_code", "")).strip()
            return ""

        industry_code = resolve_industry_code()
        if not industry_code:
            return []

        end_date = datetime.now()
        start_date = end_date - timedelta(days=max(int(days) * 3, 60))
        hist_df = analyzer.provider.get_industry_index(
            industry_code,
            start_date=start_date,
            end_date=end_date,
        )
        if hist_df is None or hist_df.empty or "close" not in hist_df.columns:
            return []

        normalized_hist = hist_df.copy().sort_index()
        normalized_hist = normalized_hist.tail(max(int(days), 20))
        close_series = pd.to_numeric(normalized_hist["close"], errors="coerce")
        if close_series.dropna().empty:
            return []

        result = []
        prev_close = None
        for idx, row in normalized_hist.iterrows():
            close_value = pd.to_numeric(pd.Series([row.get("close")]), errors="coerce").iloc[0]
            if pd.isna(close_value):
                continue

            open_value = pd.to_numeric(pd.Series([row.get("open")]), errors="coerce").iloc[0] if "open" in normalized_hist.columns else np.nan
            high_value = pd.to_numeric(pd.Series([row.get("high")]), errors="coerce").iloc[0] if "high" in normalized_hist.columns else np.nan
            low_value = pd.to_numeric(pd.Series([row.get("low")]), errors="coerce").iloc[0] if "low" in normalized_hist.columns else np.nan
            volume_value = pd.to_numeric(pd.Series([row.get("volume")]), errors="coerce").iloc[0] if "volume" in normalized_hist.columns else np.nan
            amount_value = pd.to_numeric(pd.Series([row.get("amount")]), errors="coerce").iloc[0] if "amount" in normalized_hist.columns else np.nan
            change_pct = ((float(close_value) / float(prev_close) - 1) * 100) if prev_close not in (None, 0) else None

            result.append({
                "date": idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx),
                "open": None if pd.isna(open_value) else round(float(open_value), 2),
                "high": None if pd.isna(high_value) else round(float(high_value), 2),
                "low": None if pd.isna(low_value) else round(float(low_value), 2),
                "close": round(float(close_value), 2),
                "volume": None if pd.isna(volume_value) else float(volume_value),
                "amount": None if pd.isna(amount_value) else float(amount_value),
                "change_pct": None if change_pct is None else round(float(change_pct), 2),
            })
            prev_close = float(close_value)

        return result
    except Exception as e:
        logger.debug(f"Failed to load industry trend series for {industry_name}: {e}")
        return []


def build_relative_trend_points_from_cumulative_changes(cumulative_changes: List[float]) -> List[float]:
    if not cumulative_changes:
        return []

    points = []
    ordered_changes = list(cumulative_changes)
    for change in reversed(ordered_changes):
        try:
            denominator = 1 + (float(change) / 100.0)
        except (TypeError, ValueError):
            return []
        if denominator <= 0:
            return []
        points.append(round(100.0 / denominator, 3))
    points.append(100.0)
    return points


def build_industry_mini_trend_lookup(analyzer: Any, max_days: int = 5) -> Dict[str, List[float]]:
    max_days = max(2, int(max_days or 5))
    trend_frames = []
    for day in range(1, max_days + 1):
        try:
            day_df = analyzer.analyze_money_flow(days=day)
        except Exception as exc:
            logger.warning("Failed to build industry mini trend for %s-day lookback: %s", day, exc)
            continue
        if day_df.empty or "industry_name" not in day_df.columns or "change_pct" not in day_df.columns:
            continue
        trend_frames.append(
            day_df[["industry_name", "change_pct"]]
            .rename(columns={"change_pct": f"change_pct_{day}"})
        )

    if not trend_frames:
        return {}

    merged_trends = trend_frames[0]
    for frame in trend_frames[1:]:
        merged_trends = merged_trends.merge(frame, on="industry_name", how="outer")

    trend_lookup: Dict[str, List[float]] = {}
    for _, row in merged_trends.iterrows():
        industry_name = row.get("industry_name", "")
        changes = []
        for day in range(1, max_days + 1):
            value = row.get(f"change_pct_{day}")
            if pd.isna(value):
                changes = []
                break
            changes.append(float(value))
        if len(changes) >= 2:
            trend_lookup[industry_name] = build_relative_trend_points_from_cumulative_changes(changes)
    return trend_lookup

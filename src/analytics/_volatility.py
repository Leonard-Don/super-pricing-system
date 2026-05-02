"""Internal volatility helpers for IndustryAnalyzer.

Pure helpers for deriving / overriding industry-level volatility columns
without changing the analyzer surface. Functions are stateless except
``ensure_industry_volatility`` which simply normalizes a dataframe.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


def weighted_std(values: np.ndarray, weights: np.ndarray) -> float:
    """计算加权标准差；权重不可用时退化为普通标准差。"""
    clean_values = np.asarray(values, dtype=float)
    clean_weights = np.asarray(weights, dtype=float)
    if clean_values.size == 0:
        return 0.0
    if clean_values.size == 1:
        return 0.0
    if clean_weights.size != clean_values.size or clean_weights.sum() <= 0:
        return float(np.std(clean_values))
    mean = np.average(clean_values, weights=clean_weights)
    variance = np.average((clean_values - mean) ** 2, weights=clean_weights)
    return float(np.sqrt(max(variance, 0.0)))


def ensure_industry_volatility(df: pd.DataFrame) -> pd.DataFrame:
    """
    为行业数据补齐统一的波动率字段。

    优先级:
    1. 真实/已有字段 `industry_volatility`
    2. 行业振幅 `amplitude`
    3. 行业换手率 `turnover_rate`
    4. 绝对涨跌幅 `abs(change_pct)` 作为最保守代理
    """
    if df.empty:
        return df

    result = df.copy()
    if "industry_volatility_source" not in result.columns:
        result["industry_volatility_source"] = None
    if "industry_volatility" in result.columns:
        result["industry_volatility"] = pd.to_numeric(result["industry_volatility"], errors="coerce").fillna(0.0)
        result["industry_volatility_source"] = result["industry_volatility_source"].fillna("industry_volatility")
        return result

    if "amplitude" in result.columns:
        result["industry_volatility"] = pd.to_numeric(result["amplitude"], errors="coerce").fillna(0.0)
        result["industry_volatility_source"] = "amplitude_proxy"
        return result

    if "turnover_rate" in result.columns and pd.to_numeric(result["turnover_rate"], errors="coerce").fillna(0).abs().sum() > 0:
        result["industry_volatility"] = pd.to_numeric(result["turnover_rate"], errors="coerce").fillna(0.0)
        result["industry_volatility_source"] = "turnover_rate_proxy"
        return result

    change_col = "change_pct" if "change_pct" in result.columns else ("weighted_change" if "weighted_change" in result.columns else None)
    if change_col:
        result["industry_volatility"] = pd.to_numeric(result[change_col], errors="coerce").fillna(0.0).abs()
        result["industry_volatility_source"] = "change_proxy"
    else:
        result["industry_volatility"] = 0.0
        result["industry_volatility_source"] = "unavailable"
    return result


def apply_historical_volatility(df: pd.DataFrame, historical_vol_df: pd.DataFrame) -> pd.DataFrame:
    """用真实历史波动率覆盖现有代理波动率。"""
    if df.empty or historical_vol_df.empty:
        return df
    merged = df.merge(
        historical_vol_df[["industry_name", "industry_volatility"]],
        on="industry_name",
        how="left",
        suffixes=("", "_historical"),
    )
    if "industry_volatility_historical" in merged.columns:
        historical_mask = pd.to_numeric(
            merged["industry_volatility_historical"],
            errors="coerce",
        ).notna()
        merged["industry_volatility"] = pd.to_numeric(
            merged["industry_volatility_historical"],
            errors="coerce",
        ).fillna(pd.to_numeric(merged.get("industry_volatility", 0), errors="coerce").fillna(0.0))
        if "industry_volatility_source" not in merged.columns:
            merged["industry_volatility_source"] = None
        merged.loc[historical_mask, "industry_volatility_source"] = "historical_index"
        merged = merged.drop(columns=["industry_volatility_historical"])
    return merged


def calculate_industry_historical_volatility(
    analyzer: Any,
    lookback: int = 20,
    industries: Optional[List[str]] = None,
) -> pd.DataFrame:
    """
    基于行业指数历史收盘价计算真实区间波动率。

    返回字段:
    - industry_name
    - industry_volatility
    """
    if analyzer.provider is None or not hasattr(analyzer.provider, "get_industry_index"):
        return pd.DataFrame()

    cache_key = None
    if industries is None:
        cache_key = analyzer._get_cache_key("industry_volatility", lookback=lookback)
        cached = analyzer._get_from_cache(cache_key)
        if cached is not None:
            return cached

    industry_df = analyzer.provider.get_industry_classification()
    if industry_df.empty or "industry_name" not in industry_df.columns or "industry_code" not in industry_df.columns:
        return pd.DataFrame()

    working_df = industry_df.copy()
    if industries is not None:
        working_df = working_df[working_df["industry_name"].isin(industries)]
    if working_df.empty:
        return pd.DataFrame()

    end_date = datetime.now()
    start_date = end_date - timedelta(days=max(int(lookback) * 3, 30))

    def _fetch_volatility(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        industry_name = row.get("industry_name")
        industry_code = row.get("industry_code")
        if not industry_name or not industry_code:
            return None
        try:
            hist_df = analyzer.provider.get_industry_index(
                industry_code,
                start_date=start_date,
                end_date=end_date,
            )
            if hist_df.empty or "close" not in hist_df.columns:
                return None
            close = pd.to_numeric(hist_df["close"], errors="coerce").dropna()
            if len(close) < 2:
                return None
            returns = close.pct_change().dropna().tail(max(int(lookback), 1))
            if returns.empty:
                return None
            return {
                "industry_name": industry_name,
                "industry_volatility": float(returns.std() * 100),
            }
        except Exception as e:
            logger.debug(f"Failed to fetch historical volatility for {industry_name}: {e}")
            return None

    records = []
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = [
            executor.submit(_fetch_volatility, row)
            for row in working_df[["industry_name", "industry_code"]].to_dict(orient="records")
        ]
        for future in as_completed(futures):
            item = future.result()
            if item is not None:
                records.append(item)

    if not records:
        return pd.DataFrame()

    result = pd.DataFrame(records).drop_duplicates(subset=["industry_name"], keep="first")
    if cache_key:
        analyzer._update_cache(cache_key, result)
    return result

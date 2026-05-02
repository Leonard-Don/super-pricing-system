"""Internal volatility helpers for IndustryAnalyzer.

Pure helpers for deriving / overriding industry-level volatility columns
without changing the analyzer surface. Functions are stateless except
``ensure_industry_volatility`` which simply normalizes a dataframe.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


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

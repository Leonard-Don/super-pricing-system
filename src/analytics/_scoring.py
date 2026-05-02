"""Internal rank-score helpers for IndustryAnalyzer.

Pure helpers for converting raw factor columns into the unified 0-100
heat score used across the heatmap and rank endpoints. State-bearing
helpers receive the analyzer instance so they can read ``self.weights``.
"""

from __future__ import annotations

from typing import Any, Dict, List

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler


def derive_size_source(market_cap_source: Any) -> str:
    """将热力图尺寸来源收敛到与 marketCapSource 一致的类别。"""
    source = str(market_cap_source or "unknown").strip()
    if source.startswith("snapshot_"):
        return "snapshot"
    if source == "sina_proxy_stock_sum":
        return "proxy"
    if source == "unknown" or source.startswith("estimated") or source == "constant_fallback":
        return "estimated"
    return "live"


def scale_rank_score(series: pd.Series) -> pd.Series:
    """
    将横截面原始分数压缩到统一的 0-100 展示口径。

    这里保留 20-95 的可读区间，避免排序分数在样本很集中时出现 0/100 贴边。
    """
    clean = pd.to_numeric(series, errors="coerce").replace([np.inf, -np.inf], np.nan).fillna(0.0)
    if clean.empty:
        return clean
    if len(clean) == 1:
        return pd.Series([50.0], index=clean.index, dtype=float)

    s_min = clean.min()
    s_max = clean.max()
    if s_max <= s_min:
        return pd.Series(50.0, index=clean.index, dtype=float)
    return 20 + 75 * (clean - s_min) / (s_max - s_min)


def calculate_rank_score_series(analyzer: Any, df: pd.DataFrame) -> pd.Series:
    """
    基于当前可用的横截面因子计算统一行业热度分数。

    因子口径:
    - momentum: change_pct / weighted_change
    - money_flow: flow_strength
    - volume_change: avg_volume，若缺失则退化到 turnover_rate
    - volatility: industry_volatility，高波动率为负向惩罚
    """
    if df.empty:
        return pd.Series(dtype=float)

    scaler = StandardScaler()
    raw_score = pd.Series(0.0, index=df.index, dtype=float)
    used_factor = False

    factor_specs = [
        ("momentum", "change_pct" if "change_pct" in df.columns else "weighted_change"),
        ("money_flow", "flow_strength" if "flow_strength" in df.columns else None),
        ("volume_change", "avg_volume" if "avg_volume" in df.columns else ("turnover_rate" if "turnover_rate" in df.columns else None)),
        ("volatility", "industry_volatility" if "industry_volatility" in df.columns else None),
    ]

    for weight_key, column in factor_specs:
        if not column or column not in df.columns:
            continue
        try:
            factor_values = pd.to_numeric(df[column], errors="coerce").fillna(0.0)
            raw_score += scaler.fit_transform(factor_values.to_frame()).flatten() * analyzer.weights.get(weight_key, 0.0)
            used_factor = True
        except ValueError:
            continue

    if not used_factor:
        return pd.Series(50.0, index=df.index, dtype=float)

    return scale_rank_score(raw_score)


def build_rank_score_breakdown(analyzer: Any, record: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not record:
        return []

    change_pct = float(record.get("change_pct", record.get("momentum", 0)) or 0)
    flow_strength = float(record.get("flow_strength", 0) or 0)
    money_flow = float(record.get("money_flow", record.get("main_net_inflow", 0)) or 0)
    turnover_rate = float(record.get("turnover_rate", 0) or 0)
    avg_volume = float(record.get("avg_volume", 0) or 0)
    industry_volatility = float(record.get("industry_volatility", record.get("industryVolatility", 0)) or 0)
    total_market_cap = float(record.get("total_market_cap", 0) or 0)
    score_value = float(record.get("score", record.get("total_score", 0)) or 0)

    volume_source = avg_volume if avg_volume > 0 else turnover_rate
    return [
        {
            "dimension": "价格动量",
            "key": "momentum",
            "value": int(round(np.clip((change_pct + 5) / 10 * 100, 0, 100))),
            "weight": float(analyzer.weights.get("momentum", 0)),
            "metric": round(change_pct, 2),
            "metric_label": "涨跌幅%",
        },
        {
            "dimension": "资金承接",
            "key": "money_flow",
            "value": int(round(np.clip(50 + flow_strength * 18 + np.clip(money_flow / 1e8, -20, 20), 0, 100))),
            "weight": float(analyzer.weights.get("money_flow", 0)),
            "metric": round(money_flow / 1e8, 2),
            "metric_label": "主力净流入(亿)",
        },
        {
            "dimension": "交易活跃",
            "key": "volume_change",
            "value": int(round(np.clip(35 + np.log10(max(volume_source, 1)) * 12 if volume_source > 0 else 35, 0, 100))),
            "weight": float(analyzer.weights.get("volume_change", 0)),
            "metric": round(turnover_rate, 2),
            "metric_label": "换手率%",
        },
        {
            "dimension": "波动稳定",
            "key": "volatility",
            "value": int(round(np.clip(95 - abs(industry_volatility - 2.5) * 16 if industry_volatility > 0 else 48, 0, 100))),
            "weight": abs(float(analyzer.weights.get("volatility", 0))),
            "metric": round(industry_volatility, 2),
            "metric_label": "波动率%",
        },
        {
            "dimension": "板块体量",
            "key": "scale",
            "value": int(round(np.clip(30 + np.log10(max(total_market_cap / 1e8, 1)) * 16 if total_market_cap > 0 else 35, 0, 100))),
            "weight": 0.0,
            "metric": round(total_market_cap / 1e8, 2),
            "metric_label": "总市值(亿)",
        },
        {
            "dimension": "综合得分",
            "key": "total_score",
            "value": int(round(np.clip(score_value, 0, 100))),
            "weight": 1.0,
            "metric": round(score_value, 2),
            "metric_label": "评分",
        },
    ]

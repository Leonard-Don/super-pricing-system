"""Internal momentum / money-flow helpers for IndustryAnalyzer.

These functions encapsulate the largest seam in industry analysis: the
``analyze_money_flow`` pipeline together with the Sina fallback path and
the helpers that merge / normalize the resulting dataframe. They take
the analyzer instance as the first argument so caching, provider access,
and the volatility helpers stay shared with the main class.
"""

from __future__ import annotations

import logging
from typing import Any, List, Optional

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger(__name__)


def merge_momentum_and_flow(
    analyzer: Any,
    momentum_df: pd.DataFrame,
    money_flow_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    合并动量数据和资金流向数据的公共逻辑

    Args:
        momentum_df: 动量 DataFrame
        money_flow_df: 资金流向 DataFrame

    Returns:
        合并后的 DataFrame，包含 change_pct, main_net_inflow, flow_strength 列
    """
    if not money_flow_df.empty:
        # 动态检测可用列，只合并存在的列
        merge_cols = ["industry_name"]
        optional_cols = [
        "change_pct", "main_net_inflow", "flow_strength",
        "turnover_rate", "main_net_ratio", "leading_stock",
        # THS 增强字段
        "industry_index", "total_inflow", "total_outflow",
        "leading_stock_change", "leading_stock_price",
        # AKShare 估值增强字段
        "pe_ttm", "pb", "dividend_yield",
        # 数据来源与质量标记
        "market_cap_source", "valuation_source", "valuation_quality", "data_sources"
    ]
        for col in optional_cols:
            if col in money_flow_df.columns and col not in momentum_df.columns:
                merge_cols.append(col)

        if len(merge_cols) > 1:
            merged_df = momentum_df.merge(
                money_flow_df[merge_cols],
                on="industry_name",
                how="left"
            )
        else:
            merged_df = momentum_df.copy()
    else:
        merged_df = momentum_df.copy()

    # 确保必要的列存在
    if "change_pct" not in merged_df.columns:
        merged_df["change_pct"] = merged_df.get("weighted_change", 0)
    if "main_net_inflow" not in merged_df.columns:
        merged_df["main_net_inflow"] = 0
    if "flow_strength" not in merged_df.columns:
        merged_df["flow_strength"] = 0

    # 仅对数值列 fillna(0)，保留字符串列（如 leading_stock）的 None
    numeric_cols = merged_df.select_dtypes(include="number").columns
    merged_df[numeric_cols] = merged_df[numeric_cols].fillna(0)
    return merged_df


def normalize_money_flow_dataframe(
    analyzer: Any,
    money_flow_df: pd.DataFrame,
    days: int,
) -> pd.DataFrame:
    """
    标准化不同数据源/不同周期下的行业资金流字段

    统一输出字段:
    - industry_name
    - change_pct
    - main_net_inflow
    - flow_strength
    """
    if money_flow_df.empty:
        return money_flow_df

    df = money_flow_df.copy()

    # 统一行业名称字段
    if "industry_name" not in df.columns:
        for candidate in ["名称", "板块名称", "行业名称", "industry"]:
            if candidate in df.columns:
                df = df.rename(columns={candidate: "industry_name"})
                break

    if "industry_name" not in df.columns:
        logger.warning("money flow data missing industry_name column")
        return pd.DataFrame()

    period_prefix = "今日" if days <= 1 else f"{days}日"

    # 统一涨跌幅字段
    if "change_pct" not in df.columns:
        change_candidates = [
            f"{period_prefix}涨跌幅",
            "今日涨跌幅",
            "5日涨跌幅",
            "10日涨跌幅",
            "涨跌幅",
        ]
        for col in change_candidates:
            if col in df.columns:
                df["change_pct"] = df[col]
                break
        if "change_pct" not in df.columns:
            fuzzy_col = next((c for c in df.columns if "涨跌幅" in str(c)), None)
            if fuzzy_col is not None:
                df["change_pct"] = df[fuzzy_col]

    # 统一主力净流入字段
    if "main_net_inflow" not in df.columns:
        inflow_candidates = [
            f"{period_prefix}主力净流入-净额",
            "今日主力净流入-净额",
            "5日主力净流入-净额",
            "10日主力净流入-净额",
            "主力净流入-净额",
        ]
        for col in inflow_candidates:
            if col in df.columns:
                df["main_net_inflow"] = df[col]
                break
        if "main_net_inflow" not in df.columns:
            fuzzy_col = next(
                (c for c in df.columns if "主力净流入" in str(c) and "净额" in str(c)),
                None
            )
            if fuzzy_col is not None:
                df["main_net_inflow"] = df[fuzzy_col]

    # 数值化与缺省
    if "change_pct" in df.columns:
        df["change_pct"] = pd.to_numeric(df["change_pct"], errors="coerce").fillna(0)
    else:
        df["change_pct"] = 0.0

    if "main_net_inflow" in df.columns:
        df["main_net_inflow"] = pd.to_numeric(df["main_net_inflow"], errors="coerce").fillna(0)
    else:
        df["main_net_inflow"] = 0.0

    # 统一资金强度字段，保证后续聚类/排行不会缺列。
    # 某些上游会返回全 0 的 flow_strength，这里需要根据可用字段重建，避免聚类图塌成一条线。
    recompute_flow_strength = "flow_strength" not in df.columns
    if not recompute_flow_strength:
        df["flow_strength"] = pd.to_numeric(df["flow_strength"], errors="coerce").fillna(0)
        recompute_flow_strength = (
            (df["flow_strength"].abs() <= 1e-9).all()
            and (df["main_net_inflow"].abs() > 1e-9).any()
        )

    if recompute_flow_strength:
        main_net_ratio = pd.to_numeric(df.get("main_net_ratio", 0), errors="coerce").fillna(0)
        if (main_net_ratio.abs() > 1e-9).any():
            df["flow_strength"] = (main_net_ratio / 100.0).clip(-1.0, 1.0)
        else:
            max_flow = df["main_net_inflow"].abs().max()
            if max_flow > 0:
                df["flow_strength"] = (df["main_net_inflow"] / max_flow).clip(-1.0, 1.0)
            else:
                df["flow_strength"] = 0.0

    # 统一换手率字段
    if "turnover_rate" in df.columns:
        df["turnover_rate"] = pd.to_numeric(df["turnover_rate"], errors="coerce").fillna(0)
    else:
        df["turnover_rate"] = 0.0

    if "amplitude" in df.columns:
        df["amplitude"] = pd.to_numeric(df["amplitude"], errors="coerce").fillna(0)

    # 统一主力净占比字段
    if "main_net_ratio" not in df.columns:
        ratio_candidates = [
            f"{period_prefix}主力净流入-净占比",
            "今日主力净流入-净占比",
            "5日主力净流入-净占比",
            "10日主力净流入-净占比",
            "主力净流入-净占比",
        ]
        for col in ratio_candidates:
            if col in df.columns:
                df["main_net_ratio"] = df[col]
                break

    if "main_net_ratio" in df.columns:
        df["main_net_ratio"] = pd.to_numeric(df["main_net_ratio"], errors="coerce").fillna(0)
    else:
        df["main_net_ratio"] = 0.0

    # Uniform leading stock field
    if "leading_stock" not in df.columns:
        # Try to find leading stock column
        for col in df.columns:
            if "领涨" in str(col) or "最大股" in str(col):
                df["leading_stock"] = df[col]
                break

    if "leading_stock" not in df.columns:
        df["leading_stock"] = None
    else:
        # 防御性处理：确保 leading_stock 为字符串或 None (数据源可能返回整数 0)
        df["leading_stock"] = df["leading_stock"].apply(
            lambda x: str(x) if x and x != 0 and str(x).strip() else None
        )

    # 统一成分股数量字段
    if "stock_count" not in df.columns:
        for candidate in ["成分股数量", "个股数", "stock_count"]:
            if candidate in df.columns:
                df["stock_count"] = pd.to_numeric(df[candidate], errors="coerce").fillna(0).astype(int)
                break
        if "stock_count" not in df.columns:
            df["stock_count"] = 0

    # 统一总市值字段
    if "total_market_cap" not in df.columns:
        for candidate in ["总市值", "流通市值"]:
            if candidate in df.columns:
                df["total_market_cap"] = pd.to_numeric(df[candidate], errors="coerce").fillna(0)
                break
        if "total_market_cap" not in df.columns:
            df["total_market_cap"] = 0.0
    else:
        # 即使列已存在，也确保数值类型正确
        df["total_market_cap"] = pd.to_numeric(df["total_market_cap"], errors="coerce").fillna(0)

    # [Fallback] 当所有 total_market_cap 为 0 时，使用 main_net_inflow 绝对值估算相对大小
    if (df["total_market_cap"] == 0).all() and "main_net_inflow" in df.columns:
        abs_flow = df["main_net_inflow"].abs()
        if abs_flow.max() > 0:
            logger.info("All total_market_cap are 0, estimating from main_net_inflow")
            df["total_market_cap"] = abs_flow * 1000  # 缩放到合理量级

    return analyzer._ensure_industry_volatility(df)


def analyze_money_flow(analyzer: Any, days: int = 5) -> pd.DataFrame:
    """
    分析各行业资金流向趋势

    Args:
        days: 统计周期（1/5/10 天）

    Returns:
        行业资金流向分析结果 DataFrame
    """
    if analyzer.provider is None:
        logger.error("Data provider not set")
        return pd.DataFrame()

    # Check cache
    cache_key = analyzer._get_cache_key("money_flow", days=days)
    cached = analyzer._get_from_cache(cache_key)
    if cached is not None:
        return cached

    try:
        # 获取行业资金流向数据
        money_flow_df = analyzer.provider.get_industry_money_flow(days=days)

        if money_flow_df.empty:
            logger.warning(f"No money flow data available for days={days}")
            # 使用过期缓存作为兜底
            stale = analyzer._get_stale_cache(cache_key)
            if stale is not None:
                logger.info(f"Using stale cached money flow data for days={days}")
                return stale
            # 尝试 Sina 回退
            money_flow_df = analyzer._try_sina_fallback(days)
            if money_flow_df.empty:
                return pd.DataFrame()

        money_flow_df = analyzer._normalize_money_flow_dataframe(money_flow_df, days=days)
        if money_flow_df.empty:
            logger.warning("Money flow data normalization produced empty dataframe")
            stale = analyzer._get_stale_cache(cache_key)
            if stale is not None:
                logger.info(f"Using stale cached money flow data for days={days}")
                return stale
            return pd.DataFrame()

        # Update cache
        analyzer._update_cache(cache_key, money_flow_df)
        return money_flow_df

    except Exception as e:
        logger.error(f"Error analyzing money flow: {e}")
        # 使用过期缓存作为兜底
        stale = analyzer._get_stale_cache(cache_key)
        if stale is not None:
            logger.info(f"Using stale cached money flow data for days={days} after error")
            return stale
        # 尝试 Sina 回退
        try:
            money_flow_df = analyzer._try_sina_fallback(days)
            if not money_flow_df.empty:
                money_flow_df = analyzer._normalize_money_flow_dataframe(money_flow_df, days=days)
                if not money_flow_df.empty:
                    analyzer._update_cache(cache_key, money_flow_df)
                    return money_flow_df
        except Exception as e2:
            logger.error(f"Sina fallback also failed: {e2}")
        return pd.DataFrame()


def try_sina_fallback(analyzer: Any, days: int) -> pd.DataFrame:
    """
    当主数据源失败时，尝试使用新浪财经作为备选数据源
    """
    try:
        from src.data.providers.sina_ths_adapter import SinaIndustryAdapter

        # 懒初始化 Sina 适配器
        if not hasattr(analyzer, '_sina_fallback'):
            analyzer._sina_fallback = SinaIndustryAdapter()
            logger.info("Initialized Sina fallback adapter")

        logger.info(f"Attempting Sina fallback for money flow (days={days})")
        df = analyzer._sina_fallback.get_industry_money_flow(days=days)

        if not df.empty:
            logger.info(f"Sina fallback succeeded: {len(df)} industries")
        return df

    except Exception as e:
        logger.warning(f"Sina fallback failed: {e}")
        return pd.DataFrame()


def calculate_industry_momentum(
    analyzer: Any,
    lookback: int = 20,
    industries: Optional[List[str]] = None,
) -> pd.DataFrame:
    """
    计算行业动量指标

    Args:
        lookback: 回看周期（天数）
        industries: 指定行业列表（可选）

    Returns:
        行业动量指标 DataFrame
    """
    if analyzer.provider is None:
        logger.error("Data provider not set")
        return pd.DataFrame()

    # Check cache (only for full industry list)
    cache_key = None
    if industries is None:
        cache_key = analyzer._get_cache_key("momentum", lookback=lookback)
        cached = analyzer._get_from_cache(cache_key)
        if cached is not None:
            return cached

    # [优化] 尝试使用资金流向数据作为"快速路径"，避免逐个获取行业成分股 (N+1问题)
    try:
        flow_days = max(int(lookback), 1)
        money_flow_df = analyzer.analyze_money_flow(days=flow_days)
        if not money_flow_df.empty and "change_pct" in money_flow_df.columns:
            logger.info("Using aggregated industry data for momentum calculation (Fast Path)")

            # 确保必要的列存在
            df = money_flow_df.copy()
            if "weighted_change" not in df.columns:
                df["weighted_change"] = df["change_pct"] # 近似值

            if "avg_change" not in df.columns:
                df["avg_change"] = df["change_pct"]

            if "avg_volume" not in df.columns:
                # 尝试从成交额/量估算，如果没有则为0
                df["avg_volume"] = df.get("volume", df.get("turnover", 0))

            if "amount" not in df.columns and "turnover" in df.columns:
                 df["amount"] = df["turnover"]

            if "total_market_cap" not in df.columns:
                # 更科学的估算：如果有换手率，可以通过 成交额 / 换手率 来精确估算总市值
                amount = df.get("amount", df.get("turnover", 0))

                if "turnover_rate" in df.columns:
                    # 避免除以0，单位一致即可（若 turnover_rate 是百分比）
                    df["total_market_cap"] = np.where(df["turnover_rate"] > 0, amount / (df["turnover_rate"] / 100), amount * 100)
                else:
                    df["total_market_cap"] = amount * 100 # 非常粗略的估算

            if "stock_count" not in df.columns:
                 df["stock_count"] = 0  # 数据源未提供时标记为0

            # 归一化计算动量得分
            if "weighted_change" in df.columns:
                scaler = StandardScaler()
                df["momentum_score"] = scaler.fit_transform(
                    df[["weighted_change"]].fillna(0)
                ).flatten()
            df = analyzer._ensure_industry_volatility(df)

            # 小范围列表和显式筛选优先补齐真实历史波动率，保证研究结果口径稳定；
            # 全量首屏仍保留代理波动率，避免冷启动时触发过重的行业指数历史抓取。
            should_fetch_historical_volatility = industries is not None or len(df) <= 12
            if should_fetch_historical_volatility:
                historical_vol_df = analyzer.calculate_industry_historical_volatility(
                    lookback=lookback,
                    industries=df["industry_name"].tolist()
                )
                if not historical_vol_df.empty:
                    df = analyzer._apply_historical_volatility(df, historical_vol_df)

            # Update cache
            if cache_key:
                analyzer._update_cache(cache_key, df)

            return df
    except Exception as e:
        logger.warning(f"Fast path momentum calculation failed: {e}")
        # 快路径异常时，先尝试 Sina 兜底
        df = analyzer._momentum_from_money_flow_fallback(lookback, cache_key)
        if not df.empty:
            return df

    # [Slow Path] 原始逻辑：逐个行业获取成分股
    logger.info("Falling back to slow path (fetching stocks for each industry)")

    # 获取行业分类
    if industries is None:
        industry_df = analyzer.provider.get_industry_classification()
        industries = industry_df["industry_name"].tolist() if not industry_df.empty else []

    momentum_data = []

    for industry in industries:
        try:
            # 尝试获取行业成分股来计算行业整体表现
            stocks = analyzer.provider.get_stock_list_by_industry(industry)

            if not stocks:
                continue

            # 计算行业内股票的加权平均涨跌幅
            total_market_cap = sum(s.get("market_cap", 0) for s in stocks)
            weighted_change = 0
            avg_change = 0
            avg_volume = 0
            stock_changes = []
            stock_weights = []

            for stock in stocks:
                change_pct = stock.get("change_pct", 0)
                market_cap = stock.get("market_cap", 0)
                volume = stock.get("volume", 0)
                stock_changes.append(float(change_pct or 0))
                stock_weights.append(float(market_cap or 0))

                if total_market_cap > 0:
                    weighted_change += change_pct * (market_cap / total_market_cap)
                avg_change += change_pct
                avg_volume += volume

            stock_count = len(stocks)
            if stock_count > 0:
                avg_change /= stock_count
                avg_volume /= stock_count
            industry_volatility = analyzer._weighted_std(stock_changes, stock_weights)

            momentum_data.append({
                "industry_name": industry,
                "stock_count": stock_count,
                "weighted_change": weighted_change,
                "avg_change": avg_change,
                "avg_volume": avg_volume,
                "industry_volatility": industry_volatility,
                "industry_volatility_source": "stock_dispersion",
                "total_market_cap": total_market_cap,
            })

        except Exception as e:
            logger.warning(f"Error calculating momentum for {industry}: {e}")
            continue

    if not momentum_data:
        # 慢路径无结果时，尝试 Sina 兜底构建动量（资金流表不依赖成分股）
        df = analyzer._momentum_from_money_flow_fallback(lookback, cache_key)
        if not df.empty:
            return df
        return pd.DataFrame()

    df = pd.DataFrame(momentum_data)

    # 计算动量得分（归一化）
    if not df.empty and "weighted_change" in df.columns:
        scaler = StandardScaler()
        df["momentum_score"] = scaler.fit_transform(
            df[["weighted_change"]]
        ).flatten()
    historical_vol_df = analyzer.calculate_industry_historical_volatility(
        lookback=lookback,
        industries=df["industry_name"].tolist()
    )
    if not historical_vol_df.empty:
        df = analyzer._apply_historical_volatility(df, historical_vol_df)
    df = analyzer._ensure_industry_volatility(df)

    # Update cache
    if cache_key and not df.empty:
        analyzer._update_cache(cache_key, df)

    return df


def momentum_from_money_flow_fallback(
    analyzer: Any,
    lookback: int,
    cache_key: Optional[str],
) -> pd.DataFrame:
    """
    从 Sina 兜底的资金流数据构建动量，用于快/慢路径均失败时的第三层兜底。
    """
    try:
        flow_days = max(int(lookback), 1)
        money_flow_df = analyzer._try_sina_fallback(flow_days)
        if money_flow_df.empty or "change_pct" not in money_flow_df.columns:
            return pd.DataFrame()
        df = money_flow_df.copy()
        if "weighted_change" not in df.columns:
            df["weighted_change"] = df["change_pct"]
        if "avg_change" not in df.columns:
            df["avg_change"] = df["change_pct"]
        if "avg_volume" not in df.columns:
            df["avg_volume"] = df.get("volume", df.get("turnover", 0))
        if "amount" not in df.columns and "turnover" in df.columns:
            df["amount"] = df["turnover"]
        if "total_market_cap" not in df.columns:
            amount = df.get("amount", df.get("turnover", 0))
            if "turnover_rate" in df.columns and (df["turnover_rate"] > 0).any():
                df["total_market_cap"] = np.where(
                    df["turnover_rate"] > 0,
                    amount / (df["turnover_rate"] / 100),
                    amount * 100
                )
            else:
                df["total_market_cap"] = amount * 100
        if "stock_count" not in df.columns:
            df["stock_count"] = 0
        scaler = StandardScaler()
        df["momentum_score"] = scaler.fit_transform(
            df[["weighted_change"]].fillna(0)
        ).flatten()
        historical_vol_df = analyzer.calculate_industry_historical_volatility(
            lookback=lookback,
            industries=df["industry_name"].tolist()
        )
        if not historical_vol_df.empty:
            df = analyzer._apply_historical_volatility(df, historical_vol_df)
        df = analyzer._ensure_industry_volatility(df)
        if cache_key:
            analyzer._update_cache(cache_key, df)
        logger.info("Momentum built from Sina fallback (third-layer)")
        return df
    except Exception as e:
        logger.warning(f"Momentum from Sina fallback failed: {e}")
        return pd.DataFrame()

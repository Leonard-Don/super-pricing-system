"""Pure parsing helpers for ``SinaIndustryAdapter``.

These functions are deterministic transformations of DataFrames / strings —
they don't touch the network or any cached state. Module-level functions take
the adapter instance only when they need access to other helpers on the class
(e.g. ``adapter._normalize_industry_join_key`` is used as a callable).
"""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, Any, Dict, List

import pandas as pd

from ._constants import (
    INDUSTRY_ENRICHMENT_ALIASES,
    SINA_NEW_NODE_NAME_MAP,
    SINA_PROXY_NODE_NAME_MAP,
)
from ._mappers import map_sina_to_ths, map_ths_to_sina

if TYPE_CHECKING:  # pragma: no cover - typing only
    from ._adapter import SinaIndustryAdapter

logger = logging.getLogger(__name__)


def normalize_industry_join_key(industry_name: str) -> str:
    cleaned = str(industry_name or "").strip().replace("Ⅲ", "").replace("Ⅱ", "")
    if cleaned.endswith("行业"):
        cleaned = cleaned[:-2]
    cleaned = cleaned.strip()
    return INDUSTRY_ENRICHMENT_ALIASES.get(cleaned, cleaned)


def append_data_source(df: pd.DataFrame, mask: pd.Series, source: str) -> None:
    if "data_sources" not in df.columns:
        df["data_sources"] = [[] for _ in range(len(df))]

    def append_source(current):
        items = list(current) if isinstance(current, list) else []
        if source not in items:
            items.append(source)
        return items

    df.loc[mask, "data_sources"] = df.loc[mask, "data_sources"].apply(append_source)


def ensure_data_quality_columns(df: pd.DataFrame, primary_source: str) -> pd.DataFrame:
    result = df.copy()
    if "data_sources" not in result.columns:
        result["data_sources"] = [[primary_source] for _ in range(len(result))]
    else:
        result["data_sources"] = result["data_sources"].apply(
            lambda value: list(value) if isinstance(value, list) and value else [primary_source]
        )

    if "market_cap_source" not in result.columns:
        result["market_cap_source"] = "unknown"
    if "valuation_source" not in result.columns:
        result["valuation_source"] = "unavailable"
    if "valuation_quality" not in result.columns:
        result["valuation_quality"] = "unavailable"
    return result


def candidate_matches_industry(candidate_name: str, industry_name: str) -> bool:
    raw_key = normalize_industry_join_key(industry_name)
    candidate_key = normalize_industry_join_key(candidate_name)
    if candidate_key == raw_key:
        return True

    mapped_back = map_sina_to_ths(candidate_name)
    mapped_key = normalize_industry_join_key(mapped_back)
    return mapped_key == raw_key


def normalize_to_ths_industry_name(adapter: "SinaIndustryAdapter", industry_name: str) -> str:
    """将输入名称归一为 THS 行业名，便于把 THS 作为主索引。"""
    raw_name = str(industry_name or "").strip()
    if not raw_name:
        return raw_name

    ths_catalog = adapter._get_ths_industry_catalog()
    if not ths_catalog.empty:
        exact = ths_catalog[ths_catalog["industry_name"] == raw_name]
        if not exact.empty:
            return raw_name

    direct_mapped = map_sina_to_ths(raw_name)
    # 这里只接受“输入名本身”或“显式别名字典”带来的候选，
    # 避免把宽泛行业名（如“医药生物”）误降到某个更窄子行业。
    candidate_names = [direct_mapped, raw_name]
    deduped = []
    seen = set()
    for name in candidate_names:
        normalized = str(name or "").strip()
        if normalized and normalized not in seen:
            deduped.append(normalized)
            seen.add(normalized)

    if not ths_catalog.empty:
        ths_catalog = ths_catalog.copy()
        ths_catalog["industry_name"] = ths_catalog["industry_name"].astype(str).str.strip()
        ths_names = set(ths_catalog["industry_name"].astype(str))

        # 1. 显式映射或候选名精确命中
        for name in deduped:
            mapped = map_sina_to_ths(name)
            if mapped in ths_names:
                return mapped
            if name in ths_names:
                return name

        # 2. 规范化键唯一命中
        normalized_key = normalize_industry_join_key(raw_name)
        ths_catalog["join_key"] = ths_catalog["industry_name"].apply(normalize_industry_join_key)
        exact_key_matches = ths_catalog[ths_catalog["join_key"] == normalized_key]
        if len(exact_key_matches) == 1:
            return str(exact_key_matches.iloc[0]["industry_name"])

        # 3. 受控模糊匹配：只有“唯一候选”时才命中，避免误绑
        fuzzy_seeds = []
        for name in deduped + [normalized_key]:
            cleaned = normalize_industry_join_key(name)
            if len(cleaned) >= 2:
                fuzzy_seeds.append(cleaned)

        for seed in fuzzy_seeds:
            contains_matches = ths_catalog[
                ths_catalog["industry_name"].str.contains(seed, na=False)
                | ths_catalog["join_key"].str.contains(seed, na=False)
            ]
            contains_matches = contains_matches.drop_duplicates(subset=["industry_name"])
            if len(contains_matches) == 1:
                return str(contains_matches.iloc[0]["industry_name"])

    return direct_mapped


def attach_industry_codes(adapter: "SinaIndustryAdapter", df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df

    if "industry_code" in df.columns:
        current_codes = df["industry_code"].astype(str).str.strip()
        if current_codes.ne("").all():
            return df

    result = df.copy()
    ths_catalog = adapter._get_ths_industry_catalog()
    if not ths_catalog.empty:
        code_map = {}
        for _, row in ths_catalog.iterrows():
            industry_name = str(row.get("industry_name", "")).strip()
            industry_code = str(row.get("industry_code", "")).strip()
            if not industry_name or not industry_code:
                continue
            code_map[industry_name] = industry_code
            code_map[normalize_industry_join_key(industry_name)] = industry_code

        result["industry_code"] = result["industry_name"].apply(
            lambda name: code_map.get(str(name).strip())
            or code_map.get(normalize_industry_join_key(str(name)))
        )

    if (
        ("industry_code" not in result.columns or result["industry_code"].isna().any())
        and hasattr(adapter.sina, "get_industry_list")
    ):
        try:
            sina_df = adapter.sina.get_industry_list()
            if not sina_df.empty:
                sina_code_map = {}
                for _, row in sina_df.iterrows():
                    industry_name = map_sina_to_ths(str(row.get("industry_name", "")).strip())
                    industry_code = str(row.get("industry_code", "")).strip()
                    if not industry_name or not industry_code:
                        continue
                    sina_code_map[industry_name] = industry_code
                    sina_code_map[normalize_industry_join_key(industry_name)] = industry_code
                if "industry_code" not in result.columns:
                    result["industry_code"] = pd.NA
                missing_mask = result["industry_code"].isna() | result["industry_code"].astype(str).str.strip().eq("")
                result.loc[missing_mask, "industry_code"] = result.loc[missing_mask, "industry_name"].apply(
                    lambda name: sina_code_map.get(str(name).strip())
                    or sina_code_map.get(normalize_industry_join_key(str(name)))
                )
        except Exception as e:
            logger.warning(f"Failed to attach Sina industry codes: {e}")

    return result


def resolve_sina_industry_node(
    adapter: "SinaIndustryAdapter",
    industry_name: str,
    industry_code: str | None = None,
) -> tuple[str | None, str]:
    candidate_code = str(industry_code or "").strip()
    if candidate_code.startswith("new_"):
        return candidate_code, "sina_stock_sum"

    raw_name = str(industry_name or "").strip()
    cached_new_nodes = adapter._get_cached_sina_stock_nodes()
    live_new_nodes: set[str] = set()
    possible_names = []
    if raw_name:
        possible_names.append(raw_name)
        mapped = map_sina_to_ths(raw_name)
        if mapped != raw_name:
            possible_names.append(mapped)
        possible_names.extend(map_ths_to_sina(raw_name))

    ordered_names = []
    seen = set()
    for name in possible_names:
        normalized = str(name or "").strip()
        if normalized and normalized not in seen:
            ordered_names.append(normalized)
            seen.add(normalized)

    fallback_code = None
    try:
        industries = adapter.sina.get_industry_list()
        if not industries.empty:
            live_new_nodes = {
                str(code or "").strip()
                for code in industries.get("industry_code", [])
                if str(code or "").strip().startswith("new_")
            }
            for normalized in ordered_names:
                match = industries[industries["industry_name"] == normalized]
                if match.empty:
                    continue
                resolved_code = str(match.iloc[0]["industry_code"]).strip()
                if resolved_code.startswith("new_") and (
                    normalized == raw_name
                    or (
                        normalized in SINA_NEW_NODE_NAME_MAP
                        and candidate_matches_industry(normalized, raw_name)
                    )
                ):
                    return resolved_code, "sina_stock_sum"
                if (
                    not fallback_code
                    and (
                        normalized == raw_name
                        or (
                            normalized in SINA_NEW_NODE_NAME_MAP
                            and candidate_matches_industry(normalized, raw_name)
                        )
                    )
                ):
                    fallback_code = resolved_code
    except Exception as e:
        logger.warning(f"Failed to resolve Sina industry code for {industry_name}: {e}")

    for normalized in ordered_names:
        alias_code = SINA_NEW_NODE_NAME_MAP.get(normalized)
        if not alias_code or alias_code not in cached_new_nodes:
            continue
        if candidate_matches_industry(normalized, raw_name):
            return alias_code, "sina_stock_sum"

    for normalized in ordered_names:
        proxy_code = SINA_PROXY_NODE_NAME_MAP.get(normalized)
        if proxy_code and (
            proxy_code in cached_new_nodes or proxy_code in live_new_nodes
        ):
            return proxy_code, "sina_proxy_stock_sum"

    return fallback_code, "unknown"


def resolve_sina_industry_code(
    adapter: "SinaIndustryAdapter",
    industry_name: str,
    industry_code: str | None = None,
) -> str | None:
    resolved_code, _ = adapter._resolve_sina_industry_node(industry_name, industry_code)
    return resolved_code


def process_ths_raw_data(adapter: "SinaIndustryAdapter", ths_df: pd.DataFrame) -> pd.DataFrame:
    """解析 THS 原始数据框并提取规范字段"""
    ths_df = ths_df.drop_duplicates(subset=["industry_name"], keep="first").reset_index(drop=True)

    net_cols = [c for c in ths_df.columns if "净额" in c]
    chg_cols = [c for c in ths_df.columns if ("涨跌幅" in c or "阶段涨跌幅" in c) and not c.endswith(".1")]
    inflow_cols = [c for c in ths_df.columns if "流入" in c and "净" not in c]
    outflow_cols = [c for c in ths_df.columns if "流出" in c]
    index_cols = [c for c in ths_df.columns if "行业指数" in c or "指数" in c]
    leading_chg_cols = [c for c in ths_df.columns if c == "涨跌幅.1"]
    price_cols = [c for c in ths_df.columns if "当前价" in c]
    count_cols = [c for c in ths_df.columns if "公司家数" in c]
    leading_name_cols = [c for c in ths_df.columns if c == "领涨股"]

    result = pd.DataFrame()
    result["industry_name"] = ths_df["industry_name"]

    if chg_cols:
        result["change_pct"] = pd.to_numeric(ths_df[chg_cols[0]].astype(str).str.replace("%", ""), errors="coerce").fillna(0).values
    if net_cols:
        result["main_net_inflow"] = pd.to_numeric(ths_df[net_cols[0]], errors="coerce").fillna(0).values * 1e8
    if inflow_cols:
        result["total_inflow"] = pd.to_numeric(ths_df[inflow_cols[0]], errors="coerce").fillna(0).values
    if outflow_cols:
        result["total_outflow"] = pd.to_numeric(ths_df[outflow_cols[0]], errors="coerce").fillna(0).values
    if index_cols:
        result["industry_index"] = pd.to_numeric(ths_df[index_cols[0]], errors="coerce").fillna(0).values
    if count_cols:
        result["stock_count"] = pd.to_numeric(ths_df[count_cols[0]], errors="coerce").fillna(0).astype(int).values
    if leading_name_cols:
        result["leading_stock"] = ths_df[leading_name_cols[0]].apply(lambda x: str(x).strip() if pd.notna(x) and str(x).strip() else None).values
    if leading_chg_cols:
        result["leading_stock_change"] = pd.to_numeric(ths_df[leading_chg_cols[0]].astype(str).str.replace("%", ""), errors="coerce").fillna(0).values
    if price_cols:
        result["leading_stock_price"] = pd.to_numeric(ths_df[price_cols[0]], errors="coerce").fillna(0).values

    if net_cols and inflow_cols and outflow_cols:
        net_amt = pd.to_numeric(ths_df[net_cols[0]], errors="coerce").fillna(0)
        inflow_amt = result.get("total_inflow", 0)
        outflow_amt = result.get("total_outflow", 0)
        total_amt = inflow_amt + outflow_amt
        result["main_net_ratio"] = pd.Series([n / t * 100 if t > 0 else 0.0 for n, t in zip(net_amt.values, total_amt.values)])

    return adapter._attach_industry_codes(result)


def ensure_flow_strength(adapter: "SinaIndustryAdapter", df: pd.DataFrame) -> None:
    """
    保证行业资金流结果里存在可用的 flow_strength。

    THS 主链有时只返回净流入金额，没有稳定返回资金强度；如果这里不补齐，
    前端聚类分布图会退化成一条水平线。
    """
    if df.empty:
        return

    inflow = adapter._numeric_series_or_default(df, "main_net_inflow", 0.0)
    if "flow_strength" in df.columns:
        flow_strength = pd.to_numeric(df["flow_strength"], errors="coerce").fillna(0)
    else:
        flow_strength = pd.Series(0.0, index=df.index, dtype=float)

    has_existing_signal = (flow_strength.abs() > 1e-9).any()
    has_inflow_signal = (inflow.abs() > 1e-9).any()
    if has_existing_signal or not has_inflow_signal:
        df["flow_strength"] = flow_strength.astype(float)
        return

    main_net_ratio = adapter._numeric_series_or_default(df, "main_net_ratio", 0.0)
    if (main_net_ratio.abs() > 1e-9).any():
        df["flow_strength"] = (main_net_ratio / 100.0).clip(-1.0, 1.0)
        return

    max_abs_inflow = float(inflow.abs().max())
    if max_abs_inflow > 0:
        df["flow_strength"] = (inflow / max_abs_inflow).clip(-1.0, 1.0)
    else:
        df["flow_strength"] = 0.0

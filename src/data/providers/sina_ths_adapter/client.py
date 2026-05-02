"""HTTP / API call helpers for ``SinaIndustryAdapter``.

This module owns the heavy outward-facing fetches: AKShare/THS catalogue
and summary, the THS money-flow scrape, and the multi-source enrichments
they feed into. The adapter class still exposes them as instance methods
(forwarders) so the public surface and test patches remain unchanged.
"""

from __future__ import annotations

import logging
import re
import time
from io import StringIO
from typing import TYPE_CHECKING, Any, Dict, List

import akshare as ak
import pandas as pd
import py_mini_racer
import requests
from bs4 import BeautifulSoup

if TYPE_CHECKING:  # pragma: no cover - typing only
    from ._adapter import SinaIndustryAdapter

logger = logging.getLogger(__name__)


def build_symbol_cache_industry_fallback(
    adapter: "SinaIndustryAdapter", industry_name: str
) -> List[Dict[str, Any]]:
    """使用本地股票名缓存构造高置信度行业兜底，避免单一数据源抖动时成分股完全丢失。"""
    normalized = str(industry_name or "").strip()
    if normalized != "银行":
        return []

    bank_pattern = re.compile(r"(银行|农商行|张家港行)$")
    fallback_stocks: Dict[str, Dict[str, Any]] = {}

    try:
        cached_rows = adapter.sina._load_persistent_industry_stocks("new_jrhy")
        for row in cached_rows:
            name = str(row.get("name", "")).strip()
            symbol = str(row.get("code") or row.get("symbol") or "").strip()
            if not name or not symbol.isdigit() or not bank_pattern.search(name):
                continue
            fallback_stocks[symbol] = {
                "symbol": symbol,
                "code": symbol,
                "name": name,
                "change_pct": float(row.get("change_pct", 0) or 0),
                "market_cap": float(row.get("mktcap", 0) or 0) * 10000,
                "volume": float(row.get("volume", 0) or 0),
                "amount": float(row.get("amount", 0) or 0),
                "pe_ratio": float(row.get("pe_ratio", 0) or 0),
                "pb_ratio": float(row.get("pb_ratio", 0) or 0),
            }
    except Exception as e:
        logger.warning(f"Failed to load cached bank constituents from persistent Sina cache: {e}")

    adapter.__class__._ensure_symbol_cache_loaded()
    for name, symbol in adapter.__class__._stock_name_to_symbol_cache.items():
        clean_name = str(name or "").strip()
        clean_symbol = str(symbol or "").strip()
        if not clean_symbol.isdigit() or not bank_pattern.search(clean_name):
            continue
        fallback_stocks.setdefault(
            clean_symbol,
            {
                "symbol": clean_symbol,
                "code": clean_symbol,
                "name": clean_name,
            },
        )

    if fallback_stocks:
        logger.info("Using symbol-cache fallback for %s with %s candidates", normalized, len(fallback_stocks))
    return list(fallback_stocks.values())


def refine_proxy_constituents(
    adapter: "SinaIndustryAdapter",
    industry_name: str,
    stocks: List[Dict[str, Any]],
    industry_code: str | None = None,
) -> List[Dict[str, Any]]:
    """对宽口径代理节点做行业内过滤，降低金融综合节点带来的误归类。"""
    normalized = str(industry_name or "").strip()
    resolved_code = str(industry_code or "").strip()
    if not stocks:
        return []

    def keep_by_predicate(predicate) -> List[Dict[str, Any]]:
        filtered = [stock for stock in stocks if predicate(str(stock.get("name", "")).strip())]
        return filtered or stocks

    if normalized == "银行" or (normalized == "银行" and resolved_code == "new_jrhy"):
        bank_pattern = re.compile(r"(银行|农商行|张家港行)$")
        return keep_by_predicate(lambda name: bool(bank_pattern.search(name)))

    if normalized == "证券" and resolved_code == "new_jrhy":
        broker_aliases = {"东方财富", "同花顺", "指南针", "大智慧"}
        return keep_by_predicate(
            lambda name: ("证券" in name) or (name in broker_aliases)
        )

    if normalized == "保险" and resolved_code == "new_jrhy":
        insurer_aliases = {"中国平安", "中国太保", "中国人寿", "中国人保", "新华保险", "天茂集团"}
        return keep_by_predicate(
            lambda name: ("保险" in name) or ("人寿" in name) or (name in insurer_aliases)
        )

    return stocks


def get_ths_industry_catalog(adapter: "SinaIndustryAdapter") -> pd.DataFrame:
    """获取 THS 行业目录，作为行业名称与代码的主索引。"""
    cls = adapter.__class__
    now = time.time()
    if (
        cls._ths_catalog_shared_cache is not None
        and not cls._ths_catalog_shared_cache.empty
        and now - cls._ths_catalog_shared_cache_time < 1800
    ):
        return cls._ths_catalog_shared_cache.copy()

    try:
        df = ak.stock_board_industry_name_ths()
        if not df.empty:
            df = df.rename(columns={"name": "industry_name", "code": "industry_code"})
            df["industry_name"] = df["industry_name"].astype(str).str.strip()
            cls._ths_catalog_shared_cache = df
            cls._ths_catalog_shared_cache_time = now
            return df.copy()
    except Exception as e:
        logger.warning(f"Failed to fetch THS industry catalog: {e}")

    if (
        cls._ths_catalog_shared_cache is not None
        and not cls._ths_catalog_shared_cache.empty
    ):
        logger.warning("Using stale THS industry catalog cache")
        return cls._ths_catalog_shared_cache.copy()

    return pd.DataFrame()


def get_ths_industry_summary(adapter: "SinaIndustryAdapter") -> pd.DataFrame:
    """获取 THS 行业一览表，作为热度与领涨股的主数据底座。"""
    cls = adapter.__class__
    now = time.time()
    if (
        cls._ths_summary_shared_cache is not None
        and not cls._ths_summary_shared_cache.empty
        and now - cls._ths_summary_shared_cache_time < 600
    ):
        return cls._ths_summary_shared_cache.copy()

    try:
        df = ak.stock_board_industry_summary_ths()
        if not df.empty:
            df = df.rename(
                columns={
                    "板块": "industry_name",
                    "涨跌幅": "change_pct",
                    "总成交量": "total_volume",
                    "总成交额": "total_amount",
                    "净流入": "main_net_inflow",
                    "上涨家数": "rise_count",
                    "下跌家数": "fall_count",
                    "均价": "avg_price",
                    "领涨股": "leading_stock",
                    "领涨股-最新价": "leading_stock_price",
                    "领涨股-涨跌幅": "leading_stock_change",
                }
            )
            df["industry_name"] = df["industry_name"].astype(str).str.strip()
            cls._ths_summary_shared_cache = df
            cls._ths_summary_shared_cache_time = now
            return df.copy()
    except Exception as e:
        logger.warning(f"Failed to fetch THS industry summary: {e}")

    if (
        cls._ths_summary_shared_cache is not None
        and not cls._ths_summary_shared_cache.empty
    ):
        logger.warning("Using stale THS industry summary cache")
        return cls._ths_summary_shared_cache.copy()

    return pd.DataFrame()


def get_ths_flow_data(adapter: "SinaIndustryAdapter", days: int) -> pd.DataFrame:
    """获取同花顺真实行业资金流向和涨跌幅 (不受代理拦截)"""
    try:
        js_code = py_mini_racer.MiniRacer()
        js_content = ak.stock_feature.stock_fund_flow._get_file_content_ths("ths.js")
        js_code.eval(js_content)

        headers = {
            "Host": "data.10jqka.com.cn",
            "Referer": "http://data.10jqka.com.cn/funds/hyzjl/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.85 Safari/537.36",
            "Accept": "text/html, */*; q=0.01",
        }

        if days <= 1:
            base_url = "http://data.10jqka.com.cn/funds/hyzjl/field/tradezdf/order/desc/page/{}/ajax/1/free/1/"
        else:
            supported = [3, 5, 10, 20]
            actual_days = min(supported, key=lambda x: abs(x - days))
            base_url = f"http://data.10jqka.com.cn/funds/hyzjl/board/{actual_days}/field/tradezdf/order/desc/page/{{}}/ajax/1/free/1/"

        headers["hexin-v"] = js_code.call("v")
        r = requests.get(base_url.format(1), headers=headers, timeout=15)
        soup = BeautifulSoup(r.text, features="lxml")

        page_info = soup.find("span", class_="page_info")
        page_num = 1
        if page_info:
            try:
                page_num = int(page_info.text.split("/")[1])
            except Exception:
                pass

        big_df = pd.DataFrame()
        if r.status_code == 200 and r.text.strip():
            big_df = pd.read_html(StringIO(r.text))[0]

        for page in range(2, page_num + 1):
            headers["hexin-v"] = js_code.call("v")
            r = requests.get(base_url.format(page), headers=headers, timeout=15)
            if r.status_code == 200 and r.text.strip():
                temp_df = pd.read_html(StringIO(r.text))[0]
                big_df = pd.concat([big_df, temp_df], ignore_index=True)

        if not big_df.empty and "行业" in big_df.columns:
            big_df["industry_name"] = big_df["行业"].str.replace("Ⅲ", "").str.replace("Ⅱ", "")

        return big_df
    except Exception as e:
        logger.error(f"Failed to fetch THS flow data: {e}")
        return pd.DataFrame()


def enrich_with_akshare(
    adapter: "SinaIndustryAdapter",
    df: pd.DataFrame,
    include_leader_valuation_fallback: bool = False,
) -> pd.DataFrame:
    """使用 AKShare 数据增强总市值、换手率和估值指标"""
    df["match_key"] = df["industry_name"].apply(adapter._normalize_industry_join_key)

    # 1. 补充行业源数据（总市值、换手率）
    try:
        ak_provider = adapter.akshare
        meta_df = ak_provider._get_industry_metadata()
        if not meta_df.empty:
            meta_df = meta_df.copy()
            meta_df["match_key"] = meta_df["industry_name"].apply(adapter._normalize_industry_join_key)
            meta_df = meta_df.drop_duplicates(subset=["match_key"], keep="first")

            meta_merge_df = meta_df[["match_key", "total_market_cap", "turnover_rate", "market_cap_source"]].rename(
                columns={"market_cap_source": "metadata_market_cap_source"}
            )
            df = pd.merge(
                df,
                meta_merge_df,
                on="match_key",
                how="left"
            )

            # 清洗非数字值
            df["total_market_cap"] = pd.to_numeric(df["total_market_cap"], errors="coerce")
            df["turnover_rate"] = pd.to_numeric(df["turnover_rate"], errors="coerce")
            matched_cap = df["total_market_cap"].notna() & (df["total_market_cap"] > 0)
            if matched_cap.any():
                source_series = df.loc[matched_cap, "metadata_market_cap_source"].astype(str).replace({"": "akshare_metadata", "nan": "akshare_metadata"})
                df.loc[matched_cap, "market_cap_source"] = source_series.where(source_series.ne("unknown"), "akshare_metadata")
                adapter._append_data_source(df, matched_cap, "akshare")
            df = df.drop(columns=["metadata_market_cap_source"], errors="ignore")
    except Exception as e:
        logger.warning(f"Metadata Enrichment failed: {e}")

    # 2. 补充申万行业估值指标 (PE/PB等)
    try:
        ak_sw = adapter._get_akshare_valuation_snapshot()
        if not ak_sw.empty:
            ak_sw = ak_sw.copy()
            ak_sw = ak_sw.rename(columns={
                "行业名称": "ak_name",
                "TTM(滚动)市盈率": "pe_ttm",
                "市净率": "pb",
                "静态股息率": "dividend_yield"
            })
            ak_sw["match_key"] = ak_sw["ak_name"].apply(adapter._normalize_industry_join_key)
            ak_sw = ak_sw.drop_duplicates(subset=["match_key"], keep="first")

            df = pd.merge(
                df,
                ak_sw[["match_key", "pe_ttm", "pb", "dividend_yield"]],
                on="match_key",
                how="left"
            )
            matched_valuation = df["pe_ttm"].notna() | df["pb"].notna() | df["dividend_yield"].notna()
            if matched_valuation.any():
                df.loc[matched_valuation, "valuation_source"] = "akshare_sw"
                df.loc[matched_valuation, "valuation_quality"] = "industry_level"
                adapter._append_data_source(df, matched_valuation, "akshare")
    except Exception as e:
        logger.warning(f"Valuation Enrichment failed: {e}")

    # 3. 腾讯极速行情兜底：如果 AKShare 挂了或返回 0.0（无效值）导致 pe_ttm 缺失，直接拿该行业领涨股的估值作为代表
    has_no_pe = "pe_ttm" not in df.columns or df["pe_ttm"].isna().all()
    has_zero_pe = not has_no_pe and (df["pe_ttm"] == 0).all()

    if include_leader_valuation_fallback and (has_no_pe or has_zero_pe):
        logger.info(f"Using Tencent fallback (reason: {'missing' if has_no_pe else 'zero'}) to fetch representative PE/PB from leading stocks...")
        pe_list, pb_list = [], []
        for _, row in df.iterrows():
            pe_val, pb_val = None, None
            leader = str(row.get("leading_stock", ""))
            sym = adapter.get_symbol_by_name(leader)
            if sym and sym.isdigit():
                prefix = "sh" if sym.startswith("6") else "sz" if sym.startswith(("0", "3")) else "bj"
                url = f"http://qt.gtimg.cn/q={prefix}{sym}"
                try:
                    r = requests.get(url, timeout=3)
                    if r.status_code == 200 and "v_" in r.text:
                        parts = r.text.split('"')[1].split("~")
                        if len(parts) > 46:
                            # 39: PE(TTM), 46: PB
                            pe_str, pb_str = parts[39], parts[46]
                            if pe_str and pe_str != "0.00": pe_val = float(pe_str)
                            if pb_str and pb_str != "0.00": pb_val = float(pb_str)
                except Exception:
                    pass
            pe_list.append(pe_val)
            pb_list.append(pb_val)

        # 如果之前有空列，或者未创建，则覆盖
        df["pe_ttm"] = pe_list
        df["pb"] = pb_list
        # 股息率腾讯不直接带在基础报价中，留空
        tencent_mask = pd.Series([(pe is not None or pb is not None) for pe, pb in zip(pe_list, pb_list)], index=df.index)
        if tencent_mask.any():
            df.loc[tencent_mask, "valuation_source"] = "tencent_leader_proxy"
            df.loc[tencent_mask, "valuation_quality"] = "leader_proxy"
            adapter._append_data_source(df, tencent_mask, "tencent")

    return df.drop(columns=["match_key"], errors="ignore")


def compute_industry_market_caps(
    adapter: "SinaIndustryAdapter", df: pd.DataFrame
) -> None:
    """
    通过并行获取各行业成分股，汇总计算行业总市值

    Uses a cache to avoid repeated API calls within a short period.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    # 检查缓存
    cache_key = "_industry_mktcap_cache"
    now = time.time()
    if hasattr(adapter, cache_key):
        cached_data, cached_time = getattr(adapter, cache_key)
        if now - cached_time < 600:  # 10 分钟缓存
            # 应用缓存的市值数据
            df["total_market_cap"] = df["industry_code"].map(
                lambda c: cached_data.get(c, 0)
            )
            df["total_market_cap"] = df["total_market_cap"].fillna(0)
            return

    if "industry_code" not in df.columns or df["industry_code"].isna().all():
        updated = adapter._attach_industry_codes(df)
        if "industry_code" in updated.columns:
            df["industry_code"] = updated["industry_code"]
    if "industry_code" not in df.columns or df["industry_code"].isna().all():
        logger.warning("No industry_code column, cannot compute market caps")
        return

    industry_codes = df["industry_code"].tolist()
    industry_names = df["industry_name"].tolist() if "industry_name" in df.columns else industry_codes

    mktcap_map: Dict[Any, float] = {}

    def fetch_industry_mktcap(code, name):
        """获取单个行业的总市值"""
        try:
            resolved_code, resolved_source = adapter._resolve_sina_industry_node(name, code)
            if resolved_code:
                stocks = adapter.sina.get_industry_stocks(resolved_code, page=1, count=50, fetch_all=True)
                total_cap = sum(s.get("mktcap", 0) for s in stocks) * 10000  # 万元->元
                if total_cap > 0:
                    return code, total_cap, resolved_source

            return code, 0, "unknown"
        except Exception as e:
            logger.debug(f"Failed to get stocks for {name}: {e}")
            return code, 0, "unknown"

    # 并行获取（最多 5 个并发，避免过快请求）
    logger.info(f"Computing market caps for {len(industry_codes)} industries via Sina stocks...")
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {
            executor.submit(fetch_industry_mktcap, code, name): code
            for code, name in zip(industry_codes, industry_names)
        }
        for future in as_completed(futures):
            code, cap, source = future.result()
            mktcap_map[code] = cap
            if source and source != "unknown":
                if "market_cap_source" not in df.columns:
                    df["market_cap_source"] = "unknown"
                df.loc[df["industry_code"] == code, "market_cap_source"] = source
                if source in {"sina_stock_sum", "sina_proxy_stock_sum"}:
                    adapter._append_data_source(df, df["industry_code"] == code, "sina")

    # 应用市值数据
    df["total_market_cap"] = df["industry_code"].map(mktcap_map).fillna(0)

    nonzero = (df["total_market_cap"] > 0).sum()
    logger.info(f"Industry market caps computed: {nonzero}/{len(df)} have data")

    # 更新缓存
    setattr(adapter, cache_key, (mktcap_map, now))


def estimate_market_cap_from_flow(
    adapter: "SinaIndustryAdapter", df: pd.DataFrame
) -> pd.Series:
    """
    当真实市值数据不可用时，用 THS 成交总额估算行业相对规模。

    估算优先级:
    1. total_inflow + total_outflow（THS 成交总额，亿元）× 1e8 → 元
    2. stock_count × 100亿（行业成分股数 × 平均市值粗估）
    3. 全部回退为 1.0（避免方块等大）
    """
    if "total_inflow" in df.columns and "total_outflow" in df.columns:
        total_volume = (df["total_inflow"].fillna(0) + df["total_outflow"].fillna(0))
        if total_volume.sum() > 0:
            logger.info("Estimating market cap from THS trading volume (total_inflow+outflow)")
            # 成交总额（亿元）× 1e8 = 元，再 × 10 作为换手率≈10%的粗略估算
            estimated = total_volume * 1e8 * 10
            # 若个别行业成交为0，用全体中位数填充
            median_val = estimated[estimated > 0].median()
            if pd.notna(median_val) and median_val > 0:
                estimated = estimated.where(estimated > 0, median_val * 0.5)
            return estimated

    if "stock_count" in df.columns:
        counts = df["stock_count"].fillna(0).astype(float)
        if counts.sum() > 0:
            logger.info("Estimating market cap from stock_count")
            # 每家公司平均约100亿市值，粗略估算
            return counts * 100 * 1e8

    logger.warning("Cannot estimate market cap, using constant 1.0")
    return pd.Series([1.0] * len(df), index=df.index)


def get_industry_money_flow(
    adapter: "SinaIndustryAdapter", days: int = 5
) -> pd.DataFrame:
    """
    获取行业资金流向（三层架构：THS主 + AKShare辅 + Sina底）
    """
    # ========== 第一步：获取 THS 核心数据 ==========
    ths_df = adapter._get_ths_flow_data(days)

    if not ths_df.empty:
        result = adapter._process_ths_raw_data(ths_df)
        result = adapter._attach_industry_codes(result)
        result = adapter._ensure_data_quality_columns(result, "ths")

        # ========== 第二步：AKShare 增强（市值、换手率、估值） ==========
        try:
            result = adapter._enrich_with_akshare(result)
            adapter._persist_market_cap_snapshot(result)
        except Exception as e:
            logger.warning(f"Failed to enrich with AKShare metadata: {e}")

        # ========== 第三步：Sina & 启发式辅助（市值兜底） ==========
        total_market_caps = adapter._numeric_series_or_default(result, "total_market_cap", 0.0)
        if "total_market_cap" not in result.columns or total_market_caps.max() <= 1:
            adapter._apply_persistent_market_cap_snapshot(result)
            logger.info("Falling back to Sina/Heuristics for market cap...")
            sina_df = adapter.sina.get_industry_money_flow()
            total_market_caps = adapter._numeric_series_or_default(result, "total_market_cap", 0.0)
            if total_market_caps.max() > 1:
                pass
            elif not sina_df.empty:
                adapter._compute_industry_market_caps(result)
                adapter._persist_market_cap_snapshot(result)
                # 检查是否成功由于没有抛错机制
                total_market_caps = adapter._numeric_series_or_default(result, "total_market_cap", 0.0)
                if "total_market_cap" not in result.columns or total_market_caps.max() <= 1:
                    result["total_market_cap"] = adapter._estimate_market_cap_from_flow(result)
                    result["is_estimated_cap"] = True
                    result["market_cap_source"] = "estimated_from_flow"
            else:
                result["total_market_cap"] = adapter._estimate_market_cap_from_flow(result)
                result["is_estimated_cap"] = True
                result["market_cap_source"] = "estimated_from_flow"

    else:
        # ========== 兜底层：Sina 模式 ==========
        logger.warning("THS data unavailable, falling back to Sina-only")
        sina_df = adapter.sina.get_industry_money_flow()
        if sina_df.empty:
            logger.error("Both THS and Sina data unavailable")
            return pd.DataFrame()

        result = sina_df.copy()
        result = adapter._attach_industry_codes(result)
        result = adapter._ensure_data_quality_columns(result, "sina")
        if "main_net_inflow" not in result.columns:
            if "turnover" in result.columns and "change_pct" in result.columns:
                result["main_net_inflow"] = result["turnover"].fillna(0) * (result["change_pct"].fillna(0) / 100) * 0.2
            else:
                result["main_net_inflow"] = 0.0

        try:
            adapter._compute_industry_market_caps(result)
            adapter._persist_market_cap_snapshot(result)
        except Exception:
            if "total_market_cap" not in result.columns:
                if "turnover" in result.columns:
                    result["total_market_cap"] = result["turnover"].abs() * 100
                    result["is_estimated_cap"] = True
                    result["market_cap_source"] = "estimated_from_turnover"
                else:
                    result["total_market_cap"] = 1.0
                    result["is_estimated_cap"] = True
                    result["market_cap_source"] = "constant_fallback"

        # 保证即便在 Sina 模式下，也拥有 pe_ttm, pb 字段
        if "pe_ttm" not in result.columns:
            result["pe_ttm"] = None
        if "pb" not in result.columns:
            result["pb"] = None

        # Sina 模式下也用 AKShare 增强市值、换手率、估值，实现数据最大化
        try:
            result = adapter._enrich_with_akshare(result)
            adapter._persist_market_cap_snapshot(result)
        except Exception as e:
            logger.warning(f"AKShare enrichment in Sina-only mode failed: {e}")

        adapter._apply_persistent_market_cap_snapshot(result)

    # ========== 第五步：兜底默认值填补 ==========
    defaults = {
        "change_pct": 0.0, "flow_strength": 0.0, "turnover_rate": 0.0,
        "main_net_ratio": 0.0, "total_market_cap": 1.0, "industry_index": 0.0,
        "total_inflow": 0.0, "total_outflow": 0.0, "leading_stock_change": 0.0,
        "leading_stock_price": 0.0, "stock_count": 0
    }
    for col, val in defaults.items():
        if col not in result.columns:
            result[col] = val

    adapter._ensure_flow_strength(result)

    # ========== 第六步：换手率兜底（AKShare 被拦截时用成交额/市值估算） ==========
    turnover_rate = adapter._numeric_series_or_default(result, "turnover_rate", 0.0)
    mask = (turnover_rate.isna()) | (turnover_rate <= 0)
    if mask.any():
        is_estimated = adapter._boolean_series_or_default(result, "is_estimated_cap")
        valid_for_turnover = mask & (~is_estimated)

        if valid_for_turnover.any():
            inflow = adapter._numeric_series_or_default(result, "total_inflow", 0.0)
            outflow = adapter._numeric_series_or_default(result, "total_outflow", 0.0)
            cap = adapter._numeric_series_or_default(result, "total_market_cap", 0.0)
            # 流入+流出≈总成交额(亿元)，市值(元)；换手率=(成交额/市值)*100
            vol_yi = inflow + outflow

            valid1 = valid_for_turnover & (cap > 1e7) & (vol_yi > 0)
            if valid1.any():
                result.loc[valid1, "turnover_rate"] = (vol_yi.loc[valid1] * 1e8 / cap.loc[valid1] * 100).clip(upper=999)

            # Sina 模式：用 turnover(成交额, 元) 估算
            if "turnover" in result.columns:
                t = pd.to_numeric(result["turnover"], errors="coerce").fillna(0)
                fallback = valid_for_turnover & (~valid1) & (cap > 1e7) & (t > 0)
                if fallback.any():
                    result.loc[fallback, "turnover_rate"] = (t.loc[fallback] / cap.loc[fallback] * 100).clip(upper=999)

    if "market_cap_source" not in result.columns:
        result["market_cap_source"] = "unknown"
    missing_cap_source = result["market_cap_source"].astype(str).str.strip().eq("") | result["market_cap_source"].isna()
    is_estimated_cap = adapter._boolean_series_or_default(result, "is_estimated_cap")
    result.loc[missing_cap_source & is_estimated_cap, "market_cap_source"] = "estimated"
    result.loc[missing_cap_source & ~is_estimated_cap, "market_cap_source"] = "unknown"

    if "valuation_source" not in result.columns:
        result["valuation_source"] = "unavailable"
    if "valuation_quality" not in result.columns:
        result["valuation_quality"] = "unavailable"

    return result

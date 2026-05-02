"""SinaIndustryAdapter：THS 主导的行业数据适配器（~50 个方法的核心实现）。

依赖：
- ``_constants`` 提供 ``INDUSTRY_ENRICHMENT_ALIASES``、``SINA_TO_THS_MAP``、
  ``SINA_NEW_NODE_NAME_MAP``、``SINA_PROXY_NODE_NAME_MAP``
- ``_mappers`` 提供 ``map_sina_to_ths`` / ``map_ths_to_sina``
"""

from __future__ import annotations

import fcntl
import json
import logging
import re
import time
from collections import Counter
from datetime import datetime
from io import StringIO
from pathlib import Path
from typing import Any, Dict, List

import akshare as ak
import pandas as pd
import py_mini_racer
import requests
from bs4 import BeautifulSoup

from ..akshare_provider import AKShareProvider
from ..sina_provider import SinaFinanceProvider

from . import cache, parsers
from ._constants import (
    INDUSTRY_ENRICHMENT_ALIASES,
    SINA_NEW_NODE_NAME_MAP,
    SINA_PROXY_NODE_NAME_MAP,
)
from ._mappers import map_sina_to_ths, map_ths_to_sina
from ._normalizers import (
    boolean_series_or_default,
    build_name_aliases,
    normalize_sina_stock_rows,
    numeric_series_or_default,
)

logger = logging.getLogger(__name__)


class SinaIndustryAdapter:
    """
    同花顺主导的行业数据适配器（THS-first Adapter）

    数据来源：
    - 同花顺（THS）：行业目录、行业热度、涨跌幅、资金流向、行业指数、领涨股
    - AKShare：行业补充元数据、成分股、财务和历史行情
    - 新浪财经（Sina Finance）：行业列表、成分股、实时行情兜底
    - 腾讯财经：单股估值核心字段兜底

    使用示例:
        from src.data.providers.sina_ths_adapter import SinaIndustryAdapter
        from src.analytics.industry_analyzer import IndustryAnalyzer

        provider = SinaIndustryAdapter()
        analyzer = IndustryAnalyzer(provider)

        hot_industries = analyzer.rank_industries(top_n=10)
    """

    _stock_name_to_symbol_cache: Dict[str, str] = {}
    _stock_name_cache_time: float = 0
    _stock_name_cache_loaded: bool = False
    _ths_catalog_shared_cache: pd.DataFrame | None = None
    _ths_catalog_shared_cache_time: float = 0
    _ths_summary_shared_cache: pd.DataFrame | None = None
    _ths_summary_shared_cache_time: float = 0
    _sina_cached_stock_nodes: set[str] | None = None
    _sina_cached_stock_nodes_time: float = 0
    _symbol_cache_path = Path(__file__).resolve().parents[3] / "cache" / "industry_symbol_cache.json"
    _history_cache_path = Path(__file__).resolve().parents[3] / "cache" / "history_cache.json"
    _industry_market_cap_snapshot_path = Path(__file__).resolve().parents[3] / "cache" / "industry_market_cap_snapshot.json"
    _history_cache: Dict[str, Any] = {}
    _history_cache_loaded: bool = False
    _market_cap_snapshot_stale_after_hours: int = 24
    _akshare_valuation_snapshot_cache: pd.DataFrame | None = None
    _akshare_valuation_snapshot_cache_time: float = 0
    _akshare_valuation_snapshot_failure_at: float = 0
    _akshare_valuation_snapshot_ttl_seconds: int = 4 * 60 * 60
    _akshare_valuation_snapshot_cooldown_seconds: int = 5 * 60

    _numeric_series_or_default = staticmethod(numeric_series_or_default)
    _boolean_series_or_default = staticmethod(boolean_series_or_default)
    _build_name_aliases = staticmethod(build_name_aliases)
    _normalize_sina_stock_rows = staticmethod(normalize_sina_stock_rows)

    @classmethod
    def _ensure_symbol_cache_loaded(cls):
        cache.ensure_symbol_cache_loaded(cls)

    @classmethod
    def _persist_symbol_cache(cls):
        cache.persist_symbol_cache(cls)

    @classmethod
    def _update_symbol_cache_from_pairs(cls, pairs: List[tuple[str, str]]):
        """把已知的 股票名 -> 代码 对写回共享缓存。"""
        cache.update_symbol_cache_from_pairs(cls, pairs)

    @classmethod
    def _ensure_history_cache_loaded(cls):
        cache.ensure_history_cache_loaded(cls)

    @classmethod
    def _persist_history_cache(cls):
        cache.persist_history_cache(cls)

    @classmethod
    def _load_persistent_market_cap_snapshot(cls) -> Dict[str, Any]:
        return cache.load_persistent_market_cap_snapshot(cls)

    @classmethod
    def _write_market_cap_snapshot_payload(cls, payload: Dict[str, Any]) -> None:
        cache.write_market_cap_snapshot_payload(cls, payload)

    @classmethod
    def _locked_market_cap_snapshot_update(cls, updater) -> None:
        cache.locked_market_cap_snapshot_update(cls, updater)

    @classmethod
    def get_persistent_market_cap_snapshot_status(cls) -> Dict[str, Any]:
        return cache.get_persistent_market_cap_snapshot_status(cls)

    @classmethod
    def _persist_market_cap_snapshot(cls, df: pd.DataFrame) -> None:
        cache.persist_market_cap_snapshot(cls, df)

    def _apply_persistent_market_cap_snapshot(self, df: pd.DataFrame) -> bool:
        return cache.apply_persistent_market_cap_snapshot(self, df)

    def __init__(self):
        """初始化适配器"""
        self.__class__._ensure_symbol_cache_loaded()
        self.sina = SinaFinanceProvider()
        self.akshare = AKShareProvider()
        self._industry_cache: Dict[str, pd.DataFrame] = {}
        logger.info("SinaIndustryAdapter initialized")

    def _build_symbol_cache_industry_fallback(self, industry_name: str) -> List[Dict[str, Any]]:
        """使用本地股票名缓存构造高置信度行业兜底，避免单一数据源抖动时成分股完全丢失。"""
        normalized = str(industry_name or "").strip()
        if normalized != "银行":
            return []

        bank_pattern = re.compile(r"(银行|农商行|张家港行)$")
        fallback_stocks: Dict[str, Dict[str, Any]] = {}

        try:
            cached_rows = self.sina._load_persistent_industry_stocks("new_jrhy")
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

        self.__class__._ensure_symbol_cache_loaded()
        for name, symbol in self.__class__._stock_name_to_symbol_cache.items():
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

    def _refine_proxy_constituents(
        self,
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

    def _get_ths_industry_catalog(self) -> pd.DataFrame:
        """获取 THS 行业目录，作为行业名称与代码的主索引。"""
        now = time.time()
        if (
            self.__class__._ths_catalog_shared_cache is not None
            and not self.__class__._ths_catalog_shared_cache.empty
            and now - self.__class__._ths_catalog_shared_cache_time < 1800
        ):
            return self.__class__._ths_catalog_shared_cache.copy()

        try:
            df = ak.stock_board_industry_name_ths()
            if not df.empty:
                df = df.rename(columns={"name": "industry_name", "code": "industry_code"})
                df["industry_name"] = df["industry_name"].astype(str).str.strip()
                self.__class__._ths_catalog_shared_cache = df
                self.__class__._ths_catalog_shared_cache_time = now
                return df.copy()
        except Exception as e:
            logger.warning(f"Failed to fetch THS industry catalog: {e}")

        if (
            self.__class__._ths_catalog_shared_cache is not None
            and not self.__class__._ths_catalog_shared_cache.empty
        ):
            logger.warning("Using stale THS industry catalog cache")
            return self.__class__._ths_catalog_shared_cache.copy()

        return pd.DataFrame()

    def _get_ths_industry_summary(self) -> pd.DataFrame:
        """获取 THS 行业一览表，作为热度与领涨股的主数据底座。"""
        now = time.time()
        if (
            self.__class__._ths_summary_shared_cache is not None
            and not self.__class__._ths_summary_shared_cache.empty
            and now - self.__class__._ths_summary_shared_cache_time < 600
        ):
            return self.__class__._ths_summary_shared_cache.copy()

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
                self.__class__._ths_summary_shared_cache = df
                self.__class__._ths_summary_shared_cache_time = now
                return df.copy()
        except Exception as e:
            logger.warning(f"Failed to fetch THS industry summary: {e}")

        if (
            self.__class__._ths_summary_shared_cache is not None
            and not self.__class__._ths_summary_shared_cache.empty
        ):
            logger.warning("Using stale THS industry summary cache")
            return self.__class__._ths_summary_shared_cache.copy()

        return pd.DataFrame()

    def _normalize_to_ths_industry_name(self, industry_name: str) -> str:
        """将输入名称归一为 THS 行业名，便于把 THS 作为主索引。"""
        return parsers.normalize_to_ths_industry_name(self, industry_name)

    _normalize_industry_join_key = staticmethod(parsers.normalize_industry_join_key)
    _append_data_source = staticmethod(parsers.append_data_source)
    _ensure_data_quality_columns = staticmethod(parsers.ensure_data_quality_columns)

    @classmethod
    def _get_cached_sina_stock_nodes(cls) -> set[str]:
        return cache.get_cached_sina_stock_nodes(cls)

    def _candidate_matches_industry(self, candidate_name: str, industry_name: str) -> bool:
        return parsers.candidate_matches_industry(candidate_name, industry_name)

    def _attach_industry_codes(self, df: pd.DataFrame) -> pd.DataFrame:
        return parsers.attach_industry_codes(self, df)

    def _resolve_sina_industry_node(
        self, industry_name: str, industry_code: str | None = None
    ) -> tuple[str | None, str]:
        return parsers.resolve_sina_industry_node(self, industry_name, industry_code)

    def _resolve_sina_industry_code(self, industry_name: str, industry_code: str | None = None) -> str | None:
        return parsers.resolve_sina_industry_code(self, industry_name, industry_code)

    def _get_cached_sina_industry_codes(self, industry_name: str) -> List[str]:
        return cache.get_cached_sina_industry_codes(self, industry_name)

    def get_cached_stock_list_by_industry(self, industry_name: str) -> List[Dict[str, Any]]:
        """
        仅使用本地持久化快照快速返回行业成分股，不触发远端请求。
        """
        raw_name = str(industry_name or "").strip()
        if not raw_name:
            return []

        for industry_code in self._get_cached_sina_industry_codes(raw_name):
            cached_rows = self.sina._load_persistent_industry_stocks(industry_code)
            if not cached_rows:
                continue
            refined_rows = self._refine_proxy_constituents(raw_name, cached_rows, industry_code)
            normalized_rows = self._normalize_sina_stock_rows(refined_rows)
            if normalized_rows:
                logger.info(
                    "Using persistent Sina industry stocks snapshot for %s via %s (%s rows)",
                    raw_name,
                    industry_code,
                    len(normalized_rows),
                )
                return normalized_rows

        return []

    def get_symbol_by_name(self, name: str) -> str:
        """根据股票名称获取股票代码，如果找不到则返回原名称"""
        if not name:
            return name
        self.__class__._ensure_symbol_cache_loaded()

        current_time = time.time()
        # 缓存 12 小时 (43200 秒)
        if current_time - self.__class__._stock_name_cache_time > 43200 or not self.__class__._stock_name_to_symbol_cache:
            try:
                logger.info("Updating stock name -> symbol global cache from AKShare")
                df = ak.stock_info_a_code_name()
                if not df.empty:
                    new_cache = {}
                    for _, row in df.iterrows():
                        code = str(row['code'])
                        row_name = str(row['name'])
                        for alias in self.__class__._build_name_aliases(row_name):
                            new_cache[alias] = code

                    self.__class__._stock_name_to_symbol_cache.update(new_cache)
                    self.__class__._stock_name_cache_time = current_time
                    self.__class__._persist_symbol_cache()
            except Exception as e:
                logger.error(f"Failed to update stock name cache: {e}")
                if self.__class__._stock_name_to_symbol_cache:
                    logger.warning("Using stale stock name -> symbol cache")

                # AKShare 名录失败时，退而求其次使用 Sina 行业列表中的领涨股映射补缓存。
                try:
                    industries = self.sina.get_industry_list()
                    if not industries.empty and {"leading_stock_name", "leading_stock_code"}.issubset(industries.columns):
                        pairs = list(
                            zip(
                                industries["leading_stock_name"].astype(str).tolist(),
                                industries["leading_stock_code"].astype(str).tolist(),
                            )
                        )
                        self.__class__._update_symbol_cache_from_pairs(pairs)
                except Exception as fallback_error:
                    logger.warning(f"Failed to build fallback symbol cache from Sina industries: {fallback_error}")

        for alias in self.__class__._build_name_aliases(name):
            symbol = self.__class__._stock_name_to_symbol_cache.get(alias)
            if symbol:
                return symbol

        return name

    def get_industry_classification(self) -> pd.DataFrame:
        """
        获取行业分类（THS 主；Sina 兜底）

        Returns:
            包含 industry_name 列的 DataFrame
        """
        ths_df = self._get_ths_industry_catalog()
        if not ths_df.empty:
            return ths_df[["industry_name", "industry_code"]].copy()

        df = self.sina.get_industry_list()
        if df.empty:
            return pd.DataFrame()

        return pd.DataFrame({
            "industry_name": df["industry_name"].apply(map_sina_to_ths),
            "industry_code": df["industry_code"],
        }).drop_duplicates(subset=["industry_name"], keep="first")

    def _get_ths_flow_data(self, days: int) -> pd.DataFrame:
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

    def get_industry_money_flow(self, days: int = 5) -> pd.DataFrame:
        """
        获取行业资金流向（三层架构：THS主 + AKShare辅 + Sina底）
        """
        # ========== 第一步：获取 THS 核心数据 ==========
        ths_df = self._get_ths_flow_data(days)

        if not ths_df.empty:
            result = self._process_ths_raw_data(ths_df)
            result = self._attach_industry_codes(result)
            result = self._ensure_data_quality_columns(result, "ths")

            # ========== 第二步：AKShare 增强（市值、换手率、估值） ==========
            try:
                result = self._enrich_with_akshare(result)
                self._persist_market_cap_snapshot(result)
            except Exception as e:
                logger.warning(f"Failed to enrich with AKShare metadata: {e}")

            # ========== 第三步：Sina & 启发式辅助（市值兜底） ==========
            total_market_caps = self._numeric_series_or_default(result, "total_market_cap", 0.0)
            if "total_market_cap" not in result.columns or total_market_caps.max() <= 1:
                self._apply_persistent_market_cap_snapshot(result)
                logger.info("Falling back to Sina/Heuristics for market cap...")
                sina_df = self.sina.get_industry_money_flow()
                total_market_caps = self._numeric_series_or_default(result, "total_market_cap", 0.0)
                if total_market_caps.max() > 1:
                    pass
                elif not sina_df.empty:
                    self._compute_industry_market_caps(result)
                    self._persist_market_cap_snapshot(result)
                    # 检查是否成功由于没有抛错机制
                    total_market_caps = self._numeric_series_or_default(result, "total_market_cap", 0.0)
                    if "total_market_cap" not in result.columns or total_market_caps.max() <= 1:
                        result["total_market_cap"] = self._estimate_market_cap_from_flow(result)
                        result["is_estimated_cap"] = True
                        result["market_cap_source"] = "estimated_from_flow"
                else:
                    result["total_market_cap"] = self._estimate_market_cap_from_flow(result)
                    result["is_estimated_cap"] = True
                    result["market_cap_source"] = "estimated_from_flow"

        else:
            # ========== 兜底层：Sina 模式 ==========
            logger.warning("THS data unavailable, falling back to Sina-only")
            sina_df = self.sina.get_industry_money_flow()
            if sina_df.empty:
                logger.error("Both THS and Sina data unavailable")
                return pd.DataFrame()

            result = sina_df.copy()
            result = self._attach_industry_codes(result)
            result = self._ensure_data_quality_columns(result, "sina")
            if "main_net_inflow" not in result.columns:
                if "turnover" in result.columns and "change_pct" in result.columns:
                    result["main_net_inflow"] = result["turnover"].fillna(0) * (result["change_pct"].fillna(0) / 100) * 0.2
                else:
                    result["main_net_inflow"] = 0.0

            try:
                self._compute_industry_market_caps(result)
                self._persist_market_cap_snapshot(result)
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
                result = self._enrich_with_akshare(result)
                self._persist_market_cap_snapshot(result)
            except Exception as e:
                logger.warning(f"AKShare enrichment in Sina-only mode failed: {e}")

            self._apply_persistent_market_cap_snapshot(result)

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

        self._ensure_flow_strength(result)

        # ========== 第六步：换手率兜底（AKShare 被拦截时用成交额/市值估算） ==========
        turnover_rate = self._numeric_series_or_default(result, "turnover_rate", 0.0)
        mask = (turnover_rate.isna()) | (turnover_rate <= 0)
        if mask.any():
            is_estimated = self._boolean_series_or_default(result, "is_estimated_cap")
            valid_for_turnover = mask & (~is_estimated)

            if valid_for_turnover.any():
                inflow = self._numeric_series_or_default(result, "total_inflow", 0.0)
                outflow = self._numeric_series_or_default(result, "total_outflow", 0.0)
                cap = self._numeric_series_or_default(result, "total_market_cap", 0.0)
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
        is_estimated_cap = self._boolean_series_or_default(result, "is_estimated_cap")
        result.loc[missing_cap_source & is_estimated_cap, "market_cap_source"] = "estimated"
        result.loc[missing_cap_source & ~is_estimated_cap, "market_cap_source"] = "unknown"

        if "valuation_source" not in result.columns:
            result["valuation_source"] = "unavailable"
        if "valuation_quality" not in result.columns:
            result["valuation_quality"] = "unavailable"

        return result

    def _ensure_flow_strength(self, df: pd.DataFrame) -> None:
        """
        保证行业资金流结果里存在可用的 flow_strength。

        THS 主链有时只返回净流入金额，没有稳定返回资金强度；如果这里不补齐，
        前端聚类分布图会退化成一条水平线。
        """
        parsers.ensure_flow_strength(self, df)

    def _process_ths_raw_data(self, ths_df: pd.DataFrame) -> pd.DataFrame:
        """解析 THS 原始数据框并提取规范字段"""
        return parsers.process_ths_raw_data(self, ths_df)

    @classmethod
    def _get_akshare_valuation_snapshot(cls) -> pd.DataFrame:
        return cache.get_akshare_valuation_snapshot(cls)

    def _enrich_with_akshare(self, df: pd.DataFrame, include_leader_valuation_fallback: bool = False) -> pd.DataFrame:
        """使用 AKShare 数据增强总市值、换手率和估值指标"""
        df["match_key"] = df["industry_name"].apply(self._normalize_industry_join_key)

        # 1. 补充行业源数据（总市值、换手率）
        try:
            ak_provider = self.akshare
            meta_df = ak_provider._get_industry_metadata()
            if not meta_df.empty:
                meta_df = meta_df.copy()
                meta_df["match_key"] = meta_df["industry_name"].apply(self._normalize_industry_join_key)
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
                    self._append_data_source(df, matched_cap, "akshare")
                df = df.drop(columns=["metadata_market_cap_source"], errors="ignore")
        except Exception as e:
            logger.warning(f"Metadata Enrichment failed: {e}")

        # 2. 补充申万行业估值指标 (PE/PB等)
        try:
            ak_sw = self._get_akshare_valuation_snapshot()
            if not ak_sw.empty:
                ak_sw = ak_sw.copy()
                ak_sw = ak_sw.rename(columns={
                    "行业名称": "ak_name",
                    "TTM(滚动)市盈率": "pe_ttm",
                    "市净率": "pb",
                    "静态股息率": "dividend_yield"
                })
                ak_sw["match_key"] = ak_sw["ak_name"].apply(self._normalize_industry_join_key)
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
                    self._append_data_source(df, matched_valuation, "akshare")
        except Exception as e:
            logger.warning(f"Valuation Enrichment failed: {e}")

        # 3. 腾讯极速行情兜底：如果 AKShare 挂了或返回 0.0（无效值）导致 pe_ttm 缺失，直接拿该行业领涨股的估值作为代表
        has_no_pe = "pe_ttm" not in df.columns or df["pe_ttm"].isna().all()
        has_zero_pe = not has_no_pe and (df["pe_ttm"] == 0).all()

        if include_leader_valuation_fallback and (has_no_pe or has_zero_pe):
            logger.info(f"Using Tencent fallback (reason: {'missing' if has_no_pe else 'zero'}) to fetch representative PE/PB from leading stocks...")
            import requests
            pe_list, pb_list = [], []
            for _, row in df.iterrows():
                pe_val, pb_val = None, None
                leader = str(row.get("leading_stock", ""))
                sym = self.get_symbol_by_name(leader)
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
                self._append_data_source(df, tencent_mask, "tencent")

        return df.drop(columns=["match_key"], errors="ignore")


    def _compute_industry_market_caps(self, df: pd.DataFrame):
        """
        通过并行获取各行业成分股，汇总计算行业总市值

        Uses a cache to avoid repeated API calls within a short period.
        """
        from concurrent.futures import ThreadPoolExecutor, as_completed
        import time

        # 检查缓存
        cache_key = "_industry_mktcap_cache"
        now = time.time()
        if hasattr(self, cache_key):
            cached_data, cached_time = getattr(self, cache_key)
            if now - cached_time < 600:  # 10 分钟缓存
                # 应用缓存的市值数据
                df["total_market_cap"] = df["industry_code"].map(
                    lambda c: cached_data.get(c, 0)
                )
                df["total_market_cap"] = df["total_market_cap"].fillna(0)
                return

        if "industry_code" not in df.columns or df["industry_code"].isna().all():
            updated = self._attach_industry_codes(df)
            if "industry_code" in updated.columns:
                df["industry_code"] = updated["industry_code"]
        if "industry_code" not in df.columns or df["industry_code"].isna().all():
            logger.warning("No industry_code column, cannot compute market caps")
            return

        industry_codes = df["industry_code"].tolist()
        industry_names = df["industry_name"].tolist() if "industry_name" in df.columns else industry_codes

        mktcap_map = {}

        def fetch_industry_mktcap(code, name):
            """获取单个行业的总市值"""
            try:
                resolved_code, resolved_source = self._resolve_sina_industry_node(name, code)
                if resolved_code:
                    stocks = self.sina.get_industry_stocks(resolved_code, page=1, count=50, fetch_all=True)
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
                        self._append_data_source(df, df["industry_code"] == code, "sina")

        # 应用市值数据
        df["total_market_cap"] = df["industry_code"].map(mktcap_map).fillna(0)

        nonzero = (df["total_market_cap"] > 0).sum()
        logger.info(f"Industry market caps computed: {nonzero}/{len(df)} have data")

        # 更新缓存
        setattr(self, cache_key, (mktcap_map, now))

    def _estimate_market_cap_from_flow(self, df: pd.DataFrame) -> pd.Series:
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

    def get_stock_list_by_industry(self, industry_name: str) -> List[Dict[str, Any]]:
        """
        获取行业成分股列表（融合模式：取 AKShare 与 Sina 并集，解决降级时数据过少问题）
        """
        ths_industry_name = self._normalize_to_ths_industry_name(industry_name)
        merged_stocks = {} # symbol -> data

        # 1. 尝试从 AKShare 获取
        try:
            ak_stocks = self.akshare.get_stock_list_by_industry(ths_industry_name)
            if ak_stocks:
                for s in ak_stocks:
                    merged_stocks[s["symbol"]] = s
        except Exception as e:
            logger.warning(f"AKShare get_stock_list failed for industry {ths_industry_name}: {e}")

        # 2. 如果 AKShare 数据较少 (少于 10 只) 或没有数据，优先走可解析的 Sina 节点码。
        if len(merged_stocks) < 10:
            try:
                resolved_code = self._resolve_sina_industry_code(ths_industry_name)
                if resolved_code:
                    sina_stocks = self.sina.get_industry_stocks(resolved_code)
                    sina_stocks = self._refine_proxy_constituents(ths_industry_name, sina_stocks, resolved_code)
                    for stock in self._normalize_sina_stock_rows(sina_stocks):
                        symbol = str(stock.get("symbol") or "").strip()
                        if symbol and symbol not in merged_stocks:
                            merged_stocks[symbol] = stock
            except Exception as e:
                logger.warning(f"Sina resolved-node fallback for industry {ths_industry_name} failed: {e}")

        # 3. 如果节点码未命中或数据依然偏少，再尝试基于行业列表名称匹配。
        if len(merged_stocks) < 10:
            try:
                industries = self.sina.get_industry_list()
                if not industries.empty:
                    possible_names = map_ths_to_sina(ths_industry_name)
                    for sina_name in possible_names:
                        match = industries[industries["industry_name"] == sina_name]
                        if match.empty:
                            continue
                        industry_code = match.iloc[0]["industry_code"]
                        sina_stocks = self.sina.get_industry_stocks(industry_code)
                        sina_stocks = self._refine_proxy_constituents(ths_industry_name, sina_stocks, industry_code)

                        for stock in self._normalize_sina_stock_rows(sina_stocks):
                            symbol = str(stock.get("symbol") or "").strip()
                            if symbol and symbol not in merged_stocks:
                                merged_stocks[symbol] = stock
                        if sina_stocks:
                            break
            except Exception as e:
                logger.warning(f"Sina named fallback for industry {ths_industry_name} failed: {e}")

        if len(merged_stocks) < 10:
            try:
                heuristic_stocks = self._build_symbol_cache_industry_fallback(ths_industry_name)
                for stock in heuristic_stocks:
                    symbol = str(stock.get("symbol") or stock.get("code") or "").strip()
                    if symbol and symbol not in merged_stocks:
                        merged_stocks[symbol] = stock
            except Exception as e:
                logger.warning(f"Symbol-cache fallback for industry {ths_industry_name} failed: {e}")

        result = list(merged_stocks.values())
        if result:
            # 自动更新缓存
            self.__class__._update_symbol_cache_from_pairs(
                [(s.get("name", ""), s.get("symbol", "")) for s in result]
            )
        else:
            logger.warning(f"No stocks found for industry {ths_industry_name} from any source.")

        # 3. 最后兜底：如果依然没有数据，尝试使用 THS 领涨股构造最小可用成分股
        if not merged_stocks:
            try:
                ths_summary = self._get_ths_industry_summary()
                if not ths_summary.empty:
                    summary_row = ths_summary[ths_summary["industry_name"] == ths_industry_name]
                    if not summary_row.empty:
                        row = summary_row.iloc[0]
                        leader_name = str(row.get("leading_stock") or "").strip()
                        leader_symbol = self.get_symbol_by_name(leader_name)
                        if leader_name and leader_symbol and str(leader_symbol).isdigit():
                            valuation = self.get_stock_valuation(str(leader_symbol))
                            merged_stocks[str(leader_symbol)] = {
                                "symbol": str(leader_symbol),
                                "code": str(leader_symbol),
                                "name": leader_name,
                                "change_pct": float(row.get("leading_stock_change") or row.get("change_pct") or 0),
                                "market_cap": float(valuation.get("market_cap") or 0),
                                "pe_ratio": float(valuation.get("pe_ttm") or 0),
                                "pb_ratio": float(valuation.get("pb") or 0),
                            }
            except Exception as e:
                logger.warning(f"Final THS leader fallback failed: {e}")

        result = list(merged_stocks.values())
        if result:
            self.__class__._update_symbol_cache_from_pairs(
                [(s.get("name", ""), s.get("symbol", "")) for s in result]
            )
        else:
            logger.warning(f"No stocks found for industry {ths_industry_name} from any source.")

        return result

    def get_latest_quote(self, symbol: str) -> Dict[str, Any]:
        """获取单股最新报价，优先 AKShare，失败则降级到 Sina 实时行情。"""
        try:
            quote = self.akshare.get_latest_quote(symbol)
            if "error" not in quote:
                return {
                    "symbol": symbol,
                    "name": quote.get("name", ""),
                    "current_price": quote.get("price"),
                    "previous_close": quote.get("prev_close"),
                    "change": quote.get("change"),
                    "change_percent": quote.get("change_percent"),
                    "high": quote.get("high"),
                    "low": quote.get("low"),
                    "open": quote.get("open"),
                    "volume": quote.get("volume"),
                    "amount": quote.get("amount"),
                    "source": "akshare_realtime",
                    "updated_at": quote.get("timestamp").isoformat() if getattr(quote.get("timestamp"), "isoformat", None) else quote.get("timestamp"),
                }
        except Exception as e:
            logger.warning(f"AKShare latest quote failed for {symbol}: {e}")

        try:
            prefix = "sh" if symbol.startswith("6") else "sz" if symbol.startswith(("0", "3")) else "bj"
            sina_symbol = f"{prefix}{symbol}"
            data = self.sina.get_stock_realtime([sina_symbol])
            if not data.empty:
                row = data.iloc[0]
                current_price = float(row.get("price", 0) or 0)
                previous_close = float(row.get("pre_close", 0) or 0)
                updated_at = None
                if row.get("date") and row.get("time"):
                    updated_at = datetime.fromisoformat(f"{row.get('date')}T{row.get('time')}")
                    updated_at = updated_at.isoformat()
                return {
                    "symbol": symbol,
                    "name": row.get("name", ""),
                    "current_price": current_price,
                    "previous_close": previous_close,
                    "change": current_price - previous_close if previous_close else None,
                    "high": float(row.get("high", 0) or 0),
                    "low": float(row.get("low", 0) or 0),
                    "open": float(row.get("open", 0) or 0),
                    "bid": float(row.get("bid", 0) or 0),
                    "ask": float(row.get("ask", 0) or 0),
                    "volume": int(row.get("volume", 0) or 0),
                    "amount": float(row.get("amount", 0) or 0),
                    "source": "sina_realtime",
                    "updated_at": updated_at,
                }
        except Exception as e:
            logger.warning(f"Sina latest quote failed for {symbol}: {e}")

        return {"symbol": symbol, "error": "Quote not found"}

    def get_industry_index(self, industry_code: str, start_date=None, end_date=None) -> pd.DataFrame:
        """
        获取行业指数历史数据

        优先委托给 AKShare 的申万行业指数接口；新浪侧暂无稳定行业指数历史时，
        这里直接走 AKShare，避免上层分析器拿不到行业走势和真实波动率。

        Args:
            industry_code: 行业代码

        Returns:
            行业指数 OHLCV 数据；失败时返回空 DataFrame
        """
        try:
            return self.akshare.get_industry_index(
                industry_code,
                start_date=start_date,
                end_date=end_date,
            )
        except Exception as e:
            logger.warning(f"Industry index history not available for {industry_code}: {e}")
            return pd.DataFrame()

    def get_stock_valuation(self, symbol: str) -> Dict[str, Any]:
        """
        获取股票估值数据（优先 AKShare，失败则使用新浪实时行情降级）
        """
        try:
            val = self.akshare.get_stock_valuation(symbol)
            if "error" not in val:
                return val
        except Exception as e:
            logger.warning(f"AKShare valuation failed for {symbol}: {e}, falling back to Sina")

        try:
            # 降级：转换股票代码为新浪格式
            prefix = "sh" if symbol.startswith("6") else "sz" if symbol.startswith(("0", "3")) else "bj"
            sina_symbol = f"{prefix}{symbol}"

            data = self.sina.get_stock_realtime([sina_symbol])
            if data.empty:
                return {"error": f"No data for {symbol}"}

            row = data.iloc[0]

            # 引入腾讯财经备用接口获取市值、PE、换手率等估值核心参数
            market_cap, pe_ttm, turnover, pb = 0.0, 0.0, 0.0, 0.0
            try:
                import requests
                # 腾讯财经格式: sz000001, sh600000, bj832471 等与新浪拼法完全一致
                url = f"http://qt.gtimg.cn/q={sina_symbol}"
                resp = requests.get(url, timeout=5)
                if resp.status_code == 200 and "v_" in resp.text:
                    parts = resp.text.split('"')[1].split("~")
                    if len(parts) > 46:
                        # 45: 总市值(亿), 39: 市盈率TTM, 38: 换手率, 46: 市净率
                        market_cap = float(parts[45]) * 100000000 if parts[45] else 0
                        pe_ttm = float(parts[39]) if parts[39] else 0
                        turnover = float(parts[38]) if parts[38] else 0
                        pb = float(parts[46]) if parts[46] else 0
            except Exception as e:
                logger.warning(f"Tencent fallback failed for {symbol}: {e}")

            pre_close = float(row.get("pre_close", 1))
            current = float(row.get("price", 0))
            change_pct = (current - pre_close) / pre_close * 100 if pre_close > 0 else 0

            return {
                "symbol": symbol,
                "name": row.get("name", ""),
                "market_cap": market_cap,
                "pe_ttm": pe_ttm,
                "pb": pb,
                "turnover": turnover,
                "amount": float(row.get("amount", 0)),
                "change_pct": change_pct,
            }
        except Exception as e:
            logger.warning(f"Error getting fallback valuation for {symbol}: {e}")
            return {"error": str(e)}

    def get_stock_financial_data(self, symbol: str) -> Dict[str, Any]:
        """
        获取股票财务数据（优先 AKShare，失败则返回中性默认值）
        """
        try:
            return self.akshare.get_stock_financial_data(symbol)
        except Exception as e:
            logger.warning(f"AKShare financial data failed for {symbol}: {e}, returning default")
            return {
                "roe": 0,
                "revenue_yoy": 0,
                "profit_yoy": 0,
            }

    def get_historical_data(self, symbol: str, start_date=None, end_date=None) -> pd.DataFrame:
        """
        获取股票历史 K 线数据（增加磁盘持久化缓存，优先 AKShare(EastMoney)，失败则降级）
        """
        self.__class__._ensure_history_cache_loaded()

        from datetime import datetime, timedelta
        if end_date is None:
            end_date = datetime.now()
        if start_date is None:
            start_date = end_date - timedelta(days=90)

        start_str = start_date.strftime("%Y%m%d")
        end_str = end_date.strftime("%Y%m%d") if isinstance(end_date, datetime) else str(end_date)

        cache_key = f"{symbol}_{start_str}_{end_str}"

        # 1. 检查缓存 (TTL: 4小时)
        cache_entry = self.__class__._history_cache.get(cache_key)
        if cache_entry:
            timestamp = cache_entry.get("timestamp", 0)
            if time.time() - timestamp < 14400: # 4小时
                try:
                    df = pd.DataFrame(cache_entry["data"])
                    if not df.empty:
                        df['date'] = pd.to_datetime(df['date'])
                        df.set_index('date', inplace=True)
                        return df
                except Exception as e:
                    logger.warning(f"Error decoding history cache for {symbol}: {e}")

        df = pd.DataFrame()
        try:
            df = self.akshare.get_historical_data(symbol, start_date, end_date)
        except Exception as e:
            logger.warning(f"AKShare historical data failed for {symbol}: {e}, falling back to Sina Daily")

        if df.empty:
            try:
                # 降级：转换股票代码为新浪格式
                prefix = "sh" if symbol.startswith("6") else "sz" if symbol.startswith(("0", "3")) else "bj"
                sina_symbol = f"{prefix}{symbol}"

                df_fallback = ak.stock_zh_a_daily(symbol=sina_symbol, start_date=start_str, end_date=end_str)
                if not df_fallback.empty and 'close' in df_fallback.columns:
                    df_fallback['date'] = pd.to_datetime(df_fallback['date'])
                    df_fallback.set_index('date', inplace=True)
                    df = df_fallback
            except Exception as fallback_e:
                logger.debug(f"Historical data completely failed to load for {symbol}: {fallback_e}")

        # 2. 如果获取成功，存入缓存
        if not df.empty:
            try:
                # 准备序列化数据 (重置索引以便保存日期列)
                cache_data = df.reset_index()
                cache_data['date'] = cache_data['date'].dt.strftime('%Y-%m-%d')

                self.__class__._history_cache[cache_key] = {
                    "timestamp": time.time(),
                    "data": cache_data.to_dict(orient="records")
                }
                self.__class__._persist_history_cache()
            except Exception as e:
                logger.warning(f"Failed to cache history data for {symbol}: {e}")

        return df


# 工厂函数：自动选择可用的数据提供器
# 工厂函数：自动选择可用的数据提供器
def create_industry_provider():
    """
    创建行业数据提供器

    始终返回 SinaIndustryAdapter，因为该适配器内部已实现了
    对 THS、AKShare、Sina 的三层数据融合和能力回退机制。

    Returns:
        可用的数据提供器实例
    """
    logger.info("Initializing THS-first industry provider (THS + AKShare + Sina + Tencent)")
    return SinaIndustryAdapter()

# 测试代码
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    adapter = SinaIndustryAdapter()

    print("=== Industry Classification ===")
    industries = adapter.get_industry_classification()
    print(industries.head(10).to_string())

    print("\n=== Money Flow ===")
    flow = adapter.get_industry_money_flow()
    print(flow[["industry_name", "change_pct", "main_net_inflow", "flow_strength", "total_market_cap", "turnover_rate"]].head(10).to_string())

    print("\n=== Industry Stocks ===")
    if not industries.empty:
        name = industries.iloc[0]["industry_name"]
        stocks = adapter.get_stock_list_by_industry(name)
        print(f"Stocks in {name}: {len(stocks)}")
        for s in stocks[:5]:
            print(f"  {s['code']} {s['name']}: {s['change_pct']}%")

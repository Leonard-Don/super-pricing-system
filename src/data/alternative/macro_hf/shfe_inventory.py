"""
SHFE 金属库存追踪 (上海期货交易所)

通过 akshare.futures_inventory_em 直接拉取 SHFE 注册仓库的真实库存数据,
计算去库 / 累库信号。相对 LME 的期货价格代理, SHFE 这条线是真实交易所聚合数据
(source_mode=live), 用于 CN 侧大宗商品库存敞口。
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

import pandas as pd

from ..base_alt_provider import AntiCrawlMixin

logger = logging.getLogger(__name__)

# SHFE 追踪品种 (akshare futures_inventory_em 的 symbol 名称使用中文)
# 与 LME 的 HG=F / ALI=F / ZNC=F / NI=F 保持品种对齐, 便于两侧合成.
SHFE_METALS: Dict[str, Dict[str, str]] = {
    "copper": {"name": "铜", "symbol": "CU", "ak_symbol": "沪铜", "unit": "吨"},
    "aluminium": {"name": "铝", "symbol": "AL", "ak_symbol": "沪铝", "unit": "吨"},
    "zinc": {"name": "锌", "symbol": "ZN", "ak_symbol": "沪锌", "unit": "吨"},
    "nickel": {"name": "镍", "symbol": "NI", "ak_symbol": "镍", "unit": "吨"},
}


class SHFEInventoryProvider(AntiCrawlMixin):
    """
    SHFE 库存数据提供器

    通过 akshare.futures_inventory_em 抓取上海期货交易所每日仓单库存,
    按周环比 (5 个交易日) 计算去库 / 累库信号。

    与 LMEInventoryProvider 对齐的字段:
        - signal: 1=destocking (库存下降, 偏多), -1=restocking (库存上升, 偏空), 0=stable
        - confidence: 基于 |周变化率| 标度, 上限 0.8
        - source_mode: "live" (真实交易所数据, 区别于 LME 的 "proxy")
        - lag_days: 1 (akshare 截止上一交易日)
        - coverage: 实际返回品种数 / 请求品种数

    Usage:
        shfe = SHFEInventoryProvider()
        data = shfe.get_inventory("copper")
        analysis = shfe.analyze_inventory_trend("copper")
    """

    DEFAULT_LOOKBACK_DAYS = 90

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self._min_interval = self.config.get("min_request_interval", 2.0)
        self.logger = logger
        # 缓存最近一次抓取的 DataFrame, 便于 trend 与原始查询复用
        self._inventory_cache: Dict[str, pd.DataFrame] = {}

    # ── 单品种抓取 ────────────────────────────────────────────

    def get_inventory(
        self,
        metal: str,
        days_back: int = DEFAULT_LOOKBACK_DAYS,
    ) -> Dict[str, Any]:
        """
        获取指定金属的 SHFE 库存快照

        Args:
            metal: 金属代码 (copper/aluminium/zinc/nickel)
            days_back: 回溯天数 (akshare 默认返回最近 ~60 个交易日)

        Returns:
            标准化的库存字典, 失败时返回带 error 字段的 dict
        """
        if metal not in SHFE_METALS:
            return {"error": f"不支持的金属: {metal}"}

        metal_info = SHFE_METALS[metal]
        try:
            inventory_data = self._fetch_from_akshare(metal, days_back)
        except Exception as exc:  # noqa: BLE001 - akshare 内部抛多种异常, 这里一律降级
            self.logger.warning("获取 SHFE %s 库存失败: %s", metal, exc)
            return {
                "metal": metal,
                "name": metal_info["name"],
                "data": None,
                "error": f"akshare 调用失败: {exc}",
            }

        if not inventory_data:
            return {
                "metal": metal,
                "name": metal_info["name"],
                "data": None,
                "error": "akshare 返回空数据",
            }

        return {
            "metal": metal,
            "name": metal_info["name"],
            "symbol": metal_info["symbol"],
            "ak_symbol": metal_info["ak_symbol"],
            "unit": metal_info["unit"],
            "data": inventory_data,
            "source": "akshare_futures_inventory_em",
            "source_mode": "live",
            "lag_days": 1,
            "coverage": 1.0,
            "timestamp": datetime.now().isoformat(),
        }

    def _fetch_from_akshare(
        self, metal: str, days_back: int
    ) -> Optional[Dict[str, Any]]:
        """通过 akshare.futures_inventory_em 拉取 SHFE 仓单序列"""
        meta = SHFE_METALS.get(metal)
        if meta is None:
            return None
        ak_symbol = meta["ak_symbol"]

        try:
            import akshare as ak
        except ImportError:
            self.logger.error("akshare 未安装, 无法抓取 SHFE 库存")
            return None

        df = ak.futures_inventory_em(symbol=ak_symbol)
        if df is None or df.empty:
            return None

        # akshare 的返回 schema 为 ['日期', '库存', '增减'], '增减' 列可能含 NaN (首行)
        df = df.copy()
        df["日期"] = pd.to_datetime(df["日期"], errors="coerce")
        df = df.dropna(subset=["日期", "库存"]).sort_values("日期")
        # 仅保留 days_back 范围内的数据 (akshare 默认 ~60 行, 比此值小则全部保留)
        if days_back > 0:
            cutoff = df["日期"].max() - pd.Timedelta(days=days_back)
            df = df[df["日期"] >= cutoff]

        if df.empty:
            return None

        self._inventory_cache[metal] = df

        latest_stock = float(df.iloc[-1]["库存"])
        prev_stock = float(df.iloc[-2]["库存"]) if len(df) > 1 else latest_stock

        # 周环比 (取 5 个交易日前对比, 不足 5 个交易日则用最早值兜底)
        if len(df) > 5:
            week_ago_stock = float(df.iloc[-6]["库存"])
        else:
            week_ago_stock = float(df.iloc[0]["库存"])
        weekly_change = latest_stock - week_ago_stock
        weekly_change_pct = (
            (weekly_change / week_ago_stock * 100.0) if week_ago_stock > 0 else 0.0
        )

        # 日环比 (作为高频指标)
        daily_change = latest_stock - prev_stock
        daily_change_pct = (
            (daily_change / prev_stock * 100.0) if prev_stock > 0 else 0.0
        )

        avg_stock = float(df["库存"].mean())
        high_stock = float(df["库存"].max())
        low_stock = float(df["库存"].min())

        return {
            "latest_stock": round(latest_stock, 0),
            "prev_stock": round(prev_stock, 0),
            "week_ago_stock": round(week_ago_stock, 0),
            "daily_change": round(daily_change, 0),
            "daily_change_pct": round(daily_change_pct, 2),
            "weekly_change": round(weekly_change, 0),
            "weekly_change_pct": round(weekly_change_pct, 2),
            "avg_stock": round(avg_stock, 0),
            "high_stock": round(high_stock, 0),
            "low_stock": round(low_stock, 0),
            "data_points": int(len(df)),
            "latest_date": df.iloc[-1]["日期"].strftime("%Y-%m-%d"),
        }

    # ── 趋势分析 ──────────────────────────────────────────────

    def analyze_inventory_trend(
        self, metal: str, days_back: int = DEFAULT_LOOKBACK_DAYS
    ) -> Dict[str, Any]:
        """
        基于周环比库存变化输出标准化趋势字段

        signal 方向与 LMEInventoryProvider 保持一致:
            - 库存下降 (weekly_change_pct < -2%) → destocking → signal=1 (商品多头)
            - 库存上升 (weekly_change_pct >  2%) → restocking → signal=-1 (商品空头)
            - 否则 stable, signal=0

        Returns:
            统一的 trend 字典, 用于 MacroHFSignalProvider 解析。
        """
        data = self.get_inventory(metal, days_back)

        if data.get("error") or not data.get("data"):
            return {
                "metal": metal,
                "name": SHFE_METALS.get(metal, {}).get("name", metal),
                "trend": "unknown",
                "signal": 0,
                "confidence": 0,
                "source_mode": "curated",
                "fallback_reason": data.get("error", "shfe_inventory_unavailable"),
                "lag_days": 30,
                "coverage": 0.0,
                "region": "SHFE",
            }

        inventory = data["data"]
        weekly_change_pct = float(inventory.get("weekly_change_pct", 0.0))

        # 阈值与 LME 一致 (±2%), 但这里基于真实库存周环比
        if weekly_change_pct < -2.0:
            trend = "destocking"
            signal = 1
        elif weekly_change_pct > 2.0:
            trend = "restocking"
            signal = -1
        else:
            trend = "stable"
            signal = 0

        return {
            "metal": metal,
            "name": SHFE_METALS[metal]["name"],
            "trend": trend,
            "weekly_change_pct": weekly_change_pct,
            "daily_change_pct": float(inventory.get("daily_change_pct", 0.0)),
            "latest_stock": float(inventory.get("latest_stock", 0)),
            "latest_date": inventory.get("latest_date", ""),
            "signal": signal,
            "confidence": min(0.8, abs(weekly_change_pct) / 10.0),
            "source_mode": data.get("source_mode", "live"),
            "fallback_reason": "",
            "lag_days": data.get("lag_days", 1),
            "coverage": data.get("coverage", 1.0),
            "region": "SHFE",
            "timestamp": datetime.now().isoformat(),
        }

    def get_all_metals_summary(self) -> Dict[str, Dict[str, Any]]:
        """获取所有金属的摘要"""
        summary: Dict[str, Dict[str, Any]] = {}
        for metal in SHFE_METALS:
            summary[metal] = self.analyze_inventory_trend(metal)
        return summary

    def get_supported_metals(self) -> List[str]:
        """返回 SHFE 支持的金属代码列表"""
        return list(SHFE_METALS.keys())

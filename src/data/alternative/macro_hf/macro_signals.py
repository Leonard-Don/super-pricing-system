"""
全球宏观高频信号合成器。

Phase B 后接入两条真实库存线: LME (US 侧, yfinance 价格代理) 与
SHFE (CN 侧, akshare 真实仓单), 在 inventory 维度按区域并列归一化,
再按可配置权重 (默认 US/CN = 0.5 / 0.5) 合成 macro_pressure。
"""

from __future__ import annotations

from datetime import datetime
import logging
from typing import Any, Dict, List, Optional

from ..base_alt_provider import AltDataCategory, AltDataRecord, BaseAltDataProvider
from .lme_inventory import LMEInventoryProvider
from .shfe_inventory import SHFEInventoryProvider

logger = logging.getLogger(__name__)


class MacroHFSignalProvider(BaseAltDataProvider):
    """整合宏观高频数据线 (当前 LME + SHFE 双库存)。

    可配置项:
        region_weights: {"LME": 0.5, "SHFE": 0.5} 形态的 dict,
            将被归一化到和为 1。若提供单一 region 则其权重独占。
    """

    name = "macro_hf"
    category = AltDataCategory.COMMODITY_INVENTORY
    update_interval = 14400

    DEFAULT_REGION_WEIGHTS: Dict[str, float] = {"LME": 0.5, "SHFE": 0.5}

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__(config)
        self.lme = LMEInventoryProvider(config=config)
        self.shfe = SHFEInventoryProvider(config=config)
        self.region_weights = self._resolve_region_weights(
            (config or {}).get("region_weights")
        )

    @classmethod
    def _resolve_region_weights(
        cls, weights: Optional[Dict[str, float]]
    ) -> Dict[str, float]:
        if not weights:
            return dict(cls.DEFAULT_REGION_WEIGHTS)
        cleaned = {
            str(region).upper(): max(0.0, float(value))
            for region, value in weights.items()
            if value is not None
        }
        total = sum(cleaned.values())
        if total <= 0:
            return dict(cls.DEFAULT_REGION_WEIGHTS)
        return {region: value / total for region, value in cleaned.items()}

    # ── Step 1: Fetch ─────────────────────────────────────────

    def fetch(self, **kwargs: Any) -> List[Dict[str, Any]]:
        metals = kwargs.get("metals", ["copper", "aluminium"])

        raw_data: List[Dict[str, Any]] = []

        # LME (US 侧, proxy)
        for metal in metals:
            lme_record = self.lme.analyze_inventory_trend(metal)
            raw_data.append(
                {
                    "data_type": "inventory",
                    "region": "LME",
                    **lme_record,
                }
            )

        # SHFE (CN 侧, live). 限制在 SHFE 支持的品种内, 避免不支持品种报 error.
        shfe_supported = set(self.shfe.get_supported_metals())
        for metal in metals:
            if metal not in shfe_supported:
                continue
            shfe_record = self.shfe.analyze_inventory_trend(metal)
            raw_data.append(
                {
                    "data_type": "inventory",
                    "region": "SHFE",
                    **shfe_record,
                }
            )

        return raw_data

    # ── Step 2: Parse ─────────────────────────────────────────

    def parse(self, raw_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        parsed: List[Dict[str, Any]] = []
        for item in raw_data:
            data_type = item.get("data_type")
            if data_type == "inventory":
                region = str(item.get("region", "")).upper() or "LME"
                metal_name = item.get("name", item.get("metal", ""))
                parsed.append(
                    {
                        "type": "inventory",
                        "name": metal_name,
                        "region": region,
                        "score": float(item.get("signal", 0)) * max(
                            0.2, float(item.get("confidence", 0.0))
                        ),
                        "confidence": float(item.get("confidence", 0.0)),
                        "trend": item.get("trend", "unknown"),
                        "source_mode": item.get(
                            "source_mode",
                            "live" if region == "SHFE" else "proxy",
                        ),
                        "fallback_reason": item.get("fallback_reason", ""),
                        "lag_days": item.get("lag_days"),
                        "coverage": item.get("coverage"),
                        "raw": item,
                    }
                )
        return parsed

    # ── Step 3: Normalize ─────────────────────────────────────

    def normalize(self, parsed_data: List[Dict[str, Any]]) -> List[AltDataRecord]:
        now = datetime.now()
        records: List[AltDataRecord] = []
        for item in parsed_data:
            item_type = item["type"]
            if item_type == "inventory":
                category = AltDataCategory.COMMODITY_INVENTORY
            else:
                continue

            region = item.get("region", "LME")
            metal_label = item.get("name", "")
            records.append(
                AltDataRecord(
                    timestamp=now,
                    source=f"macro_hf:{item_type}:{region.lower()}",
                    category=category,
                    raw_value=item["raw"],
                    normalized_score=max(-1.0, min(1.0, float(item["score"]))),
                    confidence=max(0.0, min(1.0, float(item["confidence"]))),
                    tags=[metal_label, item_type, region.lower()],
                    metadata={
                        "label": metal_label,
                        "region": region,
                        "source_mode": item.get(
                            "source_mode",
                            "live" if region == "SHFE" else "proxy",
                        ),
                        "fallback_reason": item.get("fallback_reason", ""),
                        "lag_days": item.get("lag_days"),
                        "coverage": item.get("coverage"),
                    },
                )
            )
        return records

    # ── Step 4: Signal ────────────────────────────────────────

    def to_signal(self, records: List[AltDataRecord]) -> Dict[str, Any]:
        signal = super().to_signal(records)

        # 区域分项 (LME / SHFE) 各自的平均分
        region_breakdown = self._region_breakdown(records)

        # 加权合成 (按 region_weights 配置), 缺失的区域权重重新归一化
        macro_pressure_value, weights_used = self._weighted_inventory_score(
            region_breakdown
        )

        dimensions = {
            "inventory": _average_score(records, AltDataCategory.COMMODITY_INVENTORY),
            "inventory_by_region": region_breakdown,
        }
        signal["dimensions"] = dimensions
        signal["macro_pressure"] = round(macro_pressure_value, 4)
        signal["region_weights_used"] = {
            region: round(weight, 4) for region, weight in weights_used.items()
        }

        source_mode_counts: Dict[str, int] = {}
        for record in records:
            mode = str((record.metadata or {}).get("source_mode") or "proxy")
            source_mode_counts[mode] = source_mode_counts.get(mode, 0) + 1
        signal["source_mode_summary"] = {
            "counts": source_mode_counts,
            "dominant": max(
                source_mode_counts.items(), key=lambda item: item[1]
            )[0]
            if source_mode_counts
            else "proxy",
        }
        return signal

    @staticmethod
    def _region_breakdown(records: List[AltDataRecord]) -> Dict[str, Dict[str, Any]]:
        breakdown: Dict[str, List[float]] = {}
        for record in records:
            if record.category != AltDataCategory.COMMODITY_INVENTORY:
                continue
            region = str((record.metadata or {}).get("region") or "LME").upper()
            breakdown.setdefault(region, []).append(record.normalized_score)
        return {
            region: {
                "count": len(scores),
                "score": round(sum(scores) / len(scores), 4) if scores else 0.0,
            }
            for region, scores in breakdown.items()
        }

    def _weighted_inventory_score(
        self, region_breakdown: Dict[str, Dict[str, Any]]
    ) -> tuple[float, Dict[str, float]]:
        """按 region_weights 加权合成 inventory 分;
        若某 region 无数据, 其权重重新归一到其他 region 上。
        """
        active_regions = {
            region: payload["score"]
            for region, payload in region_breakdown.items()
            if payload.get("count", 0) > 0
        }
        if not active_regions:
            return 0.0, {}

        # 取交集权重 (区域必须既在 weights 配置又有数据), 缺失的 region 默认权重 0.
        # 若交集为空, 退化为 active_regions 等权.
        configured = {
            region: self.region_weights.get(region, 0.0)
            for region in active_regions
        }
        total = sum(configured.values())
        if total <= 0:
            uniform_weight = 1.0 / len(active_regions)
            configured = {region: uniform_weight for region in active_regions}
            total = 1.0
        normalized = {region: weight / total for region, weight in configured.items()}
        score = sum(
            active_regions[region] * normalized[region] for region in active_regions
        )
        return score, normalized


def _average_score(
    records: List[AltDataRecord], category: AltDataCategory
) -> Dict[str, Any]:
    scores = [
        record.normalized_score for record in records if record.category == category
    ]
    return {
        "count": len(scores),
        "score": round(sum(scores) / len(scores), 4) if scores else 0.0,
    }

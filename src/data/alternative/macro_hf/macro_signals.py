"""
全球宏观高频信号合成器。
"""

from __future__ import annotations

from datetime import datetime
import logging
from typing import Any, Dict, List, Optional

from ..base_alt_provider import AltDataCategory, AltDataRecord, BaseAltDataProvider
from .lme_inventory import LMEInventoryProvider

logger = logging.getLogger(__name__)


class MacroHFSignalProvider(BaseAltDataProvider):
    """整合宏观高频数据线（当前仅 LME 库存代理生效）。"""

    name = "macro_hf"
    category = AltDataCategory.COMMODITY_INVENTORY
    update_interval = 14400

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__(config)
        self.lme = LMEInventoryProvider(config=config)

    def fetch(self, **kwargs) -> List[Dict[str, Any]]:
        metals = kwargs.get("metals", ["copper", "aluminium"])

        raw_data: List[Dict[str, Any]] = []

        for metal in metals:
            raw_data.append(
                {
                    "data_type": "inventory",
                    **self.lme.analyze_inventory_trend(metal),
                }
            )

        return raw_data

    def parse(self, raw_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        parsed: List[Dict[str, Any]] = []
        for item in raw_data:
            data_type = item.get("data_type")
            if data_type == "inventory":
                parsed.append(
                    {
                        "type": "inventory",
                        "name": item.get("name", item.get("metal", "")),
                        "score": float(item.get("signal", 0)) * max(
                            0.2, float(item.get("confidence", 0.0))
                        ),
                        "confidence": float(item.get("confidence", 0.0)),
                        "trend": item.get("trend", "unknown"),
                        "source_mode": item.get("source_mode", "proxy"),
                        "fallback_reason": item.get("fallback_reason", ""),
                        "lag_days": item.get("lag_days"),
                        "coverage": item.get("coverage"),
                        "raw": item,
                    }
                )
        return parsed

    def normalize(self, parsed_data: List[Dict[str, Any]]) -> List[AltDataRecord]:
        now = datetime.now()
        records: List[AltDataRecord] = []
        for item in parsed_data:
            item_type = item["type"]
            if item_type == "inventory":
                category = AltDataCategory.COMMODITY_INVENTORY
            else:
                continue

            records.append(
                AltDataRecord(
                    timestamp=now,
                    source=f"macro_hf:{item_type}",
                    category=category,
                    raw_value=item["raw"],
                    normalized_score=max(-1.0, min(1.0, float(item["score"]))),
                    confidence=max(0.0, min(1.0, float(item["confidence"]))),
                    tags=[item.get("name", ""), item_type],
                    metadata={
                        "label": item.get("name", ""),
                        "source_mode": item.get("source_mode", "proxy"),
                        "fallback_reason": item.get("fallback_reason", ""),
                        "lag_days": item.get("lag_days"),
                        "coverage": item.get("coverage"),
                    },
                )
            )
        return records

    def to_signal(self, records: List[AltDataRecord]) -> Dict[str, Any]:
        signal = super().to_signal(records)
        dimensions = {
            "inventory": _average_score(records, AltDataCategory.COMMODITY_INVENTORY),
        }
        signal["dimensions"] = dimensions
        signal["macro_pressure"] = round(dimensions["inventory"]["score"], 4)
        source_mode_counts: Dict[str, int] = {}
        for record in records:
            mode = str((record.metadata or {}).get("source_mode") or "proxy")
            source_mode_counts[mode] = source_mode_counts.get(mode, 0) + 1
        signal["source_mode_summary"] = {
            "counts": source_mode_counts,
            "dominant": max(source_mode_counts.items(), key=lambda item: item[1])[0] if source_mode_counts else "proxy",
        }
        return signal


def _average_score(records: List[AltDataRecord], category: AltDataCategory) -> Dict[str, Any]:
    scores = [record.normalized_score for record in records if record.category == category]
    return {
        "count": len(scores),
        "score": round(sum(scores) / len(scores), 4) if scores else 0.0,
    }

"""来源结构相关的 4 个 ``build_*_summary``。

按"证据来源/分布"主题成组：
- ``build_concentration_summary``     — 证据是否过度集中在单源/单实体
- ``build_source_drift_summary``      — 来源结构最近是否从 official → derived 漂移
- ``build_source_gap_summary``        — 证据更新节奏是否在拉长 / 断流
- ``build_source_dominance_summary``  — 加权后的主导来源 tier 是否在切换
"""

from __future__ import annotations
from typing import Any, Dict, List


def build_concentration_summary(evidence_items: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not evidence_items:
        return {
            "top_source": "",
            "top_source_share": 0.0,
            "top_entity": "",
            "top_entity_share": 0.0,
            "label": "low",
            "reason": "证据分布相对均衡",
        }

    total = len(evidence_items)
    source_counts: Dict[str, int] = {}
    entity_counts: Dict[str, int] = {}
    for item in evidence_items:
        source = item.get("source") or "unknown"
        entity = item.get("canonical_entity") or item.get("category") or "unknown"
        source_counts[source] = source_counts.get(source, 0) + 1
        entity_counts[entity] = entity_counts.get(entity, 0) + 1

    top_source, top_source_count = max(source_counts.items(), key=lambda pair: pair[1])
    top_entity, top_entity_count = max(entity_counts.items(), key=lambda pair: pair[1])
    top_source_share = round(top_source_count / total, 4)
    top_entity_share = round(top_entity_count / total, 4)

    if top_source_share >= 0.9 or top_entity_share >= 0.9:
        label = "high"
        reason = "证据高度集中在单一来源或单一实体上，存在单点偏置风险"
    elif top_source_share >= 0.7 or top_entity_share >= 0.75:
        label = "medium"
        reason = "证据分布偏集中，解读时需防止单源放大"
    else:
        label = "low"
        reason = "证据分布相对分散"

    return {
        "top_source": top_source,
        "top_source_share": top_source_share,
        "top_entity": top_entity,
        "top_entity_share": top_entity_share,
        "label": label,
        "reason": reason,
    }


def build_source_drift_summary(evidence_items: List[Dict[str, Any]]) -> Dict[str, Any]:
    if len(evidence_items) < 2:
        return {
            "label": "stable",
            "recent_official_share": 0.0,
            "previous_official_share": 0.0,
            "recent_derived_share": 0.0,
            "previous_derived_share": 0.0,
            "reason": "样本不足，默认来源结构稳定",
        }

    midpoint = max(len(evidence_items) // 2, 1)
    recent = evidence_items[:midpoint]
    previous = evidence_items[midpoint:]
    if not previous:
        previous = recent

    def _share(rows: List[Dict[str, Any]], tier: str) -> float:
        if not rows:
            return 0.0
        return round(
            sum(1 for item in rows if item.get("source_tier") == tier) / len(rows),
            4,
        )

    recent_official = _share(recent, "official")
    previous_official = _share(previous, "official")
    recent_derived = _share(recent, "derived")
    previous_derived = _share(previous, "derived")

    official_drop = round(previous_official - recent_official, 4)
    derived_rise = round(recent_derived - previous_derived, 4)

    if official_drop >= 0.4 and derived_rise >= 0.25:
        label = "degrading"
        reason = "近期来源结构从官方/硬源明显退化到派生源支撑"
    elif recent_official - previous_official >= 0.3 and previous_derived - recent_derived >= 0.2:
        label = "improving"
        reason = "近期来源结构向官方/硬源回升"
    else:
        label = "stable"
        reason = "近期来源结构没有明显漂移"

    return {
        "label": label,
        "recent_official_share": recent_official,
        "previous_official_share": previous_official,
        "recent_derived_share": recent_derived,
        "previous_derived_share": previous_derived,
        "reason": reason,
    }


def build_source_gap_summary(records: List[Any]) -> Dict[str, Any]:
    ordered = sorted(
        [record for record in records if getattr(record, "timestamp", None) is not None],
        key=lambda item: item.timestamp,
    )
    if len(ordered) < 2:
        return {
            "label": "stable",
            "latest_gap_hours": 0.0,
            "baseline_gap_hours": 0.0,
            "reason": "样本不足，默认无明显断流",
        }

    if len(ordered) == 2:
        latest_gap = round(
            max((ordered[1].timestamp - ordered[0].timestamp).total_seconds() / 3600, 0.0),
            2,
        )
        baseline_gap = 24.0
        if latest_gap >= 168:
            label = "broken"
            reason = "仅有两条样本且最近间隔已明显超出常规更新节奏，疑似出现来源断流"
        elif latest_gap >= 72:
            label = "stretching"
            reason = "仅有两条样本且最近间隔明显拉长，应关注来源是否正在断流"
        else:
            label = "stable"
            reason = "当前样本较少，但最近间隔仍处于可接受范围"
        return {
            "label": label,
            "latest_gap_hours": latest_gap,
            "baseline_gap_hours": baseline_gap,
            "reason": reason,
        }

    gap_hours = []
    for index in range(1, len(ordered)):
        gap = (ordered[index].timestamp - ordered[index - 1].timestamp).total_seconds() / 3600
        gap_hours.append(max(gap, 0.0))

    latest_gap = round(gap_hours[-1], 2)
    baseline_gaps = gap_hours[:-1] or gap_hours
    baseline_gap = round(sum(baseline_gaps) / len(baseline_gaps), 2)

    if latest_gap >= max(baseline_gap * 3, 72):
        label = "broken"
        reason = "最近证据更新间隔明显拉长，疑似出现来源断流"
    elif latest_gap >= max(baseline_gap * 2, 48):
        label = "stretching"
        reason = "最近证据更新开始变慢，应关注是否进入断流前兆"
    else:
        label = "stable"
        reason = "证据更新节奏稳定"

    return {
        "label": label,
        "latest_gap_hours": latest_gap,
        "baseline_gap_hours": baseline_gap,
        "reason": reason,
    }


def build_source_dominance_summary(evidence_items: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not evidence_items:
        return {
            "recent_dominant_tier": "",
            "previous_dominant_tier": "",
            "recent_share": 0.0,
            "previous_share": 0.0,
            "label": "stable",
            "reason": "缺少证据，无法判断来源主导权",
        }

    midpoint = max(len(evidence_items) // 2, 1)
    recent = evidence_items[:midpoint]
    previous = evidence_items[midpoint:] or evidence_items[:midpoint]

    def _tier_weights(rows: List[Dict[str, Any]]) -> Dict[str, float]:
        totals: Dict[str, float] = {}
        for item in rows:
            tier = item.get("source_tier") or "derived"
            weight = (
                abs(float(item.get("normalized_score", 0.0) or 0.0))
                * float(item.get("confidence", 0.0) or 0.0)
                * float(item.get("freshness_weight", 1.0) or 1.0)
                * float(item.get("trust_score", 0.65) or 0.65)
            )
            totals[tier] = totals.get(tier, 0.0) + weight
        return totals

    recent_weights = _tier_weights(recent)
    previous_weights = _tier_weights(previous)
    recent_total = sum(recent_weights.values()) or 1.0
    previous_total = sum(previous_weights.values()) or 1.0
    recent_dominant, recent_weight = max(recent_weights.items(), key=lambda pair: pair[1])
    previous_dominant, previous_weight = max(previous_weights.items(), key=lambda pair: pair[1])
    recent_share = round(recent_weight / recent_total, 4)
    previous_share = round(previous_weight / previous_total, 4)

    if recent_dominant != previous_dominant:
        label = "rotating"
        reason = f"结论主导权已从 {previous_dominant} 切换到 {recent_dominant}"
    elif recent_dominant == "derived" and recent_share >= 0.6:
        label = "derived_dominant"
        reason = "当前结论主要由派生源主导，应降低对硬锚的依赖"
    elif recent_dominant == "official" and recent_share >= 0.5:
        label = "official_dominant"
        reason = "当前结论仍由官方/硬源主导"
    else:
        label = "stable"
        reason = "当前来源主导权没有明显变化"

    return {
        "recent_dominant_tier": recent_dominant,
        "previous_dominant_tier": previous_dominant,
        "recent_share": recent_share,
        "previous_share": previous_share,
        "label": label,
        "reason": reason,
    }

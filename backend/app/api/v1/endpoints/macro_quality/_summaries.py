"""build_*_summary 与 calculate_confidence_*：14 个证据/置信度摘要函数。"""

from __future__ import annotations
from typing import Any, Dict, List


def build_policy_source_health_summary(
    context: Dict[str, Any],
    signal_keys: set[str],
) -> Dict[str, Any]:
    if "policy_radar" not in signal_keys:
        return {"label": "unknown", "reason": "", "sources": [], "fragile_sources": [], "watch_sources": []}

    signal = context.get("signals", {}).get("policy_radar", {}) or {}
    source_health = signal.get("source_health", {}) or {}
    if not source_health:
        return {"label": "unknown", "reason": "", "sources": [], "fragile_sources": [], "watch_sources": []}

    fragile_sources = sorted([name for name, meta in source_health.items() if meta.get("level") == "fragile"])
    watch_sources = sorted([name for name, meta in source_health.items() if meta.get("level") == "watch"])
    healthy_sources = sorted([name for name, meta in source_health.items() if meta.get("level") == "healthy"])
    avg_full_text_ratio = (
        sum(float(meta.get("full_text_ratio", 0.0) or 0.0) for meta in source_health.values()) / len(source_health)
        if source_health
        else 0.0
    )

    if fragile_sources:
        label = "fragile"
        reason = f"正文抓取脆弱源 {', '.join(fragile_sources[:3])}"
    elif watch_sources or avg_full_text_ratio < 0.7:
        label = "watch"
        if watch_sources:
            reason = f"正文抓取需关注 {', '.join(watch_sources[:3])}"
        else:
            reason = f"平均正文覆盖偏低 {round(avg_full_text_ratio * 100, 1)}%"
    else:
        label = "healthy"
        reason = f"主要政策源正文覆盖稳定，健康源 {', '.join(healthy_sources[:3])}"

    return {
        "label": label,
        "reason": reason,
        "sources": sorted(source_health.keys()),
        "fragile_sources": fragile_sources,
        "watch_sources": watch_sources,
        "healthy_sources": healthy_sources,
        "avg_full_text_ratio": round(avg_full_text_ratio, 4),
        "details": source_health,
    }



def build_coverage_summary(
    categories: set,
    signal_keys: set,
    records: List[Any],
    signal_evidence: List[Dict[str, Any]],
) -> Dict[str, Any]:
    expected_categories = sorted(categories)
    covered_categories = sorted({
        getattr(getattr(record, "category", None), "value", "")
        for record in records
        if getattr(getattr(record, "category", None), "value", "") in categories
    })
    expected_signals = sorted(signal_keys)
    covered_signals = sorted({
        item.get("signal", "")
        for item in signal_evidence
        if item.get("signal") and int(item.get("record_count", 0) or 0) > 0
    })

    category_ratio = (
        round(len(covered_categories) / len(expected_categories), 4)
        if expected_categories else 1.0
    )
    signal_ratio = (
        round(len(covered_signals) / len(expected_signals), 4)
        if expected_signals else 1.0
    )
    overall_ratio = round((category_ratio + signal_ratio) / 2, 4)

    if overall_ratio >= 0.8:
        label = "strong"
    elif overall_ratio >= 0.55:
        label = "partial"
    elif overall_ratio > 0:
        label = "thin"
    else:
        label = "sparse"

    return {
        "expected_categories": expected_categories,
        "covered_categories": covered_categories,
        "missing_categories": [item for item in expected_categories if item not in covered_categories],
        "category_coverage_ratio": category_ratio,
        "expected_signals": expected_signals,
        "covered_signals": covered_signals,
        "missing_signals": [item for item in expected_signals if item not in covered_signals],
        "signal_coverage_ratio": signal_ratio,
        "overall_coverage_ratio": overall_ratio,
        "coverage_label": label,
    }


def build_stability_summary(records: List[Any]) -> Dict[str, Any]:
    ordered = sorted(
        [record for record in records if getattr(record, "timestamp", None) is not None],
        key=lambda item: item.timestamp,
    )
    scores = [round(float(record.normalized_score or 0.0), 4) for record in ordered]
    if len(scores) < 2:
        return {
            "label": "stable",
            "avg_abs_delta": 0.0,
            "max_abs_delta": 0.0,
            "sign_flip_count": 0,
            "reason": "样本不足，默认稳定",
        }

    deltas = [abs(scores[index] - scores[index - 1]) for index in range(1, len(scores))]
    avg_abs_delta = round(sum(deltas) / len(deltas), 4)
    max_abs_delta = round(max(deltas), 4)

    sign_flip_count = 0
    previous_sign = 0
    for score in scores:
        if score >= 0.18:
            current_sign = 1
        elif score <= -0.18:
            current_sign = -1
        else:
            current_sign = 0
        if previous_sign and current_sign and current_sign != previous_sign:
            sign_flip_count += 1
        if current_sign:
            previous_sign = current_sign

    if sign_flip_count >= 2 or avg_abs_delta >= 0.45 or max_abs_delta >= 0.8:
        label = "unstable"
        reason = "近期分数跳变过大，且存在明显来回摆动"
    elif sign_flip_count >= 1 or avg_abs_delta >= 0.25 or max_abs_delta >= 0.45:
        label = "choppy"
        reason = "近期分数波动偏大，稳定性一般"
    else:
        label = "stable"
        reason = "近期分数变化平稳，可作为较稳定锚点"

    return {
        "label": label,
        "avg_abs_delta": avg_abs_delta,
        "max_abs_delta": max_abs_delta,
        "sign_flip_count": sign_flip_count,
        "reason": reason,
    }


def build_lag_summary(evidence_summary: Dict[str, Any]) -> Dict[str, Any]:
    latest = (evidence_summary.get("recent_evidence") or [{}])[0]
    age_hours = float(latest.get("age_hours", 0.0) or 0.0)
    freshness_label = latest.get("freshness_label") or evidence_summary.get("freshness_label", "stale")

    if freshness_label == "fresh":
        level = "none"
        reason = "关键证据仍然新鲜，时效性良好"
    elif freshness_label == "recent":
        level = "low"
        reason = "关键证据开始变旧，应关注后续更新"
    elif freshness_label == "aging":
        level = "medium"
        reason = "关键证据已进入衰减期，定价时效明显下降"
    else:
        level = "high"
        reason = "关键证据已经陈旧，可能失去定价时效"

    return {
        "level": level,
        "age_hours": round(age_hours, 2),
        "freshness_label": freshness_label,
        "reason": reason,
    }


def build_cross_confirmation_summary(evidence_items: List[Dict[str, Any]]) -> Dict[str, Any]:
    confirming_items = [
        item for item in evidence_items
        if abs(float(item.get("normalized_score", 0.0) or 0.0)) >= 0.18
        and float(item.get("confidence", 0.0) or 0.0) >= 0.55
    ]
    if not confirming_items:
        return {
            "label": "none",
            "dominant_direction": "neutral",
            "confirming_source_tiers": [],
            "confirming_categories": [],
            "confirming_source_count": 0,
            "reason": "缺少足够强的独立证据确认",
        }

    positive_score = sum(
        float(item.get("normalized_score", 0.0) or 0.0)
        for item in confirming_items
        if float(item.get("normalized_score", 0.0) or 0.0) > 0
    )
    negative_score = sum(
        abs(float(item.get("normalized_score", 0.0) or 0.0))
        for item in confirming_items
        if float(item.get("normalized_score", 0.0) or 0.0) < 0
    )
    dominant_direction = "positive" if positive_score >= negative_score else "negative"
    aligned_items = [
        item for item in confirming_items
        if (dominant_direction == "positive" and float(item.get("normalized_score", 0.0) or 0.0) > 0)
        or (dominant_direction == "negative" and float(item.get("normalized_score", 0.0) or 0.0) < 0)
    ]

    source_tiers = sorted({item.get("source_tier", "") for item in aligned_items if item.get("source_tier")})
    categories = sorted({item.get("category", "") for item in aligned_items if item.get("category")})
    sources = sorted({item.get("source", "") for item in aligned_items if item.get("source")})

    if len(source_tiers) >= 3 or (len(source_tiers) >= 2 and len(categories) >= 3):
        label = "strong"
        reason = "同向结论已被多类来源独立确认"
    elif len(source_tiers) >= 2 or len(categories) >= 2 or len(sources) >= 2:
        label = "moderate"
        reason = "同向结论已获得跨源侧证确认"
    else:
        label = "weak"
        reason = "当前结论主要依赖单一来源链条"

    return {
        "label": label,
        "dominant_direction": dominant_direction,
        "confirming_source_tiers": source_tiers,
        "confirming_categories": categories,
        "confirming_source_count": len(sources),
        "reason": reason,
    }


def build_reversal_summary(records: List[Any]) -> Dict[str, Any]:
    ordered = sorted(
        [record for record in records if getattr(record, "timestamp", None) is not None],
        key=lambda item: item.timestamp,
    )
    if len(ordered) < 3:
        return {
            "label": "stable",
            "previous_direction": "neutral",
            "recent_direction": "neutral",
            "previous_avg_score": 0.0,
            "recent_avg_score": 0.0,
            "reason": "样本不足，无法判断方向反转",
        }

    midpoint = max(len(ordered) // 2, 1)
    previous_scores = [float(record.normalized_score or 0.0) for record in ordered[:midpoint]]
    recent_scores = [float(record.normalized_score or 0.0) for record in ordered[midpoint:]] or previous_scores

    previous_avg = round(sum(previous_scores) / len(previous_scores), 4) if previous_scores else 0.0
    recent_avg = round(sum(recent_scores) / len(recent_scores), 4) if recent_scores else 0.0

    def _direction(score: float) -> str:
        if score >= 0.18:
            return "positive"
        if score <= -0.18:
            return "negative"
        return "neutral"

    previous_direction = _direction(previous_avg)
    recent_direction = _direction(recent_avg)

    if previous_direction in {"positive", "negative"} and recent_direction in {"positive", "negative"} and previous_direction != recent_direction:
        label = "reversed"
        reason = "因子近期主方向已经发生反转"
    elif previous_direction in {"positive", "negative"} and recent_direction == "neutral":
        label = "fading"
        reason = "因子原有方向正在显著减弱"
    elif previous_direction == "neutral" and recent_direction in {"positive", "negative"}:
        label = "emerging"
        reason = "因子开始形成新的明确方向"
    else:
        label = "stable"
        reason = "因子主方向暂时稳定"

    return {
        "label": label,
        "previous_direction": previous_direction,
        "recent_direction": recent_direction,
        "previous_avg_score": previous_avg,
        "recent_avg_score": recent_avg,
        "reason": reason,
    }


def build_reversal_precursor_summary(reversal_summary: Dict[str, Any]) -> Dict[str, Any]:
    previous_direction = reversal_summary.get("previous_direction", "neutral")
    recent_direction = reversal_summary.get("recent_direction", "neutral")
    previous_avg = abs(float(reversal_summary.get("previous_avg_score", 0.0) or 0.0))
    recent_avg = abs(float(reversal_summary.get("recent_avg_score", 0.0) or 0.0))

    if previous_direction in {"positive", "negative"} and recent_direction == previous_direction:
        weakening_ratio = round((previous_avg - recent_avg) / previous_avg, 4) if previous_avg > 0 else 0.0
        if recent_avg <= 0.22 and weakening_ratio >= 0.45:
            return {
                "label": "high",
                "weakening_ratio": weakening_ratio,
                "distance_to_zero": round(recent_avg, 4),
                "reason": "因子仍未翻向，但已快速逼近零轴，存在较强反转前兆",
            }
        if recent_avg <= 0.3 and weakening_ratio >= 0.3:
            return {
                "label": "medium",
                "weakening_ratio": weakening_ratio,
                "distance_to_zero": round(recent_avg, 4),
                "reason": "因子主方向明显衰减，正在接近反转临界区",
            }

    return {
        "label": "none",
        "weakening_ratio": 0.0,
        "distance_to_zero": round(recent_avg, 4),
        "reason": "暂未观察到明显反转前兆",
    }


def build_consistency_summary(evidence_items: List[Dict[str, Any]]) -> Dict[str, Any]:
    confirming = [
        item for item in evidence_items
        if abs(float(item.get("normalized_score", 0.0) or 0.0)) >= 0.18
        and float(item.get("confidence", 0.0) or 0.0) >= 0.55
    ]
    if len(confirming) < 2:
        return {
            "label": "unknown",
            "dominant_direction": "neutral",
            "dispersion": 0.0,
            "avg_strength": 0.0,
            "reason": "样本不足，无法判断结论强弱一致度",
        }

    positive_score = sum(
        float(item.get("normalized_score", 0.0) or 0.0)
        for item in confirming
        if float(item.get("normalized_score", 0.0) or 0.0) > 0
    )
    negative_score = sum(
        abs(float(item.get("normalized_score", 0.0) or 0.0))
        for item in confirming
        if float(item.get("normalized_score", 0.0) or 0.0) < 0
    )
    dominant_direction = "positive" if positive_score >= negative_score else "negative"
    aligned = [
        item for item in confirming
        if (dominant_direction == "positive" and float(item.get("normalized_score", 0.0) or 0.0) > 0)
        or (dominant_direction == "negative" and float(item.get("normalized_score", 0.0) or 0.0) < 0)
    ]
    strengths = [abs(float(item.get("normalized_score", 0.0) or 0.0)) for item in aligned]
    if len(strengths) < 2:
        return {
            "label": "weak",
            "dominant_direction": dominant_direction,
            "dispersion": 0.0,
            "avg_strength": round(sum(strengths) / len(strengths), 4) if strengths else 0.0,
            "reason": "仅有单一强证据支撑，结论一致度有限",
        }

    dispersion = round(max(strengths) - min(strengths), 4)
    avg_strength = round(sum(strengths) / len(strengths), 4)
    if dispersion <= 0.18:
        label = "strong"
        reason = "多源不仅同向，而且对结论强弱判断高度一致"
    elif dispersion <= 0.35:
        label = "moderate"
        reason = "多源总体同向，但对结论强弱仍存在一定分歧"
    else:
        label = "divergent"
        reason = "虽然多源同向，但对结论强弱判断分歧较大"

    return {
        "label": label,
        "dominant_direction": dominant_direction,
        "dispersion": dispersion,
        "avg_strength": avg_strength,
        "reason": reason,
    }



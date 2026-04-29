"""apply_conflict_penalty / build_input_reliability_summary 等可靠度评估器。

依赖：
- ``_summaries`` 提供 ``calculate_confidence_penalty`` / ``calculate_confidence_support_bonus``
- ``_warnings``  提供 10 个 ``_calculate_*_warning`` 警示计算器
- ``..macro_support`` 提供 ``FACTOR_WEIGHTS``
"""

from __future__ import annotations
from typing import Any, Dict

from ..macro_support import FACTOR_WEIGHTS  # noqa: F401  (used by callers)
from ._summaries import calculate_confidence_penalty, calculate_confidence_support_bonus
from ._warnings import (
    _calculate_blind_spot_warning,
    _calculate_concentration_warning,
    _calculate_consistency_warning,
    _calculate_lag_warning,
    _calculate_reversal_precursor_warning,
    _calculate_reversal_warning,
    _calculate_source_dominance_warning,
    _calculate_source_drift_warning,
    _calculate_source_gap_warning,
    _calculate_stability_warning,
)


def apply_conflict_penalty(overview: Dict[str, Any]) -> Dict[str, Any]:
    adjusted_confidence = 0.0
    total_weight = 0.0
    penalized_count = 0
    boosted_count = 0
    blind_spot_count = 0
    unstable_count = 0
    concentrated_count = 0
    lagging_count = 0
    drifting_count = 0
    broken_flow_count = 0
    confirmed_count = 0
    dominance_shift_count = 0
    inconsistent_count = 0
    reversing_count = 0
    precursor_count = 0
    policy_source_fragile_count = 0

    for factor in overview.get("factors", []):
        factor.setdefault("metadata", {})
        evidence_summary = factor["metadata"].get("evidence_summary", {})
        raw_confidence = round(float(factor.get("confidence", 0.0) or 0.0), 4)
        penalty_meta = calculate_confidence_penalty(evidence_summary)
        bonus_meta = calculate_confidence_support_bonus(evidence_summary)
        effective_confidence = min(
            1.0,
            max(0.0, round(raw_confidence - penalty_meta["penalty"] + bonus_meta["bonus"], 4)),
        )
        factor["metadata"]["raw_confidence"] = raw_confidence
        factor["metadata"]["confidence_penalty"] = penalty_meta["penalty"]
        factor["metadata"]["effective_confidence"] = effective_confidence
        factor["metadata"]["confidence_penalty_reason"] = penalty_meta["reason"]
        factor["metadata"]["confidence_support_bonus"] = bonus_meta["bonus"]
        factor["metadata"]["confidence_support_reason"] = bonus_meta["reason"]
        blind_spot_meta = _calculate_blind_spot_warning(evidence_summary, effective_confidence)
        factor["metadata"]["blind_spot_warning"] = blind_spot_meta["warning"]
        factor["metadata"]["blind_spot_level"] = blind_spot_meta["level"]
        factor["metadata"]["blind_spot_reason"] = blind_spot_meta["reason"]
        factor["metadata"]["blind_spot_missing_categories"] = blind_spot_meta["missing_categories"]
        stability_meta = _calculate_stability_warning(evidence_summary, effective_confidence)
        factor["metadata"]["stability_warning"] = stability_meta["warning"]
        factor["metadata"]["stability_level"] = stability_meta["level"]
        factor["metadata"]["stability_reason"] = stability_meta["reason"]
        concentration_meta = _calculate_concentration_warning(evidence_summary, effective_confidence)
        factor["metadata"]["concentration_warning"] = concentration_meta["warning"]
        factor["metadata"]["concentration_level"] = concentration_meta["level"]
        factor["metadata"]["concentration_reason"] = concentration_meta["reason"]
        drift_meta = _calculate_source_drift_warning(evidence_summary, effective_confidence)
        factor["metadata"]["source_drift_warning"] = drift_meta["warning"]
        factor["metadata"]["source_drift_level"] = drift_meta["level"]
        factor["metadata"]["source_drift_reason"] = drift_meta["reason"]
        gap_meta = _calculate_source_gap_warning(evidence_summary, effective_confidence)
        factor["metadata"]["source_gap_warning"] = gap_meta["warning"]
        factor["metadata"]["source_gap_level"] = gap_meta["level"]
        factor["metadata"]["source_gap_reason"] = gap_meta["reason"]
        dominance_meta = _calculate_source_dominance_warning(evidence_summary, effective_confidence)
        factor["metadata"]["source_dominance_warning"] = dominance_meta["warning"]
        factor["metadata"]["source_dominance_level"] = dominance_meta["level"]
        factor["metadata"]["source_dominance_reason"] = dominance_meta["reason"]
        consistency_meta = _calculate_consistency_warning(evidence_summary, effective_confidence)
        factor["metadata"]["consistency_warning"] = consistency_meta["warning"]
        factor["metadata"]["consistency_level"] = consistency_meta["level"]
        factor["metadata"]["consistency_reason"] = consistency_meta["reason"]
        reversal_meta = _calculate_reversal_warning(evidence_summary, effective_confidence)
        factor["metadata"]["reversal_warning"] = reversal_meta["warning"]
        factor["metadata"]["reversal_level"] = reversal_meta["level"]
        factor["metadata"]["reversal_reason"] = reversal_meta["reason"]
        precursor_meta = _calculate_reversal_precursor_warning(evidence_summary, effective_confidence)
        factor["metadata"]["reversal_precursor_warning"] = precursor_meta["warning"]
        factor["metadata"]["reversal_precursor_level"] = precursor_meta["level"]
        factor["metadata"]["reversal_precursor_reason"] = precursor_meta["reason"]
        lag_meta = _calculate_lag_warning(evidence_summary, effective_confidence)
        factor["metadata"]["lag_warning"] = lag_meta["warning"]
        factor["metadata"]["lag_level"] = lag_meta["level"]
        factor["metadata"]["lag_reason"] = lag_meta["reason"]
        policy_source_health = evidence_summary.get("policy_source_health_summary", {})
        factor["metadata"]["policy_source_warning"] = policy_source_health.get("label") in {"watch", "fragile"}
        factor["metadata"]["policy_source_level"] = policy_source_health.get("label", "unknown")
        factor["metadata"]["policy_source_reason"] = policy_source_health.get("reason", "")
        factor["confidence"] = effective_confidence

        if penalty_meta["penalty"] > 0:
            penalized_count += 1
        if bonus_meta["bonus"] > 0:
            boosted_count += 1
        if evidence_summary.get("cross_confirmation_summary", {}).get("label") in {"strong", "moderate"}:
            confirmed_count += 1
        if blind_spot_meta["warning"]:
            blind_spot_count += 1
        if stability_meta["warning"]:
            unstable_count += 1
        if concentration_meta["warning"]:
            concentrated_count += 1
        if drift_meta["warning"]:
            drifting_count += 1
        if gap_meta["warning"]:
            broken_flow_count += 1
        if dominance_meta["warning"]:
            dominance_shift_count += 1
        if consistency_meta["warning"]:
            inconsistent_count += 1
        if reversal_meta["warning"]:
            reversing_count += 1
        if precursor_meta["warning"]:
            precursor_count += 1
        if lag_meta["warning"]:
            lagging_count += 1
        if policy_source_health.get("label") in {"watch", "fragile"}:
            policy_source_fragile_count += 1

        weight = float(FACTOR_WEIGHTS.get(factor.get("name", ""), 1.0))
        total_weight += weight
        adjusted_confidence += effective_confidence * weight

    if overview.get("factors"):
        overview["confidence"] = round(adjusted_confidence / total_weight, 4) if total_weight else 0.0
        overview["confidence_adjustment"] = {
            "penalized_factor_count": penalized_count,
            "boosted_factor_count": boosted_count,
            "blind_spot_factor_count": blind_spot_count,
            "unstable_factor_count": unstable_count,
            "concentrated_factor_count": concentrated_count,
            "lagging_factor_count": lagging_count,
            "drifting_factor_count": drifting_count,
            "broken_flow_factor_count": broken_flow_count,
            "confirmed_factor_count": confirmed_count,
            "dominance_shift_factor_count": dominance_shift_count,
            "inconsistent_factor_count": inconsistent_count,
            "reversing_factor_count": reversing_count,
            "precursor_factor_count": precursor_count,
            "policy_source_fragile_factor_count": policy_source_fragile_count,
            "reason": "证据分裂会降低置信度，一致且高质量证据会提升置信度",
        }
    return overview


def build_input_reliability_summary(overview: Dict[str, Any]) -> Dict[str, Any]:
    factors = overview.get("factors", []) or []
    confidence_adjustment = overview.get("confidence_adjustment", {}) or {}
    evidence_summary = overview.get("evidence_summary", {}) or {}
    confidence = float(overview.get("confidence", 0.0) or 0.0)
    total_factors = len(factors) or 1

    issue_counts = {
        "blind_spot": int(confidence_adjustment.get("blind_spot_factor_count", 0) or 0),
        "unstable": int(confidence_adjustment.get("unstable_factor_count", 0) or 0),
        "lagging": int(confidence_adjustment.get("lagging_factor_count", 0) or 0),
        "concentrated": int(confidence_adjustment.get("concentrated_factor_count", 0) or 0),
        "drifting": int(confidence_adjustment.get("drifting_factor_count", 0) or 0),
        "broken_flow": int(confidence_adjustment.get("broken_flow_factor_count", 0) or 0),
        "dominance_shift": int(confidence_adjustment.get("dominance_shift_factor_count", 0) or 0),
        "inconsistent": int(confidence_adjustment.get("inconsistent_factor_count", 0) or 0),
        "reversing": int(confidence_adjustment.get("reversing_factor_count", 0) or 0),
        "precursor": int(confidence_adjustment.get("precursor_factor_count", 0) or 0),
        "policy_source_fragile": int(confidence_adjustment.get("policy_source_fragile_factor_count", 0) or 0),
    }
    support_counts = {
        "confirmed": int(confidence_adjustment.get("confirmed_factor_count", 0) or 0),
        "boosted": int(confidence_adjustment.get("boosted_factor_count", 0) or 0),
    }
    total_issue_hits = sum(issue_counts.values())
    dominant_issues = [name for name, count in issue_counts.items() if count > 0]
    dominant_issues.sort(key=lambda name: (-issue_counts[name], name))
    dominant_supports = [name for name, count in support_counts.items() if count > 0]
    dominant_supports.sort(key=lambda name: (-support_counts[name], name))

    freshness_label = evidence_summary.get("freshness_label", "stale")
    conflict_level = evidence_summary.get("conflict_level", "none")
    policy_source_health = (evidence_summary.get("policy_source_health_summary") or {}).get("label", "unknown")

    if (
        confidence < 0.5
        or total_issue_hits >= max(3, total_factors)
        or conflict_level == "high"
        or policy_source_health == "fragile"
        or freshness_label in {"stale", "aging"}
        or issue_counts["broken_flow"] > 0
    ):
        label = "fragile"
        posture = "当前宏观输入更适合先复核来源与证据质量，再用于定价判断。"
    elif (
        confidence < 0.7
        or total_issue_hits >= 1
        or conflict_level in {"medium", "low"}
        or policy_source_health == "watch"
        or freshness_label in {"recent", "aging"}
    ):
        label = "watch"
        posture = "当前宏观输入更适合作为研究排序与提示信号，不宜单独当作强定价锚。"
    else:
        label = "robust"
        posture = "当前宏观输入整体可靠度较好，可作为较强研究锚，但仍应结合具体资产上下文。"

    risk_score = max(
        0.0,
        min(
            1.0,
            round(
                confidence
                - min(0.35, total_issue_hits * 0.025)
                + min(0.15, sum(support_counts.values()) * 0.02),
                4,
            ),
        ),
    )

    issue_labels = {
        "blind_spot": "输入盲区",
        "unstable": "时序不稳",
        "lagging": "时效偏旧",
        "concentrated": "证据集中",
        "drifting": "来源退化",
        "broken_flow": "来源断流",
        "dominance_shift": "主导权切换",
        "inconsistent": "结论分歧",
        "reversing": "方向反转",
        "precursor": "反转前兆",
        "policy_source_fragile": "政策源脆弱",
    }
    support_labels = {
        "confirmed": "跨源确认",
        "boosted": "高质量加成",
    }
    issue_text = "、".join(issue_labels[name] for name in dominant_issues[:3]) if dominant_issues else ""
    support_text = "、".join(support_labels[name] for name in dominant_supports[:2]) if dominant_supports else ""

    if label == "fragile":
        lead = f"当前输入可靠度偏脆弱，主要风险来自 {issue_text or '多项证据质量问题'}。"
    elif label == "watch":
        lead = f"当前输入可靠度需要持续观察，主要受 {issue_text or '局部证据质量波动'} 影响。"
    else:
        lead = f"当前输入可靠度整体稳健，主要支撑来自 {support_text or '较稳定的证据结构'}。"

    reason_parts = [
        f"effective confidence {confidence:.2f}",
        f"freshness {freshness_label}",
    ]
    if conflict_level != "none":
        reason_parts.append(f"conflict {conflict_level}")
    if policy_source_health != "unknown":
        reason_parts.append(f"policy source {policy_source_health}")
    if issue_text:
        reason_parts.append(f"风险 {issue_text}")
    if support_text:
        reason_parts.append(f"支撑 {support_text}")

    return {
        "label": label,
        "score": risk_score,
        "lead": lead,
        "posture": posture,
        "reason": " · ".join(reason_parts),
        "issue_factor_hits": total_issue_hits,
        "support_factor_hits": sum(support_counts.values()),
        "dominant_issue_labels": [issue_labels[name] for name in dominant_issues[:4]],
        "dominant_support_labels": [support_labels[name] for name in dominant_supports[:3]],
    }

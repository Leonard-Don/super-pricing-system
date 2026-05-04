"""置信度调整：根据证据摘要计算 penalty / support bonus。

与 ``_summaries.py`` 里的 ``build_*_summary`` 摘要构建函数主题不同 ——
这两个 ``calculate_confidence_*`` 是把已经构建好的 evidence_summary
压成最终的 confidence 调整值，``_reliability.apply_conflict_penalty``
直接消费它们的输出。"""

from __future__ import annotations
from typing import Any, Dict


def calculate_confidence_penalty(evidence_summary: Dict[str, Any]) -> Dict[str, Any]:
    conflict_level = evidence_summary.get("conflict_level", "none")
    conflict_trend = evidence_summary.get("conflict_trend", "stable")
    strongest_conflict = (evidence_summary.get("conflicts") or [{}])[0]
    source_pattern = strongest_conflict.get("source_pattern", "")
    stability_summary = evidence_summary.get("stability_summary", {})
    lag_summary = evidence_summary.get("lag_summary", {})
    concentration_summary = evidence_summary.get("concentration_summary", {})
    source_drift_summary = evidence_summary.get("source_drift_summary", {})
    source_gap_summary = evidence_summary.get("source_gap_summary", {})
    source_dominance_summary = evidence_summary.get("source_dominance_summary", {})
    consistency_summary = evidence_summary.get("consistency_summary", {})
    reversal_summary = evidence_summary.get("reversal_summary", {})
    reversal_precursor_summary = evidence_summary.get("reversal_precursor_summary", {})
    policy_source_health_summary = evidence_summary.get("policy_source_health_summary", {})

    penalty = 0.0
    reasons = []
    if conflict_level == "low":
        penalty += 0.06
    elif conflict_level == "medium":
        penalty += 0.14
    elif conflict_level == "high":
        penalty += 0.24

    if source_pattern == "official_vs_derived":
        penalty += 0.04
        reasons.append("官方源与派生源冲突")
    elif source_pattern == "official_split":
        penalty += 0.08
        reasons.append("官方源内部冲突")
    elif source_pattern == "derived_split":
        penalty += 0.02
        reasons.append("派生源内部冲突")

    if conflict_trend == "rising":
        penalty += 0.05
        reasons.append("证据分裂正在加剧")
    elif conflict_trend == "easing":
        penalty += 0.02
        reasons.append("证据分裂仍未完全收敛")

    if stability_summary.get("label") == "unstable":
        penalty += 0.07
        reasons.append("因子时序抖动过大")
    elif stability_summary.get("label") == "choppy":
        penalty += 0.03
        reasons.append("因子近期波动偏大")

    if lag_summary.get("level") == "high":
        penalty += 0.08
        reasons.append("关键证据已经过时")
    elif lag_summary.get("level") == "medium":
        penalty += 0.04
        reasons.append("关键证据正在失去时效")
    elif lag_summary.get("level") == "low":
        penalty += 0.015
        reasons.append("关键证据开始老化")

    if concentration_summary.get("label") == "high":
        penalty += 0.05
        reasons.append("证据过度集中")
    elif concentration_summary.get("label") == "medium":
        penalty += 0.025
        reasons.append("证据来源偏集中")

    if source_drift_summary.get("label") == "degrading":
        penalty += 0.05
        reasons.append("来源结构正在退化")

    if source_gap_summary.get("label") == "broken":
        penalty += 0.06
        reasons.append("证据流疑似断档")
    elif source_gap_summary.get("label") == "stretching":
        penalty += 0.03
        reasons.append("证据更新节奏放缓")

    if source_dominance_summary.get("label") == "rotating":
        penalty += 0.03
        reasons.append("来源主导权正在切换")
    elif source_dominance_summary.get("label") == "derived_dominant":
        penalty += 0.035
        reasons.append("当前结论主要由派生源主导")

    if consistency_summary.get("label") == "divergent":
        penalty += 0.04
        reasons.append("多源对结论强弱判断分歧较大")

    if reversal_summary.get("label") == "reversed":
        penalty += 0.06
        reasons.append("因子主方向已经反转")
    elif reversal_summary.get("label") == "fading":
        penalty += 0.025
        reasons.append("因子原有方向正在衰减")

    if reversal_precursor_summary.get("label") == "high":
        penalty += 0.03
        reasons.append("因子已逼近反转临界区")
    elif reversal_precursor_summary.get("label") == "medium":
        penalty += 0.015
        reasons.append("因子存在反转前兆")

    if policy_source_health_summary.get("label") == "fragile":
        penalty += 0.06
        reasons.append("政策源正文抓取脆弱")
    elif policy_source_health_summary.get("label") == "watch":
        penalty += 0.03
        reasons.append("政策源正文覆盖下降")

    penalty = min(round(penalty, 4), 0.4)
    if not reasons:
        reasons.append("证据一致性良好")
    return {
        "penalty": penalty,
        "reason": "；".join(reasons),
    }


def calculate_confidence_support_bonus(evidence_summary: Dict[str, Any]) -> Dict[str, Any]:
    bonus = 0.0
    reasons = []
    coverage_summary = evidence_summary.get("coverage_summary", {})
    cross_confirmation_summary = evidence_summary.get("cross_confirmation_summary", {})
    consistency_summary = evidence_summary.get("consistency_summary", {})
    policy_source_health_summary = evidence_summary.get("policy_source_health_summary", {})

    if evidence_summary.get("conflict_level", "none") == "none":
        bonus += 0.03
        reasons.append("证据一致性良好")

    if int(evidence_summary.get("official_source_count", 0) or 0) >= 1:
        bonus += 0.04
        reasons.append("存在官方源支持")

    if float(evidence_summary.get("weighted_evidence_score", 0.0) or 0.0) >= 0.9:
        bonus += 0.03
        reasons.append("加权证据分较高")

    freshness_label = evidence_summary.get("freshness_label", "stale")
    if freshness_label == "fresh":
        bonus += 0.03
        reasons.append("证据新鲜度高")
    elif freshness_label == "recent":
        bonus += 0.015
        reasons.append("证据仍较新")

    coverage_ratio = float(coverage_summary.get("overall_coverage_ratio", 0.0) or 0.0)
    if coverage_ratio >= 0.8:
        bonus += 0.03
        reasons.append("关键维度覆盖充分")
    elif coverage_ratio >= 0.55:
        bonus += 0.015
        reasons.append("关键维度覆盖尚可")

    if cross_confirmation_summary.get("label") == "strong":
        bonus += 0.04
        reasons.append("同向结论已获跨源独立确认")
    elif cross_confirmation_summary.get("label") == "moderate":
        bonus += 0.02
        reasons.append("同向结论已有跨源侧证")

    if consistency_summary.get("label") == "strong":
        bonus += 0.02
        reasons.append("多源对结论强弱判断一致")
    elif consistency_summary.get("label") == "moderate":
        bonus += 0.01
        reasons.append("多源对结论强弱大体一致")

    if policy_source_health_summary.get("label") == "healthy":
        bonus += 0.02
        reasons.append("政策源正文覆盖稳定")

    bonus = min(round(bonus, 4), 0.15)
    if not reasons:
        reasons.append("缺少足够的正向证据强化")
    return {
        "bonus": bonus,
        "reason": "；".join(reasons),
    }

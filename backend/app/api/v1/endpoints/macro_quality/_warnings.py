"""macro_quality 包内的 _calculate_*_warning 函数（共 10 个）。"""

from __future__ import annotations
from typing import Any, Dict


def _calculate_blind_spot_warning(
    evidence_summary: Dict[str, Any],
    effective_confidence: float,
) -> Dict[str, Any]:
    coverage_summary = evidence_summary.get("coverage_summary", {})
    concentration_summary = evidence_summary.get("concentration_summary", {})
    coverage_label = coverage_summary.get("coverage_label", "sparse")
    missing_categories = coverage_summary.get("missing_categories", [])
    conflict_level = evidence_summary.get("conflict_level", "none")

    if coverage_label == "thin" and (
        effective_confidence >= 0.4 or concentration_summary.get("label") == "high"
    ):
        level = "medium"
        warning = True
        reason = "关键维度覆盖偏薄，但当前有效置信度仍偏高"
    elif coverage_label == "sparse" and effective_confidence >= 0.4:
        level = "high"
        warning = True
        reason = "关键维度覆盖稀疏，当前判断存在明显输入盲区"
    elif coverage_label in {"thin", "sparse"} and conflict_level == "none" and effective_confidence >= 0.45:
        level = "medium"
        warning = True
        reason = "证据虽然一致，但覆盖不足，可能存在盲区型过度自信"
    else:
        level = "none"
        warning = False
        reason = "输入覆盖与当前有效置信度基本匹配"

    return {
        "warning": warning,
        "level": level,
        "reason": reason,
        "missing_categories": missing_categories[:4],
    }


def _calculate_stability_warning(
    evidence_summary: Dict[str, Any],
    effective_confidence: float,
) -> Dict[str, Any]:
    stability_summary = evidence_summary.get("stability_summary", {})
    label = stability_summary.get("label", "stable")
    if label == "unstable" and effective_confidence >= 0.3:
        return {
            "warning": True,
            "level": "high",
            "reason": "因子近期来回摆动明显，暂时不适合直接作为定价锚",
        }
    if label == "choppy" and effective_confidence >= 0.45:
        return {
            "warning": True,
            "level": "medium",
            "reason": "因子近期波动偏大，使用时应降低锚定权重",
        }
    return {
        "warning": False,
        "level": "none",
        "reason": "因子时序稳定性可接受",
    }


def _calculate_lag_warning(
    evidence_summary: Dict[str, Any],
    effective_confidence: float,
) -> Dict[str, Any]:
    lag_summary = evidence_summary.get("lag_summary", {})
    level = lag_summary.get("level", "none")
    if level == "high" and effective_confidence >= 0.25:
        return {
            "warning": True,
            "level": "high",
            "reason": "关键证据已经陈旧，当前定价判断可能明显滞后",
        }
    if level == "medium" and effective_confidence >= 0.4:
        return {
            "warning": True,
            "level": "medium",
            "reason": "关键证据正在老化，当前定价判断可能开始滞后",
        }
    return {
        "warning": False,
        "level": "none",
        "reason": "证据时效性可接受",
    }


def _calculate_concentration_warning(
    evidence_summary: Dict[str, Any],
    effective_confidence: float,
) -> Dict[str, Any]:
    concentration_summary = evidence_summary.get("concentration_summary", {})
    label = concentration_summary.get("label", "low")
    if label == "high" and effective_confidence >= 0.35:
        return {
            "warning": True,
            "level": "high",
            "reason": "当前判断过度依赖单一来源或单一实体，存在集中偏置风险",
        }
    if label == "medium" and effective_confidence >= 0.5:
        return {
            "warning": True,
            "level": "medium",
            "reason": "当前判断存在一定来源集中度，建议结合更多侧证使用",
        }
    return {
        "warning": False,
        "level": "none",
        "reason": "证据集中度可接受",
    }


def _calculate_source_drift_warning(
    evidence_summary: Dict[str, Any],
    effective_confidence: float,
) -> Dict[str, Any]:
    drift_summary = evidence_summary.get("source_drift_summary", {})
    label = drift_summary.get("label", "stable")
    if label == "degrading" and effective_confidence >= 0.3:
        return {
            "warning": True,
            "level": "high",
            "reason": "当前判断的来源基础正在退化，应重新审视因子可信度",
        }
    if label == "improving" and effective_confidence >= 0.25:
        return {
            "warning": False,
            "level": "positive",
            "reason": "当前判断的来源基础正在改善",
        }
    return {
        "warning": False,
        "level": "none",
        "reason": "来源结构稳定",
    }


def _calculate_source_gap_warning(
    evidence_summary: Dict[str, Any],
    effective_confidence: float,
) -> Dict[str, Any]:
    gap_summary = evidence_summary.get("source_gap_summary", {})
    label = gap_summary.get("label", "stable")
    if label == "broken" and effective_confidence >= 0.25:
        return {
            "warning": True,
            "level": "high",
            "reason": "证据流疑似断档，当前判断可能建立在过期更新节奏上",
        }
    if label == "stretching" and effective_confidence >= 0.35:
        return {
            "warning": True,
            "level": "medium",
            "reason": "证据更新节奏明显放缓，应警惕来源断流风险",
        }
    return {
        "warning": False,
        "level": "none",
        "reason": "证据流更新节奏可接受",
    }


def _calculate_source_dominance_warning(
    evidence_summary: Dict[str, Any],
    effective_confidence: float,
) -> Dict[str, Any]:
    dominance_summary = evidence_summary.get("source_dominance_summary", {})
    label = dominance_summary.get("label", "stable")
    if label == "rotating" and effective_confidence >= 0.3:
        return {
            "warning": True,
            "level": "medium",
            "reason": "来源主导权正在切换，当前结论的支撑结构并不稳定",
        }
    if label == "derived_dominant" and effective_confidence >= 0.3:
        return {
            "warning": True,
            "level": "high",
            "reason": "当前结论主要由派生源主导，应主动下调硬锚信任度",
        }
    return {
        "warning": False,
        "level": "none",
        "reason": "来源主导权结构稳定",
    }


def _calculate_consistency_warning(
    evidence_summary: Dict[str, Any],
    effective_confidence: float,
) -> Dict[str, Any]:
    consistency_summary = evidence_summary.get("consistency_summary", {})
    label = consistency_summary.get("label", "unknown")
    if label == "divergent" and effective_confidence >= 0.25:
        return {
            "warning": True,
            "level": "high",
            "reason": "虽然多源同向，但对结论强弱分歧很大，不宜直接当作强定价锚",
        }
    return {
        "warning": False,
        "level": "none",
        "reason": "多源对结论强弱判断基本一致",
    }


def _calculate_reversal_warning(
    evidence_summary: Dict[str, Any],
    effective_confidence: float,
) -> Dict[str, Any]:
    reversal_summary = evidence_summary.get("reversal_summary", {})
    label = reversal_summary.get("label", "stable")
    if label == "reversed":
        return {
            "warning": True,
            "level": "high",
            "reason": "因子主方向已经反转，旧定价锚很可能失效",
        }
    if label == "fading" and effective_confidence >= 0.25:
        return {
            "warning": True,
            "level": "medium",
            "reason": "因子原有方向正在减弱，应降低锚定权重",
        }
    return {
        "warning": False,
        "level": "none",
        "reason": "因子主方向稳定",
    }


def _calculate_reversal_precursor_warning(
    evidence_summary: Dict[str, Any],
    effective_confidence: float,
) -> Dict[str, Any]:
    precursor_summary = evidence_summary.get("reversal_precursor_summary", {})
    label = precursor_summary.get("label", "none")
    if label == "high" and effective_confidence >= 0.2:
        return {
            "warning": True,
            "level": "high",
            "reason": "因子尚未翻向，但已快速接近零轴，存在明显反转前兆",
        }
    if label == "medium" and effective_confidence >= 0.25:
        return {
            "warning": True,
            "level": "medium",
            "reason": "因子方向正在衰减，需警惕反转前兆",
        }
    return {
        "warning": False,
        "level": "none",
        "reason": "暂未观察到明显反转前兆",
    }



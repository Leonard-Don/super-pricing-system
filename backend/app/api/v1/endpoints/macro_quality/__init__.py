"""``backend.app.api.v1.endpoints.macro_quality`` 包入口。

把原 1306 行单文件拆为：
- ``_summaries.py``  — 14 个 build_*_summary / calculate_confidence_* 摘要构建器
- ``_warnings.py``   — 10 个 _calculate_*_warning 警示计算器
- ``_reliability.py`` — apply_conflict_penalty + build_input_reliability_summary

兼容性约束：``macro.py`` 与 ``macro_evidence.py`` 用 ``from .macro_quality import X``
直接 import 多个公共函数；本 ``__init__`` re-export 全部以保持 import 路径不变。
"""

from ._reliability import (
    apply_conflict_penalty,
    build_input_reliability_summary,
)
from ._summaries import (
    build_concentration_summary,
    build_consistency_summary,
    build_coverage_summary,
    build_cross_confirmation_summary,
    build_lag_summary,
    build_policy_source_health_summary,
    build_reversal_precursor_summary,
    build_reversal_summary,
    build_source_dominance_summary,
    build_source_drift_summary,
    build_source_gap_summary,
    build_stability_summary,
    calculate_confidence_penalty,
    calculate_confidence_support_bonus,
)
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

__all__ = [
    # summaries
    "build_concentration_summary",
    "build_consistency_summary",
    "build_coverage_summary",
    "build_cross_confirmation_summary",
    "build_lag_summary",
    "build_policy_source_health_summary",
    "build_reversal_precursor_summary",
    "build_reversal_summary",
    "build_source_dominance_summary",
    "build_source_drift_summary",
    "build_source_gap_summary",
    "build_stability_summary",
    "calculate_confidence_penalty",
    "calculate_confidence_support_bonus",
    # warnings
    "_calculate_blind_spot_warning",
    "_calculate_concentration_warning",
    "_calculate_consistency_warning",
    "_calculate_lag_warning",
    "_calculate_reversal_precursor_warning",
    "_calculate_reversal_warning",
    "_calculate_source_dominance_warning",
    "_calculate_source_drift_warning",
    "_calculate_source_gap_warning",
    "_calculate_stability_warning",
    # reliability
    "apply_conflict_penalty",
    "build_input_reliability_summary",
]

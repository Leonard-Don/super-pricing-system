"""``backend.app.api.v1.endpoints.macro_quality`` 包入口。

把原 1306 行单文件拆为：
- ``_summaries.py``        — 8 个 ``build_*_summary``（policy-source / coverage /
                              stability / lag / cross-confirmation / reversal /
                              reversal-precursor / consistency）
- ``_source_summaries.py`` — 4 个 source-structure 主题的 ``build_*_summary``
                              （concentration / source_drift / source_gap /
                              source_dominance）
- ``_confidence.py``       — 2 个 ``calculate_confidence_*`` penalty/bonus 计算
                              （仅 ``_reliability`` 内部使用）
- ``_warnings.py``         — 10 个 ``_calculate_*_warning`` 警示计算器
                              （仅 ``_reliability`` 内部使用）
- ``_reliability.py``      — apply_conflict_penalty + build_input_reliability_summary

仅 re-export 外部消费的 14 个公共函数：
- ``macro_evidence.py`` 用 12 个 ``build_*_summary``（含 source-structure 主题）。
- ``macro.py`` 用 ``apply_conflict_penalty`` + ``build_input_reliability_summary``。

``calculate_confidence_*`` 与 ``_calculate_*_warning`` 是 ``_reliability`` 的
内部依赖，不再 re-export 出包外。
"""

from ._reliability import (
    apply_conflict_penalty,
    build_input_reliability_summary,
)
from ._source_summaries import (
    build_concentration_summary,
    build_source_dominance_summary,
    build_source_drift_summary,
    build_source_gap_summary,
)
from ._summaries import (
    build_consistency_summary,
    build_coverage_summary,
    build_cross_confirmation_summary,
    build_lag_summary,
    build_policy_source_health_summary,
    build_reversal_precursor_summary,
    build_reversal_summary,
    build_stability_summary,
)

__all__ = [
    # summaries (used by macro_evidence.py)
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
    # reliability (used by macro.py)
    "apply_conflict_penalty",
    "build_input_reliability_summary",
]

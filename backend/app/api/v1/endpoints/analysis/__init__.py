"""``backend.app.api.v1.endpoints.analysis`` 包入口。

历史 1366 行单文件 ``analysis.py`` 已被拆为：
- ``_helpers.py``     — analyzer 单例 + 缓存 / 技术指标 / fallback / 相关性解释 +
                        本地 CorrelationRequest schema
- ``routes.py``       — 7 个趋势 / 综合 / 基本面 / 量价 / 技术指标 路由 handler
- ``ml_prediction.py``— 5 个 ML / 价格预测 handler (``/patterns``、``/prediction``
                        系列、``/train/all``)
- ``sentiment.py``    — 2 个市场情绪 handler (``/sentiment``、``/sentiment-history``)
- ``correlation.py``  — 1 个多股票相关性 handler (``/correlation``)
- ``risk_and_peers.py``— 2 个重型分析 handler (``/risk-metrics``、``/industry-comparison``)

本 ``__init__`` 把五个子 router 合并为对外 ``router``。

仅保留 3 个 singleton 的 re-export：``comprehensive_scorer``、``data_manager``、
``model_comparator``。``tests/unit/test_analysis.py`` 通过 ``@patch
("backend.app.api.v1.endpoints.analysis.X.method")`` 在包命名空间下打补丁，
依赖这些符号在包顶层可见。其他原 17 个 handler / 7 个未被 patch 的 singleton /
12 个私有 helper 不再 re-export，使用方应直接 import 子模块或 ``_helpers``。
"""

from fastapi import APIRouter

from . import correlation as _correlation_module
from . import ml_prediction as _ml_prediction_module
from . import risk_and_peers as _risk_and_peers_module
from . import routes as _routes_module
from . import sentiment as _sentiment_module
from ._helpers import (  # noqa: F401  test-patched via package namespace
    comprehensive_scorer,
    data_manager,
    model_comparator,
)

router = APIRouter()
router.include_router(_routes_module.router)
router.include_router(_ml_prediction_module.router)
router.include_router(_sentiment_module.router)
router.include_router(_correlation_module.router)
router.include_router(_risk_and_peers_module.router)

__all__ = [
    "router",
    "comprehensive_scorer",
    "data_manager",
    "model_comparator",
]

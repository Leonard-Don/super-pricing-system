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

本 ``__init__`` 把五个子 router 合并为一个对外 ``router``，并把所有原顶层符号
re-export 出来保持兼容性。
"""

from fastapi import APIRouter

from ._helpers import (
    ANALYSIS_CACHE_TTLS,
    CorrelationRequest,
    _analysis_cache_key,
    _build_klines,
    _build_overview_fallback_response,
    _calculate_bollinger,
    _calculate_macd,
    _calculate_rsi,
    _get_cached_analysis,
    _set_cached_analysis,
    comprehensive_scorer,
    data_manager,
    fundamental_analyzer,
    get_correlation_interpretation,
    logger,
    lstm_predictor,
    model_comparator,
    pattern_recognizer,
    price_predictor,
    sentiment_analyzer,
    trend_analyzer,
    volume_analyzer,
)
from . import correlation as _correlation_module
from . import ml_prediction as _ml_prediction_module
from . import risk_and_peers as _risk_and_peers_module
from . import routes as _routes_module
from . import sentiment as _sentiment_module
from .correlation import analyze_correlation
from .ml_prediction import (
    compare_model_predictions,
    predict_prices,
    predict_with_lstm,
    recognize_patterns,
    train_all_models,
)
from .risk_and_peers import (
    get_industry_comparison,
    get_risk_metrics,
)
from .routes import (
    analysis_overview,
    analyze_fundamental,
    analyze_trend,
    analyze_volume_price,
    comprehensive_analysis,
    get_klines,
    get_technical_indicators,
)
from .sentiment import (
    analyze_sentiment,
    get_sentiment_history,
)

router = APIRouter()
router.include_router(_routes_module.router)
router.include_router(_ml_prediction_module.router)
router.include_router(_sentiment_module.router)
router.include_router(_correlation_module.router)
router.include_router(_risk_and_peers_module.router)

__all__ = [
    "router",
    "logger",
    # singletons
    "data_manager",
    "trend_analyzer",
    "volume_analyzer",
    "sentiment_analyzer",
    "comprehensive_scorer",
    "pattern_recognizer",
    "fundamental_analyzer",
    "price_predictor",
    "lstm_predictor",
    "model_comparator",
    # helpers
    "ANALYSIS_CACHE_TTLS",
    "CorrelationRequest",
    "_analysis_cache_key",
    "_build_klines",
    "_build_overview_fallback_response",
    "_calculate_bollinger",
    "_calculate_macd",
    "_calculate_rsi",
    "_get_cached_analysis",
    "_set_cached_analysis",
    "get_correlation_interpretation",
    # routes
    "analyze_trend",
    "analyze_correlation",
    "analyze_fundamental",
    "analyze_sentiment",
    "analyze_volume_price",
    "analysis_overview",
    "compare_model_predictions",
    "comprehensive_analysis",
    "get_industry_comparison",
    "get_klines",
    "get_risk_metrics",
    "get_sentiment_history",
    "get_technical_indicators",
    "predict_prices",
    "predict_with_lstm",
    "recognize_patterns",
    "train_all_models",
]

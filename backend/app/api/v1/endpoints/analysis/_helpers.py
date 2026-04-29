"""analysis 包内共享 helpers + 模块级 analyzer 单例 + 本地 schema。

把所有 analyzer 单例集中在这里，避免路由层重复实例化；缓存键 helper、技术指标
计算函数、本地 Pydantic 模型也都放这里。
"""

import json
import logging
from typing import List

import numpy as np
import pandas as pd
from datetime import datetime
from pydantic import BaseModel

from backend.app.schemas.analysis import TrendAnalysisRequest
from src.analytics.comprehensive_scorer import ComprehensiveScorer
from src.analytics.fundamental_analyzer import FundamentalAnalyzer
from src.analytics.lstm_predictor import lstm_predictor  # noqa: F401  re-exported
from src.analytics.model_comparator import model_comparator  # noqa: F401  re-exported
from src.analytics.pattern_recognizer import PatternRecognizer
from src.analytics.predictor import PricePredictor
from src.analytics.sentiment_analyzer import SentimentAnalyzer
from src.analytics.trend_analyzer import TrendAnalyzer
from src.analytics.volume_price_analyzer import VolumePriceAnalyzer
from src.data.data_manager import DataManager
from src.utils.cache import cache_manager

logger = logging.getLogger(__name__)

# Analyzer 单例。测试通过 ``analysis_endpoint.data_manager`` 等访问 — 必须保持
# 模块级、可 monkeypatch 的属性。
data_manager = DataManager()
trend_analyzer = TrendAnalyzer()
volume_analyzer = VolumePriceAnalyzer()
sentiment_analyzer = SentimentAnalyzer()
comprehensive_scorer = ComprehensiveScorer()
pattern_recognizer = PatternRecognizer()
fundamental_analyzer = FundamentalAnalyzer()
price_predictor = PricePredictor()


ANALYSIS_CACHE_TTLS = {
    "overview": 180,
    "klines": 180,
    "prediction_compare": 300,
}


# =============================================================================
# Cache helpers
# =============================================================================

def _analysis_cache_key(name: str, request: TrendAnalysisRequest, **extra) -> str:
    payload = {
        "name": name,
        "symbol": request.symbol,
        "interval": request.interval,
        "start_date": request.start_date,
        "end_date": request.end_date,
        **extra,
    }
    return f"analysis::{name}::{json.dumps(payload, sort_keys=True, default=str)}"


def _get_cached_analysis(name: str, request: TrendAnalysisRequest, **extra):
    return cache_manager.get(_analysis_cache_key(name, request, **extra))


def _set_cached_analysis(name: str, request: TrendAnalysisRequest, value, **extra):
    cache_manager.set(
        _analysis_cache_key(name, request, **extra),
        value,
        ttl=ANALYSIS_CACHE_TTLS[name],
    )


# =============================================================================
# Klines / fallback
# =============================================================================

def _build_klines(data: pd.DataFrame, limit: int = 150):
    recent_data = data.tail(limit).copy()
    klines = []
    for index, row in recent_data.iterrows():
        try:
            close_val = row["close"]
            if pd.isna(close_val) or np.isinf(close_val):
                continue
            klines.append({
                "date": index.strftime("%Y-%m-%d"),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": int(row["volume"]),
            })
        except Exception as e:
            logger.error(f"Error processing row {index}: {e}")
            continue
    return klines


def _build_overview_fallback_response(request: TrendAnalysisRequest, reason: str = ""):
    note = "总览分析暂时不可用，已回退为中性信号。"
    if reason:
        note = f"{note} {reason}"

    return {
        "symbol": request.symbol,
        "timestamp": datetime.now().isoformat(),
        "overall_score": 50,
        "recommendation": "暂时观望",
        "confidence": "LOW",
        "scores": {
            "trend": 50,
            "volume": 50,
            "sentiment": 50,
            "technical": 50,
        },
        "key_signals": [],
        "risk_warnings": [note],
        "score_explanation": [],
        "recommendation_reasons": ["等待更多稳定数据后再评估。"],
        "indicators": {
            "rsi": {"value": 50, "status": "neutral"},
            "macd": {"value": 0},
            "bollinger": {
                "bandwidth": 0,
                "position": "neutral",
                "signal": "波动率 neutral",
            },
            "signal_strength": {
                "signal": "neutral",
                "strength": 0,
            },
            "overall": {
                "description": "neutral",
                "signal": "neutral",
            },
        },
    }


# =============================================================================
# Correlation interpretation
# =============================================================================

class CorrelationRequest(BaseModel):
    symbols: List[str]
    period_days: int = 90


def get_correlation_interpretation(avg_corr: float) -> dict:
    """Generate interpretation of correlation results"""
    if avg_corr > 0.8:
        level = "very_high"
        description = "这些股票高度相关，价格走势非常相似，分散化效果差"
    elif avg_corr > 0.6:
        level = "high"
        description = "这些股票相关性较高，建议增加低相关资产以分散风险"
    elif avg_corr > 0.4:
        level = "moderate"
        description = "这些股票呈中等相关，组合有一定分散化效果"
    elif avg_corr > 0.2:
        level = "low"
        description = "这些股票相关性较低，组合分散化效果较好"
    else:
        level = "very_low"
        description = "这些股票几乎不相关，是理想的分散化组合"

    return {"level": level, "description": description}


# =============================================================================
# 技术指标计算（RSI / MACD / Bollinger）
# =============================================================================

def _calculate_rsi(data: pd.DataFrame, periods: int = 14) -> dict:
    """计算 RSI 指标"""
    close = data['close']
    delta = close.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=periods).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=periods).mean()
    rs = gain / loss
    rsi = 100 - (100 / (1 + rs))
    current_rsi = float(rsi.iloc[-1]) if not pd.isna(rsi.iloc[-1]) else 50

    if current_rsi > 70:
        status = "overbought"
        signal = "超买，可能面临回调"
    elif current_rsi < 30:
        status = "oversold"
        signal = "超卖，可能出现反弹"
    else:
        status = "neutral"
        signal = "中性区间"

    return {
        "value": round(current_rsi, 2),
        "status": status,
        "signal": signal,
    }


def _calculate_macd(data: pd.DataFrame, fast: int = 12, slow: int = 26, signal: int = 9) -> dict:
    """计算 MACD 指标"""
    close = data['close']
    exp1 = close.ewm(span=fast, adjust=False).mean()
    exp2 = close.ewm(span=slow, adjust=False).mean()
    macd_line = exp1 - exp2
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line

    current_macd = float(macd_line.iloc[-1]) if not pd.isna(macd_line.iloc[-1]) else 0
    current_signal = float(signal_line.iloc[-1]) if not pd.isna(signal_line.iloc[-1]) else 0
    current_hist = float(histogram.iloc[-1]) if not pd.isna(histogram.iloc[-1]) else 0
    prev_hist = float(histogram.iloc[-2]) if len(histogram) > 1 and not pd.isna(histogram.iloc[-2]) else 0

    if current_macd > current_signal and current_hist > 0:
        status = "bullish"
        if current_hist > prev_hist:
            trend = "加速上涨"
        else:
            trend = "上涨减速"
    elif current_macd < current_signal and current_hist < 0:
        status = "bearish"
        if current_hist < prev_hist:
            trend = "加速下跌"
        else:
            trend = "下跌减速"
    else:
        status = "neutral"
        trend = "横盘整理"

    return {
        "value": round(current_macd, 4),
        "signal_line": round(current_signal, 4),
        "histogram": round(current_hist, 4),
        "status": status,
        "trend": trend,
    }


def _calculate_bollinger(data: pd.DataFrame, periods: int = 20, std_dev: float = 2.0) -> dict:
    """计算布林带指标"""
    close = data['close']
    middle = close.rolling(window=periods).mean()
    std = close.rolling(window=periods).std()
    upper = middle + (std * std_dev)
    lower = middle - (std * std_dev)

    current_close = float(close.iloc[-1])
    current_upper = float(upper.iloc[-1]) if not pd.isna(upper.iloc[-1]) else current_close * 1.05
    current_middle = float(middle.iloc[-1]) if not pd.isna(middle.iloc[-1]) else current_close
    current_lower = float(lower.iloc[-1]) if not pd.isna(lower.iloc[-1]) else current_close * 0.95

    bandwidth = ((current_upper - current_lower) / current_middle * 100) if current_middle != 0 else 0

    if current_close >= current_upper:
        position = "above_upper"
        signal = "价格突破上轨，可能超买"
    elif current_close <= current_lower:
        position = "below_lower"
        signal = "价格突破下轨，可能超卖"
    elif current_close > current_middle:
        position = "upper_half"
        signal = "价格在中轨上方，偏强"
    else:
        position = "lower_half"
        signal = "价格在中轨下方，偏弱"

    return {
        "upper": round(current_upper, 2),
        "middle": round(current_middle, 2),
        "lower": round(current_lower, 2),
        "current_price": round(current_close, 2),
        "position": position,
        "bandwidth": round(bandwidth, 2),
        "signal": signal,
    }

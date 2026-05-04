"""analysis 包剩余的趋势 / 综合 / 基本面 / 量价 / 技术 / 行业对比 / 风险 路由 handler。"""

import logging
from datetime import datetime

import numpy as np
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from backend.app.schemas.analysis import TrendAnalysisRequest, TrendAnalysisResponse

from . import _helpers
from ._helpers import (
    _build_klines,
    _build_overview_fallback_response,
    _calculate_bollinger,
    _calculate_macd,
    _calculate_rsi,
    _get_cached_analysis,
    _set_cached_analysis,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/analyze", response_model=TrendAnalysisResponse, summary="分析股票趋势")
async def analyze_trend(request: TrendAnalysisRequest):
    """分析股票趋势，返回趋势方向、支撑阻力位和技术评分"""
    try:
        start_date = None
        end_date = None
        if request.start_date:
            start_date = datetime.fromisoformat(request.start_date.replace("Z", "+00:00"))
        if request.end_date:
            end_date = datetime.fromisoformat(request.end_date.replace("Z", "+00:00"))

        data = await run_in_threadpool(
            _helpers.data_manager.get_historical_data,
            request.symbol,
            start_date,
            end_date,
            request.interval,
        )

        if data.empty:
            raise HTTPException(status_code=404, detail=f"No data found for symbol {request.symbol}")

        analysis_result = _helpers.trend_analyzer.analyze_trend(data)
        return {
            "symbol": request.symbol,
            "timestamp": datetime.now().isoformat(),
            **analysis_result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing trend: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/comprehensive", summary="综合分析")
async def comprehensive_analysis(request: TrendAnalysisRequest):
    """综合分析股票，整合趋势、量价、情绪等多维度分析。"""
    try:
        start_date = None
        end_date = None
        if request.start_date:
            start_date = datetime.fromisoformat(request.start_date.replace("Z", "+00:00"))
        if request.end_date:
            end_date = datetime.fromisoformat(request.end_date.replace("Z", "+00:00"))

        data = await run_in_threadpool(
            _helpers.data_manager.get_historical_data,
            request.symbol,
            start_date,
            end_date,
            request.interval,
        )

        if data.empty:
            raise HTTPException(status_code=404, detail=f"No data found for symbol {request.symbol}")

        result = _helpers.comprehensive_scorer.comprehensive_analysis(data, request.symbol, include_pattern=True)
        result["klines"] = _build_klines(data, limit=150)
        return {
            "symbol": request.symbol,
            "timestamp": datetime.now().isoformat(),
            **result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in comprehensive analysis: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/overview", summary="分析总览")
async def analysis_overview(request: TrendAnalysisRequest):
    """轻量总览分析，返回评分与关键信号。"""
    try:
        cached = _get_cached_analysis("overview", request)
        if cached is not None:
            return cached

        start_date = None
        end_date = None
        if request.start_date:
            start_date = datetime.fromisoformat(request.start_date.replace("Z", "+00:00"))
        if request.end_date:
            end_date = datetime.fromisoformat(request.end_date.replace("Z", "+00:00"))

        data = _helpers.data_manager.get_historical_data(
            symbol=request.symbol,
            start_date=start_date,
            end_date=end_date,
            interval=request.interval,
        )

        if data.empty:
            raise HTTPException(status_code=404, detail=f"No data found for symbol {request.symbol}")

        result = await run_in_threadpool(
            _helpers.comprehensive_scorer.comprehensive_analysis,
            data,
            request.symbol,
            False,
        )

        trend_analysis = result.get("trend_analysis", {})
        raw_indicators = trend_analysis.get("indicators", {})
        volatility = trend_analysis.get("volatility", {})
        signal_strength = trend_analysis.get("signal_strength", {})

        rsi_val = raw_indicators.get("rsi", 50)
        rsi_obj = {
            "value": rsi_val,
            "status": "overbought" if rsi_val > 70 else "oversold" if rsi_val < 30 else "neutral",
        }
        macd_val = raw_indicators.get("macd", 0)
        macd_obj = {"value": macd_val}
        bollinger_obj = {
            "bandwidth": volatility.get("bollinger_width", 0),
            "position": "neutral",
            "signal": "波动率 " + volatility.get("level", "low"),
        }
        formatted_indicators = {
            "rsi": rsi_obj,
            "macd": macd_obj,
            "bollinger": bollinger_obj,
            "signal_strength": signal_strength,
            "overall": {
                "description": signal_strength.get("signal", "neutral"),
                "signal": signal_strength.get("signal", "neutral"),
            },
        }

        response = {
            "symbol": request.symbol,
            "timestamp": datetime.now().isoformat(),
            "overall_score": result.get("overall_score"),
            "recommendation": result.get("recommendation"),
            "confidence": result.get("confidence"),
            "scores": result.get("scores"),
            "key_signals": result.get("key_signals"),
            "risk_warnings": result.get("risk_warnings"),
            "score_explanation": result.get("score_explanation"),
            "recommendation_reasons": result.get("recommendation_reasons"),
            "indicators": formatted_indicators,
        }
        _set_cached_analysis("overview", request, response)
        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in overview analysis: {e}", exc_info=True)
        fallback_response = _build_overview_fallback_response(request, reason=str(e))
        _set_cached_analysis("overview", request, fallback_response)
        return fallback_response


@router.post("/fundamental", summary="基本面分析")
async def analyze_fundamental(request: TrendAnalysisRequest):
    """基本面分析"""
    try:
        result = _helpers.fundamental_analyzer.analyze(request.symbol)
        return {
            "symbol": request.symbol,
            "timestamp": datetime.now().isoformat(),
            **result,
        }
    except Exception as e:
        logger.error(f"Error in fundamental analysis: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/klines", summary="K线数据")
async def get_klines(request: TrendAnalysisRequest, limit: int = 150):
    """获取K线数据（默认150条）"""
    try:
        cached = _get_cached_analysis("klines", request, limit=limit)
        if cached is not None:
            return cached

        start_date = None
        end_date = None
        if request.start_date:
            start_date = datetime.fromisoformat(request.start_date.replace("Z", "+00:00"))
        if request.end_date:
            end_date = datetime.fromisoformat(request.end_date.replace("Z", "+00:00"))

        data = await run_in_threadpool(
            _helpers.data_manager.get_historical_data,
            request.symbol,
            start_date,
            end_date,
            request.interval,
        )

        if data.empty:
            raise HTTPException(status_code=404, detail=f"No data found for symbol {request.symbol}")

        response = {
            "symbol": request.symbol,
            "timestamp": datetime.now().isoformat(),
            "klines": _build_klines(data, limit=limit),
        }
        _set_cached_analysis("klines", request, response, limit=limit)
        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in klines: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/volume-price", summary="量价分析")
async def analyze_volume_price(request: TrendAnalysisRequest):
    """分析成交量与价格的关系"""
    try:
        start_date = None
        end_date = None
        if request.start_date:
            start_date = datetime.fromisoformat(request.start_date.replace("Z", "+00:00"))
        if request.end_date:
            end_date = datetime.fromisoformat(request.end_date.replace("Z", "+00:00"))

        data = _helpers.data_manager.get_historical_data(
            symbol=request.symbol,
            start_date=start_date,
            end_date=end_date,
            interval=request.interval,
        )

        if data.empty:
            raise HTTPException(status_code=404, detail=f"No data found for symbol {request.symbol}")

        result = _helpers.volume_analyzer.analyze(data)
        return {
            "symbol": request.symbol,
            "timestamp": datetime.now().isoformat(),
            **result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in volume-price analysis: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/technical-indicators", summary="技术指标快照")
async def get_technical_indicators(request: TrendAnalysisRequest):
    """获取常用技术指标快照（RSI、MACD、布林带）"""
    try:
        data = _helpers.data_manager.get_historical_data(symbol=request.symbol, interval=request.interval)
        if data.empty:
            raise HTTPException(status_code=404, detail=f"No data found for symbol {request.symbol}")

        rsi = _calculate_rsi(data)
        macd = _calculate_macd(data)
        bollinger = _calculate_bollinger(data)

        bullish_count = sum([
            rsi["status"] == "oversold",
            macd["status"] == "bullish",
            bollinger["position"] in ["below_lower", "lower_half"],
        ])
        bearish_count = sum([
            rsi["status"] == "overbought",
            macd["status"] == "bearish",
            bollinger["position"] in ["above_upper"],
        ])

        if bullish_count >= 2:
            overall_signal = "bullish"
            overall_description = "多数指标看涨"
        elif bearish_count >= 2:
            overall_signal = "bearish"
            overall_description = "多数指标看跌"
        else:
            overall_signal = "neutral"
            overall_description = "技术面分歧"

        return {
            "symbol": request.symbol,
            "timestamp": datetime.now().isoformat(),
            "rsi": rsi,
            "macd": macd,
            "bollinger": bollinger,
            "overall": {
                "signal": overall_signal,
                "description": overall_description,
                "bullish_indicators": bullish_count,
                "bearish_indicators": bearish_count,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting technical indicators: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))



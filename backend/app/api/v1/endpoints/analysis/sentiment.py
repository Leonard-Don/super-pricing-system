"""市场情绪 / 历史情绪趋势路由。

把 ``/sentiment`` 与 ``/sentiment-history`` 这两个共享 sentiment-analyzer 单例 +
fear-greed 评分计算的 handler 单独放置，避免 routes.py 继续膨胀。
"""

import logging
from datetime import datetime, timedelta

import numpy as np
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from backend.app.schemas.analysis import TrendAnalysisRequest

from . import _helpers

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/sentiment", summary="市场情绪分析")
async def analyze_sentiment(request: TrendAnalysisRequest):
    """分析市场情绪和恐慌程度"""
    try:
        start_date = None
        end_date = None
        if request.start_date:
            start_date = datetime.fromisoformat(request.start_date.replace("Z", "+00:00"))
        if request.end_date:
            end_date = datetime.fromisoformat(request.end_date.replace("Z", "+00:00"))

        data = await run_in_threadpool(
            _helpers.data_manager.get_historical_data,
            symbol=request.symbol,
            start_date=start_date,
            end_date=end_date,
            interval=request.interval,
        )

        if data.empty:
            raise HTTPException(status_code=404, detail=f"No data found for symbol {request.symbol}")

        result = _helpers.sentiment_analyzer.analyze(data, request.symbol)
        return {
            "symbol": request.symbol,
            "timestamp": datetime.now().isoformat(),
            **result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in sentiment analysis: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sentiment-history", summary="历史情绪趋势")
async def get_sentiment_history(request: TrendAnalysisRequest, days: int = 30):
    """获取过去N天的恐慌贪婪指数历史趋势"""
    try:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days + 50)

        data = await run_in_threadpool(
            _helpers.data_manager.get_historical_data,
            symbol=request.symbol,
            start_date=start_date,
            end_date=end_date,
            interval="1d",
        )

        if data.empty or len(data) < 30:
            raise HTTPException(status_code=404, detail=f"Insufficient data for symbol {request.symbol}")

        history = []
        close = data['close']
        volume = data['volume']

        for i in range(20, len(data)):
            window_data = data.iloc[max(0, i - 50):i + 1].copy()
            if len(window_data) < 20:
                continue

            score = 50.0

            momentum = (close.iloc[i] - close.iloc[i - 20]) / close.iloc[i - 20] * 100
            if momentum > 15:
                score += 20
            elif momentum > 10:
                score += 15
            elif momentum > 5:
                score += 10
            elif momentum > 0:
                score += 5
            elif momentum < -15:
                score -= 20
            elif momentum < -10:
                score -= 15
            elif momentum < -5:
                score -= 10
            elif momentum < 0:
                score -= 5

            avg_volume = volume.iloc[max(0, i - 20):i].mean()
            if avg_volume > 0:
                volume_ratio = volume.iloc[i] / avg_volume
                if volume_ratio > 1.5:
                    score += 10 if momentum > 0 else -10
                elif volume_ratio > 1.2:
                    score += 5 if momentum > 0 else -5
                elif volume_ratio < 0.7:
                    score -= 3

            high_52w = close.iloc[max(0, i - 252):i + 1].max()
            low_52w = close.iloc[max(0, i - 252):i + 1].min()
            if high_52w > low_52w:
                price_position = (close.iloc[i] - low_52w) / (high_52w - low_52w)
                if price_position > 0.9:
                    score += 15
                elif price_position > 0.7:
                    score += 8
                elif price_position < 0.2:
                    score -= 15
                elif price_position < 0.4:
                    score -= 8

            short_momentum = (close.iloc[i] - close.iloc[i - 5]) / close.iloc[i - 5] * 100
            if short_momentum > 5:
                score += 10
            elif short_momentum > 2:
                score += 5
            elif short_momentum < -5:
                score -= 10
            elif short_momentum < -2:
                score -= 5

            returns = close.iloc[max(0, i - 20):i + 1].pct_change()
            volatility = returns.std() * np.sqrt(252) * 100
            if volatility < 15:
                score += 10
            elif volatility < 25:
                score += 5
            elif volatility > 50:
                score -= 15
            elif volatility > 35:
                score -= 8

            score = max(0, min(100, score))

            date_str = data.index[i].strftime("%Y-%m-%d")
            sentiment = (
                "extreme_greed" if score >= 75
                else "greed" if score >= 55
                else "neutral" if score >= 45
                else "fear" if score >= 25
                else "extreme_fear"
            )

            history.append({
                "date": date_str,
                "fear_greed_index": round(score, 1),
                "sentiment": sentiment,
            })

        if len(history) >= 7:
            recent_avg = np.mean([h["fear_greed_index"] for h in history[-7:]])
            older_avg = np.mean([h["fear_greed_index"] for h in history[-14:-7]]) if len(history) >= 14 else recent_avg

            if recent_avg > older_avg + 5:
                trend = "increasing"
                trend_description = "情绪转向乐观"
            elif recent_avg < older_avg - 5:
                trend = "decreasing"
                trend_description = "情绪转向悲观"
            else:
                trend = "stable"
                trend_description = "情绪保持稳定"
        else:
            trend = "unknown"
            trend_description = "数据不足"

        avg_30d = np.mean([h["fear_greed_index"] for h in history]) if history else 50

        return {
            "symbol": request.symbol,
            "timestamp": datetime.now().isoformat(),
            "history": history[-days:],
            "trend": trend,
            "trend_description": trend_description,
            "avg_30d": round(avg_30d, 1),
            "current": history[-1] if history else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting sentiment history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

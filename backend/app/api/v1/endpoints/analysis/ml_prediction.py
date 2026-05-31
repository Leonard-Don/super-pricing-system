"""ML / 价格预测路由：形态识别、单/多模型预测、LSTM、训练。

与 ``routes.py`` 中的趋势/基本面/技术指标 handler 拆开维护，因为它们使用
``pattern_recognizer`` / ``price_predictor`` / ``lstm_predictor`` /
``model_comparator`` 等独立的 ML 单例，并且同一族下的请求模型完全一致。
"""

import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from backend.app.schemas.analysis import TrendAnalysisRequest

from . import _helpers
from ._helpers import _get_cached_analysis, _set_cached_analysis

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/patterns", summary="形态识别")
async def recognize_patterns(request: TrendAnalysisRequest):
    """识别K线形态和图表形态"""
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

        result = _helpers.pattern_recognizer.recognize_patterns(data)
        return {
            "symbol": request.symbol,
            "timestamp": datetime.now().isoformat(),
            **result,
        }
    except Exception as e:
        logger.error(f"Error in pattern recognition: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/prediction", summary="AI价格预测")
async def predict_prices(request: TrendAnalysisRequest):
    """使用AI模型预测未来价格"""
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

        result = _helpers.price_predictor.predict_next_days(data, days=5, symbol=request.symbol)
        return {
            "symbol": request.symbol,
            "timestamp": datetime.now().isoformat(),
            **result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in price prediction: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/prediction/compare", summary="多模型预测对比")
async def compare_model_predictions(request: TrendAnalysisRequest):
    """使用多个模型进行预测并对比结果"""
    try:
        cached = _get_cached_analysis("prediction_compare", request)
        if cached is not None:
            return cached

        data = await run_in_threadpool(
            _helpers.data_manager.get_historical_data,
            request.symbol,
            None,
            None,
            request.interval,
        )

        if data.empty:
            raise HTTPException(status_code=404, detail=f"No data found for symbol {request.symbol}")

        result = await run_in_threadpool(
            _helpers.model_comparator.compare_predictions,
            data,
            request.symbol,
            5,
        )

        response = {
            "symbol": request.symbol,
            "timestamp": datetime.now().isoformat(),
            **result,
        }
        _set_cached_analysis("prediction_compare", request, response)
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error comparing predictions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/prediction/lstm", summary="LSTM 模型预测")
async def predict_with_lstm(request: TrendAnalysisRequest):
    """使用 LSTM 神经网络模型进行价格预测"""
    try:
        data = await run_in_threadpool(_helpers.data_manager.get_historical_data, symbol=request.symbol, interval=request.interval)
        if data.empty:
            raise HTTPException(status_code=404, detail=f"No data found for symbol {request.symbol}")

        result = _helpers.lstm_predictor.predict(data, request.symbol, days=5)
        return {
            "symbol": request.symbol,
            "timestamp": datetime.now().isoformat(),
            **result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in LSTM prediction: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/train/all", summary="训练所有模型")
async def train_all_models(request: TrendAnalysisRequest):
    """为指定股票训练所有可用的预测模型"""
    try:
        data = await run_in_threadpool(_helpers.data_manager.get_historical_data, symbol=request.symbol, interval=request.interval)
        if data.empty:
            raise HTTPException(status_code=404, detail=f"No data found for symbol {request.symbol}")
        if len(data) < 100:
            raise HTTPException(status_code=400, detail="需要至少100条历史数据来训练模型")

        result = _helpers.model_comparator.train_all_models(data, request.symbol)
        return {
            "timestamp": datetime.now().isoformat(),
            **result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error training models: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

"""多股票相关性分析路由。

唯一独立使用 ``CorrelationRequest`` schema 的 handler；与其他 handler 在请求模型 /
返回结构上都不重叠。"""

import logging
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException

from . import _helpers
from ._helpers import CorrelationRequest, get_correlation_interpretation

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/correlation", summary="多股票相关性分析")
async def analyze_correlation(request: CorrelationRequest):
    """分析多只股票之间的价格相关性"""
    try:
        if len(request.symbols) < 2:
            raise HTTPException(status_code=400, detail="至少需要2只股票进行相关性分析")
        if len(request.symbols) > 10:
            raise HTTPException(status_code=400, detail="最多支持10只股票同时分析")

        end_date = datetime.now()
        start_date = end_date - timedelta(days=request.period_days)

        stock_data = {}
        valid_symbols = []
        for symbol in request.symbols:
            try:
                data = _helpers.data_manager.get_historical_data(
                    symbol=symbol,
                    start_date=start_date,
                    end_date=end_date,
                    interval="1d",
                )
                if not data.empty and len(data) > 10:
                    if data.index.tz is not None:
                        data.index = data.index.tz_localize(None)
                    data.index = data.index.normalize()
                    stock_data[symbol] = data['close']
                    valid_symbols.append(symbol)
            except Exception as e:
                logger.warning(f"Could not fetch data for {symbol}: {e}")

        if len(valid_symbols) < 2:
            raise HTTPException(status_code=400, detail="有效数据不足，无法计算相关性")

        combined = pd.DataFrame(stock_data).dropna()
        if len(combined) < 10:
            raise HTTPException(status_code=400, detail="重叠交易日太少，无法计算相关性")

        returns = combined.pct_change().dropna()
        correlation_matrix = returns.corr()

        corr_data = []
        for sym1 in valid_symbols:
            for sym2 in valid_symbols:
                corr_data.append({
                    "symbol1": sym1,
                    "symbol2": sym2,
                    "correlation": round(correlation_matrix.loc[sym1, sym2], 4),
                })

        pair_correlations = []
        for i, sym1 in enumerate(valid_symbols):
            for j, sym2 in enumerate(valid_symbols):
                if i < j:
                    pair_correlations.append({
                        "pair": f"{sym1}-{sym2}",
                        "correlation": round(correlation_matrix.loc[sym1, sym2], 4),
                    })

        pair_correlations.sort(key=lambda x: abs(x["correlation"]), reverse=True)
        avg_correlation = np.mean([abs(p["correlation"]) for p in pair_correlations])

        return {
            "timestamp": datetime.now().isoformat(),
            "symbols": valid_symbols,
            "period_days": request.period_days,
            "data_points": len(returns),
            "correlation_matrix": corr_data,
            "top_correlations": pair_correlations[:5],
            "average_correlation": round(avg_correlation, 4),
            "interpretation": get_correlation_interpretation(avg_correlation),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in correlation analysis: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

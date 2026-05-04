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


@router.post("/industry-comparison", summary="行业对比分析")
async def get_industry_comparison(request: TrendAnalysisRequest):
    """获取同行业公司的关键指标对比"""
    try:
        target_fundamental = _helpers.fundamental_analyzer.analyze(request.symbol)

        if not target_fundamental or not target_fundamental.get("metrics"):
            raise HTTPException(status_code=404, detail=f"Fundamental data not available for {request.symbol}")

        target_metrics = target_fundamental.get("metrics", {})
        industry = target_metrics.get("industry", "Unknown")
        sector = target_metrics.get("sector", "Unknown")

        industry_peers = {
            "Technology": ["AAPL", "MSFT", "GOOGL", "META", "NVDA", "AMD", "INTC"],
            "Consumer Electronics": ["AAPL", "SONY", "SSNLF", "HPQ", "DELL"],
            "Internet Content & Information": ["GOOGL", "META", "NFLX", "SNAP", "PINS"],
            "Software—Infrastructure": ["MSFT", "ORCL", "CRM", "NOW", "ADBE"],
            "Semiconductors": ["NVDA", "AMD", "INTC", "QCOM", "AVGO", "TSM"],
            "Auto Manufacturers": ["TSLA", "TM", "F", "GM", "RIVN", "LCID"],
            "Banks—Diversified": ["JPM", "BAC", "WFC", "C", "GS", "MS"],
            "Default": ["SPY", "QQQ", "DIA"],
        }

        peer_symbols = industry_peers.get(industry, industry_peers.get(sector, industry_peers["Default"]))
        peer_symbols = [s for s in peer_symbols if s != request.symbol][:5]

        peers = []
        for peer_symbol in peer_symbols:
            try:
                peer_fundamental = _helpers.fundamental_analyzer.analyze(peer_symbol)
                if peer_fundamental and peer_fundamental.get("metrics"):
                    metrics = peer_fundamental.get("metrics", {})
                    peers.append({
                        "symbol": peer_symbol,
                        "name": metrics.get("name", peer_symbol),
                        "pe_ratio": round(metrics.get("pe_ratio", 0) or 0, 2),
                        "revenue_growth": round((metrics.get("revenue_growth", 0) or 0) * 100, 2),
                        "profit_margin": round((metrics.get("profit_margin", 0) or 0) * 100, 2),
                        "market_cap": metrics.get("market_cap", 0),
                        "price_to_book": round(metrics.get("price_to_book", 0) or 0, 2),
                    })
            except Exception as e:
                logger.warning(f"Could not fetch data for peer {peer_symbol}: {e}")

        target = {
            "symbol": request.symbol,
            "name": target_metrics.get("name", request.symbol),
            "pe_ratio": round(target_metrics.get("pe_ratio", 0) or 0, 2),
            "revenue_growth": round((target_metrics.get("revenue_growth", 0) or 0) * 100, 2),
            "profit_margin": round((target_metrics.get("profit_margin", 0) or 0) * 100, 2),
            "market_cap": target_metrics.get("market_cap", 0),
            "price_to_book": round(target_metrics.get("price_to_book", 0) or 0, 2),
        }

        all_companies = [target] + peers
        industry_avg = {
            "pe_ratio": round(np.mean([c["pe_ratio"] for c in all_companies if c["pe_ratio"] > 0]), 2),
            "revenue_growth": round(np.mean([c["revenue_growth"] for c in all_companies]), 2),
            "profit_margin": round(np.mean([c["profit_margin"] for c in all_companies]), 2),
        }

        sorted_by_pe = sorted([c for c in all_companies if c["pe_ratio"] > 0], key=lambda x: x["pe_ratio"])
        sorted_by_growth = sorted(all_companies, key=lambda x: x["revenue_growth"], reverse=True)

        target["pe_rank"] = next((i + 1 for i, c in enumerate(sorted_by_pe) if c["symbol"] == request.symbol), 0)
        target["growth_rank"] = next((i + 1 for i, c in enumerate(sorted_by_growth) if c["symbol"] == request.symbol), 0)

        return {
            "symbol": request.symbol,
            "timestamp": datetime.now().isoformat(),
            "industry": industry,
            "sector": sector,
            "target": target,
            "peers": peers,
            "industry_avg": industry_avg,
            "total_companies": len(all_companies),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting industry comparison: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/risk-metrics", summary="风险评估增强")
async def get_risk_metrics(request: TrendAnalysisRequest):
    """获取 VaR、最大回撤、夏普比率等风险指标"""
    try:
        data = _helpers.data_manager.get_historical_data(symbol=request.symbol, interval=request.interval)
        if data.empty or len(data) < 50:
            raise HTTPException(status_code=404, detail=f"Insufficient data for risk calculation: {request.symbol}")

        close = data['close']
        returns = close.pct_change().dropna()

        var_95 = np.percentile(returns, 5) * 100
        var_99 = np.percentile(returns, 1) * 100

        cumulative = (1 + returns).cumprod()
        rolling_max = cumulative.cummax()
        drawdown = (cumulative - rolling_max) / rolling_max
        max_drawdown = drawdown.min() * 100

        max_dd_end_idx = drawdown.idxmin()
        max_dd_start_idx = cumulative.loc[:max_dd_end_idx].idxmax()

        total_return = (close.iloc[-1] - close.iloc[0]) / close.iloc[0]
        years = len(data) / 252
        annual_return = ((1 + total_return) ** (1 / years) - 1) * 100 if years > 0 else 0
        annual_volatility = returns.std() * np.sqrt(252) * 100

        risk_free_rate = 0.04
        excess_return = annual_return / 100 - risk_free_rate
        sharpe_ratio = excess_return / (annual_volatility / 100) if annual_volatility != 0 else 0

        negative_returns = returns[returns < 0]
        downside_volatility = negative_returns.std() * np.sqrt(252) * 100 if len(negative_returns) > 0 else annual_volatility
        sortino_ratio = excess_return / (downside_volatility / 100) if downside_volatility != 0 else 0

        try:
            spy_data = _helpers.data_manager.get_historical_data(symbol="SPY", interval=request.interval)
            if not spy_data.empty and len(spy_data) > 50:
                spy_returns = spy_data['close'].pct_change().dropna()
                common_index = returns.index.intersection(spy_returns.index)
                if len(common_index) > 30:
                    aligned_returns = returns.loc[common_index]
                    aligned_spy = spy_returns.loc[common_index]
                    covariance = np.cov(aligned_returns, aligned_spy)[0][1]
                    variance = np.var(aligned_spy)
                    beta = covariance / variance if variance != 0 else 1.0
                else:
                    beta = 1.0
            else:
                beta = 1.0
        except Exception:
            beta = 1.0

        risk_score = 0
        if abs(var_95) > 5:
            risk_score += 2
        if abs(max_drawdown) > 30:
            risk_score += 2
        elif abs(max_drawdown) > 20:
            risk_score += 1
        if annual_volatility > 40:
            risk_score += 2
        elif annual_volatility > 25:
            risk_score += 1
        if sharpe_ratio < 0.5:
            risk_score += 1

        if risk_score >= 5:
            risk_level = "very_high"
            risk_description = "风险极高，谨慎投资"
        elif risk_score >= 3:
            risk_level = "high"
            risk_description = "风险较高，需注意仓位控制"
        elif risk_score >= 1:
            risk_level = "medium"
            risk_description = "风险适中"
        else:
            risk_level = "low"
            risk_description = "相对低风险"

        return {
            "symbol": request.symbol,
            "timestamp": datetime.now().isoformat(),
            "var_95": round(var_95, 2),
            "var_99": round(var_99, 2),
            "max_drawdown": round(max_drawdown, 2),
            "max_drawdown_period": {
                "start": max_dd_start_idx.strftime("%Y-%m-%d") if hasattr(max_dd_start_idx, 'strftime') else str(max_dd_start_idx),
                "end": max_dd_end_idx.strftime("%Y-%m-%d") if hasattr(max_dd_end_idx, 'strftime') else str(max_dd_end_idx),
            },
            "annual_return": round(annual_return, 2),
            "annual_volatility": round(annual_volatility, 2),
            "sharpe_ratio": round(sharpe_ratio, 2),
            "sortino_ratio": round(sortino_ratio, 2),
            "beta": round(beta, 2),
            "risk_level": risk_level,
            "risk_description": risk_description,
            "data_points": len(returns),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating risk metrics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

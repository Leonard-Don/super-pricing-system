"""风险评估 + 行业对比 路由（重型分析簇）。

两个 handler 都做"基于历史价格 + 同行数据的衍生指标"计算，没有共享参数模型，但
都属于"已经超出 trend/snapshot 范畴的二阶分析"，统一放在这里维护。"""

import logging
from datetime import datetime

import numpy as np
from fastapi import APIRouter, HTTPException

from backend.app.schemas.analysis import TrendAnalysisRequest

from . import _helpers

router = APIRouter()
logger = logging.getLogger(__name__)


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

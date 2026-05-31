"""
多因子资产定价引擎
实现 CAPM 和 Fama-French 三因子模型，提供因子暴露度分析和 Alpha 归因
"""

import logging
import numpy as np
import pandas as pd
from typing import Dict, Any
from datetime import datetime, timedelta

from src.analytics.asset_pricing_support import (
    annualized_factor_premia,
    detect_market,
    empty_asset_pricing_result,
    fetch_ff5_factors,
    fetch_ff_factors,
    factor_source_meta,
    generate_factor_summary,
    normalize_daily_index,
    period_to_days,
    estimate_ff5_factors as estimate_ff5_factors_support,
    estimate_ff_factors as estimate_ff_factors_support,
    interpret_capm,
    interpret_ff3,
    interpret_ff5,
    ols_statistics,
    safe_regression_metrics,
)
logger = logging.getLogger(__name__)

# Fama-French 因子数据的本地缓存
_ff_cache: Dict[str, Any] = {}


def _detect_market(symbol: str) -> str:
    """判断标的所属市场：A 股返回 ``"CN"``，其余返回 ``"US"``。

    薄包装 ``asset_pricing_support.detect_market``，让本模块的市场检测有一个
    与 ``valuation_model._detect_market`` 对应的稳定入口。
    """
    return detect_market(symbol)


def _fetch_ff_factors(period: str = "1y", market: str = "US") -> pd.DataFrame:
    """
    获取 Fama-French 三因子数据（市场感知）

    美股尝试从 Kenneth French Data Library 获取；A 股 (``market="CN"``) 与
    获取失败时使用市场感知的代理方法估算 —— A 股的 Mkt 因子取自沪深300，
    绝不会冒充美国 Kenneth-French 因子集。

    Returns:
        DataFrame with columns: Mkt-RF, SMB, HML, RF (日频, 百分比已转为小数)
    """
    return fetch_ff_factors(_ff_cache, period, logger, market=market)


def _fetch_ff5_factors(period: str = "1y", market: str = "US") -> pd.DataFrame:
    """获取 Fama-French 五因子数据（市场感知），失败时回退到代理估算。"""
    return fetch_ff5_factors(_ff_cache, period, logger, market=market)


def _estimate_ff_factors(period: str = "1y", market: str = "US") -> pd.DataFrame:
    """
    若网络获取失败，使用市场指数代理估算因子（市场感知）
    """
    return estimate_ff_factors_support(period, logger, market=market)


def _estimate_ff5_factors(period: str = "1y", market: str = "US") -> pd.DataFrame:
    """五因子代理估算（市场感知），保证结果可复现并显式标注为代理值。"""
    return estimate_ff5_factors_support(period, logger, market=market)


def _period_to_days(period: str) -> int:
    """将 period 字符串转换为天数"""
    return period_to_days(period)


class AssetPricingEngine:
    """
    资产定价引擎
    提供 CAPM 和 Fama-French 三因子分析
    """

    def __init__(self):
        from src.data.data_manager import get_data_manager

        self.data_manager = get_data_manager()

    def analyze(self, symbol: str, period: str = "1y") -> Dict[str, Any]:
        """
        完整的因子模型分析

        Args:
            symbol: 股票代码 (如 'AAPL')
            period: 分析周期 ('6mo', '1y', '2y', '3y', '5y')

        Returns:
            包含 CAPM 和 FF3 分析结果的字典
        """
        try:
            # 标的所属市场决定因子来源：A 股回归沪深300 + 中国无风险利率，
            # 美股回归 S&P 500 / Kenneth French。绝不把 A 股收益回归美国因子。
            market = _detect_market(symbol)
            days = _period_to_days(period)
            start = datetime.now() - timedelta(days=days)
            stock_data = self.data_manager.get_historical_data(symbol, start_date=start)
            stock_data = normalize_daily_index(stock_data)

            if stock_data.empty or len(stock_data) < 60:
                return empty_asset_pricing_result("数据不足，至少需要60个交易日")

            stock_returns = stock_data["close"].pct_change().dropna()

            # CAPM 分析
            capm_result = self._run_capm(stock_returns, period, market)

            # Fama-French 三因子分析
            ff3_result = self._run_ff3(stock_returns, period, market)
            ff5_result = self._run_ff5(stock_returns, period, market)

            ff_factors = _fetch_ff_factors(period, market=market)
            # 因子归因
            attribution = self._factor_attribution(capm_result, ff3_result, ff_factors)
            factor_source = factor_source_meta(ff_factors)
            ff5_source = factor_source_meta(_fetch_ff5_factors(period, market=market))

            return {
                "symbol": symbol,
                "market": market,
                "period": period,
                "data_points": len(stock_returns),
                "factor_source": factor_source,
                "five_factor_source": ff5_source,
                "capm": capm_result,
                "fama_french": ff3_result,
                "fama_french_five_factor": ff5_result,
                "attribution": attribution,
                "summary": generate_factor_summary(capm_result, ff3_result, ff5_result)
            }

        except Exception as e:
            logger.error(f"因子模型分析出错 {symbol}: {e}", exc_info=True)
            return empty_asset_pricing_result(str(e))

    def _run_capm(self, stock_returns: pd.Series, period: str, market: str = "US") -> Dict[str, Any]:
        """CAPM 回归: R_i - R_f = alpha + beta * (R_m - R_f) + epsilon

        ``market`` 决定 Mkt-RF 因子来源（A 股沪深300 / 美股 S&P 500）。
        """
        try:
            ff = _fetch_ff_factors(period, market=market)
            if ff.empty:
                return {"error": "无法获取市场因子数据"}

            # 对齐日期
            aligned = pd.DataFrame({
                "stock": stock_returns,
                "mkt_rf": ff["Mkt-RF"],
                "rf": ff["RF"]
            }).dropna()

            if len(aligned) < 30:
                return {"error": "对齐后数据不足30天"}

            y = aligned["stock"] - aligned["rf"]  # 超额收益
            X = aligned["mkt_rf"]

            # OLS 回归
            X_with_const = np.column_stack([np.ones(len(X)), X.values])
            coeffs = np.linalg.lstsq(X_with_const, y.values, rcond=None)[0]
            alpha_daily = coeffs[0]
            beta = coeffs[1]

            # R² 计算
            _, residuals, r_squared = safe_regression_metrics(y.values, X_with_const, coeffs)
            stats_meta = ols_statistics(y.values, X_with_const, coeffs)

            # 年化 Alpha
            alpha_annual = alpha_daily * 252

            # 残差标准差 (特质风险)
            idiosyncratic_risk = np.std(residuals) * np.sqrt(252)

            return {
                "alpha_daily": round(float(alpha_daily), 6),
                "alpha_annual": round(float(alpha_annual), 4),
                "alpha_pct": round(float(alpha_annual * 100), 2),
                "beta": round(float(beta), 4),
                "r_squared": round(float(r_squared), 4),
                "idiosyncratic_risk": round(float(idiosyncratic_risk), 4),
                "data_points": len(aligned),
                # 标注本次回归所用的市场因子来源，调用方读单独的 capm 块即可
                # 确认 A 股没有被回归到 S&P 500。
                "factor_source": factor_source_meta(ff),
                "significance": {
                    "alpha_t_stat": round(float(stats_meta["t_stats"][0]), 3),
                    "alpha_p_value": round(float(stats_meta["p_values"][0]), 4),
                    "beta_t_stat": round(float(stats_meta["t_stats"][1]), 3),
                    "beta_p_value": round(float(stats_meta["p_values"][1]), 4),
                },
                "residual_diagnostics": stats_meta["residual_diagnostics"],
                "interpretation": interpret_capm(alpha_annual, beta, r_squared)
            }

        except Exception as e:
            logger.error(f"CAPM 分析出错: {e}")
            return {"error": str(e)}

    def _run_ff3(self, stock_returns: pd.Series, period: str, market: str = "US") -> Dict[str, Any]:
        """Fama-French 三因子回归: R_i - R_f = α + β1*(Mkt-RF) + β2*SMB + β3*HML + ε

        ``market`` 决定因子来源（A 股沪深300 代理 / 美股 Kenneth French）。
        """
        try:
            ff = _fetch_ff_factors(period, market=market)
            if ff.empty:
                return {"error": "无法获取FF因子数据"}

            aligned = pd.DataFrame({
                "stock": stock_returns,
                "mkt_rf": ff["Mkt-RF"],
                "smb": ff["SMB"],
                "hml": ff["HML"],
                "rf": ff["RF"]
            }).dropna()

            if len(aligned) < 30:
                return {"error": "对齐后数据不足30天"}

            y = aligned["stock"] - aligned["rf"]
            X = aligned[["mkt_rf", "smb", "hml"]].values
            X_with_const = np.column_stack([np.ones(len(X)), X])

            coeffs = np.linalg.lstsq(X_with_const, y.values, rcond=None)[0]

            alpha_daily = coeffs[0]
            beta_mkt = coeffs[1]
            beta_smb = coeffs[2]
            beta_hml = coeffs[3]

            # R²
            _, _, r_squared = safe_regression_metrics(y.values, X_with_const, coeffs)

            alpha_annual = alpha_daily * 252
            stats_meta = ols_statistics(y.values, X_with_const, coeffs)

            return {
                "alpha_daily": round(float(alpha_daily), 6),
                "alpha_annual": round(float(alpha_annual), 4),
                "alpha_pct": round(float(alpha_annual * 100), 2),
                "factor_loadings": {
                    "market": round(float(beta_mkt), 4),
                    "size": round(float(beta_smb), 4),
                    "value": round(float(beta_hml), 4)
                },
                "r_squared": round(float(r_squared), 4),
                "data_points": len(aligned),
                "factor_source": factor_source_meta(ff),
                "significance": {
                    "alpha_t_stat": round(float(stats_meta["t_stats"][0]), 3),
                    "alpha_p_value": round(float(stats_meta["p_values"][0]), 4),
                    "market_t_stat": round(float(stats_meta["t_stats"][1]), 3),
                    "market_p_value": round(float(stats_meta["p_values"][1]), 4),
                    "size_t_stat": round(float(stats_meta["t_stats"][2]), 3),
                    "size_p_value": round(float(stats_meta["p_values"][2]), 4),
                    "value_t_stat": round(float(stats_meta["t_stats"][3]), 3),
                    "value_p_value": round(float(stats_meta["p_values"][3]), 4),
                },
                "residual_diagnostics": stats_meta["residual_diagnostics"],
                "interpretation": interpret_ff3(alpha_annual, beta_mkt, beta_smb, beta_hml)
            }

        except Exception as e:
            logger.error(f"FF3 分析出错: {e}")
            return {"error": str(e)}

    def _run_ff5(self, stock_returns: pd.Series, period: str, market: str = "US") -> Dict[str, Any]:
        """Fama-French 五因子回归。

        ``market`` 决定因子来源（A 股沪深300 代理 / 美股 Kenneth French）。
        """
        try:
            ff = _fetch_ff5_factors(period, market=market)
            if ff.empty:
                return {"error": "无法获取FF5因子数据"}

            aligned = pd.DataFrame({
                "stock": stock_returns,
                "mkt_rf": ff["Mkt-RF"],
                "smb": ff["SMB"],
                "hml": ff["HML"],
                "rmw": ff["RMW"],
                "cma": ff["CMA"],
                "rf": ff["RF"],
            }).dropna()

            if len(aligned) < 30:
                return {"error": "对齐后数据不足30天"}

            y = aligned["stock"] - aligned["rf"]
            X = aligned[["mkt_rf", "smb", "hml", "rmw", "cma"]].values
            X_with_const = np.column_stack([np.ones(len(X)), X])
            coeffs = np.linalg.lstsq(X_with_const, y.values, rcond=None)[0]
            _, _, r_squared = safe_regression_metrics(y.values, X_with_const, coeffs)
            alpha_annual = coeffs[0] * 252
            stats_meta = ols_statistics(y.values, X_with_const, coeffs)

            return {
                "alpha_daily": round(float(coeffs[0]), 6),
                "alpha_annual": round(float(alpha_annual), 4),
                "alpha_pct": round(float(alpha_annual * 100), 2),
                "factor_loadings": {
                    "market": round(float(coeffs[1]), 4),
                    "size": round(float(coeffs[2]), 4),
                    "value": round(float(coeffs[3]), 4),
                    "profitability": round(float(coeffs[4]), 4),
                    "investment": round(float(coeffs[5]), 4),
                },
                "r_squared": round(float(r_squared), 4),
                "data_points": len(aligned),
                "factor_source": factor_source_meta(ff),
                "significance": {
                    "alpha_p_value": round(float(stats_meta["p_values"][0]), 4),
                    "profitability_p_value": round(float(stats_meta["p_values"][4]), 4),
                    "investment_p_value": round(float(stats_meta["p_values"][5]), 4),
                },
                "residual_diagnostics": stats_meta["residual_diagnostics"],
                "interpretation": interpret_ff5(
                    alpha_annual,
                    coeffs[1],
                    coeffs[2],
                    coeffs[3],
                    coeffs[4],
                    coeffs[5],
                ),
            }
        except Exception as e:
            logger.error(f"FF5 分析出错: {e}")
            return {"error": str(e)}

    def _factor_attribution(self, capm: Dict, ff3: Dict, ff_factors: pd.DataFrame | None = None) -> Dict[str, Any]:
        """因子归因分析：解释超额收益的来源"""
        if "error" in capm or "error" in ff3:
            return {"error": "因子模型分析失败，无法进行归因"}

        loadings = ff3.get("factor_loadings", {})
        mkt = loadings.get("market", 0)
        smb = loadings.get("size", 0)
        hml = loadings.get("value", 0)

        premium_meta = annualized_factor_premia(ff_factors)
        premia = premium_meta["values"]
        mkt_premium = premia["market"]
        smb_premium = premia["size"]
        hml_premium = premia["value"]

        mkt_contribution = mkt * mkt_premium
        smb_contribution = smb * smb_premium
        hml_contribution = hml * hml_premium
        alpha_contribution = ff3.get("alpha_annual", 0)
        total = mkt_contribution + smb_contribution + hml_contribution + alpha_contribution

        return {
            "total_expected_excess_return": round(total, 4),
            "premium_assumptions": {
                "source": premium_meta["source"],
                "label": premium_meta["label"],
                "window_days": premium_meta["window_days"],
                "is_proxy": premium_meta["is_proxy"],
                "market": round(mkt_premium, 4),
                "size": round(smb_premium, 4),
                "value": round(hml_premium, 4),
            },
            "components": {
                "alpha": {
                    "value": round(alpha_contribution, 4),
                    "pct": round(alpha_contribution * 100, 2),
                    "label": "超额收益 (Alpha)"
                },
                "market": {
                    "value": round(mkt_contribution, 4),
                    "pct": round(mkt_contribution * 100, 2),
                    "label": "市场因子贡献"
                },
                "size": {
                    "value": round(smb_contribution, 4),
                    "pct": round(smb_contribution * 100, 2),
                    "label": "规模因子贡献"
                },
                "value": {
                    "value": round(hml_contribution, 4),
                    "pct": round(hml_contribution * 100, 2),
                    "label": "价值因子贡献"
                }
            }
        }

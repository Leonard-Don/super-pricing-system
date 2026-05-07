"""
行业分析模块单元测试
"""

import pytest
import pandas as pd
import numpy as np
import warnings
from datetime import datetime
from unittest.mock import Mock, patch, MagicMock
import sys
import os

# 添加项目根目录到路径
project_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
sys.path.insert(0, project_root)


class TestIndustryAnalyzer:
    """测试行业分析器"""
    
    @pytest.fixture
    def mock_provider(self):
        """创建模拟数据提供器"""
        provider = Mock()
        
        # 模拟行业分类数据
        provider.get_industry_classification.return_value = pd.DataFrame({
            "industry_code": ["801080", "801150", "801750"],
            "industry_name": ["电子", "医药生物", "计算机"]
        })
        
        # 模拟资金流向数据
        provider.get_industry_money_flow.return_value = pd.DataFrame({
            "industry_name": ["电子", "医药生物", "计算机"],
            "change_pct": [2.5, 1.8, -0.5],
            "main_net_inflow": [5000000000, 3000000000, -1000000000],
            "main_net_ratio": [0.05, 0.03, -0.01],
            "flow_strength": [1.0, 0.6, -0.2],
            "market_cap_source": ["snapshot_akshare_metadata", "akshare_metadata", "unknown"],
            "market_cap_snapshot_age_hours": [30.0, None, None],
            "market_cap_snapshot_is_stale": [True, False, False],
        })
        
        # 模拟行业成分股数据
        provider.get_stock_list_by_industry.return_value = [
            {"symbol": "000001", "name": "股票A", "change_pct": 3.5, "market_cap": 100000000000, "volume": 1000000},
            {"symbol": "000002", "name": "股票B", "change_pct": 2.0, "market_cap": 80000000000, "volume": 800000},
            {"symbol": "000003", "name": "股票C", "change_pct": -1.0, "market_cap": 50000000000, "volume": 500000},
        ]
        provider.get_stock_valuation.side_effect = lambda symbol: {
            "symbol": symbol,
            "market_cap": 0,
            "pe_ttm": 0,
            "change_pct": None,
        }

        def _mock_industry_index(code, start_date=None, end_date=None):
            closes_map = {
                "801080": [100, 101, 103, 102, 104],
                "801150": [100, 100.5, 100.8, 100.6, 100.9],
                "801750": [100, 97, 101, 96, 102],
            }
            closes = closes_map.get(code, [100, 100, 100, 100, 100])
            dates = pd.date_range("2026-01-01", periods=len(closes), freq="D")
            return pd.DataFrame({"close": closes}, index=dates)

        provider.get_industry_index.side_effect = _mock_industry_index
        
        return provider
    
    @pytest.fixture
    def analyzer(self, mock_provider):
        """创建行业分析器实例"""
        from src.analytics.industry_analyzer import IndustryAnalyzer
        return IndustryAnalyzer(mock_provider)
    
    def test_initialization(self, analyzer):
        """测试初始化"""
        assert analyzer is not None
        assert analyzer.provider is not None
        assert "momentum" in analyzer.weights
        assert "money_flow" in analyzer.weights
    
    def test_analyze_money_flow(self, analyzer):
        """测试资金流向分析"""
        result = analyzer.analyze_money_flow(days=5)
        
        assert isinstance(result, pd.DataFrame)
        if not result.empty:
            assert "industry_name" in result.columns

    def test_analyze_money_flow_recomputes_flat_flow_strength(self, analyzer, mock_provider):
        """上游返回全 0 flow_strength 时，应根据资金字段重建资金强度"""
        mock_provider.get_industry_money_flow.return_value = pd.DataFrame({
            "industry_name": ["电子", "医药生物", "计算机"],
            "change_pct": [2.5, 1.8, -0.5],
            "main_net_inflow": [5000000000, 3000000000, -1000000000],
            "main_net_ratio": [5.0, 3.0, -1.0],
            "flow_strength": [0.0, 0.0, 0.0],
        })
        analyzer._clear_cache()

        result = analyzer.analyze_money_flow(days=5)

        assert result["flow_strength"].tolist() == pytest.approx([0.05, 0.03, -0.01], rel=1e-6)
    
    def test_calculate_industry_momentum(self, analyzer):
        """测试行业动量计算"""
        result = analyzer.calculate_industry_momentum(lookback=20)
        
        assert isinstance(result, pd.DataFrame)
        if not result.empty:
            assert "industry_name" in result.columns
            assert "weighted_change" in result.columns
    
    def test_rank_industries(self, analyzer):
        """测试行业排名"""
        result = analyzer.rank_industries(top_n=5)
        
        assert isinstance(result, list)
        if result:
            assert "rank" in result[0]
            assert "industry_name" in result[0]
            assert "score" in result[0]
            assert result[0]["rank"] == 1
            assert all(0 <= item["score"] <= 100 for item in result)
    
    def test_get_industry_heatmap_data(self, analyzer):
        """测试热力图数据生成"""
        result = analyzer.get_industry_heatmap_data()
        
        assert isinstance(result, dict)
        assert "industries" in result
        assert "max_value" in result
        assert "min_value" in result
        assert "update_time" in result
        if result["industries"]:
            first = result["industries"][0]
            assert "marketCapSnapshotAgeHours" in first
            assert "marketCapSnapshotIsStale" in first
            assert "industryVolatility" in first
            assert "industryVolatilitySource" in first

    def test_heatmap_size_source_tracks_market_cap_source(self, analyzer):
        """测试 sizeSource 与 marketCapSource 类别保持一致"""
        result = analyzer.get_industry_heatmap_data()

        by_name = {item["name"]: item for item in result["industries"]}
        assert by_name["电子"]["marketCapSource"] == "snapshot_akshare_metadata"
        assert by_name["电子"]["sizeSource"] == "snapshot"
        assert by_name["医药生物"]["marketCapSource"] == "akshare_metadata"
        assert by_name["医药生物"]["sizeSource"] == "live"
        assert by_name["计算机"]["marketCapSource"] == "unknown"
        assert by_name["计算机"]["sizeSource"] == "estimated"

    def test_rank_industries_fallback_keeps_market_cap_source(self, analyzer):
        """测试排行榜 fallback 路径也会保留市值来源字段"""
        fallback_momentum = pd.DataFrame({
            "industry_name": ["电子", "医药生物"],
            "weighted_change": [2.0, 1.0],
        })
        fallback_flow = pd.DataFrame({
            "industry_name": ["电子", "医药生物"],
            "change_pct": [2.5, 1.8],
            "main_net_inflow": [5000000000, 3000000000],
            "flow_strength": [1.0, 0.6],
            "stock_count": [31, 28],
            "total_market_cap": [2.5e12, 1.8e12],
            "market_cap_source": ["snapshot_akshare_metadata", "akshare_metadata"],
        })

        with patch.object(analyzer, "analyze_money_flow", return_value=pd.DataFrame()) as mock_fast_flow, \
             patch.object(analyzer, "calculate_industry_momentum", return_value=fallback_momentum), \
             patch.object(analyzer, "_merge_momentum_and_flow", return_value=fallback_flow):
            result = analyzer.rank_industries(top_n=2)

        assert mock_fast_flow.called
        assert result[0]["market_cap_source"] == "snapshot_akshare_metadata"
        assert result[1]["market_cap_source"] == "akshare_metadata"
        assert all(0 <= item["score"] <= 100 for item in result)

    def test_rank_industries_supports_volatility_sort(self, analyzer):
        """测试排行榜支持按行业波动率排序"""
        result = analyzer.rank_industries(top_n=3, sort_by="industry_volatility", ascending=False)

        assert isinstance(result, list)
        assert len(result) == 3
        assert result[0]["industry_volatility"] >= result[1]["industry_volatility"] >= result[2]["industry_volatility"]
    
    def test_cluster_hot_industries(self, analyzer):
        """测试行业聚类"""
        with warnings.catch_warnings(record=True) as captured:
            warnings.simplefilter("always", FutureWarning)
            result = analyzer.cluster_hot_industries(n_clusters=3)
        
        assert isinstance(result, dict)
        assert "clusters" in result
        assert "hot_cluster" in result
        assert "cluster_stats" in result
        assert not [
            item
            for item in captured
            if issubclass(item.category, FutureWarning)
            and "Downcasting object dtype arrays" in str(item.message)
        ]
    
    def test_get_industry_trend(self, analyzer):
        """测试行业趋势分析"""
        result = analyzer.get_industry_trend("电子", days=30)
        
        assert isinstance(result, dict)
        if "error" not in result:
            assert "industry_name" in result
            assert "stock_count" in result
            assert "industry_volatility" in result
            assert "industry_volatility_source" in result

    def test_get_industry_trend_uses_enriched_stock_details_for_summary(self, analyzer, mock_provider):
        """趋势摘要应复用补齐后的成分股明细口径"""
        mock_provider.get_stock_list_by_industry.return_value = [
            {"symbol": "000001", "name": "股票A", "change_pct": 3.5, "market_cap": 0, "pe_ratio": 12.0},
            {"symbol": "000002", "name": "股票B", "change_pct": 2.0, "market_cap": 0, "pe_ratio": 0},
            {"symbol": "000003", "name": "股票C", "change_pct": -1.0, "market_cap": 50000000000, "pe_ratio": 18.0},
        ]
        valuation_map = {
            "000001": {"symbol": "000001", "market_cap": 100000000000, "pe_ttm": 12.0, "change_pct": 3.5},
            "000002": {"symbol": "000002", "market_cap": 80000000000, "pe_ttm": 15.0, "change_pct": 2.0},
            "000003": {"symbol": "000003", "market_cap": 50000000000, "pe_ttm": 18.0, "change_pct": -1.0},
        }
        mock_provider.get_stock_valuation.side_effect = lambda symbol: valuation_map[symbol]

        result = analyzer.get_industry_trend("电子", days=30)

        assert result["total_market_cap"] == 230000000000
        assert result["avg_pe"] == pytest.approx(15.0, rel=0.001)
        assert result["top_gainers"][0]["symbol"] == "000001"
        assert result["top_losers"][0]["symbol"] == "000003"

    def test_get_industry_trend_ignores_missing_change_pct_in_distribution(self, analyzer, mock_provider):
        """缺失 change_pct 的股票不应参与涨跌分布和涨跌榜"""
        mock_provider.get_stock_list_by_industry.return_value = [
            {"symbol": "000001", "name": "股票A", "change_pct": None, "market_cap": 100000000000, "pe_ratio": 12.0},
            {"symbol": "000002", "name": "股票B", "change_pct": 2.0, "market_cap": 80000000000, "pe_ratio": 15.0},
            {"symbol": "000003", "name": "股票C", "change_pct": -1.0, "market_cap": 50000000000, "pe_ratio": 18.0},
        ]

        result = analyzer.get_industry_trend("电子", days=30)

        assert result["rise_count"] == 1
        assert result["fall_count"] == 1
        assert result["flat_count"] == 0
        top_symbols = {item["symbol"] for item in result["top_gainers"] + result["top_losers"]}
        assert "000001" not in top_symbols
    
    def test_cache_functionality(self, analyzer):
        """测试缓存功能"""
        # 首次调用
        result1 = analyzer.rank_industries(top_n=3)
        
        # 清除缓存
        analyzer._clear_cache()
        
        # 再次调用
        result2 = analyzer.rank_industries(top_n=3)
        
        # 结果应该相同（基于相同的模拟数据）
        assert len(result1) == len(result2)
        
    def test_cache_hit_verification(self, analyzer, mock_provider):
        """验证缓存命中"""
        # 第一次调用
        analyzer.analyze_money_flow(days=5)
        
        # 验证调用了一次提供器
        assert mock_provider.get_industry_money_flow.call_count == 1
        
        # 第二次调用（应该命中缓存）
        analyzer.analyze_money_flow(days=5)
        
        # 验证没有再次调用提供器
        assert mock_provider.get_industry_money_flow.call_count == 1
        
        # 清除缓存后第三次调用
        analyzer._clear_cache()
        analyzer.analyze_money_flow(days=5)
        
        # 验证再次调用了提供器
        assert mock_provider.get_industry_money_flow.call_count == 2
    
    def test_custom_weights(self):
        """测试自定义权重"""
        from src.analytics.industry_analyzer import IndustryAnalyzer
        
        custom_weights = {
            "momentum": 0.5,
            "money_flow": 0.3,
            "volume_change": 0.2,
            "volatility": 0.0,
        }
        
        analyzer = IndustryAnalyzer(weights=custom_weights)
        
        assert analyzer.weights["momentum"] == 0.5
        assert analyzer.weights["money_flow"] == 0.3


class TestLeaderStockScorer:
    """测试龙头股评分器"""
    
    @pytest.fixture
    def mock_provider(self):
        """创建模拟数据提供器"""
        provider = Mock()
        
        # 模拟估值数据
        provider.get_stock_valuation.return_value = {
            "symbol": "000001",
            "name": "测试股票",
            "market_cap": 100000000000,
            "pe_ttm": 20.5,
            "pb": 2.5,
            "turnover": 3.5,
        }
        
        # 模拟财务数据
        provider.get_stock_financial_data.return_value = {
            "symbol": "000001",
            "roe": 15.5,
            "revenue_yoy": 25.0,
            "profit_yoy": 20.0,
        }
        
        # 模拟行业成分股
        provider.get_stock_list_by_industry.return_value = [
            {"symbol": "000001", "name": "股票A", "market_cap": 100000000000, "pe_ratio": 20, "change_pct": 2.5, "volume": 1000000, "amount": 500000000},
            {"symbol": "000002", "name": "股票B", "market_cap": 80000000000, "pe_ratio": 25, "change_pct": 1.5, "volume": 800000, "amount": 400000000},
            {"symbol": "000003", "name": "股票C", "market_cap": 50000000000, "pe_ratio": 15, "change_pct": -0.5, "volume": 500000, "amount": 200000000},
        ]
        
        return provider
    
    @pytest.fixture
    def scorer(self, mock_provider):
        """创建龙头股评分器实例"""
        from src.analytics.leader_stock_scorer import LeaderStockScorer
        return LeaderStockScorer(mock_provider)
    
    def test_initialization(self, scorer):
        """测试初始化"""
        assert scorer is not None
        assert scorer.provider is not None
        assert "market_cap" in scorer.weights
        assert "profitability" in scorer.weights
    
    def test_score_stock(self, scorer):
        """测试单只股票评分"""
        result = scorer.score_stock("000001")
        
        assert isinstance(result, dict)
        if "error" not in result:
            assert "symbol" in result
            assert "total_score" in result
            assert "dimension_scores" in result

    def test_score_stock_uses_neutral_financial_scores_when_financial_data_missing(self, scorer, mock_provider):
        """财务数据缺失时，盈利/成长维度应回到中性分而不是惩罚分"""
        scorer.__class__._financial_cache = {}
        scorer.__class__._financial_cache_loaded = True
        mock_provider.get_stock_financial_data.return_value = {"error": "financial unavailable"}

        result = scorer.score_stock("000001")

        assert "error" not in result
        assert result["dimension_scores"]["profitability"] == pytest.approx(0.5, rel=0.001)
        assert result["dimension_scores"]["growth"] == pytest.approx(0.5, rel=0.001)

    def test_hot_score_uses_full_100_point_scale(self, scorer):
        """热点评分应使用完整 0-100 量尺，而不是被压缩到 50 分以内"""
        result = scorer.score_stock_from_snapshot({
            "symbol": "000001",
            "name": "测试股票",
            "change_pct": 15.0,
            "net_inflow_ratio": 5.0,
            "amount": 1000000000,
        }, score_type="hot")

        assert "error" not in result
        assert result["dimension_scores"]["score_type"] == "hot"
        assert result["total_score"] == pytest.approx(100.0, rel=0.001)

    def test_snapshot_core_score_keeps_missing_financials_neutral(self, scorer):
        """快评分阶段缺失财务数据时，也应保持中性分口径"""
        result = scorer.score_stock_from_snapshot({
            "symbol": "000001",
            "name": "测试股票",
            "market_cap": 100000000000,
            "pe_ratio": 20,
            "change_pct": 2.5,
            "amount": 500000000,
        }, score_type="core")

        assert "error" not in result
        assert result["dimension_scores"]["profitability"] == pytest.approx(0.5, rel=0.001)
        assert result["dimension_scores"]["growth"] == pytest.approx(0.5, rel=0.001)
    
    def test_rank_stocks_in_industry(self, scorer):
        """测试行业内股票排名"""
        result = scorer.rank_stocks_in_industry("电子", top_n=5)
        
        assert isinstance(result, list)
        if result:
            assert "symbol" in result[0]
            assert "total_score" in result[0]
            assert "rank" in result[0]
            assert result[0]["rank"] == 1
    
    def test_get_leader_stocks(self, scorer):
        """测试获取龙头股"""
        result = scorer.get_leader_stocks(["电子", "医药生物"], top_per_industry=3)
        
        assert isinstance(result, list)
        if result:
            assert "global_rank" in result[0]
    
    def test_custom_weights(self):
        """测试自定义权重"""
        from src.analytics.leader_stock_scorer import LeaderStockScorer
        
        custom_weights = {
            "market_cap": 0.3,
            "valuation": 0.2,
            "profitability": 0.2,
            "growth": 0.15,
            "momentum": 0.1,
            "activity": 0.05,
        }
        
        scorer = LeaderStockScorer(weights=custom_weights)
        scorer.set_weights(custom_weights)
        
        # 权重应该被归一化
        assert sum(scorer.weights.values()) == pytest.approx(1.0, rel=0.01)
    
    def test_normalize_function(self, scorer):
        """测试归一化函数"""
        # 测试边界值
        assert scorer._normalize(0, 0, 100) == 0.0
        assert scorer._normalize(100, 0, 100) == 1.0
        assert scorer._normalize(50, 0, 100) == 0.5
        
        # 测试超出范围的值
        assert scorer._normalize(-10, 0, 100) == 0.0
        assert scorer._normalize(150, 0, 100) == 1.0

    def test_get_leader_detail_returns_error_when_provider_missing(self):
        """provider 为 None 时,get_leader_detail 应返回 error dict 而不是抛异常"""
        from src.analytics.leader_stock_scorer import LeaderStockScorer

        scorer = LeaderStockScorer(data_provider=None)
        result = scorer.get_leader_detail("000001")

        assert result == {"symbol": "000001", "error": "Data provider not set"}

    def test_get_leader_detail_returns_score_with_technical_analysis(self, scorer, mock_provider):
        """happy path:hist_data 充足时返回 score + technical_analysis + price_data 三段"""
        # 构造 30 日价格序列(线性上升便于断言)
        dates = pd.date_range(end="2026-05-06", periods=30, freq="D")
        closes = np.linspace(10.0, 12.0, 30)
        hist_df = pd.DataFrame({"date": dates, "close": closes})

        mock_provider.get_historical_data.return_value = hist_df
        mock_provider.get_latest_quote.return_value = {
            "current_price": 12.0,
            "previous_close": 11.5,
        }

        result = scorer.get_leader_detail("000001", score_type="core")

        assert "error" not in result
        assert "technical_analysis" in result
        tech = result["technical_analysis"]
        # 30 个线性递增样本(10.0 → 12.0)的 ma 与年化波动率是确定的
        assert tech["ma5"] == pytest.approx(11.86, abs=0.01)
        assert tech["ma20"] == pytest.approx(11.34, abs=0.01)
        assert tech["volatility_60d"] == pytest.approx(0.54, abs=0.5)
        assert tech["latest_close"] == pytest.approx(12.0, abs=0.01)
        assert tech["high_60d"] == pytest.approx(12.0, abs=0.01)
        assert tech["low_60d"] == pytest.approx(10.0, abs=0.01)
        # price_data 是 records list,最多 30 条
        assert isinstance(result["price_data"], list)
        assert len(result["price_data"]) == 30

    def test_get_leader_detail_propagates_score_error(self, scorer, mock_provider, monkeypatch):
        """score_stock 返回 error dict 时,get_leader_detail 直接透传不再算 technical_analysis"""
        monkeypatch.setattr(
            scorer,
            "score_stock",
            lambda *args, **kwargs: {"symbol": "BADSYM", "error": "scoring failed"},
        )
        mock_provider.get_historical_data.return_value = pd.DataFrame()
        mock_provider.get_latest_quote.return_value = {}

        result = scorer.get_leader_detail("BADSYM")

        assert result == {"symbol": "BADSYM", "error": "scoring failed"}
        assert "technical_analysis" not in result
        assert "price_data" not in result

    def test_get_leader_detail_returns_error_on_exception(self, scorer, mock_provider):
        """provider 抛异常时,get_leader_detail 捕获并 stringify 到 error 字段"""
        mock_provider.get_historical_data.side_effect = RuntimeError("network down")

        result = scorer.get_leader_detail("000001")

        assert result["symbol"] == "000001"
        assert "error" in result
        assert "network down" in result["error"]

    def test_optimize_weights_returns_default_on_empty_dataframe(self, scorer):
        """空 df 时所有候选都得 -inf,返回值应等于 self.weights.copy() (原始 DEFAULT_WEIGHTS)"""
        original_weights = scorer.weights.copy()
        result = scorer.optimize_weights(pd.DataFrame(), target="total_return")

        assert result == original_weights

    def test_optimize_weights_returns_default_when_target_column_missing(self, scorer):
        """df 没有任何 target/return 列时,_evaluate_weights 早返回 -inf,best_weights 保持初值"""
        df = pd.DataFrame({
            "market_cap": [1.0, 2.0, 3.0],
            "roe": [0.5, 0.6, 0.7],
        })
        original_weights = scorer.weights.copy()

        result = scorer.optimize_weights(df, target="total_return")

        assert result == original_weights

    def test_optimize_weights_happy_path_returns_factor_weight_dict(self, scorer):
        """有完整因子 + forward_return 列时,grid search 找到优胜组合,返回的 dict keys 是 6 个 factor 名"""
        rng = np.random.default_rng(seed=42)
        n = 50
        df = pd.DataFrame({
            "market_cap": rng.uniform(0, 1, n),
            "roe": rng.uniform(0, 1, n),
            "revenue_growth": rng.uniform(0, 1, n),
            "profit_growth": rng.uniform(0, 1, n),
            "volatility": rng.uniform(0, 1, n),
            "liquidity": rng.uniform(0, 1, n),
            "forward_return": rng.uniform(-0.1, 0.2, n),
        })

        result = scorer.optimize_weights(df, target="total_return")

        assert isinstance(result, dict)
        # grid search 替換後的 keys
        assert set(result.keys()) == {
            "market_cap", "roe", "revenue_growth",
            "profit_growth", "volatility", "liquidity",
        }
        # weights 都是 float
        assert all(isinstance(v, float) for v in result.values())
        # mc + roe + rg + pg 應該都來自 weight_options
        assert result["market_cap"] in [0.1, 0.15, 0.2, 0.25, 0.3]
        assert result["roe"] in [0.1, 0.15, 0.2, 0.25, 0.3]

    def _multi_date_factor_frame(self, seed: int = 7) -> pd.DataFrame:
        """构造跨日的因子+收益面板,使 _evaluate_weights 能产生 ≥2 个 bucket return,
        sharpe / max_drawdown 分支才能脱离 single-bucket 退化(std=0 → -inf)。"""
        rng = np.random.default_rng(seed=seed)
        rows = []
        for date_label, return_shift in [
            ("2026-01-01", 0.05),
            ("2026-02-01", -0.02),
            ("2026-03-01", 0.01),
        ]:
            for _ in range(15):
                rows.append({
                    "date": date_label,
                    "market_cap": float(rng.uniform(0, 1)),
                    "roe": float(rng.uniform(0, 1)),
                    "revenue_growth": float(rng.uniform(0, 1)),
                    "profit_growth": float(rng.uniform(0, 1)),
                    "volatility": float(rng.uniform(0, 1)),
                    "liquidity": float(rng.uniform(0, 1)),
                    "forward_return": float(rng.uniform(-0.05, 0.1) + return_shift),
                })
        return pd.DataFrame(rows)

    def test_optimize_weights_target_sharpe_returns_factor_weight_dict(self, scorer):
        """target='sharpe' 走 mean_return / std_return 分支;
        多 date bucket 让 std_return > 0,grid search 能选出有限分数的组合。"""
        df = self._multi_date_factor_frame(seed=11)

        result = scorer.optimize_weights(df, target="sharpe")

        # grid search 必须替换初始 self.weights(否则 keys 仍是 DEFAULT_WEIGHTS 的旧 schema)
        assert set(result.keys()) == {
            "market_cap", "roe", "revenue_growth",
            "profit_growth", "volatility", "liquidity",
        }
        assert all(isinstance(v, float) for v in result.values())
        assert result["market_cap"] in [0.1, 0.15, 0.2, 0.25, 0.3]

    def test_optimize_weights_target_max_drawdown_returns_factor_weight_dict(self, scorer):
        """target='max_drawdown' 走 -drawdown 分支;grid search 总能找到优胜组合
        (即使所有组合 drawdown 都为 0,首个非负分数也会替换初始 -inf)。"""
        df = self._multi_date_factor_frame(seed=23)

        result = scorer.optimize_weights(df, target="max_drawdown")

        assert set(result.keys()) == {
            "market_cap", "roe", "revenue_growth",
            "profit_growth", "volatility", "liquidity",
        }
        assert all(isinstance(v, float) for v in result.values())

    def test_optimize_weights_returns_default_when_all_factors_are_nan(self, scorer):
        """所有因子列存在但全 NaN 时,_evaluate_weights 每次都因 dropna().empty 跳过,
        used_factor 保持 False → 返回 -inf,grid search 全军覆没,保留 self.weights.copy()
        (即原始 DEFAULT_WEIGHTS 的 valuation/profitability/growth/momentum/activity schema)。"""
        df = pd.DataFrame({
            "market_cap": [np.nan] * 10,
            "roe": [np.nan] * 10,
            "revenue_growth": [np.nan] * 10,
            "profit_growth": [np.nan] * 10,
            "volatility": [np.nan] * 10,
            "liquidity": [np.nan] * 10,
            "forward_return": [0.01] * 10,
        })
        original_weights = scorer.weights.copy()

        result = scorer.optimize_weights(df, target="total_return")

        assert result == original_weights
        # 关键不变量:回退路径不会泄露 grid-search 的 6-key schema
        assert "valuation" in result
        assert "roe" not in result


class TestIndustryBacktester:
    """测试行业回测器"""
    
    @pytest.fixture
    def backtester(self):
        """创建回测器实例"""
        from src.backtest.industry_backtest import IndustryBacktester
        return IndustryBacktester(initial_capital=1000000)
    
    def test_initialization(self, backtester):
        """测试初始化"""
        assert backtester is not None
        assert backtester.initial_capital == 1000000
        assert backtester.commission_rate == 0.001
    
    @pytest.mark.skip(reason="Network-dependent: run_backtest fans out to live akshare/Sina fetches and times out in CI; covered by integration suite")
    def test_run_backtest(self, backtester):
        """测试运行回测"""
        result = backtester.run_backtest(
            start_date='2023-01-01',
            end_date='2023-03-01',
            rebalance_freq='monthly',
            top_industries=3,
            stocks_per_industry=3
        )

        assert result is not None
        assert hasattr(result, 'total_return')
        assert hasattr(result, 'sharpe_ratio')
        assert hasattr(result, 'max_drawdown')

    @pytest.mark.skip(reason="Network-dependent: run_backtest fans out to live akshare/Sina fetches and times out in CI; covered by integration suite")
    def test_compare_with_benchmark(self, backtester):
        """测试与基准对比"""
        result = backtester.run_backtest(
            start_date='2023-01-01',
            end_date='2023-03-01',
            rebalance_freq='monthly'
        )

        comparison = backtester.compare_with_benchmark('000300.SH', result)

        assert isinstance(comparison, dict)
        assert "strategy_return" in comparison
        assert "benchmark_return" in comparison
        assert "excess_return" in comparison
        assert "outperform" in comparison
    
    @pytest.mark.skip(reason="Network-dependent: invokes live akshare/Sina money-flow fetches and times out in CI; covered by integration suite when run with --run-network")
    def test_get_trade_history(self, backtester):
        """测试获取交易历史"""
        backtester.run_backtest(
            start_date='2023-01-01',
            end_date='2023-02-01',
            rebalance_freq='weekly'
        )

        trades = backtester.get_trade_history()

        assert isinstance(trades, list)
    
    @pytest.mark.skip(reason="Legacy test method missing in newer implementation")
    def test_calculate_max_drawdown(self, backtester):
        """测试最大回撤计算"""
        # 测试模拟资金曲线
        equity_values = [100, 110, 105, 120, 100, 130]
        # max_dd = backtester._calculate_max_drawdown(equity_values)
        
        # 最大回撤应该是从120跌到100，回撤约16.67%
        expected_dd = (120 - 100) / 120
        # assert max_dd == pytest.approx(expected_dd, rel=0.01)
    
    @pytest.mark.skip(reason="Legacy test method missing in newer implementation")
    def test_empty_equity_values(self, backtester):
        """测试空资金曲线"""
        # max_dd = backtester._calculate_max_drawdown([])
        # assert max_dd == 0.0

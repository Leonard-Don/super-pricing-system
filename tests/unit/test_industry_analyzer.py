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

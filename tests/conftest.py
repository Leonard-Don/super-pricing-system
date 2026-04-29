"""
pytest配置文件
"""

import os
import sys
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import pytest

# 添加项目根目录到路径
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

# 在导入业务模块之前注入测试环境默认值，避免：
# 1. 触发非关键启动任务（cache 预热 / 行业刷新）影响测试稳定性。
# 2. 因缺少 AUTH_SECRET 在生产模式下抛错（虽然测试默认 ENVIRONMENT=test 不会触发，但保险起见兜底）。
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("DISABLE_NONCRITICAL_STARTUP_TASKS", "1")
os.environ.setdefault("AUTH_SECRET", "pytest-fixture-secret-not-for-production")

from src.backtest.backtester import Backtester  # noqa: E402
from src.data.data_manager import DataManager  # noqa: E402
from src.strategy.strategies import MovingAverageCrossover, RSIStrategy  # noqa: E402


@pytest.fixture
def sample_data():
    """生成测试用的样本数据"""
    dates = pd.date_range(start="2023-01-01", end="2023-12-31", freq="D")
    np.random.seed(42)

    # 生成模拟的OHLCV数据
    base_price = 100
    returns = np.random.normal(0.001, 0.02, len(dates))
    prices = base_price * (1 + returns).cumprod()

    data = pd.DataFrame(
        {
            "open": prices * (1 + np.random.normal(0, 0.001, len(dates))),
            "high": prices * (1 + np.abs(np.random.normal(0.002, 0.001, len(dates)))),
            "low": prices * (1 - np.abs(np.random.normal(0.002, 0.001, len(dates)))),
            "close": prices,
            "volume": np.random.randint(1000000, 10000000, len(dates)),
        },
        index=dates,
    )

    # 确保high >= low, open和close在high和low之间
    data["high"] = np.maximum(data["high"], data[["open", "close"]].max(axis=1))
    data["low"] = np.minimum(data["low"], data[["open", "close"]].min(axis=1))

    return data


@pytest.fixture
def data_manager():
    """数据管理器实例"""
    return DataManager()


@pytest.fixture
def moving_average_strategy():
    """移动平均策略实例"""
    return MovingAverageCrossover(fast_period=10, slow_period=20)


@pytest.fixture
def rsi_strategy():
    """RSI策略实例"""
    return RSIStrategy(period=14, oversold=30, overbought=70)


@pytest.fixture
def backtester():
    """回测器实例"""
    return Backtester(initial_capital=10000, commission=0.001)


@pytest.fixture
def api_client():
    """API客户端（需要后端运行）"""
    import requests

    return requests.Session()


@pytest.fixture(scope="session")
def test_config():
    """测试配置"""
    return {
        "api_base_url": os.getenv("API_BASE_URL", "http://localhost:8100"),
        "test_symbol": "AAPL",
        "test_date_range": {"start": "2023-01-01", "end": "2023-12-31"},
    }

"""
API集成测试
"""

import pytest

# import requests  # 暂时未使用
# import time  # 暂时未使用
# import subprocess  # 暂时未使用
# import threading  # 暂时未使用
import sys
from pathlib import Path

# import uvicorn  # 暂时未使用
# import asyncio  # 暂时未使用
from fastapi.testclient import TestClient

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from backend.main import app  # noqa: E402



class TestAPIIntegration:
    """API集成测试"""

    @pytest.fixture(scope="class")
    def client(self):
        """创建测试客户端"""
        return TestClient(app)

    def test_health_check(self, client):
        """测试健康检查端点"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert data["status"] == "healthy"

    def test_performance_metrics_endpoint(self, client):
        """测试性能指标端点"""
        response = client.get("/system/metrics")
        assert response.status_code == 200

        data = response.json()
        assert "success" in data
        assert "metrics" in data
        assert "timestamp" in data

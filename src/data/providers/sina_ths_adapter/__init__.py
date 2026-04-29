"""``src.data.providers.sina_ths_adapter`` 包入口。

把原 2075 行单文件 ``sina_ths_adapter.py`` 拆为：
- ``_constants.py``  — INDUSTRY_ENRICHMENT_ALIASES / SINA_TO_THS_MAP / SINA_INDUSTRY_CODES 静态映射
- ``_mappers.py``    — map_sina_to_ths / map_ths_to_sina 名称双向映射
- ``_adapter.py``    — SinaIndustryAdapter 类（~50 方法）+ create_industry_provider 工厂

兼容性约束：
- ``backend.app.api.v1.endpoints.industry`` / ``src.analytics.industry_analyzer`` 通过
  ``from src.data.providers.sina_ths_adapter import SinaIndustryAdapter`` /
  ``map_ths_to_sina`` / ``create_industry_provider`` 直接导入
- ``tests/unit/test_sina_ths_adapter.py`` 与 manual 脚本同样依赖这些 import 路径

本 ``__init__`` 重新导出所有原顶层符号。
"""

# 测试通过 ``patch("src.data.providers.sina_ths_adapter.ak.<func>", ...)`` 在 adapter
# namespace 替换 akshare 顶层调用。拆分后必须在包级别保留 ``ak`` 别名。
import akshare as ak  # noqa: F401  re-exported for test patches

from ._adapter import SinaIndustryAdapter, create_industry_provider
from ._constants import (
    INDUSTRY_ENRICHMENT_ALIASES,
    SINA_NEW_NODE_NAME_MAP,
    SINA_PROXY_NODE_NAME_MAP,
    SINA_TO_THS_MAP,
)
from ._mappers import map_sina_to_ths, map_ths_to_sina

__all__ = [
    # class + factory
    "SinaIndustryAdapter",
    "create_industry_provider",
    # mappers
    "map_sina_to_ths",
    "map_ths_to_sina",
    # constants
    "INDUSTRY_ENRICHMENT_ALIASES",
    "SINA_NEW_NODE_NAME_MAP",
    "SINA_PROXY_NODE_NAME_MAP",
    "SINA_TO_THS_MAP",
]

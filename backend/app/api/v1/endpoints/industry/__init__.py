"""``backend.app.api.v1.endpoints.industry`` 包入口。

包含 11 个 FastAPI 路由 handler（行业成分股 + 偏好 + 趋势 + intelligence + network + health），
重型业务逻辑分散在 ``heatmap_service`` / ``ranking_service`` / ``trend_service`` /
``preferences_service``，共享单例与缓存仍在 ``_helpers``。

只 re-export ``router``（由 ``api/v1/api.py`` 注册）；包外没有任何代码或测试
import 包内的 helper / handler / 模型符号——需要的话直接从子模块取。
"""

from .routes import router  # noqa: F401

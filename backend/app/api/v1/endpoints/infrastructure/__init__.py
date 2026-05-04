"""``backend.app.api.v1.endpoints.infrastructure`` 包入口。

历史 818 行 ``infrastructure.py`` 已经按子主题继续拆：
- ``_helpers.py``           — 共享 helper（如 ``_require_admin_or_bootstrap``）
- ``routes.py``             — status / tasks / rate-limit / config-versions /
                              notifications handler
- ``auth_routes.py``        — 16 个 ``/auth/*`` 与 ``/oauth/token`` handler +
                              OAuth provider / 用户 / 策略管理 + 模型类
- ``persistence_routes.py`` — 8 个 ``/persistence/*`` handler（records /
                              timeseries / diagnostics / bootstrap / migration）

本 ``__init__`` 把三个子 router 合并到对外 ``router``。

monkeypatch 注意事项：handler 的名称查找在各自模块的全局命名空间。测试
若需 patch ``exchange_oauth_authorization_code`` 之类的依赖，应直接 import
``backend.app.api.v1.endpoints.infrastructure.auth_routes``；若 patch
``task_queue_manager`` 等 routes.py 依赖，则 import ``...infrastructure.routes``；
``persistence_manager`` 默认实例由 ``persistence_routes.py`` 引用，需 patch
``...infrastructure.persistence_routes``。
"""

from fastapi import APIRouter

from . import auth_routes as _auth_routes_module
from . import persistence_routes as _persistence_routes_module
from . import routes as _routes_module

router = APIRouter()
router.include_router(_routes_module.router)
router.include_router(_auth_routes_module.router)
router.include_router(_persistence_routes_module.router)

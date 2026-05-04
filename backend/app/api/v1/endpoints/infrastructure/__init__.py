"""``backend.app.api.v1.endpoints.infrastructure`` 包入口。

历史上是 818 行单文件 ``infrastructure.py``，36 个 handler 涵盖 auth/oauth、
tasks、persistence、config-versions、notifications 等多个责任域。本次第一步
只把 flat file 转成 package（``routes.py`` 承接全部内容），后续按子主题
继续抽出独立 sub-router。

兼容性 re-export：
- ``router``：FastAPI APIRouter，由 ``api/v1/api.py`` 注册。
- 其它 monkeypatch / 直接属性访问的测试应直接 import
  ``backend.app.api.v1.endpoints.infrastructure.routes``，因为 handler 的
  名称查找发生在 ``routes`` 模块自身的全局命名空间。
"""

from .routes import router  # noqa: F401

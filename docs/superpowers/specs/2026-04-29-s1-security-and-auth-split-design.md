# S1 设计 · 把安全硬化与 auth 重构从未提交大 diff 中切出

**日期**：2026-04-29
**作者**：leo（与 Claude 协作）
**状态**：design (pending implementation)
**关联**：`docs/REFACTORING_PLAN.md`、未提交工作树

---

## 1. 背景与目标

当前工作树有 13,685 行删除 / 420 行新增的未提交改动，混合了多条独立线索：

- 巨型文件拆分（industry / backtest / analysis / macro_quality / persistence / sina_ths_adapter / 前端 god component）
- 真实安全行为变更（CORS 解析重写、AUTH_SECRET 生产守卫）
- auth.py 物理拆为 `auth/` 包

把整团 diff 一次性 commit 风险高且无法 bisect。S1 是这条整理工作的第一步，目标：**把"安全 + auth 重构"这条线索从大 diff 中切出，独立落地为可 bisect 的 commit 序列，不触碰其它拆分**。

S1 之后还有 S2（后端剩余拆分收尾）、S3（前端 god component 拆分）、S4（CI 收紧）、S5（测试补强），每个独立走 brainstorm → spec → plan 循环。

## 2. 范围

### 2.1 In-Scope

S1 PR 只触动以下 11 个文件：

| 文件 | 状态 |
|---|---|
| `backend/app/core/auth.py` | 删除 |
| `backend/app/core/auth/__init__.py` | 新增 |
| `backend/app/core/auth/_constants.py` | 新增 |
| `backend/app/core/auth/_oauth.py` | 新增 |
| `backend/app/core/auth/_secrets.py` | 新增 |
| `backend/app/core/auth/_users_tokens.py` | 新增 |
| `tests/unit/test_auth_secret_guard.py` | 新增 |
| `src/settings/api.py` | 修改 |
| `tests/unit/test_cors_settings.py` | 新增 |
| `.env.example` | 修改 |
| `docs/REFACTORING_PLAN.md` | 新增（总览文档，给 PR 描述提供锚点） |

### 2.2 Out-of-Scope（**留在工作树**，等 S2/S3）

```
backend/app/api/v1/endpoints/{analysis,backtest,industry,macro_quality}.py    [删除]
backend/app/api/v1/endpoints/{analysis,backtest,industry,macro_quality}/      [新增目录]
backend/app/core/persistence.py                                                [删除]
backend/app/core/persistence/                                                  [新增目录]
src/data/providers/sina_ths_adapter.py                                         [删除]
src/data/providers/sina_ths_adapter/                                           [新增目录]
frontend/src/components/CrossMarketBacktestPanel.js                            [修改]
frontend/src/components/RealTimePanel.js                                       [修改]
frontend/src/services/api.js                                                   [修改]
frontend/src/services/api/                                                     [新增]
frontend/src/components/{cross-market,realtime}/                               [新增]
frontend/src/setupTests.js                                                     [新增]
tests/conftest.py                                                              [修改]
tests/integration/test_strategy_comparison.py                                  [修改]
tests/unit/test_alt_data_endpoint.py                                           [修改]
tests/unit/test_backtest_endpoint_logging.py                                   [修改]
tests/unit/test_industry_leader_endpoint.py                                    [修改]
.github/workflows/ci.yml                                                       [修改]
.pre-commit-config.yaml                                                        [新增]
pyproject.toml                                                                 [新增]
```

### 2.3 兼容性证明（关键）

`auth/_secrets.py`、`auth/_oauth.py`、`auth/_users_tokens.py` 都依赖：

```python
from backend.app.core.persistence import persistence_manager
```

老 `persistence.py:1287` 行：`persistence_manager = PersistenceManager()`——存在。
新 `persistence/__init__.py` 也 re-export `persistence_manager`——存在。

S1 分支不动 persistence：commit 落地后老 `persistence.py` 仍在文件系统，import 解析正确。**S1 不被迫拖上 persistence 拆分**。

## 3. 方案

### 3.1 选择 · Alpha（4 commit）

```
C0  docs(refactor): add REFACTORING_PLAN.md
C1  refactor(auth): split auth.py into auth/ package (zero behavior change)
C2  feat(auth): enforce AUTH_SECRET in production
C3  feat(cors): environment-aware origin resolution + reject wildcard
```

放弃 Beta（C1+C2 合并）和 Gamma（全合并）的理由：AUTH_SECRET 生产守卫是真正的行为变更，独立 commit 让未来"production 启动失败、报 AUTH_SECRET 错"这类问题可瞬间 bisect 定位。

### 3.2 关键操作 · `_secrets.py` 两步走

**C1 时 `_secrets.py` 必须不含守卫**（行为等价于原 `auth.py:96-97`）：

```python
def _auth_secret() -> bytes:
    return os.getenv("AUTH_SECRET", "dev-only-change-me").encode("utf-8")
```

**C2 时给 `_secrets.py` 加守卫**：

```python
_DEV_AUTH_SECRET_FALLBACK = "dev-only-change-me"
_AUTH_SECRET_WARNED = False

def _auth_secret() -> bytes:
    global _AUTH_SECRET_WARNED
    secret = os.getenv("AUTH_SECRET")
    environment = os.getenv("ENVIRONMENT", "development").strip().lower()

    if not secret:
        if environment in {"production", "prod"}:
            raise RuntimeError(
                "AUTH_SECRET environment variable is required in production but is missing; "
                "refusing to sign JWTs with the development fallback."
            )
        if not _AUTH_SECRET_WARNED:
            logger.warning(
                "AUTH_SECRET is not set; using insecure development fallback. "
                "Set AUTH_SECRET in your environment before deploying."
            )
            _AUTH_SECRET_WARNED = True
        secret = _DEV_AUTH_SECRET_FALLBACK

    return secret.encode("utf-8")
```

实施时：先把工作树中 `_secrets.py` 的守卫移除提交 C1 → 再加回守卫提交 C2。

### 3.3 分支与 Push 策略

```
当前: main (脏工作树, 混合 S1+S2+S3)

# 创建分支前记录 main HEAD（为 5 节回滚预案服务）
git rev-parse HEAD > /tmp/s1-base-sha

git checkout -b s1/security-and-auth   # 保留工作树
执行 C0 → C1 → C2 → C3
本地端到端验证通过 + 用户过审 commit 内容
git push -u origin s1/security-and-auth
```

S2/S3 的工作树改动持续保留在工作树中，等 S1 PR 落地后开 s2/s3 分支处理。

## 4. 验证

### 4.1 每 commit 后窄验证模板

```bash
git status --short                       # 复核 staging
git log --oneline -1                     # 确认 commit 落地
git diff HEAD~1 --stat                   # 看本次 commit 改了哪些文件

git stash push --include-untracked -m "S2/S3 work in progress"
pytest tests/unit/test_<相关>.py -v
git stash pop
```

| Commit | 窄测试目标 |
|---|---|
| C0 | 仅 `git status` 复核（纯文档，无测试） |
| C1 | `pytest tests/unit/test_backend_startup.py tests/unit/test_infrastructure_oauth_async.py -v`（系统启动 + 唯一显式 import auth 的现有单测） |
| C2 | `pytest tests/unit/test_auth_secret_guard.py -v`（4 个新用例 + C1 两个回归再跑一次） |
| C3 | `pytest tests/unit/test_cors_settings.py -v` |

### 4.2 全 S1 完成后端到端验证

```bash
git stash push --include-untracked -m "S2/S3 work in progress"

# 全量后端测试
pytest tests/unit tests/integration --maxfail=10 --timeout=180

# 行为专项检查（三个 Python 一行）
python -c "
import os
os.environ['ENVIRONMENT'] = 'production'
os.environ['AUTH_SECRET'] = ''
from backend.app.core import auth
try:
    auth._auth_secret()
    print('FAIL: should have raised')
except RuntimeError:
    print('OK: production guard raised')
"

python -c "
import os
os.environ['ENVIRONMENT'] = 'production'
os.environ['FRONTEND_URL'] = 'https://app.example.com'
import importlib, src.settings.api as api
importlib.reload(api)
assert api.CORS_ORIGINS == ['https://app.example.com'], api.CORS_ORIGINS
print('OK: prod CORS only contains FRONTEND_URL')
"

python -c "
import os
os.environ['ENVIRONMENT'] = 'development'
os.environ['CORS_ORIGINS'] = '*'
os.environ['FRONTEND_URL'] = 'http://localhost:3100'
import importlib, src.settings.api as api
importlib.reload(api)
assert '*' not in api.CORS_ORIGINS, api.CORS_ORIGINS
print('OK: wildcard rejected')
"

git stash pop
```

### 4.3 Diff 审计

```bash
git diff main..HEAD --stat
```

期望：恰好 11 个文件（2.1 节列出的全部）。如果出现 2.2 节 Out-of-Scope 中的任何文件——**停手，回滚错位的 commit，重新 staging**。

## 5. 回滚预案

| 场景 | 操作 |
|---|---|
| 单 commit 漏 staged 错文件 | `git reset --soft HEAD~1` 重新 staging |
| 整条 S1 链路要重做 | `git reset --hard $(cat /tmp/s1-base-sha)`（3.3 节预先存的 SHA，S2/S3 内容若已 stash 仍在 stash 里） |
| stash pop 冲突 | S1 已提交的文件如果 stash 里也修改了同一行——人工解决：S1 版本通常是"基线"，stash 版本是 S2/S3 的进一步演化，**保留 stash 版本**继续 S2/S3 工作 |

## 6. PR 描述模板

> **Title**: `feat(security): tighten CORS resolver and AUTH_SECRET guard, refactor auth into package`
>
> **Summary**:
> - 把 `backend/app/core/auth.py` (1154 行) 物理拆为 `auth/` 包（_constants / _oauth / _secrets / _users_tokens），通过 `__init__.py` re-export 保持原 import 路径不变
> - 在 `auth/_secrets.py:_auth_secret()` 加生产守卫：`ENVIRONMENT in {production,prod}` 且 `AUTH_SECRET` 未设置时抛 RuntimeError；非生产环境保留 dev fallback 但只警告一次
> - 重写 `src/settings/api.py` 的 CORS 解析：环境推导默认值（生产仅 FRONTEND_URL，dev/test 含 localhost）、支持 `CORS_EXTRA_ORIGINS` 增量、JSON / 逗号双语法、显式拒绝 `*` 通配
> - 加两个回归测试：`test_auth_secret_guard.py`（4 用例）、`test_cors_settings.py`
> - 顺带提交 `docs/REFACTORING_PLAN.md`，给后续 S2/S3 拆分 PR 提供总览
>
> **Commits**:
> - `C0 docs(refactor): add REFACTORING_PLAN.md`
> - `C1 refactor(auth): split auth.py into auth/ package (zero behavior change)`
> - `C2 feat(auth): enforce AUTH_SECRET in production`
> - `C3 feat(cors): environment-aware origin resolution + reject wildcard`
>
> **Test plan**:
> - [ ] `pytest tests/unit tests/integration` 全绿
> - [ ] `pytest tests/unit/test_auth_secret_guard.py` 4 用例通过
> - [ ] `pytest tests/unit/test_cors_settings.py` 通过
> - [ ] 三个 Python 一行行为检查：production guard / production CORS / wildcard rejection
> - [ ] `git diff main..HEAD --stat` 仅列出 11 个 in-scope 文件

## 7. 验收

S1 完成的判据：

- [ ] s1 分支 4 个 commit 落地，顺序为 C0 → C3
- [ ] `git diff main..HEAD --stat` 仅触动第 2.1 节列出的 11 个文件
- [ ] 端到端验证 4.2 节所有命令通过
- [ ] 用户审阅 commit 内容并确认后才 `git push`
- [ ] PR 描述按第 6 节模板填好

S2/S3/S4/S5 是 S1 的后继工作，独立走自己的 brainstorm → spec → plan → 实施循环。

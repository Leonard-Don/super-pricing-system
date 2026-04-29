# S1 Implementation Plan: 把安全硬化与 auth 重构从未提交大 diff 中切出

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `s1/security-and-auth` 分支上，按 4 个 commit（C0–C3）把 CORS 解析重写、auth.py 物理拆分、AUTH_SECRET 生产守卫与两个回归测试从当前混合的 13.7k 行未提交 diff 中独立抽出，工作树中所有 S2/S3 改动保持完整保留。

**Architecture:** 不创建 worktree（用户在主仓直接操作）。利用 git 选择性 staging（每个 commit 只 `git add` spec 列出的特定文件）+ stash 隔离测试方法，在脏工作树中安全提交 4 个 commit 而不混入 S2/S3 工作。每个 commit 之后用 `git stash --include-untracked` 暂存 S2/S3 改动跑窄测试，再 `git stash pop` 还原。

**Tech Stack:** git 2.x（branch / add / stash / commit / log）、pytest（项目已有 `requirements-dev.txt`）、Python 3.13 解释器（用于行为专项检查）。

**关联文件**：
- spec：`docs/superpowers/specs/2026-04-29-s1-security-and-auth-split-design.md`
- 当前 main HEAD：`78ea438`（spec 提交）

---

## File Structure

实施期间将触动的全部文件——分别归属于哪个 commit：

| 文件 | 操作 | Commit |
|---|---|---|
| `docs/REFACTORING_PLAN.md` | 新增 | C0 |
| `backend/app/core/auth.py` | 删除 | C1 |
| `backend/app/core/auth/__init__.py` | 新增 | C1 |
| `backend/app/core/auth/_constants.py` | 新增 | C1 |
| `backend/app/core/auth/_oauth.py` | 新增 | C1 |
| `backend/app/core/auth/_secrets.py` | 新增（简化版本） | C1 |
| `backend/app/core/auth/_users_tokens.py` | 新增 | C1 |
| `backend/app/core/auth/_secrets.py` | 修改（加守卫） | C2 |
| `tests/unit/test_auth_secret_guard.py` | 新增 | C2 |
| `src/settings/api.py` | 修改 | C3 |
| `tests/unit/test_cors_settings.py` | 新增 | C3 |
| `.env.example` | 修改 | C3 |

工作树中保留不动的 S2/S3 文件清单见 spec 第 2.2 节。

---

## Task 0: 预检与分支创建

**Files:**
- Read-only: 工作树状态
- Create: 临时文件 `/tmp/s1-base-sha`

- [ ] **Step 0.1: 复核工作树状态**

Run:
```bash
git status --short | wc -l
git status --short | head -40
git log --oneline -3
```

Expected:
- 36 行未提交改动（`git status --short` 行数）
- HEAD 是 spec commit（`78ea438` 或更新的 SHA，commit message 含 "S1 spec"）
- 工作树包含 `?? backend/app/core/auth/` 等 S1+S2+S3 目录

如果状态不符——停手，让用户确认状态。

- [ ] **Step 0.2: 记录 main 当前 HEAD 用作回滚锚点**

Run:
```bash
git rev-parse HEAD > /tmp/s1-base-sha
cat /tmp/s1-base-sha
```

Expected: 一个 40 位十六进制 SHA。后续所有"整条 S1 链路重做"操作都基于这个 SHA。

- [ ] **Step 0.3: 创建 s1 分支并切换**

Run:
```bash
git checkout -b s1/security-and-auth
git status --short | wc -l
git branch --show-current
```

Expected:
- `Switched to a new branch 's1/security-and-auth'`
- 仍是 36 行未提交（工作树原样保留）
- 当前分支：`s1/security-and-auth`

- [ ] **Step 0.4: 验证关键文件存在于工作树**

Run:
```bash
ls docs/REFACTORING_PLAN.md \
   backend/app/core/auth/__init__.py \
   backend/app/core/auth/_constants.py \
   backend/app/core/auth/_oauth.py \
   backend/app/core/auth/_secrets.py \
   backend/app/core/auth/_users_tokens.py \
   tests/unit/test_auth_secret_guard.py \
   tests/unit/test_cors_settings.py \
   src/settings/api.py \
   .env.example
```

Expected: 所有 10 个文件都列出，无 "No such file or directory"。

注：`backend/app/core/auth.py` 在工作树中应当**不存在**（被删除），`ls backend/app/core/auth.py` 应报错——这是预期的。

---

## Task 1: C0 提交 REFACTORING_PLAN.md

**Files:**
- Add: `docs/REFACTORING_PLAN.md`

- [ ] **Step 1.1: Stage 仅 REFACTORING_PLAN.md**

Run:
```bash
git add docs/REFACTORING_PLAN.md
git diff --cached --name-only
```

Expected: 输出恰好一行 `docs/REFACTORING_PLAN.md`。如果出现其它文件——`git reset HEAD` 然后回到 1.1 重做。

- [ ] **Step 1.2: 复核 staging 与未 staged 区分**

Run:
```bash
git status --short | head -5
git diff --cached --stat
```

Expected:
- `git status --short` 第一行是 `A  docs/REFACTORING_PLAN.md`（首列 A 表示新增已 staged）
- 后续行首列是空格 + 第二列 M/D/??（未 staged）
- `git diff --cached --stat` 只列 1 个文件、约 200 行新增

- [ ] **Step 1.3: 写 commit message 到临时文件**

```bash
cat > /tmp/s1_c0_msg.txt <<'TXT'
docs(refactor): add REFACTORING_PLAN.md

Adds the splitting roadmap for the 10 files that exceeded 1500 lines as
of v4.1.0. Lists priority, target structure, splitting strategy, and
acceptance criteria per file. Used as the umbrella reference for the
upcoming S1/S2/S3/S4/S5 PR series.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
TXT
```

- [ ] **Step 1.4: Commit C0**

Run:
```bash
git commit -F /tmp/s1_c0_msg.txt
rm /tmp/s1_c0_msg.txt
git log -1 --pretty=oneline
git show --stat HEAD | tail -3
```

Expected:
- `[s1/security-and-auth <sha>] docs(refactor): add REFACTORING_PLAN.md`
- `1 file changed, ~204 insertions(+)`

如果输出超过 1 个文件 / 数百行以外的体量——立即 `git reset HEAD~1` 回到 1.1 重做。

- [ ] **Step 1.5: 验证工作树仍含 S1+S2+S3 待提交**

Run:
```bash
git status --short | wc -l
```

Expected: 35 行（原 36 行 - 1 行已被 C0 吃掉）。如果数字不对——停手检查。

---

## Task 2: C1 提交 auth.py 拆分（行为零变更）

**Files:**
- Delete: `backend/app/core/auth.py`
- Create: `backend/app/core/auth/__init__.py`
- Create: `backend/app/core/auth/_constants.py`
- Create: `backend/app/core/auth/_oauth.py`
- Create: `backend/app/core/auth/_secrets.py`（**简化版**，先去掉守卫逻辑）
- Create: `backend/app/core/auth/_users_tokens.py`

C1 的核心约束：**`_secrets.py` 必须不含生产守卫**，行为完全等价于原 `auth.py:96-97` 的单行实现。

- [ ] **Step 2.1: 临时移除 `_secrets.py` 中的守卫逻辑**

完整覆盖写入 `backend/app/core/auth/_secrets.py`。这一步用 Edit/Write 工具，**不是** Bash heredoc。

把 `backend/app/core/auth/_secrets.py` 完整替换为：

```python
"""auth 包内的加密 / 密码 / token 编解码 / env helpers / policy loader。

无状态工具或简单的 module-level state。
所有上层模块（``_users_tokens``、``_oauth``）通过此模块访问 JWT 密钥与密码哈希。
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
from typing import Any, Dict, List, Optional

from backend.app.core.persistence import persistence_manager

from ._constants import AUTH_POLICY_RECORD_TYPE

logger = logging.getLogger(__name__)


def _b64url_encode(payload: bytes) -> str:
    return base64.urlsafe_b64encode(payload).rstrip(b"=").decode("ascii")


def _b64url_decode(payload: str) -> bytes:
    padding = "=" * (-len(payload) % 4)
    return base64.urlsafe_b64decode((payload + padding).encode("ascii"))


def _auth_secret() -> bytes:
    return os.getenv("AUTH_SECRET", "dev-only-change-me").encode("utf-8")


def _env_auth_required() -> bool:
    return os.getenv("AUTH_REQUIRED", "false").lower() == "true"


def _hash_password(password: str, iterations: int = 200_000) -> str:
    if not password:
        raise ValueError("password is required")
    salt = os.urandom(16).hex()
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), iterations).hex()
    return f"pbkdf2_sha256${iterations}${salt}${digest}"


def _verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt, expected = str(encoded or "").split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            str(password or "").encode("utf-8"),
            bytes.fromhex(salt),
            int(iterations),
        ).hex()
        return hmac.compare_digest(digest, expected)
    except (ValueError, TypeError) as exc:
        # 仅吃掉"凭据格式错误"这一类预期异常；其余真正的 bug 不应被静默。
        logger.debug(
            "Password verification rejected due to malformed credential payload: %s", exc
        )
        return False


def _load_policy() -> Dict[str, Any]:
    records = persistence_manager.list_records(record_type=AUTH_POLICY_RECORD_TYPE, limit=1)
    payload = (records[0].get("payload") or {}) if records else {}
    required = bool(payload.get("required", _env_auth_required()))
    return {
        "required": required,
        "mode": "local_jwt",
        "updated_at": payload.get("updated_at") or (records[0].get("updated_at") if records else None),
        "updated_by": payload.get("updated_by"),
        "note": (
            "Authentication is required for protected API calls"
            if required
            else "Authentication is optional; anonymous research access is allowed"
        ),
    }


def _hash_token(token: str) -> str:
    return hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()


def _default_access_ttl() -> int:
    return max(300, min(int(os.getenv("AUTH_ACCESS_TOKEN_TTL", "86400")), 60 * 60 * 24 * 30))


def _default_refresh_ttl() -> int:
    return max(3600, min(int(os.getenv("AUTH_REFRESH_TOKEN_TTL", str(60 * 60 * 24 * 30))), 60 * 60 * 24 * 180))


def _normalize_scope_items(scopes: Optional[List[str] | str]) -> List[str]:
    if isinstance(scopes, str):
        raw_items = scopes.replace(",", " ").split()
    else:
        raw_items = list(scopes or [])
    return [str(item).strip() for item in raw_items if str(item).strip()]


def _env_flag(name: str, default: bool = True) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() not in {"0", "false", "no", "off", ""}
```

注：相对于工作树原版，删除了三处：
1. `_DEV_AUTH_SECRET_FALLBACK = "dev-only-change-me"` 模块常量
2. `_AUTH_SECRET_WARNED = False` once-flag
3. `_auth_secret()` 函数体内的 production / dev-warning 分支逻辑（重写为 1 行 return）

`_auth_secret()` 上方的 docstring 也一并删除（保持原 `auth.py` 风格——原版没有 docstring）。

- [ ] **Step 2.2: 验证 `_secrets.py` 行数缩小**

Run:
```bash
wc -l backend/app/core/auth/_secrets.py
grep -c "_DEV_AUTH_SECRET_FALLBACK\|_AUTH_SECRET_WARNED\|RuntimeError" backend/app/core/auth/_secrets.py
```

Expected:
- `wc -l` 输出 ~110 行（从原 137 减下来约 25 行）
- grep 输出 `0`（这三个标记字符串都不出现）

- [ ] **Step 2.3: Stage C1 的 5 个新增 + 1 个删除**

Run:
```bash
git add backend/app/core/auth/__init__.py
git add backend/app/core/auth/_constants.py
git add backend/app/core/auth/_oauth.py
git add backend/app/core/auth/_secrets.py
git add backend/app/core/auth/_users_tokens.py
git rm backend/app/core/auth.py
git diff --cached --name-only
git diff --cached --name-status
```

Expected `git diff --cached --name-status` 输出（顺序可能不同）：
```
D  backend/app/core/auth.py
A  backend/app/core/auth/__init__.py
A  backend/app/core/auth/_constants.py
A  backend/app/core/auth/_oauth.py
A  backend/app/core/auth/_secrets.py
A  backend/app/core/auth/_users_tokens.py
```

如果输出含 `auth/` 之外的任何路径——`git reset HEAD` 然后回到 2.3 重新精确 add。

- [ ] **Step 2.4: 复核 staging 不含 S2/S3 文件**

Run:
```bash
git diff --cached --name-only | grep -v "^backend/app/core/auth" && echo "OOPS" || echo "OK: only auth/ paths"
```

Expected: `OK: only auth/ paths`。如果输出 `OOPS`——立即 `git reset HEAD` 重做。

- [ ] **Step 2.5: 写 commit message**

```bash
cat > /tmp/s1_c1_msg.txt <<'TXT'
refactor(auth): split auth.py into auth/ package (zero behavior change)

Physically reorganizes the 1154-line auth.py into a package with four
sub-modules behind a re-exporting __init__.py. No behavior changes:
_auth_secret() still returns the dev fallback when AUTH_SECRET is unset
in any environment (production guard arrives in the next commit).

Sub-modules:
- _constants.py        Module-level enums and policy keys
- _secrets.py          base64url codec, password hash/verify, JWT secret,
                       env flag helpers, policy loader
- _oauth.py            OAuth state machinery (688 lines)
- _users_tokens.py     User/token CRUD on top of persistence_manager

Compatibility: every external caller imported from
``backend.app.core.auth``; the new __init__.py re-exports all 17 public
helpers from the sub-modules so existing imports continue to resolve
without modification. Verified by grepping the working-tree callers
(test_infrastructure_oauth_async, backend startup wiring, etc.).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
TXT
```

- [ ] **Step 2.6: Commit C1**

Run:
```bash
git commit -F /tmp/s1_c1_msg.txt
rm /tmp/s1_c1_msg.txt
git log -1 --pretty=oneline
git show --stat HEAD | tail -10
```

Expected:
- 6 files changed (1 deleted + 5 created)
- 总行数：约 1500 新增 / 1154 删除（auth.py 原始 - 5 个新文件总和约 1500）

如果出现 6 个以外的文件——立即 `git reset HEAD~1` 回到 2.3 重做。

- [ ] **Step 2.7: 窄测试 C1（stash + pytest + pop）**

Run:
```bash
git stash push --include-untracked -m "S2/S3 work in progress (during C1 verify)"
git status --short | wc -l
```

Expected: 0（工作树已被 stash 清空）。

Run:
```bash
pytest tests/unit/test_backend_startup.py tests/unit/test_infrastructure_oauth_async.py -v
```

Expected: 全部测试 PASS。如果失败——停手检查 import 链路（最常见原因：`auth/__init__.py` 漏 re-export 某个符号）。

Run:
```bash
git stash pop
git status --short | wc -l
```

Expected: 30 行未提交改动（35 - 5 个被 C1 吃掉的 auth 文件）。

注：`git stash pop` 偶尔报"untracked file would be overwritten"——通常是被 stash 的 untracked 文件路径被 commit 抢先创建。处理：先 `git stash apply --3way`，再人工解决。

---

## Task 3: C2 提交 AUTH_SECRET 生产守卫

**Files:**
- Modify: `backend/app/core/auth/_secrets.py`（加回守卫逻辑）
- Create: `tests/unit/test_auth_secret_guard.py`

- [ ] **Step 3.1: 给 `_secrets.py` 加回守卫**

用 Edit 工具修改 `backend/app/core/auth/_secrets.py`：

把
```python
def _auth_secret() -> bytes:
    return os.getenv("AUTH_SECRET", "dev-only-change-me").encode("utf-8")
```

替换为：
```python
_DEV_AUTH_SECRET_FALLBACK = "dev-only-change-me"
_AUTH_SECRET_WARNED = False


def _auth_secret() -> bytes:
    """返回 JWT 签名密钥。

    - 生产环境（``ENVIRONMENT in {production, prod}``）下若未配置 ``AUTH_SECRET``，直接抛错避免用弱密钥签 token。
    - 非生产环境若用到默认占位密钥，进程内只警告一次，避免日志噪音。
    """
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

新行数应回升到 ~137 行。

- [ ] **Step 3.2: 验证 `_secrets.py` 现在含守卫**

Run:
```bash
wc -l backend/app/core/auth/_secrets.py
grep -c "_DEV_AUTH_SECRET_FALLBACK\|_AUTH_SECRET_WARNED\|RuntimeError" backend/app/core/auth/_secrets.py
```

Expected:
- `wc -l` 输出 ~137 行
- grep 输出 `4` 或 `5`（这三个标记字符串总共出现 4-5 次）

- [ ] **Step 3.3: Stage `_secrets.py` 修改 + 测试新增**

Run:
```bash
git add backend/app/core/auth/_secrets.py
git add tests/unit/test_auth_secret_guard.py
git diff --cached --name-status
```

Expected：
```
M  backend/app/core/auth/_secrets.py
A  tests/unit/test_auth_secret_guard.py
```

- [ ] **Step 3.4: 复核 staging 没扫到其它**

Run:
```bash
git diff --cached --name-only | grep -vE "^(backend/app/core/auth/_secrets\.py|tests/unit/test_auth_secret_guard\.py)$" && echo "OOPS" || echo "OK"
```

Expected: `OK`。

- [ ] **Step 3.5: 写 commit message**

```bash
cat > /tmp/s1_c2_msg.txt <<'TXT'
feat(auth): enforce AUTH_SECRET in production

Hardens _auth_secret() to refuse signing JWTs with the published dev
fallback when running in production:

- Raises RuntimeError if ENVIRONMENT in {production, prod} and
  AUTH_SECRET is empty/unset, rather than quietly using the dev fallback
  (an attacker who knows the fallback could mint arbitrary tokens).
- Outside production, retains the dev fallback but emits a one-time
  warning per process via a module-level _AUTH_SECRET_WARNED latch
  (avoids log spam without losing the visibility that fallback is in
  use).

Adds tests/unit/test_auth_secret_guard.py covering: production raises,
"prod" alias raises, production with secret returns bytes, development
falls back with exactly one warning.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
TXT
```

- [ ] **Step 3.6: Commit C2**

Run:
```bash
git commit -F /tmp/s1_c2_msg.txt
rm /tmp/s1_c2_msg.txt
git log -1 --pretty=oneline
git show --stat HEAD | tail -5
```

Expected: 2 files changed (1 modified + 1 created)，约 100-120 行净新增。

- [ ] **Step 3.7: 窄测试 C2**

Run:
```bash
git stash push --include-untracked -m "S2/S3 work in progress (during C2 verify)"
pytest tests/unit/test_auth_secret_guard.py -v
```

Expected: 4 个测试全部 PASS：
- `test_production_without_secret_raises`
- `test_production_alias_prod_also_enforces`
- `test_production_with_secret_returns_bytes`
- `test_development_falls_back_with_warning`

Run:
```bash
git stash pop
git status --short | wc -l
```

Expected: 28 行未提交改动（30 - 2 个被 C2 吃掉的文件）。

---

## Task 4: C3 提交 CORS 解析器重写

**Files:**
- Modify: `src/settings/api.py`
- Create: `tests/unit/test_cors_settings.py`
- Modify: `.env.example`

- [ ] **Step 4.1: Stage 三个 CORS 文件**

Run:
```bash
git add src/settings/api.py
git add tests/unit/test_cors_settings.py
git add .env.example
git diff --cached --name-status
```

Expected：
```
M  .env.example
M  src/settings/api.py
A  tests/unit/test_cors_settings.py
```

- [ ] **Step 4.2: 复核 staging 不含其它**

Run:
```bash
git diff --cached --name-only | grep -vE "^(\.env\.example|src/settings/api\.py|tests/unit/test_cors_settings\.py)$" && echo "OOPS" || echo "OK"
```

Expected: `OK`。

- [ ] **Step 4.3: 写 commit message**

```bash
cat > /tmp/s1_c3_msg.txt <<'TXT'
feat(cors): environment-aware origin resolution + reject wildcard

Replaces the hard-coded localhost CORS list with an environment-aware
resolver in src/settings/api.py:

- Default origins are derived from ENVIRONMENT: production returns only
  FRONTEND_URL; development/test/staging additionally allow common
  localhost variants for the React dev server.
- CORS_ORIGINS env override accepts both JSON arrays and comma-separated
  strings, fully replacing the default whitelist when set.
- CORS_EXTRA_ORIGINS appends to the resolved list in either mode (handy
  for staging or progressive prod rollouts).
- The wildcard "*" is now actively rejected because it is incompatible
  with allow_credentials=True per the CORS spec — silently dropping it
  prevents accidental misconfiguration.
- Empty resolution emits a warning (the API would otherwise reject all
  browser origins).

Adds tests/unit/test_cors_settings.py and updates .env.example to
document the new resolution order.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
TXT
```

- [ ] **Step 4.4: Commit C3**

Run:
```bash
git commit -F /tmp/s1_c3_msg.txt
rm /tmp/s1_c3_msg.txt
git log -1 --pretty=oneline
git show --stat HEAD | tail -5
```

Expected: 3 files changed，约 230 行新增 / 5 行删除。

- [ ] **Step 4.5: 窄测试 C3**

Run:
```bash
git stash push --include-untracked -m "S2/S3 work in progress (during C3 verify)"
pytest tests/unit/test_cors_settings.py -v
```

Expected: 全部 CORS 测试 PASS。

Run:
```bash
git stash pop
git status --short | wc -l
```

Expected: 25 行未提交改动（28 - 3 个被 C3 吃掉的文件）。

---

## Task 5: 端到端验证

**Files:** 不修改任何文件，仅验证。

- [ ] **Step 5.1: 复核 4 个 commit 的 diff 形态**

Run:
```bash
BASE_SHA=$(cat /tmp/s1-base-sha)
git log --oneline ${BASE_SHA}..HEAD
git diff ${BASE_SHA}..HEAD --stat
```

Expected：
- 4 行 commit log，依次为 C0/C1/C2/C3
- diff stat 恰好 11 个文件（按 spec 第 2.1 节）

- [ ] **Step 5.2: 复核没有 S2/S3 文件混入**

Run:
```bash
BASE_SHA=$(cat /tmp/s1-base-sha)
git diff ${BASE_SHA}..HEAD --name-only > /tmp/s1_files.txt
cat /tmp/s1_files.txt
echo "---"
grep -vE "^(\.env\.example|backend/app/core/auth\.py|backend/app/core/auth/.*|docs/REFACTORING_PLAN\.md|src/settings/api\.py|tests/unit/test_auth_secret_guard\.py|tests/unit/test_cors_settings\.py)$" /tmp/s1_files.txt && echo "OOPS: out-of-scope files in S1" || echo "OK: only S1 files"
```

注：spec commit (`docs/superpowers/specs/2026-04-29-s1-security-and-auth-split-design.md`) 已经在 BASE_SHA 中，所以 `${BASE_SHA}..HEAD` 范围不包含它，白名单不需要列。

Expected: `OK: only S1 files`。

- [ ] **Step 5.3: 全量后端测试（在干净工作树上）**

Run:
```bash
git stash push --include-untracked -m "S2/S3 work in progress (during E2E verify)"
git status --short | wc -l
```

Expected: 0。

Run:
```bash
pytest tests/unit tests/integration --maxfail=10 --timeout=180 2>&1 | tail -30
```

Expected: pytest 退出码 0；最后一行形如 `==== N passed in M.MMs ====`（N 应等于 BASE_SHA 时全量测试数 + 8 个新加的 auth_secret_guard / cors_settings 用例）。

如果有失败——多半是某个之前隐式依赖 `backend.app.core.auth` 内部细节的测试（如直接访问 `auth._SOMETHING_PRIVATE`），需检查 `auth/__init__.py` 是否漏 re-export 那个符号。汇报失败的测试名后停手让用户决策。

- [ ] **Step 5.4: 三项行为专项检查**

Run（生产 AUTH_SECRET 缺失抛错）:
```bash
python -c "
import os, importlib
os.environ['ENVIRONMENT'] = 'production'
os.environ['AUTH_SECRET'] = ''
from backend.app.core import auth
importlib.reload(auth)
try:
    auth._auth_secret()
    print('FAIL: should have raised')
except RuntimeError as e:
    print('OK: production guard raised:', str(e)[:60])
"
```

Expected: `OK: production guard raised: AUTH_SECRET environment variable is required in produc...`

Run（生产 CORS 仅 FRONTEND_URL）:
```bash
python -c "
import os, importlib
os.environ['ENVIRONMENT'] = 'production'
os.environ['FRONTEND_URL'] = 'https://app.example.com'
os.environ['CORS_ORIGINS'] = ''
os.environ['CORS_EXTRA_ORIGINS'] = ''
import src.settings.api as api
importlib.reload(api)
print('Production CORS:', api.CORS_ORIGINS)
assert api.CORS_ORIGINS == ['https://app.example.com'], api.CORS_ORIGINS
print('OK')
"
```

Expected:
```
Production CORS: ['https://app.example.com']
OK
```

Run（CORS wildcard 被拒绝）:
```bash
python -c "
import os, importlib
os.environ['ENVIRONMENT'] = 'development'
os.environ['CORS_ORIGINS'] = '*'
os.environ['FRONTEND_URL'] = 'http://localhost:3100'
os.environ['CORS_EXTRA_ORIGINS'] = ''
import src.settings.api as api
importlib.reload(api)
print('CORS:', api.CORS_ORIGINS)
assert '*' not in api.CORS_ORIGINS, api.CORS_ORIGINS
print('OK: wildcard rejected')
"
```

Expected:
```
CORS: []
OK: wildcard rejected
```

注：当 CORS_ORIGINS=`*` 时，解析器会拒绝唯一 origin 导致空列表。是预期行为（用户应当配置具体 origin）。

- [ ] **Step 5.5: 还原工作树**

Run:
```bash
git stash pop
git status --short | wc -l
```

Expected: 25 行未提交改动（S2/S3 工作树已还原）。

如果 stash pop 报冲突——优先保留 stash 版本（更新），手动解决后 `git stash drop`。

---

## Task 6: PR 准备与 push 决策

**Files:** 不修改任何文件。

- [ ] **Step 6.1: 写 PR description 草稿到本地文件**

Run:
```bash
cat > /tmp/s1_pr_body.md <<'TXT'
## Summary

把当前 13.7k 行未提交大 diff 中的"安全 + auth 重构"线索独立切出，形成 4 个可 bisect 的 commit。剩余拆分（industry / persistence / sina_ths_adapter / 前端 god component）留给后续 S2/S3 PR。

- 把 `backend/app/core/auth.py` (1154 行) 物理拆为 `auth/` 包（_constants / _oauth / _secrets / _users_tokens），通过 `__init__.py` re-export 保持原 import 路径不变
- 在 `auth/_secrets.py:_auth_secret()` 加生产守卫：`ENVIRONMENT in {production,prod}` 且 `AUTH_SECRET` 未设置时抛 RuntimeError；非生产环境保留 dev fallback 但只警告一次
- 重写 `src/settings/api.py` 的 CORS 解析：环境推导默认值（生产仅 FRONTEND_URL，dev/test 含 localhost）、支持 `CORS_EXTRA_ORIGINS` 增量、JSON / 逗号双语法、显式拒绝 `*` 通配
- 加两个回归测试：`test_auth_secret_guard.py`（4 用例）、`test_cors_settings.py`
- 顺带提交 `docs/REFACTORING_PLAN.md`，给后续 S2/S3 拆分 PR 提供总览

## Commits

- C0 `docs(refactor): add REFACTORING_PLAN.md`
- C1 `refactor(auth): split auth.py into auth/ package (zero behavior change)`
- C2 `feat(auth): enforce AUTH_SECRET in production`
- C3 `feat(cors): environment-aware origin resolution + reject wildcard`

## Test plan

- [x] `pytest tests/unit tests/integration` 全绿
- [x] `pytest tests/unit/test_auth_secret_guard.py` 4 用例通过
- [x] `pytest tests/unit/test_cors_settings.py` 通过
- [x] 三项 Python 一行行为检查（production guard / production CORS / wildcard rejection）
- [x] `git diff main..HEAD --stat` 仅列出 11 个 in-scope 文件

🤖 Generated with [Claude Code](https://claude.com/claude-code)
TXT
echo "PR body written to /tmp/s1_pr_body.md"
wc -l /tmp/s1_pr_body.md
```

- [ ] **Step 6.2: 让用户审 commit 内容**

呈现给用户：

```bash
BASE_SHA=$(cat /tmp/s1-base-sha)
git log ${BASE_SHA}..HEAD --oneline
echo "---"
git diff ${BASE_SHA}..HEAD --stat
echo "---"
echo "PR body 草稿见 /tmp/s1_pr_body.md"
```

**HALT 给用户决策**：
1. ✅ commit 内容 OK，可以 push 到 origin
2. 🔧 需要修订某个 commit message
3. 🔧 需要重做某个 commit
4. ⏸️ 先暂停

仅在用户回 1 时进入下一步。

- [ ] **Step 6.3: Push s1 分支（仅在用户授权后）**

Run:
```bash
git push -u origin s1/security-and-auth
```

Expected: `branch 's1/security-and-auth' set up to track 'origin/s1/security-and-auth' from 'origin'.`

如果远端无 origin 配置 / 推送失败——汇报给用户由其手动处理。

- [ ] **Step 6.4: （可选）开 PR**

仅在用户明确要求时执行。否则 PR 创建留给用户在 GitHub 手动操作（spec 第 6 节有标题 / body 模板）。

如果用户明确要求：

```bash
gh pr create \
  --base main \
  --head s1/security-and-auth \
  --title "feat(security): tighten CORS resolver and AUTH_SECRET guard, refactor auth into package" \
  --body-file /tmp/s1_pr_body.md
rm /tmp/s1_pr_body.md
```

---

## Task 7: 收尾与清理

**Files:** 不修改任何文件。

- [ ] **Step 7.1: 验证回到 main 仍能正常切换并保留工作树**

Run:
```bash
git status --short | wc -l
git stash list  # 应为空
```

Expected: 25 行未提交改动（S2/S3）；stash list 空（之前的 push/pop 都成对）。

注：**不要**切回 main 分支——S2/S3 工作仍依赖于当前 s1 分支的工作树状态。等 S1 PR 落地（merge）之后再 `git checkout main && git pull && git checkout -b s2/<name>` 开 S2 分支。

- [ ] **Step 7.2: 清理临时文件**

Run:
```bash
rm -f /tmp/s1-base-sha /tmp/s1_pr_body.md /tmp/s1_files.txt
echo "OK"
```

Expected: `OK`，且 `ls /tmp/s1*` 应全部 No such file。

- [ ] **Step 7.3: 在对话里汇总给用户**

呈现：
- 4 个 commit 的 SHA + message
- 工作树 25 行未提交（保留 S2/S3）
- 远端分支：`origin/s1/security-and-auth`（如果 push 完成）
- 下一步建议：S2 brainstorm（后端剩余拆分收尾）/ S3 brainstorm（前端 god component）/ 两者并行

S1 完成的判据（spec 第 7 节）：
- [x] s1 分支 4 个 commit 落地，顺序为 C0 → C3
- [x] `git diff <BASE_SHA>..HEAD --stat` 仅触动 spec 列出的 11 个文件
- [x] 端到端验证 Task 5 所有命令通过
- [x] 用户审阅 commit 内容并确认后才 push
- [x] PR 描述按 spec 第 6 节模板填好

---

## 整体回滚预案（任何时刻可调用）

| 场景 | 操作 |
|---|---|
| 单 commit 漏 staged 错文件 | `git reset --soft HEAD~1`，`git reset HEAD <错位文件>`，重新 staging |
| 整条 S1 链路要重做 | `git reset --hard $(cat /tmp/s1-base-sha)`，工作树会恢复到 spec commit 时的状态。S2/S3 内容若已 stash 仍在 stash list 里。 |
| stash pop 冲突 | 优先保留 stash 版本（更新）；冲突常见于 S1 已提交但 stash 也修改的文件——人工解决 |
| 不慎切到 main 丢 s1 | 分支已 push（Task 6.3 之后）则 `git checkout -b s1/security-and-auth origin/s1/security-and-auth`；否则 S1 提交的 SHA 仍在 reflog（`git reflog`），24 小时内可恢复 |

---

**末态**：S1 PR 待 merge；S2/S3 工作以未提交形式继续保留在工作树；用户后续以 S1 为模板独立 brainstorm S2/S3。

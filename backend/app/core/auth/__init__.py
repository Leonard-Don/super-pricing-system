"""``backend.app.core.auth`` 包入口。

把原 1154 行单文件 ``auth.py`` 拆为 4 个内部模块：
- ``_constants.py``  — RECORD_TYPE / TOKEN_TYPE 字符串、OAuth provider preset / env 映射、oauth2_scheme_optional
- ``_secrets.py``    — 加密、密码哈希、JWT 密钥、env helpers、policy loader
- ``_users_tokens.py`` — 本地用户 / refresh session / JWT 创建-验证-刷新
- ``_oauth.py``      — OAuth provider 配置 + state + 授权流 + 当前用户依赖

兼容性约束：
- ``backend.app.api.v1.endpoints.infrastructure`` 通过
  ``from backend.app.core.auth import (authenticate_local_user, ...)`` 直接导入 17 个函数
- ``tests/unit/test_auth_secret_guard.py`` 用 ``from backend.app.core import auth`` +
  ``importlib.reload(auth)`` 测试 ``_auth_secret`` / ``_AUTH_SECRET_WARNED`` /
  ``_verify_password`` / ``hashlib`` patch

本 ``__init__`` re-export 所有公共与测试可见符号。
"""

# Constants & FastAPI dependency singletons
from ._constants import (
    ACCESS_TOKEN_TYPE,
    AUTH_OAUTH_PROVIDER_RECORD_TYPE,
    AUTH_OAUTH_STATE_RECORD_TYPE,
    AUTH_POLICY_RECORD_TYPE,
    AUTH_REFRESH_RECORD_TYPE,
    AUTH_USER_RECORD_TYPE,
    ENV_OAUTH_PROVIDER_MAPPINGS,
    OAUTH_PROVIDER_PRESETS,
    REFRESH_TOKEN_TYPE,
    oauth2_scheme_optional,
)

# 加密 / 密码 / env helpers
from ._secrets import (
    _AUTH_SECRET_WARNED,
    _DEV_AUTH_SECRET_FALLBACK,
    _auth_secret,
    _b64url_decode,
    _b64url_encode,
    _default_access_ttl,
    _default_refresh_ttl,
    _env_auth_required,
    _env_flag,
    _hash_password,
    _hash_token,
    _load_policy,
    _normalize_scope_items,
    _verify_password,
)

# 用户 / token / policy
from ._users_tokens import (
    _find_refresh_session,
    _find_user_record,
    _persist_refresh_session,
    _sanitize_refresh_session,
    _sanitize_user,
    auth_status,
    authenticate_local_user,
    create_access_token,
    create_refresh_token,
    get_auth_policy,
    list_local_users,
    list_refresh_sessions,
    refresh_access_token,
    revoke_refresh_session,
    update_auth_policy,
    upsert_local_user,
    verify_access_token,
)

# OAuth provider + flow + dependency
from ._oauth import (
    _backend_public_base_url,
    _env_oauth_provider_specs,
    _fetch_oauth_userinfo,
    _find_linked_oauth_user,
    _find_oauth_provider_record,
    _find_oauth_state_record,
    _frontend_public_origin,
    _issue_token_bundle,
    _mark_oauth_state_used,
    _oauth_provider_preset,
    _persist_oauth_state,
    _pkce_challenge,
    _resolve_oauth_user_identity,
    _sanitize_oauth_provider,
    _upsert_oauth_user,
    begin_oauth_authorization,
    diagnose_oauth_provider,
    exchange_oauth_authorization_code,
    get_current_user_optional,
    list_oauth_providers,
    sync_env_oauth_providers,
    upsert_oauth_provider,
)


# 测试通过 ``auth.hashlib.pbkdf2_hmac`` patch hashlib 来验证 _verify_password
# 不会吞噬 RuntimeError——拆分后保持 ``hashlib`` 在 auth namespace 可见。
import hashlib  # noqa: F401, E402  (re-exported for test monkeypatch)

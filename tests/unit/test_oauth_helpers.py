"""Characterization tests for backend/app/core/auth/_oauth.py 的纯辅助函数。

锁定：
- _oauth_provider_preset / _pkce_challenge / _backend_public_base_url /
  _frontend_public_origin / _resolve_oauth_user_identity / _sanitize_oauth_provider
- begin_oauth_authorization 的安全相关行为（state、PKCE、redirect_uri 校验）
- diagnose_oauth_provider 的 findings 触发条件
- upsert_oauth_provider 的入参校验

这些是 OAuth 授权流的安全关键点。这里通过 monkeypatch persistence_manager 隔离
持久层，专注分析逻辑分支。
"""

from __future__ import annotations

import base64
import hashlib
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from backend.app.core.auth import _oauth as oauth_mod


# ---------- _oauth_provider_preset ----------


def test_preset_returns_known_provider_dict():
    out = oauth_mod._oauth_provider_preset("github")
    # 已知 preset 必含 auth_url / token_url / userinfo_url
    assert "auth_url" in out
    assert "token_url" in out
    assert "userinfo_url" in out


def test_preset_unknown_returns_empty_dict():
    assert oauth_mod._oauth_provider_preset("nonexistent_xx") == {}


def test_preset_handles_none_and_whitespace():
    assert oauth_mod._oauth_provider_preset(None) == oauth_mod._oauth_provider_preset("generic")
    # 大小写 / 空白都规范化
    assert oauth_mod._oauth_provider_preset("  GITHUB  ") == oauth_mod._oauth_provider_preset("github")


# ---------- _pkce_challenge ----------


def test_pkce_challenge_is_sha256_base64url():
    verifier = "test_verifier_12345"
    expected = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("utf-8")).digest()).rstrip(b"=").decode("utf-8")
    assert oauth_mod._pkce_challenge(verifier) == expected


def test_pkce_challenge_handles_empty():
    # 空字符串也能产出合法 challenge（base64url 形式 sha256("")）
    out = oauth_mod._pkce_challenge("")
    assert isinstance(out, str)
    assert "=" not in out  # urlsafe b64 已 strip padding


def test_pkce_challenge_handles_none():
    out = oauth_mod._pkce_challenge(None)
    assert isinstance(out, str)


def test_pkce_challenge_is_deterministic():
    a = oauth_mod._pkce_challenge("v1")
    b = oauth_mod._pkce_challenge("v1")
    assert a == b


# ---------- _backend_public_base_url / _frontend_public_origin ----------


def test_backend_public_base_url_strips_trailing_slash(monkeypatch):
    monkeypatch.setenv("BACKEND_PUBLIC_URL", "https://api.example.com/")
    assert oauth_mod._backend_public_base_url() == "https://api.example.com"


def test_backend_public_base_url_falls_back_to_localhost(monkeypatch):
    monkeypatch.delenv("BACKEND_PUBLIC_URL", raising=False)
    monkeypatch.delenv("AUTH_PUBLIC_BASE_URL", raising=False)
    assert oauth_mod._backend_public_base_url() == "http://127.0.0.1:8100"


def test_backend_public_base_url_uses_auth_var_fallback(monkeypatch):
    monkeypatch.delenv("BACKEND_PUBLIC_URL", raising=False)
    monkeypatch.setenv("AUTH_PUBLIC_BASE_URL", "https://auth.example.com")
    assert oauth_mod._backend_public_base_url() == "https://auth.example.com"


def test_frontend_public_origin_default(monkeypatch):
    monkeypatch.delenv("FRONTEND_ORIGIN", raising=False)
    assert oauth_mod._frontend_public_origin() == "http://127.0.0.1:3100"


def test_frontend_public_origin_strips_trailing_slash(monkeypatch):
    monkeypatch.setenv("FRONTEND_ORIGIN", "https://app.example.com/")
    assert oauth_mod._frontend_public_origin() == "https://app.example.com"


# ---------- _resolve_oauth_user_identity ----------


def test_resolve_user_identity_uses_provider_field_keys():
    provider = {"subject_field": "login", "display_name_field": "name", "email_field": "email"}
    userinfo = {"login": "octocat", "name": "Octo Cat", "email": "Octo@Example.COM"}
    out = oauth_mod._resolve_oauth_user_identity(provider, userinfo)
    assert out["subject"] == "octocat"
    assert out["display_name"] == "Octo Cat"
    assert out["email"] == "octo@example.com"  # email lowercased


def test_resolve_user_identity_falls_back_to_sub_id_chain():
    # provider 不指定 subject_field 时，按 sub → id 链路降级
    provider: dict = {}
    userinfo = {"id": "12345", "email": "x@y.test"}
    out = oauth_mod._resolve_oauth_user_identity(provider, userinfo)
    assert out["subject"] == "12345"


def test_resolve_user_identity_raises_when_subject_missing():
    provider = {"subject_field": "login"}
    userinfo = {"name": "Anon"}  # no login / sub / id
    with pytest.raises(HTTPException) as ei:
        oauth_mod._resolve_oauth_user_identity(provider, userinfo)
    assert ei.value.status_code == 502


def test_resolve_user_identity_email_optional():
    provider = {"subject_field": "sub"}
    userinfo = {"sub": "abc123"}
    out = oauth_mod._resolve_oauth_user_identity(provider, userinfo)
    assert out["email"] is None
    assert out["subject"] == "abc123"
    # display_name 在缺失时退回 subject
    assert out["display_name"] == "abc123"


def test_resolve_user_identity_display_name_chain():
    # display_name 缺失时按 name → login → email → subject 降级
    provider = {"subject_field": "sub"}
    userinfo = {"sub": "u1", "login": "octo"}
    out = oauth_mod._resolve_oauth_user_identity(provider, userinfo)
    assert out["display_name"] == "octo"


# ---------- _sanitize_oauth_provider ----------


def test_sanitize_provider_redacts_client_secret():
    record = {
        "id": "rec1",
        "record_key": "github",
        "payload": {
            "provider_id": "github",
            "label": "GitHub",
            "provider_type": "github",
            "client_id": "abc",
            "client_secret": "secret_value_NEVER_LEAK",
            "enabled": True,
        },
        "created_at": 100,
        "updated_at": 200,
    }
    out = oauth_mod._sanitize_oauth_provider(record)
    assert "client_secret" not in out
    assert out["client_secret_configured"] is True
    assert out["client_id"] == "abc"


def test_sanitize_provider_falls_back_to_preset_urls():
    record = {
        "id": "rec1",
        "record_key": "github",
        "payload": {
            "provider_id": "github",
            "provider_type": "github",
            "client_id": "abc",
            # auth_url / token_url 都未设置 → preset 兜底
        },
    }
    out = oauth_mod._sanitize_oauth_provider(record)
    assert out["auth_url"]  # preset 提供
    assert out["token_url"]
    assert out["userinfo_url"]


def test_sanitize_provider_no_secret_configured_when_empty():
    record = {
        "id": "rec1",
        "record_key": "github",
        "payload": {"provider_id": "github", "provider_type": "github", "client_id": "x", "client_secret": ""},
    }
    out = oauth_mod._sanitize_oauth_provider(record)
    assert out["client_secret_configured"] is False


# ---------- list_oauth_providers ----------


def test_list_oauth_providers_sorted_enabled_first():
    fake_records = [
        {
            "id": "1",
            "record_key": "p_z",
            "payload": {"provider_id": "p_z", "provider_type": "generic", "client_id": "x", "enabled": False},
        },
        {
            "id": "2",
            "record_key": "p_a",
            "payload": {"provider_id": "p_a", "provider_type": "generic", "client_id": "x", "enabled": True},
        },
        {
            "id": "3",
            "record_key": "p_b",
            "payload": {"provider_id": "p_b", "provider_type": "generic", "client_id": "x", "enabled": True},
        },
    ]
    with patch.object(oauth_mod.persistence_manager, "list_records", return_value=fake_records):
        out = oauth_mod.list_oauth_providers()
    ids = [p["provider_id"] for p in out]
    # enabled 优先（False sort key ↑），同状态按 provider_id 升序
    assert ids == ["p_a", "p_b", "p_z"]


def test_list_oauth_providers_filter_enabled_only():
    fake_records = [
        {
            "id": "1",
            "record_key": "p_a",
            "payload": {"provider_id": "p_a", "provider_type": "generic", "client_id": "x", "enabled": False},
        },
        {
            "id": "2",
            "record_key": "p_b",
            "payload": {"provider_id": "p_b", "provider_type": "generic", "client_id": "x", "enabled": True},
        },
    ]
    with patch.object(oauth_mod.persistence_manager, "list_records", return_value=fake_records):
        out = oauth_mod.list_oauth_providers(enabled_only=True)
    assert [p["provider_id"] for p in out] == ["p_b"]


# ---------- _find_oauth_provider_record ----------


def test_find_provider_record_normalizes_case():
    fake_records = [{"id": "x", "record_key": "github", "payload": {}}]
    with patch.object(oauth_mod.persistence_manager, "list_records", return_value=fake_records):
        assert oauth_mod._find_oauth_provider_record("GITHUB") is not None
        assert oauth_mod._find_oauth_provider_record("  github  ") is not None
        assert oauth_mod._find_oauth_provider_record("missing") is None


def test_find_provider_record_returns_none_for_empty_input():
    assert oauth_mod._find_oauth_provider_record(None) is None
    assert oauth_mod._find_oauth_provider_record("") is None
    assert oauth_mod._find_oauth_provider_record("   ") is None


# ---------- diagnose_oauth_provider ----------


def test_diagnose_provider_404_when_not_found():
    with patch.object(oauth_mod.persistence_manager, "list_records", return_value=[]):
        with pytest.raises(HTTPException) as ei:
            oauth_mod.diagnose_oauth_provider("missing")
    assert ei.value.status_code == 404


def test_diagnose_provider_high_severity_for_missing_secret():
    fake_record = {
        "id": "1",
        "record_key": "github",
        "payload": {
            "provider_id": "github",
            "provider_type": "github",
            "client_id": "abc",
            "enabled": True,
            # client_secret 缺失
        },
    }
    with patch.object(oauth_mod.persistence_manager, "list_records", return_value=[fake_record]):
        out = oauth_mod.diagnose_oauth_provider("github")
    severities = [f["severity"] for f in out["findings"]]
    assert "high" in severities
    assert out["ready"] is False


def test_diagnose_provider_ready_when_all_required_set(monkeypatch):
    monkeypatch.delenv("BACKEND_PUBLIC_URL", raising=False)
    fake_record = {
        "id": "1",
        "record_key": "github",
        "payload": {
            "provider_id": "github",
            "provider_type": "github",
            "client_id": "abc",
            "client_secret": "s",
            "auth_url": "https://x/auth",
            "token_url": "https://x/token",
            "userinfo_url": "https://x/userinfo",
            "frontend_origin": "https://front",
            "redirect_uri": "https://back/cb",
            "enabled": True,
        },
    }
    with patch.object(oauth_mod.persistence_manager, "list_records", return_value=[fake_record]):
        out = oauth_mod.diagnose_oauth_provider("github")
    # 已经齐了：ready=True，findings 全部不是 high
    assert out["ready"] is True
    assert all(f["severity"] != "high" for f in out["findings"])


def test_diagnose_provider_flags_disabled():
    fake_record = {
        "id": "1",
        "record_key": "github",
        "payload": {
            "provider_id": "github",
            "provider_type": "github",
            "client_id": "abc",
            "client_secret": "s",
            "auth_url": "https://x/auth",
            "token_url": "https://x/token",
            "userinfo_url": "https://x/userinfo",
            "frontend_origin": "https://front",
            "redirect_uri": "https://back/cb",
            "enabled": False,
        },
    }
    with patch.object(oauth_mod.persistence_manager, "list_records", return_value=[fake_record]):
        out = oauth_mod.diagnose_oauth_provider("github")
    msgs = [f["message"] for f in out["findings"]]
    assert any("禁用" in m for m in msgs)


# ---------- upsert_oauth_provider ----------


def test_upsert_validates_provider_id_required():
    with pytest.raises(ValueError, match="provider_id is required"):
        oauth_mod.upsert_oauth_provider("", client_id="x", auth_url="x", token_url="y")


def test_upsert_validates_client_id_required():
    with pytest.raises(ValueError, match="client_id is required"):
        oauth_mod.upsert_oauth_provider("p", client_id="", auth_url="x", token_url="y")


def test_upsert_validates_auth_token_urls_required():
    # generic preset 没有默认 url，必须显式传
    with pytest.raises(ValueError, match="auth_url and token_url are required"):
        with patch.object(oauth_mod.persistence_manager, "list_records", return_value=[]):
            oauth_mod.upsert_oauth_provider("p", client_id="x", provider_type="generic")


def test_upsert_uses_preset_urls_when_provider_type_known():
    fake_put = MagicMock(
        return_value={
            "id": "1",
            "record_key": "github",
            "payload": {
                "provider_id": "github",
                "provider_type": "github",
                "client_id": "x",
                "client_secret": "",
                "auth_url": "https://github.com/login/oauth/authorize",
                "token_url": "https://github.com/login/oauth/access_token",
                "userinfo_url": "https://api.github.com/user",
                "scopes": [],
                "enabled": True,
            },
        }
    )
    with (
        patch.object(oauth_mod.persistence_manager, "list_records", return_value=[]),
        patch.object(oauth_mod.persistence_manager, "put_record", fake_put),
    ):
        out = oauth_mod.upsert_oauth_provider(
            "github", client_id="x", provider_type="github"
        )
    fake_put.assert_called_once()
    # 确认 sanitize 后字段
    assert out["provider_id"] == "github"
    assert "client_secret" not in out


# ---------- begin_oauth_authorization ----------


def test_begin_authorization_404_when_provider_missing():
    with patch.object(oauth_mod.persistence_manager, "list_records", return_value=[]):
        with pytest.raises(HTTPException) as ei:
            oauth_mod.begin_oauth_authorization("nope")
    assert ei.value.status_code == 404


def test_begin_authorization_400_when_provider_disabled():
    fake_record = {
        "id": "1",
        "record_key": "github",
        "payload": {
            "provider_id": "github",
            "provider_type": "github",
            "client_id": "abc",
            "auth_url": "https://x/auth",
            "token_url": "https://x/token",
            "userinfo_url": "https://x/userinfo",
            "enabled": False,
        },
    }
    with patch.object(oauth_mod.persistence_manager, "list_records", return_value=[fake_record]):
        with pytest.raises(HTTPException) as ei:
            oauth_mod.begin_oauth_authorization("github")
    assert ei.value.status_code == 400


def test_begin_authorization_returns_state_and_url():
    fake_record = {
        "id": "1",
        "record_key": "github",
        "payload": {
            "provider_id": "github",
            "provider_type": "github",
            "client_id": "abc",
            "auth_url": "https://x/auth",
            "token_url": "https://x/token",
            "userinfo_url": "https://x/userinfo",
            "enabled": True,
            "redirect_uri": "https://cb",
            "frontend_origin": "https://front",
            "scopes": ["read:user"],
        },
    }
    with (
        patch.object(oauth_mod.persistence_manager, "list_records", return_value=[fake_record]),
        patch.object(oauth_mod.persistence_manager, "put_record", MagicMock(return_value={})),
    ):
        out = oauth_mod.begin_oauth_authorization("github")
    # state 是高熵随机字符串
    assert isinstance(out["state"], str)
    assert len(out["state"]) >= 16
    # URL 含必须的 OAuth 参数
    assert "code_challenge=" in out["authorization_url"]
    assert "code_challenge_method=S256" in out["authorization_url"]
    assert "state=" in out["authorization_url"]
    assert "client_id=abc" in out["authorization_url"]


def test_fetch_userinfo_400_when_url_unconfigured():
    with pytest.raises(HTTPException) as ei:
        oauth_mod._fetch_oauth_userinfo({}, "token")
    assert ei.value.status_code == 400


def test_fetch_userinfo_uses_bearer_authorization():
    fake_resp = MagicMock(status_code=200)
    fake_resp.json.return_value = {"id": "abc", "email": "x@y.test"}
    fake_resp.raise_for_status = MagicMock()
    with patch("backend.app.core.auth._oauth.requests.get", return_value=fake_resp) as gp:
        out = oauth_mod._fetch_oauth_userinfo({"userinfo_url": "https://api.x/me"}, "tok123")
    assert out == {"id": "abc", "email": "x@y.test"}
    _, kwargs = gp.call_args
    assert kwargs["headers"]["Authorization"] == "Bearer tok123"
    assert kwargs["timeout"] == 20


def test_fetch_userinfo_github_falls_back_to_email_endpoint():
    # GitHub userinfo 不返回 email 时，走 email_url 二次请求
    fake_userinfo = MagicMock(status_code=200)
    fake_userinfo.json.return_value = {"id": "abc", "login": "octo"}  # no email
    fake_userinfo.raise_for_status = MagicMock()
    fake_emails = MagicMock(status_code=200)
    fake_emails.json.return_value = [
        {"email": "secondary@x.test", "primary": False, "verified": True},
        {"email": "primary@x.test", "primary": True, "verified": True},
    ]
    fake_emails.raise_for_status = MagicMock()
    with patch("backend.app.core.auth._oauth.requests.get", side_effect=[fake_userinfo, fake_emails]):
        out = oauth_mod._fetch_oauth_userinfo(
            {"userinfo_url": "https://api.github.com/user", "provider_type": "github"},
            "tok",
        )
    assert out["email"] == "primary@x.test"


def test_fetch_userinfo_github_falls_back_to_first_email_when_no_primary():
    fake_userinfo = MagicMock(status_code=200)
    fake_userinfo.json.return_value = {"id": "abc"}
    fake_userinfo.raise_for_status = MagicMock()
    fake_emails = MagicMock(status_code=200)
    # 没有 primary+verified 的记录
    fake_emails.json.return_value = [
        {"email": "fallback@x.test", "primary": False, "verified": False},
    ]
    fake_emails.raise_for_status = MagicMock()
    with patch("backend.app.core.auth._oauth.requests.get", side_effect=[fake_userinfo, fake_emails]):
        out = oauth_mod._fetch_oauth_userinfo(
            {"userinfo_url": "https://api.github.com/user", "provider_type": "github"},
            "tok",
        )
    assert out["email"] == "fallback@x.test"


def test_fetch_userinfo_returns_empty_dict_for_non_dict_response():
    fake_resp = MagicMock(status_code=200)
    fake_resp.json.return_value = ["not", "a", "dict"]
    fake_resp.raise_for_status = MagicMock()
    with patch("backend.app.core.auth._oauth.requests.get", return_value=fake_resp):
        out = oauth_mod._fetch_oauth_userinfo({"userinfo_url": "https://x/me"}, "tok")
    assert out == {}


# ---------- _find_linked_oauth_user ----------


def test_find_linked_user_matches_by_oauth_identity():
    fake_records = [
        {
            "id": "u1",
            "payload": {"metadata": {"oauth_identities": {"github": "octo123"}, "email": ""}},
        },
        {
            "id": "u2",
            "payload": {"metadata": {"oauth_identities": {"github": "other"}, "email": ""}},
        },
    ]
    with patch.object(
        oauth_mod.persistence_manager,
        "list_records_page",
        return_value={"records": fake_records, "has_more": False, "next_cursor": None},
    ):
        out = oauth_mod._find_linked_oauth_user("github", "octo123", None)
    assert out["id"] == "u1"


def test_find_linked_user_matches_by_email_when_no_oauth_link():
    fake_records = [
        {
            "id": "u1",
            "payload": {"metadata": {"oauth_identities": {}, "email": "x@y.test"}},
        }
    ]
    with patch.object(
        oauth_mod.persistence_manager,
        "list_records_page",
        return_value={"records": fake_records, "has_more": False, "next_cursor": None},
    ):
        out = oauth_mod._find_linked_oauth_user("github", "octo123", "x@y.test")
    assert out["id"] == "u1"


def test_find_linked_user_returns_none_when_no_match():
    fake_records = [
        {"id": "u1", "payload": {"metadata": {"oauth_identities": {}, "email": "a@b.test"}}}
    ]
    with patch.object(
        oauth_mod.persistence_manager,
        "list_records_page",
        return_value={"records": fake_records, "has_more": False, "next_cursor": None},
    ):
        out = oauth_mod._find_linked_oauth_user("github", "octo", "x@y.test")
    assert out is None


def test_find_linked_user_scans_beyond_the_first_page():
    """The lookup must page through every user, not stop at the first page."""
    page_one = {
        "records": [
            {"id": "u1", "payload": {"metadata": {"oauth_identities": {"github": "other"}}}},
        ],
        "has_more": True,
        "next_cursor": "cursor-1",
    }
    page_two = {
        "records": [
            {"id": "u2", "payload": {"metadata": {"oauth_identities": {"github": "octo123"}}}},
        ],
        "has_more": False,
        "next_cursor": None,
    }
    with patch.object(
        oauth_mod.persistence_manager,
        "list_records_page",
        side_effect=[page_one, page_two],
    ):
        out = oauth_mod._find_linked_oauth_user("github", "octo123", None)
    assert out["id"] == "u2"


# ---------- exchange_oauth_authorization_code 安全检查 ----------


def _provider_record(enabled=True):
    return {
        "id": "p1",
        "record_key": "github",
        "payload": {
            "provider_id": "github",
            "provider_type": "github",
            "client_id": "abc",
            "client_secret": "shh",
            "auth_url": "https://x/auth",
            "token_url": "https://x/token",
            "userinfo_url": "https://x/userinfo",
            "enabled": enabled,
            "redirect_uri": "https://cb",
        },
    }


def test_exchange_404_when_provider_missing():
    with patch.object(oauth_mod.persistence_manager, "list_records", return_value=[]):
        with pytest.raises(HTTPException) as ei:
            oauth_mod.exchange_oauth_authorization_code("github", code="c", state="s")
    assert ei.value.status_code == 404


def test_exchange_400_when_provider_disabled():
    with patch.object(oauth_mod.persistence_manager, "list_records", return_value=[_provider_record(enabled=False)]):
        with pytest.raises(HTTPException) as ei:
            oauth_mod.exchange_oauth_authorization_code("github", code="c", state="s")
    assert ei.value.status_code == 400


def test_exchange_401_when_state_not_found():
    # provider 存在但 state 找不到
    def _list(record_type=None, limit=None, **kwargs):
        if record_type == oauth_mod.AUTH_OAUTH_PROVIDER_RECORD_TYPE:
            return [_provider_record()]
        return []

    with patch.object(oauth_mod.persistence_manager, "list_records", side_effect=_list):
        with pytest.raises(HTTPException) as ei:
            oauth_mod.exchange_oauth_authorization_code("github", code="c", state="bad_state")
    assert ei.value.status_code == 401


def test_exchange_401_when_state_provider_mismatch():
    state_record = {
        "id": "s1",
        "record_key": "S1",
        "payload": {"provider_id": "google", "code_verifier": "v"},
    }

    def _list(record_type=None, limit=None, **kwargs):
        if record_type == oauth_mod.AUTH_OAUTH_PROVIDER_RECORD_TYPE:
            return [_provider_record()]
        return [state_record]

    with patch.object(oauth_mod.persistence_manager, "list_records", side_effect=_list):
        with pytest.raises(HTTPException) as ei:
            oauth_mod.exchange_oauth_authorization_code("github", code="c", state="S1")
    assert ei.value.status_code == 401


def test_exchange_401_when_state_already_used():
    state_record = {
        "id": "s1",
        "record_key": "S1",
        "payload": {"provider_id": "github", "code_verifier": "v", "used_at": 12345},
    }

    def _list(record_type=None, limit=None, **kwargs):
        if record_type == oauth_mod.AUTH_OAUTH_PROVIDER_RECORD_TYPE:
            return [_provider_record()]
        return [state_record]

    with patch.object(oauth_mod.persistence_manager, "list_records", side_effect=_list):
        with pytest.raises(HTTPException) as ei:
            oauth_mod.exchange_oauth_authorization_code("github", code="c", state="S1")
    assert ei.value.status_code == 401


def test_exchange_401_when_state_expired():
    import time as _t

    state_record = {
        "id": "s1",
        "record_key": "S1",
        "payload": {
            "provider_id": "github",
            "code_verifier": "v",
            "expires_at": int(_t.time()) - 100,  # 已过期
        },
    }

    def _list(record_type=None, limit=None, **kwargs):
        if record_type == oauth_mod.AUTH_OAUTH_PROVIDER_RECORD_TYPE:
            return [_provider_record()]
        return [state_record]

    with patch.object(oauth_mod.persistence_manager, "list_records", side_effect=_list):
        with pytest.raises(HTTPException) as ei:
            oauth_mod.exchange_oauth_authorization_code("github", code="c", state="S1")
    assert ei.value.status_code == 401


def test_begin_authorization_two_calls_use_distinct_states():
    fake_record = {
        "id": "1",
        "record_key": "github",
        "payload": {
            "provider_id": "github",
            "provider_type": "github",
            "client_id": "abc",
            "auth_url": "https://x/auth",
            "token_url": "https://x/token",
            "userinfo_url": "https://x/userinfo",
            "enabled": True,
            "redirect_uri": "https://cb",
            "frontend_origin": "https://front",
            "scopes": [],
        },
    }
    with (
        patch.object(oauth_mod.persistence_manager, "list_records", return_value=[fake_record]),
        patch.object(oauth_mod.persistence_manager, "put_record", MagicMock(return_value={})),
    ):
        a = oauth_mod.begin_oauth_authorization("github")
        b = oauth_mod.begin_oauth_authorization("github")
    # CSRF 防护：每次调用生成新的 state
    assert a["state"] != b["state"]

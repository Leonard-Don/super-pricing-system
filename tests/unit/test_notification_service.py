"""NotificationService characterization + integration tests.

锁定 channel CRUD、send 路由、敏感字段 mask 行为。webhook/SMTP 通过 mock 验证，
不发真实网络请求。
"""

from __future__ import annotations

from email.message import EmailMessage
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from backend.app.services.notification_service import NotificationService


# ---------- fixtures ----------


@pytest.fixture
def svc(tmp_path):
    return NotificationService(config_path=tmp_path / "channels.json")


@pytest.fixture
def clean_env(monkeypatch):
    for key in (
        "ALERT_WEBHOOK_URL",
        "WECOM_WEBHOOK_URL",
        "SMTP_HOST",
        "SMTP_FROM",
        "SMTP_PORT",
        "SMTP_USERNAME",
        "SMTP_PASSWORD",
        "SMTP_USE_TLS",
        "ALERT_EMAIL_TO",
    ):
        monkeypatch.delenv(key, raising=False)
    return monkeypatch


# ---------- status / list_channels ----------


def test_status_reports_no_env_when_unset(svc, clean_env):
    s = svc.status()
    assert s["env"]["webhook_url_configured"] is False
    assert s["env"]["wecom_webhook_configured"] is False
    assert s["env"]["smtp_configured"] is False
    # 总是包含 builtin dry_run channel
    assert any(c["id"] == "dry_run" and c["source"] == "builtin" for c in s["channels"])


def test_status_reports_each_env_channel(svc, clean_env):
    clean_env.setenv("ALERT_WEBHOOK_URL", "https://example.test/webhook")
    clean_env.setenv("WECOM_WEBHOOK_URL", "https://wecom.test/webhook")
    clean_env.setenv("SMTP_HOST", "smtp.test")
    clean_env.setenv("SMTP_FROM", "alerts@test.local")
    s = svc.status()
    assert s["env"]["webhook_url_configured"] is True
    assert s["env"]["wecom_webhook_configured"] is True
    assert s["env"]["smtp_configured"] is True
    types = {c["type"] for c in s["channels"]}
    assert {"dry_run", "webhook", "wecom", "email"} <= types


def test_smtp_status_requires_both_host_and_from(svc, clean_env):
    clean_env.setenv("SMTP_HOST", "smtp.test")
    # 没有 SMTP_FROM
    s = svc.status()
    assert s["env"]["smtp_configured"] is False


# ---------- save_channel ----------


def test_save_channel_validates_id_required(svc):
    with pytest.raises(ValueError, match="channel id is required"):
        svc.save_channel({"type": "webhook"})


def test_save_channel_rejects_unsupported_type(svc):
    with pytest.raises(ValueError, match="unsupported channel type"):
        svc.save_channel({"id": "x", "type": "carrier_pigeon"})


def test_save_channel_renames_reserved_id(svc):
    out = svc.save_channel({"id": "webhook", "type": "webhook", "settings": {"url": "https://x"}})
    # reserved id "webhook" 被自动加 custom_ 前缀
    assert out["id"] == "custom_webhook"


def test_save_channel_persists_to_file(svc, tmp_path):
    svc.save_channel({"id": "ops_team", "type": "webhook", "settings": {"url": "https://hooks.test"}})
    listed = svc.list_channels()
    ids = [c["id"] for c in listed]
    assert "ops_team" in ids


def test_save_channel_overwrites_same_id(svc):
    svc.save_channel({"id": "team", "type": "webhook", "settings": {"url": "https://a"}})
    svc.save_channel({"id": "team", "type": "wecom", "settings": {"url": "https://b"}})
    listed = [c for c in svc.list_channels() if c["id"] == "team"]
    assert len(listed) == 1
    assert listed[0]["type"] == "wecom"


def test_save_channel_masks_sensitive_settings(svc):
    out = svc.save_channel(
        {
            "id": "team",
            "type": "webhook",
            "settings": {"url": "https://secret", "label_text": "ops"},
        }
    )
    # url 被 mask
    assert out["settings"]["url"] == "***configured***"
    # 非敏感字段保留
    assert out["settings"]["label_text"] == "ops"


# ---------- delete_channel ----------


def test_delete_channel_removes_existing(svc):
    svc.save_channel({"id": "team", "type": "webhook"})
    out = svc.delete_channel("team")
    assert out["deleted"] is True
    assert out["channel_id"] == "team"


def test_delete_channel_noop_for_unknown(svc):
    out = svc.delete_channel("nonexistent")
    assert out["deleted"] is False


def test_delete_channel_normalizes_id_case(svc):
    svc.save_channel({"id": "team", "type": "webhook"})
    out = svc.delete_channel("TEAM")
    assert out["deleted"] is True


# ---------- send: dry_run ----------


def test_send_dry_run_unknown_channel_returns_payload(svc):
    out = svc.send("unknown_channel", {"title": "t", "message": "m"})
    assert out["status"] == "dry_run"
    assert out["delivered"] is False
    assert out["payload"]["title"] == "t"
    assert "timestamp" in out["payload"]


def test_send_dry_run_uses_default_severity(svc):
    out = svc.send(None, {})
    assert out["payload"]["severity"] == "info"
    assert out["payload"]["source"] == "quant_system"


# ---------- send: webhook ----------


def test_send_webhook_skipped_when_not_configured(svc, clean_env):
    out = svc.send("webhook", {"title": "t"})
    assert out["status"] == "skipped"
    assert out["delivered"] is False


def test_send_webhook_posts_when_url_configured(svc, clean_env):
    clean_env.setenv("ALERT_WEBHOOK_URL", "https://hooks.test/x")
    fake_response = MagicMock(ok=True, status_code=200)
    with patch("backend.app.services.notification_service.requests.post", return_value=fake_response) as p:
        out = svc.send("webhook", {"title": "t", "message": "m"})
    assert out["status"] == "sent"
    assert out["delivered"] is True
    assert out["status_code"] == 200
    p.assert_called_once()
    _, kwargs = p.call_args
    assert kwargs["timeout"] == 10
    assert kwargs["json"]["title"] == "t"


def test_send_webhook_returns_failed_on_non_2xx(svc, clean_env):
    clean_env.setenv("ALERT_WEBHOOK_URL", "https://hooks.test/x")
    fake_response = MagicMock(ok=False, status_code=500)
    with patch("backend.app.services.notification_service.requests.post", return_value=fake_response):
        out = svc.send("webhook", {"title": "t"})
    assert out["status"] == "failed"
    assert out["delivered"] is False


# ---------- send: wecom ----------


def test_send_wecom_uses_markdown_format(svc, clean_env):
    clean_env.setenv("WECOM_WEBHOOK_URL", "https://wecom.test/x")
    fake_response = MagicMock(ok=True, status_code=200)
    with patch("backend.app.services.notification_service.requests.post", return_value=fake_response) as p:
        svc.send("wecom", {"title": "Alert", "message": "body", "severity": "high"})
    _, kwargs = p.call_args
    body = kwargs["json"]
    assert body["msgtype"] == "markdown"
    assert "Alert" in body["markdown"]["content"]
    assert "high" in body["markdown"]["content"]


# ---------- send: email ----------


def test_send_email_skipped_when_smtp_unconfigured(svc, clean_env):
    out = svc.send("email", {"title": "t"})
    assert out["status"] == "skipped"
    assert out["delivered"] is False


def test_send_email_calls_smtp_with_credentials(svc, clean_env):
    clean_env.setenv("SMTP_HOST", "smtp.test")
    clean_env.setenv("SMTP_FROM", "alerts@test")
    clean_env.setenv("ALERT_EMAIL_TO", "ops@test")
    clean_env.setenv("SMTP_USERNAME", "u")
    clean_env.setenv("SMTP_PASSWORD", "p")
    fake_smtp = MagicMock()
    fake_ctx = MagicMock()
    fake_ctx.__enter__.return_value = fake_smtp
    fake_ctx.__exit__.return_value = False
    with patch("backend.app.services.notification_service.smtplib.SMTP", return_value=fake_ctx):
        out = svc.send("email", {"title": "Alert", "message": "body"})
    assert out["status"] == "sent"
    assert out["delivered"] is True
    fake_smtp.starttls.assert_called_once()
    fake_smtp.login.assert_called_once_with("u", "p")
    fake_smtp.send_message.assert_called_once()


def test_send_email_skips_starttls_when_use_tls_false(svc, clean_env):
    clean_env.setenv("SMTP_HOST", "smtp.test")
    clean_env.setenv("SMTP_FROM", "alerts@test")
    clean_env.setenv("ALERT_EMAIL_TO", "ops@test")
    clean_env.setenv("SMTP_USERNAME", "u")
    clean_env.setenv("SMTP_PASSWORD", "p")
    clean_env.setenv("SMTP_USE_TLS", "false")
    fake_smtp = MagicMock()
    fake_ctx = MagicMock()
    fake_ctx.__enter__.return_value = fake_smtp
    fake_ctx.__exit__.return_value = False
    with patch("backend.app.services.notification_service.smtplib.SMTP", return_value=fake_ctx):
        svc.send("email", {"title": "t", "message": "b"})
    fake_smtp.starttls.assert_not_called()


def test_send_email_uses_recipient_from_payload(svc, clean_env):
    clean_env.setenv("SMTP_HOST", "smtp.test")
    clean_env.setenv("SMTP_FROM", "alerts@test")
    fake_smtp = MagicMock()
    fake_ctx = MagicMock()
    fake_ctx.__enter__.return_value = fake_smtp
    fake_ctx.__exit__.return_value = False
    with patch("backend.app.services.notification_service.smtplib.SMTP", return_value=fake_ctx):
        out = svc.send("email", {"title": "t", "message": "b", "to": "explicit@x"})
    assert out["to"] == "explicit@x"


# ---------- send via stored channel ----------


def test_send_via_stored_webhook(svc, clean_env):
    svc.save_channel({"id": "team", "type": "webhook", "settings": {"url": "https://stored.test"}})
    fake_response = MagicMock(ok=True, status_code=200)
    with patch("backend.app.services.notification_service.requests.post", return_value=fake_response) as p:
        out = svc.send("team", {"title": "t"})
    assert out["status"] == "sent"
    p.assert_called_once()
    args, _ = p.call_args
    # 第一个位置参数是 url
    assert args[0] == "https://stored.test"


def test_send_via_stored_wecom(svc, clean_env):
    svc.save_channel({"id": "team", "type": "wecom", "settings": {"url": "https://wecom-stored.test"}})
    fake_response = MagicMock(ok=True, status_code=200)
    with patch("backend.app.services.notification_service.requests.post", return_value=fake_response) as p:
        svc.send("team", {"title": "t", "message": "m", "severity": "high"})
    _, kwargs = p.call_args
    assert kwargs["json"]["msgtype"] == "markdown"


def test_send_via_disabled_stored_falls_back_to_dry_run(svc):
    svc.save_channel({"id": "team", "type": "webhook", "enabled": False, "settings": {"url": "https://x"}})
    out = svc.send("team", {"title": "t"})
    assert out["status"] == "dry_run"


# ---------- _read_stored_config 异常路径 ----------


def test_read_stored_config_returns_default_on_corrupt_file(svc, tmp_path):
    svc.config_path.write_text("not valid json", encoding="utf-8")
    out = svc._read_stored_config()
    assert out == {"channels": []}

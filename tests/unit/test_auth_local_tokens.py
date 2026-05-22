from __future__ import annotations

from typing import Any

from backend.app.core.auth import _users_tokens as auth_mod


class InMemoryPersistence:
    def __init__(self) -> None:
        self.records: dict[tuple[str, str], dict[str, Any]] = {}

    def get_record(self, record_type: str, record_key: str) -> dict[str, Any] | None:
        return self.records.get((record_type, record_key))

    def put_record(
        self,
        *,
        record_type: str,
        record_key: str,
        payload: dict[str, Any],
        record_id: str | None = None,
    ) -> dict[str, Any]:
        existing = self.records.get((record_type, record_key)) or {}
        record = {
            "id": record_id or existing.get("id") or f"{record_type}:{record_key}",
            "record_type": record_type,
            "record_key": record_key,
            "payload": payload,
            "created_at": existing.get("created_at", 1),
            "updated_at": int(existing.get("updated_at", 0)) + 1,
        }
        self.records[(record_type, record_key)] = record
        return record

    def list_records(self, *, record_type: str, limit: int = 200) -> list[dict[str, Any]]:
        return [
            record
            for (stored_type, _), record in self.records.items()
            if stored_type == record_type
        ][:limit]

    def list_records_page(
        self,
        *,
        record_type: str,
        limit: int = 500,
        cursor: str | None = None,
    ) -> dict[str, Any]:
        del cursor
        return {
            "records": self.list_records(record_type=record_type, limit=limit),
            "has_more": False,
            "next_cursor": None,
        }


def test_local_password_login_issues_refresh_token_bundle(monkeypatch) -> None:
    store = InMemoryPersistence()
    monkeypatch.setenv("AUTH_SECRET", "local-auth-test-secret")
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setattr(auth_mod, "persistence_manager", store)

    auth_mod.upsert_local_user(
        subject="analyst",
        password="s3cret",
        role="admin",
        scopes=["research:write"],
    )

    bundle = auth_mod.authenticate_local_user(
        subject="analyst",
        password="s3cret",
        expires_in_seconds=3600,
        refresh_expires_in_seconds=7200,
    )

    assert bundle["token_type"] == "Bearer"
    assert bundle["access_token"]
    assert bundle["refresh_token"]
    assert bundle["refresh_expires_in_seconds"] == 7200
    assert bundle["user"]["subject"] == "analyst"
    assert bundle["user"]["role"] == "admin"
    assert bundle["scope"] == "research:write"
    assert len(auth_mod.list_refresh_sessions(subject="analyst")) == 1

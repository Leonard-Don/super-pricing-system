"""IndustryPreferencesStore characterization tests.

锁定 profile id 规范化、watchlist 去重、saved_views 上限、阈值合法化、
文件大小裁剪策略、加载异常 fallback。
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.app.services.industry_preferences import (
    DEFAULT_ALERT_THRESHOLDS,
    DEFAULT_PREFERENCES,
    IndustryPreferencesStore,
    _PREFERENCES_MAX_FILE_BYTES,
    _PREFERENCES_MAX_SAVED_VIEWS,
)


@pytest.fixture
def store(tmp_path):
    return IndustryPreferencesStore(storage_path=tmp_path / "prefs")


# ---------- _normalize_profile_id ----------


@pytest.mark.parametrize(
    "raw, expected",
    [
        (None, "default"),
        ("", "default"),
        ("  ", "default"),
        ("Alpha-User", "alpha-user"),
        ("user@team", "user-team"),  # @ 被替换为 -
        ("___", "default"),  # 全部 strip 掉后空 → default
        ("a/b/c", "a-b-c"),
        ("simple", "simple"),
    ],
)
def test_normalize_profile_id(store, raw, expected):
    assert store._normalize_profile_id(raw) == expected


# ---------- _format_size ----------


@pytest.mark.parametrize(
    "n, expected",
    [
        (512, "512 B"),
        (2048, "2.0 KB"),
        (3 * 1024 * 1024, "3.00 MB"),
    ],
)
def test_format_size(n, expected):
    assert IndustryPreferencesStore._format_size(n) == expected


# ---------- _normalize_preferences ----------


def test_normalize_empty_returns_defaults(store):
    out = store._normalize_preferences(None)
    assert out["watchlist_industries"] == []
    assert out["saved_views"] == []
    assert out["alert_thresholds"] == DEFAULT_ALERT_THRESHOLDS


def test_normalize_dedups_watchlist(store):
    out = store._normalize_preferences(
        {"watchlist_industries": ["Tech", "Tech", "  Finance  ", "", None, 5]}
    )
    # 去重 + strip + 跳过非字符串
    assert out["watchlist_industries"] == ["Tech", "Finance"]


def test_normalize_drops_views_without_id(store):
    out = store._normalize_preferences(
        {
            "saved_views": [
                {"id": "v1", "filters": {}},
                {"name": "no id"},  # 无 id 被丢
                "not a dict",  # 非 dict 被丢
                {"id": "  ", "filters": {}},  # 空 id 被丢
            ]
        }
    )
    ids = [v["id"] for v in out["saved_views"]]
    assert ids == ["v1"]


def test_normalize_caps_saved_views(store):
    payload = {"saved_views": [{"id": f"v{i}"} for i in range(50)]}
    out = store._normalize_preferences(payload)
    assert len(out["saved_views"]) == _PREFERENCES_MAX_SAVED_VIEWS


def test_normalize_thresholds_falls_back_on_bad_value(store):
    out = store._normalize_preferences(
        {"alert_thresholds": {"resonance_score": "not a number", "high_volatility_threshold": "5.5"}}
    )
    # bad value → 用默认
    assert out["alert_thresholds"]["resonance_score"] == float(
        DEFAULT_ALERT_THRESHOLDS["resonance_score"]
    )
    # 数字字符串可被 float() 转
    assert out["alert_thresholds"]["high_volatility_threshold"] == 5.5


def test_normalize_thresholds_handles_non_dict(store):
    out = store._normalize_preferences({"alert_thresholds": "not a dict"})
    # 非 dict → 全部默认
    assert out["alert_thresholds"] == DEFAULT_ALERT_THRESHOLDS


# ---------- get_preferences / update_preferences ----------


def test_get_preferences_default_when_no_file(store):
    out = store.get_preferences()
    assert out == DEFAULT_PREFERENCES


def test_get_preferences_isolated_per_profile(store):
    store.update_preferences({"watchlist_industries": ["Tech"]}, profile_id="alice")
    store.update_preferences({"watchlist_industries": ["Finance"]}, profile_id="bob")
    a = store.get_preferences("alice")
    b = store.get_preferences("bob")
    assert a["watchlist_industries"] == ["Tech"]
    assert b["watchlist_industries"] == ["Finance"]


def test_update_preferences_persists_and_reads_back(store):
    store.update_preferences(
        {
            "watchlist_industries": ["A", "B"],
            "saved_views": [{"id": "v1", "filters": {"x": 1}}],
            "alert_thresholds": {"resonance_score": 90},
        },
        profile_id="user1",
    )
    out = store.get_preferences("user1")
    assert out["watchlist_industries"] == ["A", "B"]
    assert out["saved_views"][0]["id"] == "v1"
    assert out["alert_thresholds"]["resonance_score"] == 90.0


def test_update_preferences_returns_normalized_view(store):
    out = store.update_preferences({"watchlist_industries": ["X", "X", "Y"]})
    assert out["watchlist_industries"] == ["X", "Y"]


# ---------- profile_id 隔离 + 文件命名 ----------


def test_get_preferences_file_uses_normalized_id(store):
    p = store._get_preferences_file("Mixed-Case_USER")
    assert p.name == "mixed-case_user.json"


def test_get_preferences_file_falls_back_to_default(store):
    p = store._get_preferences_file(None)
    assert p.name == "default.json"


# ---------- 异常路径 ----------


def test_load_preferences_falls_back_on_corrupt_json(store, tmp_path):
    path = store._get_preferences_file("corrupt")
    path.write_text("not json", encoding="utf-8")
    out = store.get_preferences("corrupt")
    # 损坏文件 → 返回 default
    assert out == DEFAULT_PREFERENCES


def test_persist_swallows_write_errors(monkeypatch, store):
    # 模拟 open 失败：不应抛
    def fail_open(*args, **kwargs):
        raise OSError("disk full")

    monkeypatch.setattr("builtins.open", fail_open)
    # 不应抛异常
    store.update_preferences({"watchlist_industries": ["A"]}, profile_id="failtest")


# ---------- saved_views 文件大小自适应 ----------


def test_persist_trims_saved_views_when_oversized(store):
    # 用很长的 view payload 触发 size > limit → 应裁剪
    big_view = {"id": "v", "filters": {"junk": "x" * 10_000}}
    store.update_preferences(
        {"saved_views": [{**big_view, "id": f"v{i}"} for i in range(_PREFERENCES_MAX_SAVED_VIEWS)]},
        profile_id="large",
    )
    # 重新读取，文件大小应在限制内
    path = store._get_preferences_file("large")
    assert path.stat().st_size <= _PREFERENCES_MAX_FILE_BYTES

from pathlib import Path

from backend.app.services.quant_lab import (
    QuantLabService,
    _resolve_quant_lab_storage_root,
)


def test_quant_lab_service_uses_env_storage_root(monkeypatch, tmp_path):
    isolated_root = tmp_path / "e2e_quant_lab"
    monkeypatch.setenv("QUANT_LAB_STORAGE_ROOT", str(isolated_root))

    service = QuantLabService()

    assert service.storage_root == isolated_root
    assert service.storage_root.exists()


def test_quant_lab_service_explicit_storage_root_overrides_env(monkeypatch, tmp_path):
    monkeypatch.setenv("QUANT_LAB_STORAGE_ROOT", str(tmp_path / "env_quant_lab"))
    explicit_root = tmp_path / "explicit_quant_lab"

    service = QuantLabService(storage_root=explicit_root)

    assert service.storage_root == Path(explicit_root)
    assert service.storage_root.exists()


def test_resolve_storage_root_falls_back_to_project_default(monkeypatch, tmp_path):
    fake_project_root = tmp_path / "fake_project_root"
    monkeypatch.delenv("QUANT_LAB_STORAGE_ROOT", raising=False)
    monkeypatch.setattr(
        "backend.app.services.quant_lab.PROJECT_ROOT", fake_project_root
    )

    resolved = _resolve_quant_lab_storage_root()

    assert resolved == fake_project_root / "data" / "quant_lab"


def test_read_store_returns_default_for_missing_and_corrupt_files(
    monkeypatch, tmp_path
):
    monkeypatch.setenv("QUANT_LAB_STORAGE_ROOT", str(tmp_path / "edge_quant_lab"))
    service = QuantLabService()

    missing = service.storage_root / "absent.json"
    sentinel = {"missing": True}
    assert service._read_store(missing, sentinel) is sentinel

    corrupt = service.storage_root / "corrupt.json"
    corrupt.write_text("{not valid json", encoding="utf-8")
    fallback = {"fallback": True}
    assert service._read_store(corrupt, fallback) == fallback


def test_profile_file_normalizes_profile_id(monkeypatch, tmp_path):
    monkeypatch.setenv("QUANT_LAB_STORAGE_ROOT", str(tmp_path / "norm_quant_lab"))
    service = QuantLabService()

    default_path = service._profile_file("journal", None)
    assert default_path == service.storage_root / "journal" / "default.json"
    assert default_path.parent.is_dir()

    empty_path = service._profile_file("journal", "")
    assert empty_path.name == "default.json"

    normalized = service._profile_file("alerts", "  Group/Alpha-One  ")
    assert normalized == service.storage_root / "alerts" / "group-alpha-one.json"


def test_write_store_round_trip_and_overwrites_existing(monkeypatch, tmp_path):
    import json

    monkeypatch.setenv("QUANT_LAB_STORAGE_ROOT", str(tmp_path / "round_trip_lab"))
    service = QuantLabService()
    target = service.storage_root / "round-trip.json"

    initial = {"version": 1, "items": ["a", "b"]}
    service._write_store(target, initial)
    assert json.loads(target.read_text(encoding="utf-8")) == initial
    assert service._read_store(target, {}) == initial

    updated = {"version": 2, "items": ["c"]}
    service._write_store(target, updated)
    assert service._read_store(target, {}) == updated

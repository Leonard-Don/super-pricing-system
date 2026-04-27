from pathlib import Path

from backend.app.services.quant_lab import QuantLabService


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

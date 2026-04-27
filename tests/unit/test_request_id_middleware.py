import logging

from fastapi import FastAPI
from fastapi.testclient import TestClient

import src.middleware.request_id as request_id_module

from src.middleware.request_id import RequestIDMiddleware


def _build_app():
    app = FastAPI()
    app.add_middleware(RequestIDMiddleware)

    @app.get("/macro/overview")
    def get_macro_overview():
        return {"ok": True}

    @app.post("/quant-lab/alerts")
    def update_quant_lab_alerts():
        return {"ok": True}

    @app.get("/healthz")
    def healthz():
        return {"ok": True}

    @app.get("/health")
    def health():
        return {"ok": True}

    @app.options("/quant-lab/alerts/publish")
    def preflight_publish_alert():
        return {"ok": True}

    return app


def test_request_id_middleware_demotes_benign_get_logs(caplog):
    app = _build_app()

    with TestClient(app) as client:
        caplog.set_level(logging.DEBUG, logger="src.middleware.request_id")
        caplog.clear()

        response = client.get("/macro/overview")

    assert response.status_code == 200

    info_messages = [record.getMessage() for record in caplog.records if record.levelno == logging.INFO]
    debug_messages = [record.getMessage() for record in caplog.records if record.levelno == logging.DEBUG]

    assert "请求开始: GET /macro/overview" not in info_messages
    assert "请求完成: GET /macro/overview 状态码=200" not in info_messages
    assert "请求开始: GET /macro/overview" in debug_messages
    assert "请求完成: GET /macro/overview 状态码=200" in debug_messages


def test_request_id_middleware_keeps_slow_benign_get_finish_log_at_info(caplog, monkeypatch):
    app = _build_app()
    monkeypatch.setattr(request_id_module, "SLOW_REQUEST_INFO_THRESHOLD_MS", 0.0)

    with TestClient(app) as client:
        caplog.set_level(logging.DEBUG, logger="src.middleware.request_id")
        caplog.clear()

        response = client.get("/macro/overview")

    assert response.status_code == 200

    info_messages = [record.getMessage() for record in caplog.records if record.levelno == logging.INFO]
    debug_messages = [record.getMessage() for record in caplog.records if record.levelno == logging.DEBUG]

    assert "请求开始: GET /macro/overview" in debug_messages
    assert "请求完成: GET /macro/overview 状态码=200" in info_messages


def test_request_id_middleware_keeps_write_requests_at_info(caplog):
    app = _build_app()

    with TestClient(app) as client:
        caplog.set_level(logging.DEBUG, logger="src.middleware.request_id")
        caplog.clear()

        response = client.post("/quant-lab/alerts")

    assert response.status_code == 200

    info_messages = [record.getMessage() for record in caplog.records if record.levelno == logging.INFO]

    assert "请求开始: POST /quant-lab/alerts" in info_messages
    assert "请求完成: POST /quant-lab/alerts 状态码=200" in info_messages


def test_request_id_middleware_demotes_health_check_logs(caplog):
    app = _build_app()

    with TestClient(app) as client:
        caplog.set_level(logging.DEBUG, logger="src.middleware.request_id")
        caplog.clear()

        response = client.get("/health")

    assert response.status_code == 200

    info_messages = [record.getMessage() for record in caplog.records if record.levelno == logging.INFO]
    debug_messages = [record.getMessage() for record in caplog.records if record.levelno == logging.DEBUG]

    assert "请求开始: GET /health" not in info_messages
    assert "请求完成: GET /health 状态码=200" not in info_messages
    assert "请求开始: GET /health" in debug_messages
    assert "请求完成: GET /health 状态码=200" in debug_messages


def test_request_id_middleware_demotes_successful_preflight_logs(caplog):
    app = _build_app()

    with TestClient(app) as client:
        caplog.set_level(logging.DEBUG, logger="src.middleware.request_id")
        caplog.clear()

        response = client.options("/quant-lab/alerts/publish")

    assert response.status_code == 200

    info_messages = [record.getMessage() for record in caplog.records if record.levelno == logging.INFO]
    debug_messages = [record.getMessage() for record in caplog.records if record.levelno == logging.DEBUG]

    assert "请求开始: OPTIONS /quant-lab/alerts/publish" not in info_messages
    assert "请求完成: OPTIONS /quant-lab/alerts/publish 状态码=200" not in info_messages
    assert "请求开始: OPTIONS /quant-lab/alerts/publish" in debug_messages
    assert "请求完成: OPTIONS /quant-lab/alerts/publish 状态码=200" in debug_messages

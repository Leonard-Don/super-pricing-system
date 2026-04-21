"""
应用与前后端通信配置。
"""

import os

API_HOST = os.getenv("API_HOST", "127.0.0.1")
API_PORT = int(os.getenv("API_PORT", "8100"))
API_RELOAD = os.getenv("API_RELOAD", "True").lower() == "true"

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://127.0.0.1:3100")
CORS_ORIGINS = list(
    dict.fromkeys(
        [
            FRONTEND_URL,
            "http://127.0.0.1:3100",
            "http://localhost:3100",
            "http://127.0.0.1:3000",
            "http://localhost:3000",
        ]
    )
)

API_TIMEOUT = int(os.getenv("API_TIMEOUT", "30"))
HEALTH_CHECK_TIMEOUT = int(os.getenv("HEALTH_CHECK_TIMEOUT", "5"))
BACKEND_WAIT_TIMEOUT = int(os.getenv("BACKEND_WAIT_TIMEOUT", "30"))

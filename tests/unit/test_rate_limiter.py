"""Regression tests for the production rate-limit configuration.

The rate limiter is mounted as live middleware in ``backend/main.py`` and its
per-endpoint rules live in ``backend/app/core/rate_limit_state.py``. These
tests guard against the rule patterns drifting away from the actual mounted
route paths -- when they mismatch, every tightened limit silently degrades to
the default and the misconfiguration is invisible.
"""

import pytest
from starlette.requests import Request

from backend.app.core.rate_limit_state import rate_limiter
from src.middleware.rate_limiter import RateLimiter


def _make_request(path: str, client_host: str) -> Request:
    """Build a minimal ASGI request the limiter can evaluate."""
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "headers": [],
            "client": (client_host, 12345),
            "scheme": "http",
            "server": ("testserver", 80),
        }
    )


@pytest.mark.parametrize(
    ("request_path", "expected_rule_id", "expected_rpm"),
    [
        ("/backtest/run", "backtest", 24),
        ("/quant-lab/optimize", "quant_lab", 40),
        ("/realtime/quotes", "realtime", 180),
        ("/pricing/analyze", "pricing", 45),
        ("/industry/ranking", "industry", 75),
    ],
)
def test_production_rules_match_mounted_route_paths(request_path, expected_rule_id, expected_rpm):
    """Each tightened rule must match the path its endpoints are actually served at.

    Routers are mounted with no ``/api/v1`` prefix (see ``api.py``), so a rule
    pattern of ``/api/v1/backtest*`` never matches the real ``/backtest`` path
    and the request silently falls back to the default limit.
    """
    rule = rate_limiter._match_rule(request_path)

    assert rule["id"] == expected_rule_id
    assert rule["requests_per_minute"] == expected_rpm


def test_evaluate_keeps_stats_dicts_bounded():
    """A long-running limiter must not accumulate one stat entry per distinct
    path / client forever -- endpoint_stats and identity_stats are pruned so
    memory cannot grow without bound.
    """
    limiter = RateLimiter()
    distinct = limiter._max_tracked_stats + 80

    for i in range(distinct):
        limiter.evaluate(_make_request(f"/ep/{i}", f"10.0.{i // 256}.{i % 256}"))

    assert len(limiter.endpoint_stats) <= limiter._max_tracked_stats
    assert len(limiter.identity_stats) <= limiter._max_tracked_stats

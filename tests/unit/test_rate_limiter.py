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


def _make_request(path: str, client_host: str, headers: dict | None = None) -> Request:
    """Build a minimal ASGI request the limiter can evaluate.

    ``client_host`` is the real transport peer (``request.client.host``);
    ``headers`` are optional request headers, e.g. attacker-supplied
    ``X-Forwarded-For`` used to probe loopback-spoofing.
    """
    raw_headers = [
        (name.lower().encode(), value.encode()) for name, value in (headers or {}).items()
    ]
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "headers": raw_headers,
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


def test_evaluate_keeps_tracking_maps_bounded():
    """A long-running limiter must not accumulate one entry per distinct
    path / client forever -- endpoint_stats, identity_stats and the per-client
    token buckets are all pruned so memory cannot grow without bound.
    """
    limiter = RateLimiter()
    distinct = limiter._max_tracked_stats + 80

    for i in range(distinct):
        limiter.evaluate(_make_request(f"/ep/{i}", f"10.0.{i // 256}.{i % 256}"))

    assert len(limiter.endpoint_stats) <= limiter._max_tracked_stats
    assert len(limiter.identity_stats) <= limiter._max_tracked_stats
    assert len(limiter.buckets) <= limiter._max_tracked_stats


def test_is_local_request_ignores_spoofed_forwarding_headers():
    """A remote caller must not gain local status by forging forwarding headers.

    ``is_local_request`` gates a full rate-limit bypass in ``backend/main.py``.
    ``X-Forwarded-For`` / ``X-Real-IP`` are client-supplied and attacker-
    controlled, so the only trustworthy signal is the real transport peer
    (``request.client.host``). A request from ``203.0.113.7`` carrying
    ``X-Forwarded-For: 127.0.0.1`` is NOT local.
    """
    limiter = RateLimiter()
    request = _make_request(
        "/pricing/analyze",
        "203.0.113.7",
        headers={"X-Forwarded-For": "127.0.0.1", "X-Real-IP": "127.0.0.1"},
    )

    assert limiter.is_local_request(request) is False


def test_is_local_request_true_for_genuine_loopback_peer():
    """A request whose real transport peer is loopback is genuinely local."""
    limiter = RateLimiter()
    request = _make_request("/pricing/analyze", "127.0.0.1")

    assert limiter.is_local_request(request) is True


def test_is_local_request_false_for_remote_peer_without_headers():
    """A plain remote request (no forwarding headers) is not local."""
    limiter = RateLimiter()
    request = _make_request("/pricing/analyze", "203.0.113.7")

    assert limiter.is_local_request(request) is False


def test_get_client_identity_ignores_spoofed_forwarding_headers():
    """An anonymous caller must not dilute per-identity rate limiting by
    forging forwarding headers.

    With no bearer token / ``X-API-Key`` / ``X-User-Id``, ``get_client_identity``
    falls back to a network address for the rate-limit bucket key.
    ``X-Forwarded-For`` / ``X-Real-IP`` are client-supplied and attacker-
    controlled -- if the fallback trusted them, an anonymous caller could send a
    fresh fake ``X-Forwarded-For`` on every request and get a brand-new token
    bucket each time, diluting the limit to near-uselessness. The only
    trustworthy signal is the real transport peer (``request.client.host``), so
    two anonymous requests from the same peer must share one ``subject``
    regardless of what forwarding headers they forge.
    """
    limiter = RateLimiter()
    request_a = _make_request(
        "/pricing/analyze",
        "203.0.113.7",
        headers={"X-Forwarded-For": "10.0.0.1", "X-Real-IP": "10.0.0.1"},
    )
    request_b = _make_request(
        "/pricing/analyze",
        "203.0.113.7",
        headers={"X-Forwarded-For": "198.51.100.99", "X-Real-IP": "198.51.100.99"},
    )

    identity_a = limiter.get_client_identity(request_a)
    identity_b = limiter.get_client_identity(request_b)

    assert identity_a["subject"] == identity_b["subject"]
    assert identity_a["subject"] == "ip:203.0.113.7"

"""Circuit-breaker tests for ``BaseAltProvider._safe_request``.

Root cause (debugging session 2026-06-07): on every backend startup,
``refresh_all(force=True)`` force-refreshes all alt-data providers. The
supply-chain bidding provider fetches from an unreachable host
(``deal.ggzy.gov.cn``); with no circuit breaker, ``_safe_request`` blocking-
retries the whole industry x keyword matrix (~2-3 min of ``requests`` +
``time.sleep``) on every boot — log spam, network hammering, and the likely
trigger of the transient event-loop unresponsiveness.

These tests lock in a host-level circuit breaker: after K consecutive
connection/timeout failures to a host, further requests to that host
short-circuit (return ``None`` immediately, no blocking) for a cooldown; any
success resets it. HTTP errors (a reachable host returning 4xx/5xx) must NOT
trip the breaker.
"""

from __future__ import annotations

from typing import Any, Dict, List
from unittest.mock import MagicMock, patch

import requests

from src.data.alternative.base_alt_provider import (
    AltDataCategory,
    AltDataRecord,
    BaseAltDataProvider,
)


class _DummyProvider(BaseAltDataProvider):
    """Minimal concrete provider so we can exercise ``_safe_request``."""

    name = "dummy"
    category = AltDataCategory.BIDDING

    def fetch(self, **kwargs) -> List[Dict[str, Any]]:  # pragma: no cover - unused
        return []

    def parse(self, raw_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:  # pragma: no cover
        return raw_data

    def normalize(self, parsed_data: List[Dict[str, Any]]) -> List[AltDataRecord]:  # pragma: no cover
        return []


URL = "http://dead.example.test/endpoint"
_MOD = "src.data.alternative.base_alt_provider"


def _provider() -> _DummyProvider:
    # min_request_interval=0 keeps _throttle from sleeping
    return _DummyProvider({"min_request_interval": 0})


def test_breaker_opens_after_consecutive_connection_failures_and_short_circuits():
    p = _provider()
    threshold = p._CB_FAILURE_THRESHOLD
    with patch(f"{_MOD}.requests.request",
               side_effect=requests.exceptions.ConnectionError("refused")) as req, \
            patch(f"{_MOD}.time.sleep"):
        for _ in range(threshold):
            assert p._safe_request(URL, max_retries=1) is None
        calls_after_trip = req.call_count
        assert calls_after_trip >= threshold  # it really attempted the network

        # Breaker now OPEN — subsequent calls must short-circuit with NO new attempts.
        assert p._safe_request(URL, max_retries=1) is None
        assert p._safe_request(URL, max_retries=1) is None
        assert req.call_count == calls_after_trip


def test_http_errors_do_not_trip_the_breaker():
    """A reachable host returning 4xx/5xx is not 'down' — keep trying."""
    p = _provider()
    resp = MagicMock()
    http_err = requests.exceptions.HTTPError("boom")
    http_err.response = MagicMock(status_code=500)
    resp.raise_for_status.side_effect = http_err
    with patch(f"{_MOD}.requests.request", return_value=resp) as req, \
            patch(f"{_MOD}.time.sleep"):
        for _ in range(p._CB_FAILURE_THRESHOLD + 2):
            p._safe_request(URL, max_retries=1)
        # never short-circuited — every call still hit the network
        assert req.call_count == p._CB_FAILURE_THRESHOLD + 2


def test_success_resets_the_failure_counter():
    p = _provider()
    ok = MagicMock()
    ok.raise_for_status = MagicMock()  # no error -> success
    conn_err = requests.exceptions.ConnectionError("refused")
    with patch(f"{_MOD}.requests.request") as req, patch(f"{_MOD}.time.sleep"):
        # threshold-1 failures (one short of tripping)
        req.side_effect = conn_err
        for _ in range(p._CB_FAILURE_THRESHOLD - 1):
            p._safe_request(URL, max_retries=1)
        # a success resets the counter
        req.side_effect = None
        req.return_value = ok
        assert p._safe_request(URL, max_retries=1) is ok

        # now it should take a FULL threshold of fresh failures to trip again
        req.side_effect = conn_err
        for _ in range(p._CB_FAILURE_THRESHOLD):
            p._safe_request(URL, max_retries=1)
        calls = req.call_count
        # breaker open now -> short-circuits
        p._safe_request(URL, max_retries=1)
        assert req.call_count == calls

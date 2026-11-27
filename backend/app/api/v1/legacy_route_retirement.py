"""Retirement matrix for route groups kept only as legacy support.

The main product surface for this repository is the pricing research,
alt-data / macro, cross-market, workbench, quant-lab, and infrastructure
APIs. Several older quant-workspace route groups are still mounted for saved
research tasks and local compatibility, but hidden from OpenAPI. This matrix is
used by tests to keep that boundary explicit whenever a router is hidden with
``include_in_schema=False``.
"""

from __future__ import annotations

from typing import Final, TypedDict


class LegacyRouteRetirementRow(TypedDict):
    status: str
    owner: str
    replacement: str
    removal_condition: str
    openapi_policy: str


LEGACY_ROUTE_RETIREMENT_MATRIX: Final[dict[str, LegacyRouteRetirementRow]] = {
    "/realtime": {
        "status": "hidden_legacy_support",
        "owner": "watchlist report (GET/PUT /realtime/preferences only)",
        "replacement": "quant-trading-system realtime feeds",
        "removal_condition": "remove after the watchlist report stops reading /realtime/preferences",
        "openapi_policy": "include_in_schema_false",
    },
}

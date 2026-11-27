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
    "/backtest": {
        "status": "hidden_legacy_support",
        "owner": "saved research task compatibility",
        "replacement": "quant-lab and quant-trading-system backtest surfaces",
        "removal_condition": "remove after historical saved tasks no longer deep-link to legacy backtest routes",
        "openapi_policy": "include_in_schema_false",
    },
    "/realtime": {
        "status": "hidden_legacy_support",
        "owner": "alert compatibility",
        "replacement": "quant-lab alert center and quant-trading-system realtime feeds",
        "removal_condition": "remove after realtime alerts no longer depend on this repository's legacy websocket/polling handlers",
        "openapi_policy": "include_in_schema_false",
    },
    "/industry": {
        "status": "hidden_legacy_support",
        "owner": "legacy industry heatmap compatibility",
        "replacement": "cross-market diagnostics and pricing research industry context",
        "removal_condition": "remove after active dashboards stop reading industry heatmap internals directly",
        "openapi_policy": "include_in_schema_false",
    },
}

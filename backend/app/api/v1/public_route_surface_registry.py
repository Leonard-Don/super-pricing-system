"""Public API routes that intentionally have no production frontend entry.

The React app should either call a public product endpoint directly via a
service helper or the backend route should be classified here. This keeps
"backend exists but frontend never uses it" audits deterministic and prevents
legacy/deprecated compatibility endpoints from being mistaken for product gaps.
"""

from __future__ import annotations

from typing import Final, TypedDict


class PublicRouteSurfaceRow(TypedDict):
    status: str
    owner: str
    entry_strategy: str
    removal_condition: str


PUBLIC_ROUTE_SURFACE_REGISTRY: Final[dict[str, PublicRouteSurfaceRow]] = {
    "GET /system/status": {
        "status": "deprecated_compat",
        "owner": "legacy system dashboard compatibility",
        "entry_strategy": "Do not add a new frontend entry; active operations views should use /infrastructure/status and infrastructure diagnostics.",
        "removal_condition": "Remove after saved probes and dashboards stop polling the legacy system status payload.",
    },
    "GET /system/performance": {
        "status": "deprecated_compat",
        "owner": "legacy system dashboard compatibility",
        "entry_strategy": "Do not add a new frontend entry; prefer telemetry-specific monitoring or infrastructure diagnostics.",
        "removal_condition": "Remove after saved dashboards migrate away from the legacy performance overview.",
    },
    "GET /system/health-check": {
        "status": "deprecated_compat",
        "owner": "legacy system health probe compatibility",
        "entry_strategy": "Do not add a new frontend entry; prefer infrastructure health/status surfaces.",
        "removal_condition": "Remove after external probes and saved tasks migrate to infrastructure health diagnostics.",
    },
    "GET /system/metrics": {
        "status": "deprecated_compat",
        "owner": "legacy metrics dashboard compatibility",
        "entry_strategy": "Do not add a new frontend entry; prefer infrastructure telemetry or external monitoring.",
        "removal_condition": "Remove after saved dashboards no longer request the legacy metrics payload.",
    },
    "GET /system/alerts/summary": {
        "status": "deprecated_compat",
        "owner": "legacy alert-center compatibility",
        "entry_strategy": "Do not wire to new UI; current alert center surfaces alert orchestration through quant-lab/infrastructure flows.",
        "removal_condition": "Remove after one compatibility window with no logged calls to the legacy alert summary endpoint.",
    },
    "POST /system/alerts/{alert_index}/resolve": {
        "status": "deprecated_compat",
        "owner": "legacy alert-center compatibility",
        "entry_strategy": "Do not add a new frontend entry; alert review actions should use the current alert orchestration APIs.",
        "removal_condition": "Remove after legacy alert-index based resolve requests disappear from saved clients.",
    },
    "GET /system/dependencies": {
        "status": "deprecated_compat",
        "owner": "legacy dependency probe compatibility",
        "entry_strategy": "Do not add a new frontend entry; prefer infrastructure diagnostics for dependency status.",
        "removal_condition": "Remove after saved probes migrate to infrastructure diagnostics.",
    },
    "GET /alt-data/signals": {
        "status": "deprecated_compat",
        "owner": "legacy alt-data dashboard compatibility",
        "entry_strategy": "Do not add a new frontend entry; use /alt-data/snapshot, /alt-data/history, and /alt-data/diagnostics/signals instead.",
        "removal_condition": "Remove after saved clients migrate to the snapshot/history/diagnostics alt-data surfaces.",
    },
    "GET /alt-data/providers": {
        "status": "deprecated_compat",
        "owner": "legacy alt-data provider list compatibility",
        "entry_strategy": "Do not add a new frontend entry; use /alt-data/status and /alt-data/health provider summaries instead.",
        "removal_condition": "Remove after saved clients stop requesting the legacy provider list.",
    },
    "GET /macro/history": {
        "status": "deprecated_compat",
        "owner": "legacy macro-history compatibility",
        "entry_strategy": "Do not add a new frontend entry; use macro overview and factor-backtest surfaces for active UI work.",
        "removal_condition": "Remove after saved research tasks no longer read the legacy macro history payload.",
    },
}

"""Public API routes that intentionally have no direct production frontend entry.

The React app should either call a public product endpoint directly via a
service helper or the backend route should be classified here. This keeps
"backend exists but frontend never uses it" audits deterministic and prevents
legacy/deprecated compatibility endpoints from being mistaken for product gaps.

The v5 frontend lives in `frontend/` (Vite + React; the pre-split CRA/AntD
frontend was retired in the P4 cutover). The scanner targets frontend/src. The v5 frontend (frontend/) is
scoped to pricing / god-eye / workbench — infrastructure admin, deprecated
legacy, and not-yet-wired routes are all classified here.
"""

from __future__ import annotations

from typing import Final, TypedDict


class PublicRouteSurfaceRow(TypedDict):
    status: str
    owner: str
    entry_strategy: str
    removal_condition: str


PUBLIC_ROUTE_SURFACE_REGISTRY: Final[dict[str, PublicRouteSurfaceRow]] = {
    # ── Legacy system-dashboard compatibility ─────────────────────────────
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
    # ── Legacy alt-data compatibility ─────────────────────────────────────
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
    # ── Legacy macro compatibility ────────────────────────────────────────
    "GET /macro/history": {
        "status": "deprecated_compat",
        "owner": "legacy macro-history compatibility",
        "entry_strategy": "Do not add a new frontend entry; use macro overview and factor-backtest surfaces for active UI work.",
        "removal_condition": "Remove after saved research tasks no longer read the legacy macro history payload.",
    },
    # ── External OAuth callback ───────────────────────────────────────────
    "GET /infrastructure/auth/oauth/providers/{provider_id}/callback": {
        "status": "external_callback",
        "owner": "infrastructure OAuth provider redirect flow",
        "entry_strategy": (
            "Do not add a React service helper; provider authorization windows redirect here and "
            "the callback page posts quant-oauth-callback to the opener."
        ),
        "removal_condition": (
            "Keep while infrastructure OAuth login uses backend-hosted callbacks; remove only if "
            "the OAuth flow moves to a dedicated auth gateway."
        ),
    },
    # ── Infrastructure admin — v5 scope gap (not yet in frontend/ UI) ─────────
    # NOTE: GET /infrastructure/status removed — now called from frontend/src
    # (useDailyBriefing via getInfrastructureStatus, P3.5).
    "GET /infrastructure/signal-panel": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Service helper getInfrastructureSignalPanel exists in frontend/src but no component calls it yet.",
        "removal_condition": "Remove this entry once a component in frontend/src calls getInfrastructureSignalPanel.",
    },
    "GET /infrastructure/tasks": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI; add a service helper when infrastructure task monitoring is built.",
        "removal_condition": "Remove this entry once /infrastructure/tasks is called from frontend/src.",
    },
    "GET /infrastructure/tasks/{task_id}": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI; add when task detail view is built.",
        "removal_condition": "Remove this entry once task detail is called from frontend/src.",
    },
    "POST /infrastructure/tasks": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "POST /infrastructure/tasks/{task_id}/cancel": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "GET /infrastructure/config-versions": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "GET /infrastructure/config-versions/diff": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "POST /infrastructure/config-versions": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "POST /infrastructure/config-versions/restore": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "GET /infrastructure/persistence/diagnostics": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "GET /infrastructure/persistence/migration/preview": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "POST /infrastructure/persistence/migration/run": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "GET /infrastructure/persistence/records": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "POST /infrastructure/persistence/records": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "GET /infrastructure/persistence/timeseries": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "POST /infrastructure/persistence/timeseries": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "POST /infrastructure/persistence/bootstrap": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "GET /infrastructure/auth/users": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "POST /infrastructure/auth/users": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "POST /infrastructure/auth/token": {
        "status": "deprecated_compat",
        "owner": "infrastructure auth — v5 scope gap",
        "entry_strategy": "Token endpoint called internally via core.ts refresh flow; no direct component entry needed.",
        "removal_condition": "Remove this entry if token management is surfaced in a UI component.",
    },
    "POST /infrastructure/auth/policy": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "POST /infrastructure/auth/sessions/{session_id}/revoke": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "GET /infrastructure/auth/oauth/providers": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI (OAuth provider list for admin).",
        "removal_condition": "Remove this entry once an admin OAuth settings panel calls this from frontend/src.",
    },
    "POST /infrastructure/auth/oauth/providers": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "POST /infrastructure/auth/oauth/providers/sync-env": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "POST /infrastructure/auth/oauth/providers/{provider_id}/authorize": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "POST /infrastructure/auth/oauth/providers/{provider_id}/exchange": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "GET /infrastructure/auth/oauth/providers/{provider_id}/diagnostics": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "POST /infrastructure/notifications/channels": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "DELETE /infrastructure/notifications/channels/{channel_id}": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "POST /infrastructure/notifications/test": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "POST /infrastructure/rate-limits": {
        "status": "deprecated_compat",
        "owner": "infrastructure admin — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    # ── Product routes — service helper exists but component not wired yet ─
    "POST /pricing/factor-model": {
        "status": "deprecated_compat",
        "owner": "pricing — v5 scope gap",
        "entry_strategy": "Service helper getFactorModelAnalysis exists in frontend/src/services/api/pricing.ts but no component invokes it yet.",
        "removal_condition": "Remove this entry once a pricing component calls getFactorModelAnalysis.",
    },
    "GET /pricing/benchmark-factors": {
        "status": "deprecated_compat",
        "owner": "pricing — v5 scope gap",
        "entry_strategy": "Service helper getBenchmarkFactors exists in frontend/src/services/api/pricing.ts but no component invokes it yet.",
        "removal_condition": "Remove this entry once a pricing component calls getBenchmarkFactors.",
    },
    "GET /macro/factor-backtest": {
        "status": "deprecated_compat",
        "owner": "macro/god-eye — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI; factor backtest results may be surfaced in a future god-eye or quant-lab panel.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "POST /cross-market/backtest": {
        "status": "deprecated_compat",
        "owner": "cross-market — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once a cross-market backtest panel calls this from frontend/src.",
    },
    # ── Quant-lab routes — v5 scope gap ───────────────────────────────────
    "GET /quant-lab/data-quality": {
        "status": "deprecated_compat",
        "owner": "quant-lab — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "GET /quant-lab/trading-journal": {
        "status": "deprecated_compat",
        "owner": "quant-lab — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "PUT /quant-lab/trading-journal": {
        "status": "deprecated_compat",
        "owner": "quant-lab — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    "POST /quant-lab/alerts/action": {
        "status": "deprecated_compat",
        "owner": "quant-lab — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    # ── Research workbench routes — v5 scope gap ─────────────────────────
    # NOTE: the briefing (distribution/dry-run/send) and alt-data-candidate
    # (list/refresh/convert/dismiss/snooze) routes were removed — now called
    # from frontend/src (P3.5 daily-briefing + candidate-queue features).
    "POST /research-workbench/tasks/from-screener": {
        "status": "deprecated_compat",
        "owner": "research-workbench — v5 scope gap",
        "entry_strategy": "Not yet wired into the v5 frontend/ workbench UI.",
        "removal_condition": "Remove this entry once used from frontend/src.",
    },
    # Credibility routes are wired into frontend/src/features/credibility/api.ts +
    # mounted on pricing/valuation/godeye, so they have frontend entries (not listed here).
    # ── Proactive mispricing alerts — Tier 3 PR-1 (eval core; frontend lands in PR-2) ──
    "GET /alerts/mispricing/rule": {
        "status": "deprecated_compat",
        "owner": "mispricing-alerts — Tier 3",
        "entry_strategy": "Backend eval core (PR-1); the rules/history panel lands in PR-2.",
        "removal_condition": "Remove once a frontend component in frontend/src calls it.",
    },
    "PUT /alerts/mispricing/rule": {
        "status": "deprecated_compat",
        "owner": "mispricing-alerts — Tier 3",
        "entry_strategy": "Backend eval core (PR-1); the rules panel lands in PR-2.",
        "removal_condition": "Remove once a frontend component in frontend/src calls it.",
    },
    "GET /alerts/mispricing/history": {
        "status": "deprecated_compat",
        "owner": "mispricing-alerts — Tier 3",
        "entry_strategy": "Backend eval core (PR-1); the history panel lands in PR-2.",
        "removal_condition": "Remove once a frontend component in frontend/src calls it.",
    },
    "POST /alerts/mispricing/evaluate": {
        "status": "deprecated_compat",
        "owner": "mispricing-alerts — Tier 3",
        "entry_strategy": "Backend dry-run eval (PR-1); wired from the panel in PR-2.",
        "removal_condition": "Remove once a frontend component in frontend/src calls it.",
    },
}

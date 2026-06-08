# Public route surface registry

This registry documents public backend routes that intentionally have no direct production frontend entry in `frontend/src` (the v5 frontend, post-P4 cutover). Hidden legacy route groups stay in `backend/app/api/v1/legacy_route_retirement.py`; this file is for public OpenAPI routes that are either deprecated compatibility surfaces, externally-entered backend callbacks, or v5 scope gaps (routes not yet wired into the `frontend/` UI).

## Product routes — service helper exists, component not yet wired

These routes have service helpers in `frontend/src/services/api/` but no component calls them yet.

- `POST /pricing/factor-model` → `getFactorModelAnalysis` in `frontend/src/services/api/pricing.ts`
- `GET /pricing/benchmark-factors` → `getBenchmarkFactors` in `frontend/src/services/api/pricing.ts`
- `GET /infrastructure/signal-panel` → `getInfrastructureSignalPanel` (helper exists)

## Externally-entered public routes

- `GET /infrastructure/auth/oauth/providers/{provider_id}/callback`
  - status: `external_callback`
  - entry strategy: no React service helper; OAuth provider authorization windows redirect here and the backend callback page posts `quant-oauth-callback` to the opener.
  - removal condition: keep while infrastructure OAuth login uses backend-hosted callbacks; remove only if the OAuth flow moves to a dedicated auth gateway.

## Deprecated public compatibility routes

- `GET /system/status`
  - status: `deprecated_compat`
  - entry strategy: no new frontend entry; use `/infrastructure/status` and infrastructure diagnostics.
  - removal condition: remove after saved probes/dashboards stop polling the legacy status payload.

- `GET /system/performance`
  - status: `deprecated_compat`
  - entry strategy: no new frontend entry; prefer telemetry-specific monitoring or infrastructure diagnostics.
  - removal condition: remove after saved dashboards migrate away from the legacy performance overview.

- `GET /system/health-check`
  - status: `deprecated_compat`
  - entry strategy: no new frontend entry; prefer infrastructure health/status surfaces.
  - removal condition: remove after external probes and saved tasks migrate to infrastructure health diagnostics.

- `GET /system/metrics`
  - status: `deprecated_compat`
  - entry strategy: no new frontend entry; prefer infrastructure telemetry or external monitoring.
  - removal condition: remove after saved dashboards no longer request the legacy metrics payload.

- `GET /system/alerts/summary`
  - status: `deprecated_compat`
  - entry strategy: no new frontend entry; current alert center should use alert orchestration APIs.
  - removal condition: remove after one compatibility window with no logged calls.

- `POST /system/alerts/{alert_index}/resolve`
  - status: `deprecated_compat`
  - entry strategy: no new frontend entry; use current alert review/orchestration APIs.
  - removal condition: remove after legacy alert-index based resolve requests disappear from saved clients.

- `GET /system/dependencies`
  - status: `deprecated_compat`
  - entry strategy: no new frontend entry; prefer infrastructure diagnostics.
  - removal condition: remove after saved probes migrate to infrastructure diagnostics.

- `GET /alt-data/signals`
  - status: `deprecated_compat`
  - entry strategy: no new frontend entry; use `/alt-data/snapshot`, `/alt-data/history`, and `/alt-data/diagnostics/signals`.
  - removal condition: remove after saved clients migrate to the newer alt-data surfaces.

- `GET /alt-data/providers`
  - status: `deprecated_compat`
  - entry strategy: no new frontend entry; use `/alt-data/status` and `/alt-data/health` provider summaries.
  - removal condition: remove after saved clients stop requesting the legacy provider list.

- `GET /macro/history`
  - status: `deprecated_compat`
  - entry strategy: no new frontend entry; use macro overview and factor-backtest surfaces for active UI work.
  - removal condition: remove after saved research tasks no longer read the legacy macro history payload.

## v5 scope gaps — infrastructure admin

Routes not yet wired into the v5 `frontend/` UI. Remove the registry entry once the route is called from `frontend/src`.

- `GET /infrastructure/tasks`
- `GET /infrastructure/tasks/{task_id}`
- `POST /infrastructure/tasks`
- `POST /infrastructure/tasks/{task_id}/cancel`
- `GET /infrastructure/config-versions`
- `GET /infrastructure/config-versions/diff`
- `POST /infrastructure/config-versions`
- `POST /infrastructure/config-versions/restore`
- `GET /infrastructure/persistence/diagnostics`
- `GET /infrastructure/persistence/migration/preview`
- `POST /infrastructure/persistence/migration/run`
- `GET /infrastructure/persistence/records`
- `POST /infrastructure/persistence/records`
- `GET /infrastructure/persistence/timeseries`
- `POST /infrastructure/persistence/timeseries`
- `POST /infrastructure/persistence/bootstrap`
- `GET /infrastructure/auth/users`
- `POST /infrastructure/auth/users`
- `POST /infrastructure/auth/token`
- `POST /infrastructure/auth/policy`
- `POST /infrastructure/auth/sessions/{session_id}/revoke`
- `GET /infrastructure/auth/oauth/providers`
- `POST /infrastructure/auth/oauth/providers`
- `POST /infrastructure/auth/oauth/providers/sync-env`
- `POST /infrastructure/auth/oauth/providers/{provider_id}/authorize`
- `POST /infrastructure/auth/oauth/providers/{provider_id}/exchange`
- `GET /infrastructure/auth/oauth/providers/{provider_id}/diagnostics`
- `POST /infrastructure/notifications/channels`
- `DELETE /infrastructure/notifications/channels/{channel_id}`
- `POST /infrastructure/notifications/test`
- `POST /infrastructure/rate-limits`

## v5 scope gaps — product features

Routes for features not yet surfaced in the v5 `frontend/` UI. Remove each registry entry once its route is called from `frontend/src`.

- `GET /macro/factor-backtest`
- `POST /cross-market/backtest`
- `GET /quant-lab/data-quality`
- `GET /quant-lab/trading-journal`
- `PUT /quant-lab/trading-journal`
- `POST /quant-lab/alerts/action`
- `POST /research-workbench/tasks/from-screener`
- `GET /credibility/pricing` — per-stock signal credibility; will be mounted in ValuationLabPage (Tasks 10-12)
- `GET /credibility/macro` — macro signal credibility; will be mounted in GodEyePage (Tasks 10-12)
- `GET /credibility/screener` — screener cross-sectional credibility; will be shown in screener results area (Tasks 10-12)
<!-- briefing (distribution/dry-run/send) + alt-data-candidate (list/refresh/convert/dismiss/snooze) routes are now called from frontend/src (P3.5) — removed from the scope-gap registry. -->

# Public route surface registry

This registry documents public backend routes that intentionally have no direct production frontend entry in `frontend/src`. Hidden legacy route groups stay in `backend/app/api/v1/legacy_route_retirement.py`; this file is for public OpenAPI routes that are either deprecated compatibility surfaces or externally-entered backend callbacks.

Current product gaps have been closed at the service-helper layer:

- `POST /pricing/factor-model` → `getFactorModelAnalysis`
- `GET /pricing/benchmark-factors` → `getBenchmarkFactors`
- `GET /alt-data/themes-with-diversity` → `getAltDataThemesWithDiversity`
- `GET /alt-data/provider-correlation` → `getAltDataProviderCorrelation`
- `GET /alt-data/composite-signals-cluster-aware` → `getCompositeSignalsClusterAware`
- `GET /alt-data/composite-signal-comparison` → `getCompositeSignalComparison`
- `GET /infrastructure/signal-panel` → `getInfrastructureSignalPanel`

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

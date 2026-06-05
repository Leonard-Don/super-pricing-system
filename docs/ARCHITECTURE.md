# super-pricing-system · Architecture

This document describes the runtime topology, layering, and request lifecycle
of `super-pricing-system`. It complements `docs/PROJECT_STRUCTURE.md`
(which lists workspaces) and `CLAUDE.md` (which lists commands and gates).

> Current revision: v4.1.0 with v4.2.0 cleanup work in progress.
> See `docs/REFACTORING_PLAN.md` for the current cleanup and split-boundary plan.

---

## 1. Bird's-eye view

```
┌─────────────────────────────────────────────────────────────────┐
│      Browser SPA — web/ (Vite + React 19 + TS + Tailwind v4)     │
│   /pricing | /godeye | /workbench  (v5 shadcn dark+amber)        │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTPS / WSS
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│              FastAPI app — backend/main.py:8100                  │
│  ┌────────────────┬─────────────────┬────────────────────────┐  │
│  │ HTTP routers   │ WebSocket gw    │ Auth / token middleware│  │
│  │ (33 files,     │ (realtime quotes│ (JWT, env-secret,      │  │
│  │  12 prefixes)  │  ~/ws)          │  optional gate)        │  │
│  └────────┬───────┴────────┬────────┴────────────────────────┘  │
└───────────┼────────────────┼────────────────────────────────────┘
            │                │
            ▼                ▼
┌──────────────────────┐  ┌──────────────────────────────────────┐
│ backend/app/services │  │ backend/app/core/task_queue.py       │
│ (QuantLab service    │  │ - default: ThreadPoolExecutor        │
│  layer, narrow API   │  │ - optional: Celery + Redis broker    │
│  surface)            │  └──────────────────────────────────────┘
└──────────┬───────────┘
           ▼
┌─────────────────────────────────────────────────────────────────┐
│              Pure computation engine — src/                      │
│ analytics  · backtest · strategy · research · trading · settings │
│ data/providers (Sina · THS · AKShare · yfinance)                 │
└──────────────────────┬──────────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│      Persistence — backend/app/core/persistence/                 │
│  - SQLite (default, file-backed under data/)                     │
│  - PostgreSQL/TimescaleDB (optional, when DATABASE_URL set)      │
│  - record table (key-value with type) + timeseries table         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Workspaces

The frontend SPA mounts four logical workspaces at the same React app under
different `?view=` query strings:

| Workspace | URL (v5 web/) | Backend prefix(es) consumed |
|---|---|---|
| 定价研究 (Pricing Research) | `/pricing` (含估值历史/自定义因子子页) | `/pricing/*`, `/pricing-support/*`, `/macro*` |
| 上帝视角 (GodEye) | `/godeye` (含深度诊断子页) | `/macro/*`, `/macro-conflicts/*`, `/macro-decay/*`, `/macro-evidence/*`, `/macro-quality/*`, `/macro-support/*` |
| 研究工作台 (Workbench) | `/workbench` | `/research-workbench/*`, `/research-workbench-support/*` |

Workspaces share the same React app shell, the same auth surface, and the
same backend instance. They are organisational, not deployment units.
Shared primitives such as `/market-data/*`, `/strategies/*`, `/backtest/*`,
`/realtime/*`, `/trade/*`, `/industry/*`, `/analysis/*`, `/events/*`, and
`/optimization/*` may remain mounted for old snapshots, system-flow reopens,
and local verification, but they are hidden from the generated OpenAPI/Postman
surface and are not top-level `super-pricing-system` product boundaries.

The `quantlab` workspace is intentionally scoped as a pricing experiment and
internal runtime surface. Valuation history and factor expression are the
visible product features; strategy optimization, backtest enhancement, industry
rotation, and realtime signal validation no longer have a Quant Lab frontend
entry point. Their backend routes and `src/` engine modules remain mounted and
maintained in this repo as internal runtime support, but are hidden from the
generated OpenAPI surface (`include_in_schema=False`). Further trading-focused
development of those capabilities can happen in `quant-trading-system`.

---

## 3. Backend layering

The backend follows a strict three-layer structure. Layer N must not import
upward into layer N-1.

```
Layer 1 — Routers (backend/app/api/v1/endpoints/)
   │  thin: parse request, validate, delegate, wrap response
   │  must NOT contain business logic or do disk/network IO directly
   │
   ▼
Layer 2 — Services (backend/app/services/, plus inline service helpers
                    next to each endpoint package, e.g.
                    backend/app/api/v1/endpoints/industry/heatmap_service.py)
   │  orchestration: cache lookup, provider fallback, error mapping,
   │  diagnostic envelope construction
   │
   ▼
Layer 3 — Core domain (src/)
      pure compute, no FastAPI / no HTTP / no service coupling
      analytics, backtest engines, strategy library, providers
```

### Persistence is its own subsystem

`backend/app/core/persistence/` is consumed by both layer 2 and layer 3
as a side facility, not a dependency in the layering. It exposes:
- `persistence_manager.list_records(record_type=...)` — typed key-value
  store backing auth/workbench/etc.
- `persistence_manager.append_timeseries(...)` and
  `persistence_manager.read_timeseries(...)` — narrow optimised path for
  tick / bar storage when TimescaleDB is wired in.
- `persistence_manager.healthcheck()` — used by the health-check script.

PostgreSQL/TimescaleDB schema is managed by Alembic — see `alembic/`
and `scripts/alembic_baseline.sh`. Existing PostgreSQL deployments
stamp once to revision `0001_baseline` and use `alembic upgrade head`
afterwards. SQLite (default local dev driver) keeps its inline bootstrap
in `_manager.py` and is intentionally not Alembic-managed.

### Auth subsystem

`backend/app/core/auth/` (split into `_secrets`, `_users_tokens`, `_oauth`,
`_constants`) handles JWT signing, password hashing (PBKDF2-SHA256 with
200k iterations and per-secret salt), and the env-driven enable flag
`AUTH_REQUIRED`.

Hard guard: when `ENVIRONMENT in {production, prod}` and `AUTH_SECRET` is
unset, the boot path raises `RuntimeError` rather than fall back to the
development placeholder. See `tests/unit/test_auth_secret_guard.py`.

### CORS

`src/settings/api.py` parses CORS origins by environment. Production never
falls back to `*`-with-credentials nor to localhost defaults; this is
verified by `tests/unit/test_cors_settings.py`.

---

## 4. Frontend layering

> v5 rebuild: `web/` (Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui dark+amber).
> Legacy `frontend/` (CRA / Ant Design) has been retired.

```
web/src/main.tsx → App.tsx (route definitions + Suspense boundaries)
   │
   ├─ features/ (one folder per workspace)
   │   ├─ pricing/      (定价研究 — analysis / valuation history / factor)
   │   ├─ godeye/       (上帝视角 — macro dashboard / deep diagnostics)
   │   └─ workbench/    (研究工作台 — task cards / snapshots / state flow)
   │
   ├─ components/ui/    (shadcn/ui component library, dark+amber theme)
   ├─ services/api/     (Axios + endpoint helpers, retry / abort / typing)
   └─ routes/           (route config; dev server :3100, proxies /api → :8100)
```

State management is intentionally local: each workspace owns its state
via custom hooks per feature. There is no global Redux / Zustand store.

---

## 5. Request lifecycle — a CAPM pricing query

```
Browser
  │
  │ POST /api/v1/pricing/capm  { symbol, market, lookback_days }
  ▼
backend/app/api/v1/endpoints/pricing.py
  │  - Pydantic validates request body
  │  - delegates to pricing service
  ▼
backend/app/services/pricing_service.py (or inline helper)
  │  - resolves data adapter (Sina / yfinance / cached)
  │  - reads pricing cache (bounded LRU under backend/app/core/)
  ▼
src/data/providers/sina_ths_adapter/
  │  - HTTP fetch with retry + rate limit
  │  - parses raw payload
  │  - normalises to canonical OHLCV frame
  ▼
src/analytics/pricing/capm.py
  │  - pure compute: regression, alpha/beta, R², residual std
  │
  └─► returns CAPMResult dataclass
  ▲
  │  service wraps result + diagnostics envelope
  │
  ▼
Browser receives JSON: { capm: { ... }, diagnostics: { ... }, meta: { ... } }
```

The same shape applies to FF3, DCF, gap analysis, and cross-market
backtests — only layer 3 differs.

---

## 6. Internal realtime support

`backend/app/websocket/` exposes `~/ws`. Subscribers send a JSON message
declaring symbols of interest; the backend pushes ticks as they arrive
from the underlying adapter. The realtime backend code remains present and
maintained in this repo as support for 定价实验台 diagnostics, old task
snapshots, and shared hooks; the four-workspace frontend ships no realtime
workstation UI of its own. A dedicated realtime workstation product can be
developed in `quant-trading-system`.

There is no SSE fallback; clients must support WebSocket.

---

## 7. Task queue

`backend/app/core/task_queue.py` exposes a `JobManager` that:

1. Runs jobs on a built-in `ThreadPoolExecutor` by default (no extra infra).
2. If `CELERY_BROKER_URL` (or `REDIS_URL`) is set AND the optional `celery`
   package is installed, it dispatches to a Celery worker instead.
3. Persists task status to the persistence layer's record table so the
   `/infrastructure/tasks` endpoint can serve UI listings without depending
   on the broker being reachable.

Result: a single instance can run cleanly without Docker, but scales out
horizontally by enabling the Celery path.

---

## 8. Caching

Two cache facilities live in `backend/app/core/`:
- `bounded_cache.py` — fixed-size LRU for hot read paths, cleared on
  process restart.
- Service-level micro-caches inside each endpoint package (`industry/_cache.py`,
  `analytics/_cache.py`) — typically TTL'd 60–300s, bypass-able via header
  for testing.

There is no Redis cache layer by default; if one is needed, the bounded
cache facility is the integration seam.

---

## 9. Testing topology

| Layer | Where | Run with |
|---|---|---|
| Unit | `tests/unit/` | `pytest tests/unit -q` |
| Integration | `tests/integration/` | `pytest tests/integration -q` |
| Manual | `tests/manual/` | excluded from CI |
| Browser E2E | `tests/e2e/` (Playwright) | `cd tests/e2e && npm run verify:research` |
| Frontend Vitest | `web/src/**/__tests__/` | `cd web && npm run test` |

CI (`.github/workflows/ci.yml`) enforces:
- coverage `--cov-fail-under=55`
- mypy incremental gate (no regression past `scripts/mypy_baseline_count.txt`)
- ruff pyflakes baseline (HARD), bandit medium (HARD), pip-audit `--strict`
- OpenAPI contract diff against `docs/openapi.json`
- npm audit `--audit-level=high` (runs in `web/`)
- Playwright research suite (depends on backend + web/ frontend passing)

See `docs/CLAUDE.md` for the local-equivalent commands.

---

## 10. Deployment shapes

### Single-host research workbench (default)

One Uvicorn instance + frontend dev/static build + SQLite. No Docker.
This is the assumed shape for a solo researcher and matches
`./scripts/start_system.sh`.

### Single-host with infra

`./scripts/start_system.sh --with-infra --with-worker` runs PostgreSQL/
TimescaleDB + Redis via docker-compose, plus a local Celery worker.
Suitable for "production-like" trial on one box.

### Multi-host (not packaged today)

- Backend on N nodes behind a load balancer (cookie-affinity NOT required;
  WebSocket sessions are independent).
- One shared PostgreSQL/TimescaleDB.
- One shared Redis broker.
- Celery workers scaled independently of the API tier.

The repo does not currently ship k8s manifests for this; treat it as a
target topology rather than a supported configuration.

---

## 11. Things this architecture intentionally lacks

- No microservices. The compute engine is one Python package.
- No event sourcing or CQRS. Writes go to the same record table reads come from.
- No GraphQL. All endpoints are typed REST.
- No container orchestration in-tree.
- No service mesh, no message broker beyond optional Celery.
- No multi-tenancy in the auth subsystem; users share one tenant.

These are deliberate omissions to keep the research workbench simple. If
the repo grows into a production trading system any of them may need
revisiting.

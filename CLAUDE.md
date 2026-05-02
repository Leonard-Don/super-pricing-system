# CLAUDE.md — Super Pricing System

This file orients AI assistants (Claude Code, Copilot, etc.) entering the
repository. Humans should read `README.md` first.

## What this project is

`super-pricing-system` is a self-hosted A 股 (China A-share) quantitative
research platform centered on macro mispricing detection. It is **not** a
production trading system — it is a research workbench. Current version
`v4.1.0`; an in-flight `v4.2.0` effort is documented under
`docs/superpowers/plans/2026-05-02-comprehensive-improvement.md`.

Four workspaces, mounted at the same SPA under different `?view=` query
strings:

| Workspace | URL | Purpose |
|-----------|-----|---------|
| 定价研究 (Pricing Research) | `?view=pricing` | CAPM / Fama-French 3 / DCF / gap analysis |
| 上帝视角 (GodEye) | `?view=godsEye` | Macro factor radar, evidence quality, policy timeline |
| 研究工作台 (Workbench) | `?view=workbench` | Persistent research tasks, snapshots, deep links |
| Quant Lab | `?view=quantlab` | Parameter optimization, risk attribution, alerts |

## Layout

```
backend/        FastAPI app (entry: backend/main.py, port 8100)
  app/api/v1/endpoints/   33 route files across 12 prefixes
  app/core/               auth/, persistence/, task_queue.py, bounded_cache, rate limiter
  app/services/           QuantLab service layer
  app/websocket/          realtime quote stream (~/ws)
src/            Pure-Python computation engine (no FastAPI dependency)
  analytics/              28+ analytical engines (industry, pricing, factor)
  backtest/               14 backtest engines (single, batch, cross-market)
  data/providers/         Sina, THS, AKShare, yfinance adapters
  research/               workbench state machine
  strategy/               strategy library
frontend/       React 18 + Antd 5 + Recharts (entry: src/index.js, port 3100)
  src/components/{pricing,GodEyeDashboard,research-workbench,quant-lab,...}
tests/          unit / integration / manual / e2e (Playwright in tests/e2e/)
scripts/        30+ ops scripts; see "Common commands" below
docs/           reference docs, OpenAPI baseline, CHANGELOG, plans/
```

## Common commands

```bash
# Boot the whole stack (foreground)
./scripts/start_system.sh                                  # backend + frontend
./scripts/start_system.sh --with-infra --with-worker       # + TimescaleDB/Redis + Celery
./scripts/stop_system.sh

# Health check (verifies imports, ports, env)
python3 ./scripts/health_check.py

# Backend tests
python -m pytest tests/unit tests/integration -q
python -m pytest tests/unit tests/integration --cov=backend --cov=src
python scripts/run_tests.py --unit                          # orchestrator
python scripts/run_tests.py --integration

# Frontend tests
cd frontend && CI=1 npm test -- --runInBand --watchAll=false

# Browser E2E (full app surface)
cd tests/e2e && npm run verify:research                     # research workbench flow
cd tests/e2e && npm run verify:current-app                  # full app regression

# Quality gates run in CI (also useful locally)
python scripts/check_ruff_pyflakes_baseline.py              # baseline-locked ruff
bash scripts/check_mypy_gate.sh                             # incremental mypy gate
bandit -r backend src -c pyproject.toml --severity-level medium
pip-audit -r requirements.txt --strict
python scripts/check_openapi_diff.py                        # OpenAPI contract diff
```

## Refactoring principles

Distilled from `docs/REFACTORING_PLAN.md`. **Read these before any structural
change** — they exist because past large-scope refactors caused regressions.

1. **Lock tests before moving code.** Zero-behavior-change relocation only;
   if a test must change to keep passing, the refactor is doing too much.
2. **One clear boundary per commit.** Don't split helpers and rewrite
   business rules in the same diff.
3. **No drive-by changes** to recommendation scores, diagnostic thresholds,
   auth policy, or CORS policy inside a structural refactor.
4. **Tolerate duplication early.** Wait for the third occurrence before
   extracting a shared module — premature abstraction has hurt this repo.
5. **Cap a single split PR at ~600 lines of pure relocation diff** (barrel
   exports / generated docs excepted).
6. **Every backend split runs `python scripts/check_openapi_diff.py`** —
   rename / type-change / required-set expansion is forbidden.

## CI jobs

`.github/workflows/ci.yml` defines four jobs. Their gates and corresponding
local verification commands:

| Job | Gate | Local verify |
|-----|------|--------------|
| `quality` | ruff pyflakes baseline (HARD), bandit medium (HARD), pip-audit `--strict` (HARD), mypy incremental gate (HARD), ruff lint/format (advisory) | `python scripts/check_ruff_pyflakes_baseline.py && bash scripts/check_mypy_gate.sh && bandit -r backend src -c pyproject.toml --severity-level medium && pip-audit -r requirements.txt --strict` |
| `backend` | unit + integration + coverage `fail_under=55` | `pytest tests/unit tests/integration --cov=backend --cov=src --cov-fail-under=55 -q` |
| `frontend` | npm audit `--audit-level=high` (HARD) + Jest + build | `cd frontend && npm audit --omit=dev --audit-level=high && CI=1 npm test -- --runInBand --watchAll=false && npm run build` |
| `research-e2e` | Playwright research suite (depends on backend+frontend passing) | `cd tests/e2e && npm run verify:research` |

## Things to know before editing

- **`requirements.lock` is the source of truth in CI.** Do not edit by hand;
  edit `requirements.txt` (the human-maintained intent file) and regenerate
  via `pip-compile requirements.txt --output-file requirements.lock --no-header --annotation-style=line --strip-extras`.
- **mypy baseline is `scripts/mypy_baseline_count.txt`.** The gate fails on
  regression, not on absolute count. Update it via
  `bash scripts/generate_mypy_baseline.sh` only when you intentionally fixed
  type errors.
- **OpenAPI baseline is `docs/openapi.json`.** Regenerate intentionally via
  `python scripts/check_openapi_diff.py --update`.
- **Two big import paths to know:** `backend.app.X` (always — never bare
  `app.X`) and `src.X`. mypy's import root is the repo root.
- **Auth secret in production:** `AUTH_SECRET` must not equal
  `dev-only-change-me` when `ENVIRONMENT != development` — the boot guard
  refuses to start.
- **No Alembic yet.** Schema changes live inside
  `backend/app/core/persistence/_manager.py`'s bootstrap path. This is on
  the v4.2.0 cleanup list.

## Active improvement effort

If you're working on the v4.2.0 effort, the canonical plan is at
`docs/superpowers/plans/2026-05-02-comprehensive-improvement.md` and the
design rationale is at
`docs/superpowers/specs/2026-05-02-comprehensive-improvement-design.md`.

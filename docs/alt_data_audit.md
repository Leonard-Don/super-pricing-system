# Alternative Data Pipeline Audit

**Date:** 2026-05-16
**Scope:** `src/data/alternative/` (six sub-packages) plus the `/alt-data/*` API surface in `backend/app/api/v1/endpoints/alt_data.py`.
**Codebase version:** v4.2.0
**Auditor goal:** Sort real working pipelines from scaffolding, with file:line evidence.

## 1. Audit methodology

For each sub-package I read the `__init__.py` to capture the public surface, then read the provider entry point (`*_signal.py` / `provider.py` / `chain_signals.py` / `macro_signals.py`) plus every underlying adapter. For each adapter I traced the real fetch path (`_safe_request`, `yfinance.Ticker`, BS4 selectors, hard-coded catalog dicts) to establish where data actually comes from. I cross-checked persistence by greping `backend/app/core/persistence/` and `alembic/versions/` for any alt-data tables — there are none. I confirmed scheduling reality by greping `backend/`, `scripts/`, and `pyproject.toml` for `beat_schedule` / `celery` references — Celery beat is not configured for alt-data. I then inspected the on-disk snapshot store (`cache/alt_data/`) and parsed each provider JSON to count actual records, source breakdown, and dominant `source_mode` (`live` / `proxy` / `curated` / `derived`). External callers were found by greping `get_alt_data_manager` across the backend.

## 2. Per sub-package verdict table

| Sub-package | Real data source | Refresh cadence | Persistence target | Records in last 7d (cache) | Verdict |
|---|---|---|---|---|---|
| `policy_radar` | fed/ecb/boe RSS via `_safe_request`; ndrc/nea HTML scrape | APScheduler 60 min (in-proc only) | `cache/alt_data/providers/policy_radar.json` | 40 (fed=20, ecb=20; ndrc/nea/boe = 0) | **WORKING-PROTOTYPE** |
| `policy_radar/policy_execution.py` | Re-reads `policy_radar` history, derives department disorder | APScheduler 120 min | `cache/alt_data/providers/policy_execution.json` | 60 (derived from policy_radar) | **WORKING-PROTOTYPE** |
| `supply_chain` (bidding) | `deal.ggzy.gov.cn` JSON endpoint with hard-coded params | APScheduler 360 min (shared with supply_chain) | `cache/alt_data/providers/supply_chain.json` (none of category=bidding) | **0 bidding rows** in last snapshot | **SCAFFOLDING-ONLY** |
| `supply_chain` (env_assessment) | `mee.gov.cn/ywgz/hpgl/` BS4 `<a>` scan | APScheduler 360 min (shared) | same file (none of category=env_assessment) | **0 env_assessment rows** in last snapshot | **SCAFFOLDING-ONLY** |
| `supply_chain` (hiring) | 51job HTML via BS4 `.j_joblist .e` selector — falls through to empty list, dilution computed from 0 | APScheduler 360 min (shared) | same file | 14 records, but all from synthetic zero-job classification | **SCAFFOLDING-ONLY** |
| `macro_hf/lme_inventory` | yfinance futures price (HG=F, ALI=F, ZNC=F, NI=F) used as inventory proxy | APScheduler 180 min | `cache/alt_data/providers/macro_hf.json` | 4 inventory records, `source_mode=proxy` | **WORKING-PROTOTYPE** |
| `macro_hf/customs_data` | Reaches `customs.gov.cn` for ping only; returns neutral signal with `source_mode=proxy` | APScheduler 180 min | same file | 6 customs records, all signal=0, `confidence=0.3` | **SCAFFOLDING-ONLY** |
| `macro_hf/port_congestion` | Hard-coded `global_index = 50.0` constant | APScheduler 180 min | same file | 2 port records, all signal=0 | **SCAFFOLDING-ONLY** |
| `people_layer` (`people/`) | Hand-curated dicts: `EXECUTIVE_PROFILE_CATALOG` (~16 tickers), `INSIDER_FLOW_CATALOG` (10 tickers), `CURATED_HIRING_SIGNALS` (4 tickers) | APScheduler 360 min | `cache/alt_data/providers/people_layer.json` | 66 records (`source_mode=curated`, `lag_days=21`) | **PRODUCTION** (curated, not live) |
| `entity_resolution` | Pure-Python alias table (no I/O) | N/A — utility | N/A | N/A | **PRODUCTION** (utility) |
| `governance` | Pure-Python (snapshot store, scheduler, refresh service) | N/A — infrastructure | `cache/alt_data/*` JSON via tempfile atomic-rename | N/A | **PRODUCTION** (infrastructure) |

## 3. Per sub-package writeups

### `policy_radar` — WORKING-PROTOTYPE
`PolicySignalProvider.run_pipeline` (`policy_radar/policy_signals.py:23-208`) wires `PolicyCrawler` + `PolicyNLPAnalyzer` into the four-stage `BaseAltDataProvider` contract. Five sources are configured (`policy_radar/policy_crawler.py:56-150`: ndrc, nea, fed, ecb, boe) but the most recent snapshot (`cache/alt_data/providers/policy_radar.json`, 2026-05-05) holds 40 records all from `policy_radar:fed` (20) and `policy_radar:ecb` (20). The ndrc/nea HTML selectors (`.list_con li`) and boe RSS path produced zero rows in the last refresh — the western RSS adapters (`policy_radar/official_feeds.py`) are doing all the work. NLP runs in `local` mode by default (`policy_signals.py:46-50`), not LLM.

### `policy_radar/policy_execution` — WORKING-PROTOTYPE
`PolicyExecutionProvider` (`policy_radar/policy_execution.py:52-115`) is downstream of `policy_radar`: it reads up to 200 records from the policy provider's in-memory history and computes per-department reversal counts (`_reversal_count`, line 45). The snapshot has 60 derived rows with `source_mode=derived`. No independent fetch — value depends entirely on whether `policy_radar` filled history. Working when CN sources fail, but with degraded department coverage (fed/ecb only).

### `supply_chain` — SCAFFOLDING-ONLY
`SupplyChainSignalProvider` (`supply_chain/chain_signals.py:26-228`) advertises three dimensions: bidding, env_assessment, hiring. The on-disk snapshot has 14 records, **all category=hiring, all source=`supply_chain:hiring`**. Bidding (`supply_chain/bidding_crawler.py:140-186`) targets `deal.ggzy.gov.cn` with `pageSize=20` but the response parser expects `response.json()` (`bidding_crawler.py:169`) — the endpoint actually returns HTML, so parsing silently fails and `_search_single_keyword` returns `[]`. Env assessment (`supply_chain/env_assessment.py:73-111`) does a BS4 `<a>` text-match scan on `mee.gov.cn/ywgz/hpgl/` — extremely fragile and empty in production. Hiring (`supply_chain/hiring_tracker.py:224-268`) hits 51job, but the `.j_joblist .e` selector is stale (51job moved to JS-rendered listings years ago); jobs list is empty, all 14 hiring records have `total_jobs=0` falling into the `no_data` branch (`hiring_tracker.py:117-124`). No alerts, no signal.

### `macro_hf` — WORKING-PROTOTYPE (LME only)
`MacroHFSignalProvider` (`macro_hf/macro_signals.py:19-174`) fans out to three adapters. Only **LME inventory is a real working proxy**: it uses `yfinance.Ticker(symbol).history` (`macro_hf/lme_inventory.py:117-144`) on copper/aluminium/zinc/nickel futures, derives a destocking/restocking signal from price change %, with honest `source_mode=proxy`, `lag_days=1`, `coverage=0.68`. **Customs** is a façade: `_fetch_customs_data` (`macro_hf/customs_data.py:148-170`) only does a connectivity ping to `customs.gov.cn`; `get_trade_balance_signal` hard-returns `signal=0, confidence=0.3` with `reason="数据暂不充足，待接入海关高频数据后增强"`. **Port congestion** is a constant: `global_index = 50.0` literal (`macro_hf/port_congestion.py:97-98`) with `_fetch_port_data` always returning `{"data_available": False}`. The 12 records on disk are 4 yfinance-backed inventory rows plus 8 zero-signal placeholders.

### `people_layer` — PRODUCTION (with caveat: curated, not live)
`PeopleLayerProvider` (`people/provider.py:134-395`) emits three record types per ticker (executive_governance / insider_flow / hiring_structure) and is the largest single contributor on disk (66 records, dominant_mode=`curated`). Data is entirely from hand-curated Python dicts: `EXECUTIVE_PROFILE_CATALOG` (`people/executive_profile.py:8+`, ~16 entries), `INSIDER_FLOW_CATALOG` (`people/insider_flow.py:8-19`, 10 entries), `CURATED_HIRING_SIGNALS` (`people/people_signal.py:12-65`, 4 entries with NVDA/TSM/BABA/BIDU). No live fetch path. The metadata is explicit about this: `fallback_reason="live_proxy_or_def14a_not_connected"`, `lag_days=21`. This is the most reliable provider in the snapshot specifically because it has no I/O.

### `entity_resolution` — PRODUCTION
`entity_resolution.py:13-148` is a pure-Python alias table mapping company names / tickers / themes to canonical entities. Used by `alt_data_manager._record_to_evidence` to enrich every record with `canonical_entity`. No I/O, no failure modes. Working as designed.

### `governance` (snapshot store + scheduler) — PRODUCTION
`governance.py` defines `AltDataSnapshotStore`, `AltDataRefreshService`, and `AltDataScheduler`. Atomic JSON writes via `tempfile.mkstemp` + `Path.replace` (`governance.py:111-123`) work correctly — the on-disk snapshots are valid JSON. `AltDataScheduler` (`governance.py:312-388`) uses APScheduler `BackgroundScheduler` (in-process), not Celery, and registers five interval jobs (policy_radar=60m, supply_chain=360m, macro_hf=180m, people_layer=360m, policy_execution=120m) on `start()`. Wired from `backend/main.py:96-98` at lifespan startup.

## 4. Cross-cutting findings

**Wired:**
- The `/alt-data/*` HTTP surface (snapshot, signals, providers, status, refresh, history, diagnostics/signals) reads from `AltDataManager` which reads from on-disk JSON (`cache/alt_data/`). Endpoints return real shapes with real (if stale) data.
- `backend/main.py:96-98` calls `get_alt_data_manager()`, `start_alt_data_scheduler()`, and an initial `refresh_all(force=True)` at lifespan startup. The APScheduler then re-refreshes per provider on its interval.
- Other endpoints consume alt-data: `endpoints/macro_support.py:5,72`, `endpoints/macro.py:18,349`, and `endpoints/cross_market.py` references `linked_dimensions: people_layer / policy_execution`. Alt-data is real upstream input for macro views.

**Not wired:**
- **TimescaleDB:** zero hypertable DDL exists. `grep -r "alt_data|policy_radar|supply_chain|macro_hf|people_layer" backend/app/core/persistence/ alembic/versions/` returns nothing. `_diagnostics.py` only enumerates existing hypertables, it does not create any for alt-data. Snapshots live in JSON files, not PG.
- **Celery beat:** no `beat_schedule` defined anywhere in the codebase. `task_queue.py` configures a Celery worker for one task (`quant.infrastructure.execute_task`) and does not register periodic alt-data jobs. Refresh is in-process APScheduler only, which means: refresh stops when the FastAPI process stops; refresh doesn't survive a worker restart; refresh doesn't run on Celery worker nodes.
- **`AltDataSnapshotStore` is NOT idempotent across processes:** if you run two backend instances (e.g., reload mode), both schedulers will write to the same `cache/alt_data/` files.

**Snapshot reality:**
- All five providers wrote successfully on 2026-05-05 (~9 days before audit date 2026-05-16). The `dashboard_snapshot.json` was rebuilt 2026-05-07 but provider snapshots are unchanged — meaning **scheduled refresh ran twice and then stopped** (likely the backend was last bounced 2026-05-07). Without Celery beat or a system-level cron, refresh ages out as soon as the FastAPI process exits.
- `dominant source_mode` distribution: `policy_radar=None` (no metadata field set), `policy_execution=derived`, `supply_chain=None`, `macro_hf=proxy`, `people_layer=curated`. **Zero providers have `live` as their dominant mode.**

**Cache mtime evidence (`ls -la cache/alt_data/providers/`):**
```
macro_hf.json         May  5 11:02
people_layer.json     May  5 11:02
policy_execution.json May  5 11:02
policy_radar.json     May  5 11:00
supply_chain.json     May  5 11:02
```
No file refreshed in the last 7 days. Older than the audit date by 11 days.

## 5. Recommended next moves

| Sub-package | Verdict | Recommended move | Effort |
|---|---|---|---|
| `policy_radar` | WORKING-PROTOTYPE | **Promote.** Fix the ndrc/nea HTML selectors (they are stale — `.list_con li` does not appear in current NDRC HTML) and add the boe RSS adapter check. The infrastructure is sound; only the CN-side selectors need updating. | M (1-2 days, mostly Selenium-style verification of current page DOM) |
| `policy_execution` | WORKING-PROTOTYPE | **Promote** as part of policy_radar fix — it inherits coverage automatically once ndrc/nea start returning rows. | S (free with policy_radar promotion) |
| `supply_chain/bidding_crawler` | SCAFFOLDING-ONLY | **Decide (T/F).** ggzy.gov.cn endpoint returns HTML, not JSON; the JSON parser is wrong. Two paths: (a) rewrite to scrape the HTML list page, or (b) switch to a paid bidding data API. Either requires research; not a quick fix. | L (1-2 weeks) |
| `supply_chain/env_assessment` | SCAFFOLDING-ONLY | **Remove or decide.** The BS4 `<a>` scan is too fragile to ever be reliable. Either commit to a real MEE crawler with proper pagination, or remove the dimension and stop reporting `project_pipeline` in supply_chain signals. | Decide first |
| `supply_chain/hiring_tracker` (51job path) | SCAFFOLDING-ONLY | **Remove the 51job fetch path.** It returns 0 jobs and pollutes `supply_chain.confidence`. Keep `TRACKED_COMPANIES` and `JOB_CATEGORIES` as referenced by `people_layer`. The `_fetch_job_listings` method can be deleted. | S (~half day) |
| `macro_hf/lme_inventory` | WORKING-PROTOTYPE | **Promote** — it is the only `macro_hf` adapter doing real work. Optionally add Shanghai Futures Exchange (SHFE) inventory as a parallel proxy for CN exposure. | S (current state already useful) |
| `macro_hf/customs_data` | SCAFFOLDING-ONLY | **Decide (T/F).** Connectivity check is meaningless. Real options: (a) integrate `tushare` or `wind` customs feeds (paid), or (b) drop the customs dimension. The hard-coded `signal=0, confidence=0.3` is currently dragging down `macro_pressure` weight. | Decide first |
| `macro_hf/port_congestion` | SCAFFOLDING-ONLY | **Remove or decide.** `global_index = 50.0` is a literal. Either commit to MarineTraffic / Portcast / open AIS integration, or strip the dimension. Currently it contributes 20% weight to `macro_pressure` with zero signal value. | Decide first |
| `people_layer` | PRODUCTION (curated) | **Keep, but be honest in marketing copy.** Source mode is correctly `curated` with `lag_days=21`. If "live people-layer signal" is the differentiator pitch, the dictionaries need a quarterly update process (manual is fine) and a `last_curated_at` timestamp field per ticker. | S for honesty doc; M to wire DEF 14A / Form 4 parsers if you want it actually live |
| `entity_resolution` | PRODUCTION | Keep. | — |
| `governance` (snapshot + APScheduler) | PRODUCTION | **Promote scheduling out of in-process APScheduler.** Move alt-data refresh into the existing Celery worker as a beat schedule. Five providers × interval. This survives backend restarts and matches the rest of the platform's job model. | M (1 day to register beat tasks and route through `task_queue.py`) |
| TimescaleDB persistence | NOT WIRED | **Decide.** If you want time-series queries on alt-data (delta_score over weeks, hit-rate vs. realized_return), promote `AltDataRecord` to an Alembic-migrated hypertable. Otherwise the JSON snapshots are fine for the current dashboard surface. | M (1 day for Alembic + bootstrap) — only valuable if you commit to longer history than the 500-record in-memory cap |

**Bottom line for the differentiator pitch:** the platform's alt-data story is real for 3 of 6 sub-packages (`policy_radar` western half, `macro_hf` LME, `people_layer` curated), scaffolding for the rest. The infrastructure layer (`governance` + `entity_resolution` + the API surface) is production-grade. The data layer is partial — and the **scheduling layer is fragile** (in-process APScheduler, no Celery beat, no PG persistence). Fix scheduling first, then promote the three working prototypes; defer or cut the three scaffolding paths until you commit to real upstream sources.

## 6. Phase A actions (2026-05-16)

Three scaffolding-only components were cut so their zero-signal records stop polluting downstream factors. See the cleanup commit on the same date for the exact diff.

- **Deleted** `src/data/alternative/macro_hf/port_congestion.py` (literal `global_index = 50.0`, all records `signal=0`). The `PORT_CONGESTION` enum member, the `ports` dimension in `macro_hf` signal output, the `port_congestion` key in `alt_data_manager._record_to_evidence`, the `port_congestion` entry in `baseload_mismatch.py` history filter, and the `port_congestion` member in `macro_support.FACTOR_EVIDENCE_MAP` (baseload_mismatch + credit_spread_stress sets) were removed in the same pass.
- **Deleted** `src/data/alternative/macro_hf/customs_data.py` (connectivity ping only, hard-returned `signal=0, confidence=0.3`). The `CUSTOMS` enum member, the `customs` dimension in `macro_hf` signal output, and `customs` entries in `macro_support.FACTOR_EVIDENCE_MAP` (baseload_mismatch + credit_spread_stress sets at lines 39 and 47) were removed. `customs` references in the `rate_curve_pressure`/`fx_mismatch` evidence sets and the `cross_market.linked_dimensions` metadata are doc-shaped and were left in place — they now no-op against an empty record stream.
- **Neutered** `src/data/alternative/supply_chain/hiring_tracker.py`: deleted `_fetch_job_listings` + `_parse_51job_response`; `analyze_company` now returns a `signal="no_data"` payload directly without touching the network. `TRACKED_COMPANIES` and `JOB_CATEGORIES` are preserved because `people_layer` imports them. `chain_signals` continues to instantiate `HiringTracker(...)`; the no-data response shape is compatible with its parser (score defaults to 0).
- **Resilience touch-up** in `alt_data_manager._bootstrap_from_snapshots`: records with categories no longer in the `AltDataCategory` enum are skipped (with debug log) instead of crashing the bootstrap. This makes future enum retirements safe for cached snapshots.

Test status after the cut: `pytest tests/unit tests/integration -q` → 1198 passed, 5 pre-existing network-dependent skips, 0 failures.

## 7. Phase C actions (2026-05-16) — Celery beat wiring

Section 4 flagged the **scheduling layer as fragile**: refresh ran in-process via APScheduler (`governance.AltDataScheduler`) and stopped when the FastAPI process exited, leaving `cache/alt_data/providers/*.json` 11 days stale by audit date. Phase C wires Celery beat as an additive replacement without breaking local-dev.

### What was added

- **`backend/app/core/alt_data_tasks.py`** — five Celery tasks (`alt_data.refresh.policy_radar`, `…supply_chain`, `…macro_hf`, `…people_layer`, `…policy_execution`), each `acks_late=True` with `soft_time_limit=240s` / `time_limit=300s`. Each task calls `AltDataManager.refresh_provider(name, force=True)` and rebuilds the dashboard snapshot, mirroring the side effects of `AltDataScheduler._refresh_job`. The module also registers a `beat_schedule` (`alt-data-refresh-<provider>` entries) at the same intervals as `AltDataScheduler.DEFAULT_INTERVALS_MINUTES`. Import is side-effect-free when `CELERY_BROKER_URL` is unset.
- **`backend/app/core/task_queue.py`** — appends `from backend.app.core import alt_data_tasks  # noqa` after `celery_app` is constructed so the Celery worker / beat discovery path (`-A backend.app.core.task_queue:celery_app`) picks up the registrations.
- **`src/data/alternative/governance.py`** — `AltDataScheduler.start()` now checks `_celery_beat_active()`. When `ALT_DATA_USE_CELERY_BEAT=1` or `CELERY_BROKER_URL` is set (and `ALT_DATA_USE_CELERY_BEAT` is not explicitly `0`), the in-process scheduler does NOT register any APScheduler jobs and `get_status()` reports `delegated_to_celery_beat=True`. Local-dev (no env, no broker) keeps the original behaviour.
- **`scripts/start_alt_data_beat.sh`** + **`scripts/stop_alt_data_beat.sh`** — thin wrappers around `celery -A backend.app.core.task_queue:celery_app beat --schedule=logs/celery-beat-schedule`. Supports `--foreground` for launchd / systemd, otherwise daemonises with a pid file (`logs/celery-beat.pid`) and log (`logs/celery-beat.log`). Auto-sources `logs/infra-stack.env` like the worker script does.
- **`scripts/start_system.sh`** — new `--with-beat` flag. When set, it requires `CELERY_BROKER_URL`, exports `ALT_DATA_USE_CELERY_BEAT=1` for the backend it launches, and invokes `start_alt_data_beat.sh`. Cleanup path calls `stop_alt_data_beat.sh`.
- **`tests/unit/test_alt_data_tasks.py`** — 11 tests covering: task callables are importable, task names are `alt_data.refresh.*`-namespaced, beat schedule has exactly 5 timedelta-keyed entries matching `DEFAULT_INTERVALS_MINUTES`, registration against a stub Celery app installs 5 tasks + beat entries with `acks_late=True` and the right timeouts, and the scheduler delegates correctly across four env-var combinations (env-on / broker-on / env-off-with-broker / no-env-no-broker).

### How to enable Celery beat alongside `--with-worker`

```bash
# 1) Bring up infra (Postgres + Redis) and the worker:
./scripts/start_system.sh --with-infra --with-worker --with-beat

# OR, if infra is already running and you just want to add beat to an existing
# stack:
./scripts/start_alt_data_beat.sh

# Stop:
./scripts/stop_alt_data_beat.sh
```

Required env (auto-set by `--with-beat`, exported from `logs/infra-stack.env` otherwise):
- `CELERY_BROKER_URL` — must point at a running Redis (or other broker)
- `ALT_DATA_USE_CELERY_BEAT=1` — disables the in-process APScheduler

### Behaviour matrix

| Mode | `CELERY_BROKER_URL` | `ALT_DATA_USE_CELERY_BEAT` | APScheduler | Celery beat |
|---|---|---|---|---|
| Local-dev | unset | unset / `0` | runs 5 in-proc jobs | n/a |
| Worker only (no beat) | set | unset | **delegated** (no jobs registered) | not running → **no refresh** |
| Worker + beat (recommended for prod-like) | set | `1` | delegated | runs 5 scheduled tasks |
| Force in-proc on a host with a broker (rare) | set | `0` | runs 5 in-proc jobs | n/a |

### Caveats / unresolved decisions

- The "Worker only (no beat)" row is the failure mode to watch for. If you start the worker but forget `--with-beat`, refresh stops entirely (APScheduler is suppressed, beat isn't running). The CLAUDE.md `--with-worker` docs should be updated to recommend `--with-beat` in tandem; left to user discretion to avoid widening the diff.
- Beat's `--schedule` file persists in `logs/celery-beat-schedule`. If the schedule entries change (e.g., new interval, new provider), delete that file before restarting beat so it doesn't replay the old schedule from its database.
- `worker_prefetch_multiplier=1` is set to prevent a slow refresh from pre-fetching the next one, but Celery doesn't have a built-in singleton lock — if a provider refresh runs longer than its interval (default 60 min for policy_radar), beat will queue the next run anyway and the worker will execute them sequentially. This is acceptable for the current cadence; if it becomes a problem, add a `celery_singleton`-style dependency or a Redis lock in the task body.
- The Celery worker reads `task_queue.py` which now imports `alt_data_tasks` unconditionally. If the alt-data import chain regresses (e.g., a circular import), the worker fails to boot — kept in mind during testing; current import order is fine.

Test status after Phase C: `pytest tests/unit tests/integration -q --no-header --tb=line` → **1209 passed** (1198 baseline + 11 new), 5 pre-existing network-dependent skips, 0 failures. mypy gate: 72 errors vs baseline 73 (down by 1). ruff/pyflakes baseline: 169, unchanged.

## 8. Phase B actions (2026-05-16) — SHFE inventory parallel proxy

Section 5 recommended adding Shanghai Futures Exchange (SHFE) inventory as a parallel proxy for CN exposure. Phase B promotes `macro_hf` from a single-adapter, single-region (US-side, proxy) line into a dual-adapter, dual-region (US + CN, mixed `proxy` + `live`) line.

### What was added

- **`src/data/alternative/macro_hf/shfe_inventory.py`** — `SHFEInventoryProvider` parallels `LMEInventoryProvider`: same `get_inventory` / `analyze_inventory_trend` / `get_all_metals_summary` surface. Backed by `akshare.futures_inventory_em(symbol=...)`, which returns the SHFE warehouse-stock daily series for one metal at a time. The `SHFE_METALS` mapping covers the same four metals as LME (copper / aluminium / zinc / nickel) with akshare's Chinese symbol names: `沪铜=CU`, `沪铝=AL`, `沪锌=ZN`, `镍=NI` (nickel is *not* `沪镍` in akshare; this is the one schema surprise — caught in `get_supported_metals`).
- **Signal direction matches LME**: positive `weekly_change_pct` (>+2%) → restocking → `signal=-1`; negative (<-2%) → destocking → `signal=+1`; otherwise stable. Confidence scales as `min(0.8, |weekly_change_pct|/10)`. The signal is computed from a real 5-trading-day-ago vs. latest stock comparison, not a price proxy.
- **Honest source_mode**: `source_mode="live"` (real exchange-aggregated inventory), `lag_days=1` (akshare returns data through the previous trading day), `coverage=1.0` when the metal is supported. Failure paths return `source_mode="curated"` with `coverage=0.0` and the underlying error in `fallback_reason` — never claims `live` for a missing fetch.

### What was changed in `macro_hf/macro_signals.py`

- `MacroHFSignalProvider.__init__` now instantiates both `self.lme = LMEInventoryProvider(...)` and `self.shfe = SHFEInventoryProvider(...)` from the same config dict; `region_weights` is parsed off `config["region_weights"]` with default `{"LME": 0.5, "SHFE": 0.5}` (zero / negative values fall back to default; weights are normalised to sum to 1).
- `fetch()` now emits two `region`-tagged blocks per metal: one `region="LME"` row from the LME adapter, one `region="SHFE"` row from the SHFE adapter (only when the metal is in `SHFE_METALS`).
- `parse()` propagates `region`; `normalize()` writes `source="macro_hf:inventory:lme"` / `"macro_hf:inventory:shfe"` and embeds `region` + `source_mode` in record metadata.
- `to_signal()` now exposes:
  - `dimensions.inventory` — unweighted mean across all records (back-compat with the Phase A shape).
  - `dimensions.inventory_by_region` — per-region `{count, score}` breakdown.
  - `macro_pressure` — **region-weighted** mean: LME 0.5 + SHFE 0.5 by default. If one region has zero records (e.g., akshare offline) its weight collapses to the other. Composite shifts from "inventory-only single-region" (Phase A) to "US+CN inventory average" (Phase B).
  - `region_weights_used` — the actual normalised weights applied this run (telemetry).
  - `source_mode_summary.counts` — now shows both `proxy` (LME) and `live` (SHFE) keys; dominant mode flips per run depending on which region has more records.

### What was changed elsewhere

- **`src/data/alternative/macro_hf/__init__.py`** exports `SHFEInventoryProvider` and the docstring now reflects the dual-adapter status.
- **No Celery beat changes needed.** `backend/app/core/alt_data_tasks.py:refresh_macro_hf()` calls `AltDataManager.refresh_provider("macro_hf")`, which invokes `MacroHFSignalProvider.run_pipeline()`. Because SHFE is wired into the provider's `fetch()`, the existing Phase C beat task transparently picks up the new adapter.
- **No requirements changes.** `akshare>=1.10.0` is already in `requirements.txt` (lock pin `akshare==1.18.59`) — it backs the existing `src/data/providers/akshare_provider.py`.

### Tests

- **`tests/unit/test_shfe_inventory.py`** (8 tests): success path with mocked DataFrame, unknown metal, empty DataFrame, akshare exception (degraded), destocking / restocking / stable trend branches, partial-metals-returned summary, and supported-metals listing. All akshare calls go through a `sys.modules` stub — no network.
- **`tests/unit/test_macro_signals.py`** (9 tests): provider emits both `region=LME` and `region=SHFE` records, macro_pressure correctly weights the two regions, single-region fallback collapses weights, `source_mode_summary` contains both `proxy` and `live`, custom `region_weights` config is honoured, invalid weights fall back to default, and record metadata always contains `region`.

### Test status after Phase B

`pytest tests/unit tests/integration -q --no-header --tb=line` → **1226 passed** (1209 baseline + 17 new), 5 pre-existing network-dependent skips, 0 failures.
mypy gate: 72 errors vs baseline 73 (unchanged from Phase C).
ruff/pyflakes baseline: 169, unchanged.

### Honesty note: macro_hf source_mode upgrade

Before Phase B, `macro_hf` snapshots reported `dominant_source_mode="proxy"` because the only working adapter (LME) used yfinance futures-price as an inventory proxy. After Phase B, snapshots will show **mixed `proxy` (LME) + `live` (SHFE) modes**. Per-snapshot dominance depends on how many metals each region returns; with the default `["copper", "aluminium"]` request and SHFE supporting both, the counts are typically 2 proxy + 2 live → tied (or dominant=live for nickel/zinc-heavy runs since SHFE has more metal coverage).

This upgrades `macro_hf` from a single-region proxy line to a true CN/US inventory composite — and it's the **first alt-data provider in the repo with a `live` exchange-aggregated mode** (`policy_radar` is RSS-scraped, `people_layer` is curated, `supply_chain` is scaffolding). The differentiator-pitch claim "we ingest real exchange data" is now defensible for the `macro_hf` line.

## 9. Phase D actions (2026-05-16) — CN policy selectors

Section 4 documented that `policy_radar`'s 2026-05-05 snapshot held 40 records that all came from western sources (`fed=20, ecb=20`), with `ndrc/nea/boe` returning zero. The audit's verbatim diagnosis: "the ndrc/nea HTML selectors (`.list_con li`) and boe RSS path produced zero rows in the last refresh". Phase D refreshes those selectors against the live DOM captured on the audit date.

### DOM findings (empirical, captured 2026-05-16)

- **NDRC.** The `xxgk/zcfb/` root no longer serves a listing — it returns a 54-byte JS redirect (`window.location.href='./fzggwl/'`). The actual policy listings live at:
  - `https://www.ndrc.gov.cn/xxgk/zcfb/fzggwl/` — 发改委文件 (regulations / orders), 25 real items + 5 `<li class="empty">` spacers per page.
  - `https://www.ndrc.gov.cn/xxgk/zcfb/tz/` — 通知 (notices), same DOM shape, 25 real items per page.

  Both pages serialise rows as `ul.u-list > li` with this structure:

  ```html
  <ul class="u-list">
    <li>
      <a href="./YYYYMM/tYYYYMMDD_xxxxxxx.html" title="《政策标题》">
        《政策标题》
      </a>
      <div class="popbox">…相关解读…</div>  <!-- nested <li> in here -->
      <span>YYYY/MM/DD</span>
    </li>
    <li class="empty"></li>  <!-- spacer; skipped via empty-title guard -->
    …
  </ul>
  ```

  The new selector is `ul.u-list > li` (direct-child combinator) so the nested `<li>` under `相关解读` is not picked up. Title is read from the first descendant `<a>`'s `title` attribute (with anchor-text fallback), date from the trailing sibling `<span>` (`YYYY/MM/DD`). The stale `.list_con li` selector returns zero rows against the current HTML (pinned by `test_ndrc_legacy_selector_returns_empty`).

- **NEA.** All `nea.gov.cn/policy/*.htm` listings are 3.5 KB Vue shells. The HTML body contains an empty `<ul id="showData0" class="list">` that is populated client-side by the `Xhwpage` component from a JSON datasource. The actual policy data lives at:

  ```
  https://www.nea.gov.cn/policy/ds_<datasource_id>.json
  ```

  For 最新文件 (latest documents — the broadest entry), the datasource id is `40d365c13659452aa06cdb7268d6192e`, resolving to a 1.05 MB JSON file with **1000 entries**. Schema (relevant fields):

  ```json
  {
    "datasource": [
      {
        "title": "中国绿色电力证书发展报告（2025）",
        "publishUrl": "../20260515/76a82a7375a942e2ab748b36cf7cc14b/c.html",
        "publishTime": "2026-05-15 17:10:41",
        "contentType": "MultiMedia"
      },
      …
    ]
  }
  ```

  When `contentType=="Link"`, the `title` is HTML-wrapped (`<a href="…">…</a>`) and is unwrapped by the parser's `_strip_html`. The `publishTime` format `YYYY-MM-DD HH:MM:SS` is now in `_parse_date`'s explicit format list.

  Implementation: `PolicySource` gained a new optional `json_url` field; `PolicyCrawler.crawl_source` prefers `json_url` over the HTML listing (similar to how `feed_url` was already preferred). A new `_crawl_json` helper handles the fetch + parse. Records carry `ingest_mode="json"` for downstream `source_health` accounting.

- **BoE.** `https://www.bankofengland.co.uk/rss/news` (and every other endpoint on that host) terminates the TLS handshake before sending data — `LibreSSL`/`OpenSSL`/`certifi`/`WebFetch` all hit `SSL_ERROR_SYSCALL` (Akamai-style anti-bot fronting). Existing `_safe_request` cannot reach this host from the audit machine. Disposition: **removed from default `POLICY_SOURCES`**; the original config is preserved as `DEPRECATED_POLICY_SOURCES["boe"]` so callers can opt back in once the network constraint changes. No silent placeholder data is written.

### Sample of items now flowing through (live smoke, 2026-05-16)

NDRC (`xxgk/zcfb/fzggwl/`, 3 most recent):

1. `[2026/04/09]` 《电力重大事故隐患判定标准及治理监督管理规定》 2026年第41号令
2. `[2026/02/11]` 《粮食流通行政执法办法》 2026年第40号令
3. `[2026/01/23]` 《国家发展改革委企业技术中心认定管理办法》 2025年第39号令

NDRC TZ (`xxgk/zcfb/tz/`, 3 most recent):

1. `[2026/05/11]` 关于核定南水北调中线干线工程供水价格的通知(发改价格〔2026〕630号)
2. `[2026/04/27]` 关于印发《西藏生态安全屏障保护与建设规划(修编)》的通知(发改农经〔2026〕508号)
3. `[2026/04/24]` 关于修订省间电力现货交易规则的复函(发改办体改〔2026〕275号)

NEA (`policy/ds_<id>.json`, 3 most recent):

1. `[2026-05-15 17:10:41]` 中国绿色电力证书发展报告（2025）
2. `[2026-05-13 08:45:44]` 国家能源局公告 2026年 第1号
3. `[2026-05-08 18:09:09]` 国家发展改革委 国家能源局 工业和信息化部 国家数据局印发《关于促进人工智能与能源双向赋能的行动方案》的通知

### Code changes

- **`src/data/alternative/policy_radar/policy_crawler.py`**:
  - `PolicySource` gained `json_url: Optional[str]` for JS-rendered listings.
  - `POLICY_SOURCES` rewrite: `ndrc.list_url` → `xxgk/zcfb/fzggwl/`, selectors → `ul.u-list > li`; added `ndrc_tz` for the 通知 sub-listing (same DOM); `nea` switched from HTML to `json_url`-driven ingest; `boe` moved to a new `DEPRECATED_POLICY_SOURCES` dict.
  - `_parse_list_page` now (a) prefers anchor `title` attribute, (b) resolves relative hrefs against `list_url` via `urljoin`.
  - New `_crawl_json` method covers the NEA-style JS-rendered case (responses parsed as JSON, `datasource[]` array consumed, `<a>`-wrapped titles stripped, relative `publishUrl` resolved).
  - `_parse_date` format list extended with `%Y-%m-%d %H:%M:%S` to match NEA's `publishTime`.
- **`src/data/alternative/policy_radar/official_feeds.py`**: unchanged structurally; `BoeFeedAdapter` is still registered so opt-in via `DEPRECATED_POLICY_SOURCES["boe"]` still works.

### Tests

- **`tests/unit/test_policy_crawler_cn.py`** (8 new tests): NDRC HTML parser against a trimmed real-DOM fixture (asserts 3 valid rows + 1 `<li class="empty">` skipped, nested popbox `<a>` not picked up, relative href resolved); NDRC TZ uses the same fixture pattern; legacy `.list_con li` selector regression test (returns `[]` against current HTML); NEA JSON adapter against a trimmed `datasource` payload (covers plain title, anchor-wrapped title, absolute + relative publishUrl); malformed-JSON guard returns `[]` cleanly; `_parse_date` understands NEA `YYYY-MM-DD HH:MM:SS` format; config-shape regression (`boe` removed from default but kept in deprecated map, `ndrc + ndrc_tz + nea` all wired in default).
- All fixtures are trimmed verbatim snapshots from the audit-date fetches; no live network calls during test runs.

### Test status after Phase D

`pytest tests/unit tests/integration -q --no-header --tb=line` → **1234 passed** (1226 baseline + 8 new), 5 pre-existing network-dependent skips, 0 failures.
mypy gate: 72 errors vs baseline 73 (unchanged from Phase B/C).
ruff/pyflakes baseline: 169, unchanged.

### Expected post-fix volume shift

Before Phase D, the 2026-05-05 snapshot held 40 records all from western RSS sources (`fed=20, ecb=20`); `ndrc=0, nea=0, boe=0`. Post-fix, with `limit=10` per source (the provider's default) and the new sources wired, a single refresh should yield approximately:

- `ndrc`: 10 records (down to 25 available per listing page, days_back filter applies)
- `ndrc_tz`: 10 records (new source — was not in pre-Phase-D config)
- `nea`: 10 records (out of 1000 available in the JSON datasource)
- `fed`: 10 (unchanged)
- `ecb`: 10 (unchanged)
- `boe`: 0 (deprecated — no longer in default config, no error noise)

Net: **~50 records per refresh, of which 60% are CN-sourced** vs. the prior 40 records of 100% western. The `dominant source_mode` field in the snapshot remains `None` (the provider does not annotate it; that's the next hygiene fix), but `ingest_modes` per-source now distinguishes `html` (NDRC) / `json` (NEA) / `feed` (Fed, ECB). `policy_execution`, which derives from `policy_radar` history, inherits this CN coverage automatically — its per-department reversal counts will start including 发改委 and 能源局 alongside Fed / ECB.

### Caveats / unresolved

- The NEA JSON datasource id (`40d365c13659452aa06cdb7268d6192e`) is hard-coded against 最新文件 (latest documents — the broadest entry point on `/policy/zxwj.htm`). If NEA rotates the datasource ids, the `json_url` needs updating; this is a known fragility that a future refactor could mitigate by parsing the listing HTML once to extract the current id. The same caveat applies to the NDRC URL path; both are checked into config rather than discovered at runtime.
- BoE remains unreachable from this machine. Re-enabling it requires either (a) a network egress that the Akamai WAF accepts, (b) a server-side proxy, or (c) switching to an alternative central-bank RSS aggregator. Out of scope for Phase D; flagged here so it doesn't get silently rediscovered as a "bug".
- The new `ndrc_tz` source was added rather than replacing `ndrc` because both listings carry distinct policy categories (orders vs. notices) and downstream NLP and `policy_execution` benefit from having both flow into the history buffer.

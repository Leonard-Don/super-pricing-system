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
| `fund_holdings` | `ak.fund_portfolio_hold_em(symbol=<code>, date=<year>)` over a curated 50-name 大型公募 catalog; per-fund top-10 holdings aggregated into per-ticker concentration (`holding_fund_count`, `total_aum_weight_pct`) | APScheduler 10080 min (weekly) / Celery beat `alt_data.refresh.fund_holdings` | `cache/alt_data/providers/fund_holdings.json` | up to 50 records (`source_mode=public_disclosure`, `lag_days=15`) — see § 15 | **WORKING-PROTOTYPE** |
| `northbound` | `ak.stock_hsgt_hist_em(symbol="北向资金")` daily netflow history + `ak.stock_hsgt_hold_stock_em(market=..., indicator="今日排行")` per-stock holdings + `ak.stock_hsgt_board_rank_em(symbol="北向资金增持行业板块排行", indicator="今日")` industry rank; emits `netflow_daily` / `top_holding_stock` / `industry_netflow_agg` records | APScheduler 720 min (twice daily) / Celery beat `alt_data.refresh.northbound` | `cache/alt_data/providers/northbound.json` | ~60 daily rows + ~100 holdings + ~25 industry (`source_mode=public_disclosure`, `lag_days=1`) — see § 16 | **WORKING-PROTOTYPE** |
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

- ~~The "Worker only (no beat)" row is the failure mode to watch for. If you start the worker but forget `--with-beat`, refresh stops entirely (APScheduler is suppressed, beat isn't running).~~ **Resolved post-Phase-D**: `scripts/start_system.sh --with-worker` now auto-implies `--with-beat`. Advanced setups that run beat on a separate host can pass `--no-beat` to opt out. The mutually-exclusive guard fails fast if both `--no-beat` and `--with-beat` are passed together.
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

## 10. Phase E1 actions (2026-05-16) — Runtime health manifest endpoint

The per-component verdict table in § 2 (refreshed by the phase entries in
§§ 6-9) is the canonical record of "what's PRODUCTION / WORKING-PROTOTYPE
vs. SCAFFOLDING-ONLY / DEAD in alt-data". Until Phase E1 that information
was only available in markdown, which means consumers (frontend, ops
dashboards, future LLM-driven self-checks) had to parse the doc to know
which components are reliable. Phase E1 makes the audit self-documenting
at runtime by surfacing a machine-readable mirror of § 2.

### What was added

- **`src/data/alternative/health_manifest.py`** — a typed
  `ComponentHealth` dataclass (`name`, `sub_package`, `source`,
  `cadence_minutes`, `persistence_target`, `verdict`,
  `audit_section_ref`, `last_refresh_at`, plus `notes` /
  `snapshot_provider_key` / `extras` for downstream consumers) and the
  module-level constant `ALT_DATA_HEALTH_MANIFEST` listing the current
  real verdicts post-Phase-D. The manifest contains **7 components**:
  - `policy_radar` — WORKING-PROTOTYPE (Phase D selectors)
  - `policy_execution` — WORKING-PROTOTYPE (derived)
  - `lme_inventory` — WORKING-PROTOTYPE (`source_mode=proxy`, US side)
  - `shfe_inventory` — WORKING-PROTOTYPE (`source_mode=live`, Phase B
    addition, CN side)
  - `people_layer` — PRODUCTION (curated, `lag_days=21`)
  - `entity_resolution` — PRODUCTION (utility)
  - `governance` — PRODUCTION (infrastructure)

  The three SCAFFOLDING-ONLY components cut in Phase A
  (`macro_hf/port_congestion`, `macro_hf/customs_data`,
  `supply_chain/hiring` 51job path) are intentionally absent. The two
  still-wired SCAFFOLDING-ONLY sub-crawlers of `supply_chain` (`bidding`
  + `env_assessment`) are also excluded from the manifest -- they yield
  zero records in the current snapshot and have not been promoted; the
  doc remains the inventory of choice for cut/never-promoted components.

  A `refresh_runtime_state(manager)` helper overlays per-component
  `last_refresh_at` (UTC ISO-8601) from each `cache/alt_data/providers/
  <provider>.json` file's mtime. Components without a snapshot key
  (utility modules) surface `last_refresh_at=None` rather than a
  fabricated timestamp. The static manifest is never mutated -- the
  overlay returns a fresh copy.

- **`GET /alt-data/health`** in
  `backend/app/api/v1/endpoints/alt_data.py` returns:

  ```json
  {
    "manifest": [{"name": "policy_radar", "sub_package": "policy_radar",
                  "source": "fed/ecb RSS via _safe_request; ndrc HTML …",
                  "cadence_minutes": 60,
                  "persistence_target": "cache/alt_data/providers/policy_radar.json",
                  "verdict": "WORKING-PROTOTYPE",
                  "audit_section_ref": "docs/alt_data_audit.md#2-per-sub-package-verdict-table",
                  "last_refresh_at": "2026-05-05T03:00:55+00:00",
                  "notes": "Phase D refreshed CN selectors …",
                  "snapshot_provider_key": "policy_radar",
                  "extras": {}}, …],
    "generated_at": "2026-05-16T11:52:00+00:00",
    "audit_doc_url": "docs/alt_data_audit.md",
    "total_components": 7,
    "production_count": 3,
    "working_prototype_count": 4,
    "scaffolding_only_count": 0,
    "dead_count": 0
  }
  ```

  The `audit_doc_url` is repo-relative so consumers can hop straight to
  the longer-form writeup (§§ 3-9) when the structured row's `notes`
  field is not enough.

- **`tests/unit/test_alt_data_health.py`** — 8 tests pin the manifest
  shape (no SCAFFOLDING-ONLY entries, Phase B + Phase D coverage
  represented, counts add up), the runtime overlay (mtime read from a
  temp dir, utility rows stay None, static manifest immutable), the
  endpoint contract (200 OK, schema keys present, `last_refresh_at` is
  ISO-8601 or null, `audit_doc_url` resolves to a real file), and
  guards `ComponentHealth.__post_init__` against invalid verdicts.

### How to use it

- **Ops dashboards.** Poll `/alt-data/health` instead of scraping
  markdown. Filter to `verdict in ("PRODUCTION", "WORKING-PROTOTYPE")`
  for the "trustworthy components" view; sort by `last_refresh_at` to
  spot stale providers without hand-checking five JSON files.
- **Frontend GodEye.** The macro evidence panel can render a small
  per-source health chip with the verdict label and a stale-refresh
  warning when `last_refresh_at` is older than `6 * cadence_minutes`.
  *Shipped:* `frontend/src/components/GodEyeDashboard/AltDataHealthTile.jsx`
  consumes this endpoint and renders the manifest in GodEye's "另类数据
  与物理世界" section (4 verdict counters + per-component table with
  relative-time refresh tags).
- **CI / self-checks.** A scheduled task can fail the build when the
  manifest's `working_prototype_count` drops below 4 or
  `scaffolding_only_count` rises above 0, catching regressions where a
  promoted component silently falls back to scaffolding.

### Caveats

- The manifest is statically maintained in code; promoting a component
  (e.g., `lme_inventory` from WORKING-PROTOTYPE → PRODUCTION) is a code
  change, not a runtime side-effect. This is intentional: the verdict
  reflects audit-team judgement, not just record-count thresholds.
- `last_refresh_at` reads file mtime, not the in-memory
  `ProviderRefreshStatus.last_success_at`. For a "did the *refresh
  itself* succeed" view, callers should still look at
  `/alt-data/status` -- the manifest answers "did the snapshot file
  change on disk", which is the more honest persistence signal.
- OpenAPI baseline (`docs/openapi.json`) was refreshed with only the
  new `/alt-data/health` entry; no unrelated routes were touched. The
  diff gate (`scripts/check_openapi_diff.py`) reports the addition as
  non-breaking.

### Test status after Phase E1

`pytest tests/unit tests/integration -q --no-header --tb=line` →
**1242 passed** (1234 baseline + 8 new), 5 pre-existing
network-dependent skips, 0 failures. OpenAPI diff: additive only.

## 11. Phase E2 actions (2026-05-16) — Alt-data narrative tile

Phase E1 surfaced the structured per-component verdict table at runtime
via `/alt-data/health`; consumers can now answer *"which components are
trustworthy and when did each last refresh"* without parsing markdown.
What they still could not answer cheaply was *"so what is the alt-data
layer actually telling me right now?"* — that required scanning the
provider snapshots and writing the analyst sentence yourself. Phase E2
ships a deterministic, no-LLM synthesizer that produces the same 2-3
sentence summary an analyst would write after five minutes on the
dashboard, plus the matching GodEye tile.

### What was added

- **`src/data/alternative/narrative.py`** — `build_alt_data_narrative(manager)`
  returns an `AltDataNarrative` dataclass (`summary`, `bullets`,
  `evidence_links`, `generated_at`). The synthesis rules are
  intentionally narrow and visible in code (no LLM call, no network
  I/O):
  - Sentence #1 — `policy_radar`: total record count, per-source
    breakdown (non-CN vs. CN-split, e.g. `fed/ecb 主导, CN 端 ndrc 贡献
    3 条`), and the industry with the highest `|avg_impact|` plus its
    `偏多 / 偏空 / 中性` direction label.
  - Sentence #2 — `macro_hf`: LME (proxy) + SHFE (live) inventory trend
    summary per region, grouping metals by `destocking` /
    `restocking` / `stable`.
  - Sentence #3 — cross-cutting takeaway: only generated when the
    upstream sentences agree on a directional story (e.g., metals
    destocking + bearish industry impact → "能源金属上行压力，X 板块短期
    承压"). Returns no sentence rather than fabricating a thesis on
    weak signal.
  - Components whose snapshot mtime is older than `STALE_THRESHOLD_DAYS`
    (= 7 days) get a `[stale]` prefix on the corresponding sentence and
    `stale: true` on the evidence link.
  - Every bullet carries a matching `evidence_link` dict (`component`,
    `snapshot_path`, `verdict`, `stale`, `last_refresh_at`) so the
    frontend can deep-link the consumer into the underlying snapshot.
  - Empty manager (zero providers / zero signals) returns the
    `"alt-data 暂无信号"` empty-state copy, never blank.

- **`GET /alt-data/narrative`** in
  `backend/app/api/v1/endpoints/alt_data.py` returns the synthesizer's
  payload plus `audit_doc_url`. `Cache-Control: max-age=300` is set on
  the response — synthesis is deterministic, so the same inputs produce
  identical `bullets` / `evidence_links` across the 5-minute window.

- **`frontend/src/components/GodEyeDashboard/AltDataNarrativeTile.jsx`**
  — Antd `Card` with the 2-3 sentence `summary` rendered as a paragraph,
  a `List` of bullets below where each row shows the underlying
  provider's verdict tag (PRODUCTION / WORKING-PROTOTYPE / DERIVED), a
  `[stale]` / `[fresh]` chip from the evidence link, and a snapshot
  deep-link. The tile is wired into the `GodEyeDashboard` index *above*
  `AltDataHealthTile` so the narrative comes first, the health
  drill-down below.

- **`tests/unit/test_alt_data_narrative.py`** — 8 tests pin the rules:
  empty manager → empty narrative; fresh policy + macro → 3 sentences
  with the documented structure; stale provider → `[stale]` prefix +
  `stale=True` evidence link; idempotence (same inputs → identical
  `bullets` / `evidence_links`); single-provider seeded → 2 sentences
  without the missing component; `to_dict()` field coverage;
  endpoint returns 200 with the `Cache-Control: max-age=300` header.

- **`frontend/src/components/GodEyeDashboard/__tests__/AltDataNarrativeTile.test.jsx`**
  — 7 Jest tests covering: relative-time formatter, happy-path render
  (summary + 3 bullets + verdict tags), stale chip color, error-state
  Alert, refresh button re-fetch, empty narrative renders the `Empty`
  component.

### How to use it

- **Frontend GodEye.** The tile auto-fetches on mount and exposes a
  refresh button. Mounted in the "另类数据与物理世界" section above
  `AltDataHealthTile`.
- **Ops dashboards.** Poll `/alt-data/narrative` to render a one-glance
  "what's the alt-data layer telling us" card. The 5-minute cache budget
  means a 1/min poller is fine.
- **CI / smoke checks.** Compare the `summary` string across releases
  to spot accidental regressions in the synthesis rules.

### Caveats

- The synthesizer is intentionally conservative: when the directional
  read is ambiguous it returns the policy or macro sentence on its own
  and skips the cross-cutting takeaway rather than guessing.
- `generated_at` is the wall-clock UTC time at synthesis; it differs
  across calls. The endpoint test compares `summary` / `bullets` /
  `evidence_links` for idempotence, not `generated_at`.
- OpenAPI baseline (`docs/openapi.json`) refreshed with only the new
  `/alt-data/narrative` entry; the diff gate reports the addition as
  non-breaking.

### Test status after Phase E2

`pytest tests/unit tests/integration -q --no-header --tb=line` runs
clean: backend unit suite + 8 new narrative tests pass. Frontend Jest:
all 7 `AltDataNarrativeTile.test.jsx` cases pass alongside the existing
`AltDataHealthTile.test.jsx` suite. OpenAPI diff: additive only.

### Phase E2.1 (2026-05-16) — Industry-scoped narrative on Pricing Gap

The Pricing Gap Analysis page is the user's primary single-ticker
mispricing decision surface. Before this slice it surfaced multi-model
estimates (CAPM / FF3 / DCF) and gap deltas but did not pull in any
macro / alt-data context. Phase E2.1 connects the two pieces:
`/alt-data/narrative` now accepts an optional industry scope and the
pricing page reads it for the analysed ticker's industry.

**Backend extensions** (one-direction integration; pricing reads alt-data,
not the other way around):

- `src/data/alternative/narrative.py:build_alt_data_narrative` accepts
  an optional `ticker_industry: str | None` keyword. When supplied:
  * Policy_radar records are filtered to those whose `tags` /
    `metadata.industries` / `raw_value.industry` mention the label.
    When the time-windowed record set is empty the synthesiser falls
    back to the provider's in-memory history, then to the post-refresh
    aggregates in `latest_signals.industry_signals` so an analyst
    consulting an old cache still sees a meaningful read.
  * Macro_hf inventory buckets are pruned to commodities relevant to the
    industry via `ticker_industry.metals_for_industry` — 新能源汽车 →
    `{铜, 铝, 镍, 锂}`, AI算力 → `{铜}`, 光伏 → `{铝, 铜}`, etc. When the
    intersection is empty the macro sentence is dropped rather than
    fabricated.
  * The cross-cutting takeaway is pinned to the requested industry's
    avg_impact rather than the global top-impact one.
  * Both layers empty → degraded `本行业暂无显著另类数据信号` copy
    via the new `EMPTY_INDUSTRY_NARRATIVE_SUMMARY` constant.
- `src/data/alternative/ticker_industry.py` (new) — ticker → industry
  resolver with a static fallback (`300750.SZ`, `TSLA`, `NVDA`, ...) and
  an optional `data_manager.get_fundamental_data(symbol)` lookup that
  canonicalises Yahoo industry/sector strings ("Auto Manufacturers"
  → 新能源汽车) into the alt-data label set.
- `GET /alt-data/narrative` accepts `industry=<label>` (optional,
  maxLength 64). Response carries `industry_scope` echoing the scope
  back to the client; `Cache-Control: max-age=300` budget is preserved.

**Frontend integration**:

- `frontend/src/components/pricing/AltDataContextPanel.jsx` (new) —
  ant Card titled "另类数据上下文", `data-testid="pricing-alt-data-context"`.
  Lazy-loaded via `React.lazy` in `PricingResultsSection`. Renders summary
  paragraph + bullets with verdict + stale/fresh chips, mirroring the
  GodEye `AltDataNarrativeTile` evidence-link UX. Empty state when the
  industry can't be resolved; Alert on endpoint error.
- `frontend/src/components/pricing/PricingResultsSection.js` mounts the
  panel on its own row directly under the CAPM/FF3 + Valuation row,
  ahead of the Drivers / Implications row. Industry resolution lives
  client-side in `resolveAltDataIndustry(data)` which inspects
  `data.valuation.{industry,sector}` and matches against six regex
  rules (新能源汽车 / 电网 / 风电 / AI算力 / 光伏 / 储能).
- `frontend/src/services/api/altDataAndMacro.js:getAltDataNarrative`
  now accepts `{ industry?: string }` and appends it as a URL
  search-param. Pre-existing callers (`AltDataNarrativeTile`) keep
  working — no positional API break.

**Tests** (run with `python -m pytest tests/unit tests/integration -q
--no-header --tb=line && cd frontend && CI=1 npm test -- --runInBand
--watchAll=false src/components/pricing/__tests__/AltDataContextPanel.test.jsx`):

- `tests/unit/test_alt_data_narrative.py` gains 11 cases covering the
  industry-filter happy path, no-coverage degraded path, endpoint
  query-param echo, the `ticker_industry` resolver layers (static
  fallback + data-manager lookup + broken-provider tolerance),
  `metals_for_industry`, `filter_records_by_industry`, and
  industry-scoped idempotence. Total backend suite: 1261 passed, 5
  skipped (baseline 1222 → 1261, only additive).
- `frontend/src/components/pricing/__tests__/AltDataContextPanel.test.jsx`
  ships 4 cases: 3-bullet happy path with `getAltDataNarrative` called
  as `{ industry: '新能源汽车' }`, no-signal empty state with degraded
  summary, error rendering, and the no-industry-prop short-circuit
  (no api call, "未识别行业" empty state).

**OpenAPI diff**: additive only. `GET /alt-data/narrative` gains the
optional `industry` query parameter and a 422 response (validation
failure path); `industry_scope` shows up in the response payload schema.
`python scripts/check_openapi_diff.py` reports `OpenAPI: no contract
drift` after baseline refresh.

**Sample industry-scoped narrative (live cache, 2026-05-16)**:

```
GET /alt-data/narrative?industry=新能源汽车

summary:
  [stale] 政策雷达本周捕获 8 条 新能源汽车 相关政策记录(ecb=4、fed=4 主导)，
  新能源汽车 行业影响力 avg_impact=-0.39, 偏空。
  [stale] 宏观高频库存信号（新能源汽车 相关金属）：LME 铜/铝 stable。
  综合判读：新能源汽车 板块短期承压。
```

Both upstream snapshots are flagged `[stale]` because the audit corpus
mtime is older than `STALE_THRESHOLD_DAYS=7` — the cross-cutting
takeaway is synthesised (no snapshot of its own) so it has no prefix,
consistent with Phase E2 rules.


## 12. Phase E3 actions (2026-05-17) — Workbench candidate queue

Phases E1/E2/E2.1 made alt-data **visible** — first as a health
manifest tile, then as a 2-3 sentence narrative, then as an
industry-scoped panel on the Pricing Gap page. Phase E3 closes the
loop by making alt-data **actionable**: high-impact policy signals
and SHFE inventory swings now surface as **candidate research tasks**
that the operator can convert into real Workbench task cards with one
click.

### Architecture

```
AltDataManager.latest_signals          (policy_radar, macro_hf, …)
                ↓
generate_candidates_from_alt_data()    (threshold-gated, pure)
                ↓
CandidateStore.reconcile()             (state-preserving merge)
                ↓
cache/workbench/alt_data_candidates.json (atomic-rename)
                ↓
GET /research-workbench/alt-data-candidates
POST /research-workbench/alt-data-candidates/refresh
POST /research-workbench/alt-data-candidates/{id}/convert
POST /research-workbench/alt-data-candidates/{id}/dismiss
POST /research-workbench/alt-data-candidates/{id}/snooze
                ↓
AltDataCandidateQueue (research-workbench column, board left)
```

A **candidate** is *not* a task: it carries `state ∈ {pending,
dismissed, snoozed, converted}` and is system-generated from alt-data
state. The user converts a pending candidate into a real Workbench
task (`macro_mispricing` type, `context.tags` pre-populated with
`alt-data:<component>` + `industry:<name>`, snapshot carrying the
evidence link), dismisses it (state preserved so the same signal
doesn't re-suggest itself), or snoozes it for `N` hours.

### Thresholds (env-configurable)

| Env var | Default | Meaning |
|---|---|---|
| `ALT_DATA_CANDIDATE_POLICY_IMPACT_THRESHOLD` | `0.30` | Minimum `|avg_impact|` on `industry_signals` for a policy candidate |
| `ALT_DATA_CANDIDATE_POLICY_MENTIONS_THRESHOLD` | `3` | Minimum `mentions` on `industry_signals` for a policy candidate |
| `ALT_DATA_CANDIDATE_SHFE_WEEKLY_CHANGE_THRESHOLD` | `5.0` (pct) | Minimum `|weekly_change_pct|` for an SHFE candidate |
| `ALT_DATA_CANDIDATE_STALE_DAYS` | `30` | Days after which a candidate with no recurring signal is pruned |

### Reconciliation contract

`CandidateStore.reconcile()` is idempotent under repeat input:

- **NEW** `candidate_id` (new combination of `component / signal_type /
  industry`) — appended with state `pending`.
- **KNOWN** `candidate_id` — `headline / impact_score / mentions /
  evidence_link / last_seen_at` overwritten, **`state` preserved**
  (so a dismissed candidate stays dismissed, a converted one stays
  bound to its task).
- **STALE** — `last_seen_at` older than `stale_days` and not in the
  new batch → pruned entirely.

Snoozed candidates auto-unsnooze when `snoozed_until` is in the past
(checked lazily on every `list_candidates()` / `reconcile()` call).

### Persistence

JSON file at `cache/workbench/alt_data_candidates.json`. Atomic-rename
pattern matches Phase E2's narrative.py: write to a unique sibling
temp file in the target directory, `fsync`, then `Path.replace` to the
target. A crash mid-write cannot corrupt the on-disk view, and
multiple store instances do not race on one shared temp path.

### Convert ↔ task contract

When a candidate is converted, `candidate_to_task_payload()` produces
a `ResearchWorkbenchStore.create_task` payload with:

- `type = "macro_mispricing"` (closest match in the existing
  `VALID_TYPES`; alt-data candidates always reflect a macro narrative).
- `status = "new"` (the spec called for a `"triaged"` state, but
  extending `VALID_STATUSES` would touch shared state-flow logic —
  the candidate's "triaged" intent rides through
  `context.alt_data_candidate_id`).
- `source = "alt_data:<component>"`.
- `title = "[Alt-Data] <component> · <industry>"`.
- `note` carrying the human-readable evidence breakdown.
- `context.tags = ["alt-data:<component>", "industry:<name>"]`.
- `context.alt_data_candidate_id`, `alt_data_evidence`, and the raw
  metric (impact_score, mentions) for downstream queries.
- `snapshot.payload.alt_data_candidate_id` so the snapshot history
  carries the same back-reference.

After successful conversion the candidate transitions to
`state = "converted"` with `converted_task_id` populated. Re-invoking
`/convert` on the same candidate returns the existing task with
`duplicate: true` (so the frontend can stop spamming creates if the
user double-clicks). Dismissed and snoozed candidates are rejected
before task creation.

### Test status after Phase E3

`tests/unit/test_alt_data_candidates.py` covers:

- threshold gating for both policy_radar and SHFE inventory
- dedup across reconcile passes
- pruning of stale candidates
- state transitions (dismiss / snooze / mark_converted)
- snooze auto-unblock when `snoozed_until` is past
- JSON persistence round-trip after restart
- the five HTTP endpoint shapes (list / refresh / convert /
  dismiss / snooze), including non-pending convert rejection
- converted duplicate handling remains idempotent
- conversion → task creation pre-attaches `alt-data:*` and
  `industry:*` tags

Focused verification for this slice:

- `pytest tests/unit/test_alt_data_candidates.py` — 15 passed
- `CI=true npm test -- --runTestsByPath src/components/research-workbench/__tests__/AltDataCandidateQueue.test.jsx --watchAll=false` — 8 passed
- `python3 scripts/check_openapi_diff.py` — no contract drift
- `CI=true npm run build` — compiled successfully


## 13. Phase E4 actions (2026-05-17) — Narrative time-series archive

Phase E2 ships a synchronous *snapshot* narrative. The next leap is a
time-series view: every time `/alt-data/narrative` runs we want to keep
the bullets + evidence_links + industry scope on disk so a research
analyst can scroll a 14-day timeline and watch the alt-data picture
evolve.

### Design

`src/data/alternative/narrative.py` adds:

- `ArchivedNarrative` dataclass (`archived_at`, `industry`, `summary`,
  `bullets`, `evidence_links`, `original_generated_at`).
- `NarrativeArchive` class managing
  `cache/alt_data/narrative_history.jsonl`.
- Module-level singleton `get_narrative_archive()` plus the
  test-only `reset_narrative_archive_for_tests`. Mirrors the
  `CandidateStore` pattern from `src/research/alt_data_candidates.py`.

Persistence strategy:

- **Append**: each call opens the JSONL with `O_APPEND | O_CREAT |
  O_WRONLY`, writes one JSON line, fsyncs, and closes. The OS
  guarantees per-record positioning so two concurrent processes never
  interleave bytes mid-line. Per-line `O_APPEND` is simpler than a
  temp-file rename and is appropriate because a partial line on crash
  is recoverable (the reader skips malformed lines with a warning).
- **Rotation**: before each append we `stat()` the file; if it
  crosses `ARCHIVE_ROTATE_SIZE_BYTES` (default 10 MB) we
  `rename` it to `narrative_history.jsonl.<UTC-iso>.archive` and
  start a fresh file. `recent()` only reads the live file —
  archived rolls are out of band until an operator merges them.
- **Memory cap**: the instance keeps the most recent
  `ARCHIVE_MEMORY_CAP` (default 200) entries in a `deque`; older
  reads stream from disk lazily so a long-running process can't
  accumulate an unbounded in-memory list.
- **Empty state suppression**: when `narrative.bullets` is empty
  (e.g. the industry-scoped degraded copy) we return the
  `ArchivedNarrative` but skip the disk write — a timeline of
  "no signals" rows is noise.

### Endpoint shape

`GET /alt-data/narrative/history?days=<int>&industry=<name>` returns

```json
{
  "archives": [
    {
      "archived_at": "2026-05-17T08:00:00+00:00",
      "industry": "新能源汽车",
      "summary": "...",
      "bullets": [...],
      "evidence_links": [...],
      "original_generated_at": "2026-05-17T07:55:00+00:00"
    }
  ],
  "total": 1,
  "days_window": 14,
  "industry_scope": "新能源汽车",
  "audit_doc_url": "docs/alt_data_audit.md"
}
```

- `days` defaults to 14, clamped to `[1, 90]` by FastAPI's `Query`
  validator (a request outside that range returns 422, not a silent
  clamp — this surfaces bugs in callers).
- `industry` is exact-match against the `industry` recorded at
  append time. Empty / null matches every row.
- Sort order is newest-first; the frontend renders an Antd
  `Timeline` in that order without re-sorting.

### Frontend

`AltDataNarrativeTile.jsx` grows a "查看历史" button alongside the
existing refresh button. Clicking opens a right-side `Drawer`
(`data-testid="alt-data-narrative-history-drawer"`) that lazy-fetches
`getAltDataNarrativeHistory({ days: 14 })` and renders the
`archives` list as an Antd `Timeline`. Each row shows the
`archived_at` timestamp, an industry tag (or "全局" when null), and
the summary text. Empty payloads render the `Empty` placeholder.

### Test status after Phase E4

`tests/unit/test_alt_data_narrative_history.py` covers:

- `append` → `recent` roundtrip (bullets, evidence, industry, ISO
  stamps survive JSON serialisation)
- the `days` window filters out backdated rows
- the `industry` filter is exact-match across multiple appends
- the rotation path: a `rotate_size_bytes=512` archive produces a
  `*.archive` rolled file once enough rows accumulate
- malformed JSON lines are skipped + logged at WARNING
- the in-memory cap correctly falls back to disk reads when the
  deque is smaller than the on-disk file
- the `/alt-data/narrative/history` endpoint shape + `days` clamp
  (FastAPI rejects `days=0` and `days > 90` with 422)
- the `/alt-data/narrative` endpoint appends to the archive when
  invoked

Frontend `AltDataNarrativeTile.test.jsx` adds three cases:

- opening the drawer fetches `/alt-data/narrative/history?days=14`
  and renders the entries as a Timeline newest-first
- empty `archives` array renders the empty-state
- the tile preserves the backend's sort order rather than
  re-sorting

Focused verification for this slice:

- `pytest tests/unit/test_alt_data_narrative_history.py` — 8 passed
- `CI=true npm test -- --runTestsByPath src/components/GodEyeDashboard/__tests__/AltDataNarrativeTile.test.jsx --watchAll=false` — 10 passed (7 prior + 3 history)
- `python3 scripts/check_openapi_diff.py --update` adds only the
  new `/alt-data/narrative/history` path; no breaking change.

## 14. Phase F1 actions (2026-05-17) — Public summary export

Phases A–E shipped the alt-data pipeline as a *private* runtime: every
snapshot lives in `cache/alt_data/providers/*.json`, which is gitignored
and process-local. Downstream consumers (the new
`/Users/leonardodon/cn-altdata-brief` sibling project that generates
daily briefs, and an eventual GitHub Pages publication path) currently
have to access the local filesystem to read the runtime cache. That
breaks the moment briefs run from GitHub Actions or any other host that
doesn't share the working machine's `cache/` tree.

Phase F1 introduces a stable PUBLIC distillation of the runtime cache
that is safely committable to git, refreshed on a beat cadence, and
versioned via a top-level `schema_version`.

### Design

`scripts/export_public_summary.py` is the source-of-truth. Its
`build_public_summary(...)` helper reads each provider snapshot under
`cache/alt_data/providers/*.json` and emits a small dict at
`data/public/alt_data_summary.json` (~5KB on the 2026-05-05 reference
snapshot, 199 lines pretty-printed). Per-provider distillers strip
everything except curated aggregates:

- `policy_radar` — `total_records`, `policy_count`, `by_source`
  (always including the canonical fed/ecb/ndrc/nea/boe keys so dark
  regions surface as explicit `0`), and the per-industry
  `{avg_impact, mentions, signal}` map (capped at top-25 by
  `|avg_impact|` to bound growth).
- `macro_hf` — metals dict with per-region (LME/SHFE) breakdown
  derived from `source_mode`, plus aggregate `macro_pressure` and
  `dominant_source_mode`.
- `people_layer` — `ticker_count`, fragile/supportive split, avg
  scores, plus a watchlist preview (capped at 30) containing only
  `{symbol, risk_level, stance, people_fragility_score, people_quality_score}`.
  Watchlist *evidence* and per-symbol governance bullets are excluded.
- `policy_execution` — `department_count`, `chaotic_department_count`,
  `reversal_count`, plus the top-10 department previews (chaos_score,
  reversal counts, execution_status — no `latest_title` headlines).
- `supply_chain` — `dimensions` map and `alert_count`.

### Sanitization rules

The script is conservative by construction:

- File paths, raw HTML bodies, `_internal_*` debug keys,
  `provider_info`, `refresh_status`, and the full `records` array are
  **never** included in the output. The `test_sensitive_runtime_fields_are_excluded`
  test asserts no `/Users/`, `/cache/`, `<html>`, `secret_api_key_hash`,
  `_internal_*`, `raw_value`, `provider_info`, `refresh_status` etc.
  appears in the serialized blob.
- Deterministic ordering: `json.dump(..., sort_keys=True, indent=2)`
  + UTC ISO timestamps stripped to second resolution means same
  input + same `generated_at` → byte-identical output. The only
  field that changes between runs without a real data change is
  `generated_at` itself.
- Atomic write via the `governance.py` tempfile + rename pattern.

### Beat wiring

A new task `alt_data.export_public_summary` lives in
`backend/app/core/alt_data_tasks.py` next to the 5 provider refresh
tasks. Schedule: every 30 minutes (beat entry name
`alt-data-export-public-summary`). Soft / hard timeouts are 45s / 60s
because the work is pure JSON munging on already-cached snapshots, no
network. The task body lazily loads `scripts/export_public_summary.py`
via `importlib.util.spec_from_file_location` so the Celery import path
doesn't need to know the script's internals — both the CLI run and the
beat run share `build_public_summary` + `write_public_summary_atomic`,
so they produce identical files (modulo `generated_at`).

### .gitignore change

The repo's pre-existing `data/` blanket ignore was tightened to `data/*`
+ a `!data/public/` negation so this single sub-tree becomes
committable. `git check-ignore -v data/public/alt_data_summary.json`
now reports the negation hit.

### Output sample (2026-05-05 reference snapshot)

```json
{
  "schema_version": 1,
  "generated_at": "2026-05-17T02:04:19+00:00",
  "source_codebase_version": "4.2.0",
  "providers": {
    "policy_radar": {
      "last_refresh_at": "2026-05-05T11:00:55.132458",
      "total_records": 20,
      "policy_count": 20,
      "by_source": {"boe": 0, "ecb": 10, "fed": 10, "ndrc": 0, "nea": 0},
      "industry_signals": {
        "新能源汽车": {"avg_impact": -0.3875, "mentions": 94, "signal": "bearish"},
        "电网": {"avg_impact": 0.1, "mentions": 8, "signal": "neutral"}
      }
    },
    "macro_hf": {
      "last_refresh_at": "2026-05-05T11:02:15.485885",
      "macro_pressure": 0.0,
      "dominant_source_mode": "proxy",
      "metals": {
        "copper": {
          "weekly_change_pct": -0.68,
          "trend": "stable",
          "region_breakdown": {
            "LME": {"source_mode": "proxy", "trend": "stable", "price_change_pct": -0.68, "confidence": 0.068, "lag_days": 1, "coverage": 0.68}
          }
        }
      }
    },
    "people_layer": {
      "last_refresh_at": "2026-05-05T11:02:15.641591",
      "ticker_count": 11,
      "fragile_company_count": 1,
      "supportive_company_count": 10,
      "dominant_mode": "curated",
      "watchlist_preview": [{"symbol": "BABA", "risk_level": "high", "stance": "fragile", ...}]
    },
    "policy_execution": {...},
    "supply_chain": {...}
  },
  "components_health": {
    "total": 7, "production": 3, "working_prototype": 4, "scaffolding_only": 0, "dead": 0
  }
}
```

### Test status after Phase F1

`tests/unit/test_public_summary_export.py` — 12 passed:

- All 5 expected provider keys land in the output when all snapshots exist
- Missing provider → silently omitted (no synthetic data)
- Empty `industry_signals` round-trips as `{}` (not `None`)
- `schema_version` constant surfaces at top level (currently 1)
- Atomic write: file swap is one-step + no leftover `.tmp`
- Atomic write: serialization failure preserves prior output untouched
- Sensitive runtime fields never leak (file paths, `_internal_*`,
  raw HTML, `provider_info`, `refresh_status`, etc.)
- Determinism: same input + fixed `generated_at` → byte-identical output
- `policy_radar.by_source` backfills `ndrc/nea/boe=0` even when the
  source_health map omits them
- `macro_hf.metals.copper` aggregates SHFE (live) + LME (proxy)
  records into one entry with per-region breakdown; top-level
  `weekly_change_pct` prefers the live reading
- `components_health` aggregates the static `ALT_DATA_HEALTH_MANIFEST`
  tier counts (7 total: 3 PRODUCTION, 4 WORKING-PROTOTYPE, 0 / 0)
- End-to-end `export_public_summary()` writes the JSON to disk

`tests/unit/test_alt_data_tasks.py` extended for the export task:

- `build_beat_schedule` now emits 6 entries (5 refresh + 1 export);
  the export entry uses `timedelta(minutes=30)`, task name
  `alt_data.export_public_summary`, beat entry name
  `alt-data-export-public-summary`
- `register_alt_data_tasks` registers a 6th task on the stub app
  with `soft_time_limit=45`, `time_limit=60`, `acks_late=True`
- `register_alt_data_tasks` against a real `celery.Celery` app
  also picks up the export task
- New focused test asserts the Celery body delegates to
  `scripts/export_public_summary.py:export_public_summary` (via
  `importlib.util.spec_from_file_location`) and returns
  `{status, schema_version, generated_at, provider_count, output_path}`

Full suite after Phase F1: `pytest tests/unit tests/integration -q
--no-header` → **1298 passed, 5 skipped, 0 failures** (1290 baseline
+ 8 net new — 12 new tests + 1 added export-task test, 5 pre-existing
network-dependent skips remain). mypy gate: 72 errors vs baseline 73
(down by 1, unchanged from Phase E4). ruff/pyflakes baseline: 169,
unchanged. OpenAPI baseline: no API change (the export task is
internal — the public summary is read off disk).

### Size + growth budget

Committed file size on the 2026-05-05 reference cache: **5054 bytes**
(~5KB), well under the 50KB sanity bound documented in the task brief.
Estimated growth profile:

- 1 day, beat refreshes every 30 minutes → 48 rewrites; only the
  fields that actually change show up in `git diff` thanks to
  `sort_keys=True`. Realistic per-day delta on a healthy day: 2–3
  lines (the `generated_at` line + a handful of `last_refresh_at`
  + score updates).
- 1 month committed every 30 minutes → upper-bound 1440 commits if
  *every* beat tick were committed (which we don't — humans / a
  daily auto-commit job will batch). Even at that pace the file
  itself stays bounded; only the git history grows.

### Downstream consumers

`cn-altdata-brief` and any future GitHub Pages publication can now
read `data/public/alt_data_summary.json` directly out of the repo
(raw GitHub URL or git fetch), with no dependency on a running
backend or the private `cache/` tree. The schema is stable: bumps
to `schema_version` signal a breaking change so consumers can pin
to a known shape.

## 15. Phase F2 actions (2026-05-17) — fund holdings provider

Phase F2 adds `fund_holdings` as a **WORKING-PROTOTYPE** institutional-flow
provider. It reads public 天天基金 portfolio-holdings disclosures through the
AkShare function present in the locked dependency line:
`ak.fund_portfolio_hold_em(symbol=<code>, date=<year>)`. The provider tries the
current and previous disclosure year, then degrades to an empty/low-coverage
signal when AkShare returns no rows or raises.

Key design constraints:

- The catalog is a manually maintained 50-name large/liquid public-fund list,
  not a live top-AUM ranking claim.
- The output metric is a proxy: `total_aum_weight_pct` is the sum of reported
  per-fund position weights, not RMB exposure and not AUM-weighted exposure.
- Runtime records may keep per-fund attribution for debugging, but
  `data/public/alt_data_summary.json` intentionally omits `top_holder_fund_code`
  and other per-fund fields. The public file only exposes ticker-level aggregate
  counts, summed reported weights, catalog version, confidence, and capped
  leaderboard rows.
- Narrative copy only fires when a ticker appears in at least 15 catalog funds,
  avoiding high-concentration claims on thin coverage.

Focused gates after Phase F2:

- `python3 -m pytest -q tests/unit/test_fund_holdings_provider.py
  tests/unit/test_alt_data_health.py tests/unit/test_alt_data_tasks.py
  tests/unit/test_public_summary_export.py` → 42 passed.
- `python3 scripts/check_ruff_pyflakes_baseline.py` → current=169, baseline=169.
- `git diff --check` → clean.

## 16. Phase F3 actions (2026-05-17) — northbound flows provider

Phase F3 adds `northbound` as a **WORKING-PROTOTYPE** foreign-capital-flow
provider — the 9th alt-data sub-package, and the first daily-frequency
public-disclosure feed in the repo. It complements `fund_holdings`
(quarterly domestic institutional flow) with T+1 *daily* foreign capital
netflow via Stock Connect (沪深港通, HSGT). The combined view feeds the
"Macro Mispricing" thesis: when 北向 outflow + 公募 inflow → potential
reversion opportunity (or vice versa).

Three AkShare endpoints back the provider:

- `ak.stock_hsgt_hist_em(symbol="北向资金")` — daily netflow history.
  Provider trims to the trailing 60 days (`days_back` config) so the 30-day
  cumulative window in the public summary always has 1.5× margin.
- `ak.stock_hsgt_hold_stock_em(market=..., indicator="今日排行")` — per-stock
  current northbound holdings. Provider keeps the top 100 by aggregate
  northbound holding value. The first call uses `market="北向"`; if upstream
  rejects it (some akshare versions only accept `沪股通` / `深股通`) we fall
  back to the Shanghai-only path so at least *some* coverage flows through.
- `ak.stock_hsgt_board_rank_em(symbol="北向资金增持行业板块排行",
  indicator="今日")` — industry-level netflow rank.

Key design constraints:

- The three endpoints are called inside isolated try/except blocks so a
  single network blip degrades to a *partial-coverage* signal rather than
  tanking the whole run. `confidence` peaks at 0.75 when all three slices
  respond; degrades linearly with the number of failed slices.
- `source_mode="public_disclosure"`, `lag_days=1` — HSGT publishes the day's
  net buy by T+1 morning; the 1-day lag keeps the freshness-weighted
  evidence honest. Twice-daily refresh cadence (12 h) is the smallest
  interval that still keeps the macro engine current ahead of T+1
  decisions; anything faster would burn cache without new information.
- The public summary export (`data/public/alt_data_summary.json`) only
  surfaces *aggregate* fields: `last_trade_date`, `daily_netflow_cny_billion`,
  `cumulative_30d_cny_billion`, plus the top-5 inflow / outflow industry
  lists (`PUBLIC_TOP_INDUSTRY_LIMIT=5`). Per-stock detail (ticker,
  `stock_name`, `holding_value_cny`) is intentionally kept in runtime
  records only — the public file never leaks per-stock attribution.
- Signal sign uses a 5 亿 deadband so noise around zero doesn't flip
  bullish/bearish; strength caps at 1.0 when |latest_netflow| ≥ 50 亿.

Focused gates after Phase F3:

- `python3 -m pytest -q tests/unit/test_northbound_provider.py
  tests/unit/test_alt_data_health.py tests/unit/test_alt_data_tasks.py
  tests/unit/test_public_summary_export.py
  tests/unit/test_fund_holdings_provider.py` → all targeted suites pass.
- Full suite `tests/unit tests/integration` → 1317 passed + 5 skipped
  (baseline 1308 + 9 new northbound tests).
- akshare is stubbed via `sys.modules` in all tests — zero live HTTP.

### Block trades provider

`block_trades` reads SSE/SZSE public block-trade disclosure aggregates through
`ak.stock_dzjy_sctj()` and `ak.stock_dzjy_mrtj(start_date=, end_date=)`, then
emits only daily tape, per-ticker aggregate, and industry aggregate records.
The provider drops buyer/seller brokerage-seat detail before `AltDataRecord`
emission.

Public-summary output keeps that boundary: the block-trades section publishes
bounded industry/ticker leaderboards plus an `evidence_link` with
`component`, `source_mode`, public source label, `audit_ref`,
`last_refresh_at`, and the `aggregate_only_no_brokerage_seats` redaction
contract. It deliberately does not publish runtime `records`, cache paths, or
seat-level provenance.

## 17. Phase F4 actions (2026-05-17) — Composite signal layer

Phase F4 turns the 9 alt-data providers from a parallel array of probes into a
single cross-component composite-signal layer. Until now each provider lived
in isolation; the only cross-cutting view was the deterministic 2-3 sentence
narrative built by `narrative.py`. The new `composite_signal.py` module adds a
**read-only synthesizer** on top: when 3+ providers agree on a direction for
the same industry, a `CompositeSignal{direction, target_kind, target,
conviction, supporting_components, emit_at, aggregate_strength}` is emitted.

### Architecture

```
src/data/alternative/composite_signal.py
  ├── detect_composite_signals(manager) -> list[CompositeSignal]
  └── composite_signals_to_public_summary(signals) -> {top_n_bullish, top_n_bearish}

backend/app/api/v1/endpoints/alt_data.py
  └── GET /alt-data/composite-signals?min_conviction=medium

scripts/export_public_summary.py
  └── _build_composite_signals → data/public/alt_data_summary.json["composite_signals"]

frontend/src/components/GodEyeDashboard/CompositeSignalTile.jsx
  └── Mounted between AltDataNarrativeTile and AltDataHealthTile.
```

### Component readers

For each candidate industry the detector consults up to 8 component readers
(7 providers + the SHFE-only inventory split). Each reader returns a
`SupportingComponent{component, direction, signal_strength, is_strong, detail}`
or `None` when the component is below threshold / has no opinion:

| Component | Bullish trigger | Bearish trigger | Strong threshold |
|-----------|-----------------|-----------------|------------------|
| `policy_radar` | `industry_signals[X].avg_impact ≥ +0.20` | `≤ -0.20` | `|impact| ≥ 0.30` |
| `policy_execution` | Same as policy_radar, gated on `record_count > 0` | Same | `|impact| ≥ 0.30 AND records ≥ 3` |
| `northbound` | Industry netflow `≥ +2.0` CNY billion | `≤ -2.0` CNY billion | `|netflow| ≥ 5.0` billion |
| `fund_holdings` | Summed `total_aum_weight_pct` for industry tickers `≥ 0.35` | (one-sided) | `≥ 0.55` |
| `macro_hf` | Relevant metals predominantly destocking | Predominantly restocking | `≥ 2` metals same direction |
| `shfe_inventory` | SHFE-only metal slice destocking | SHFE-only restocking | `≥ 2` SHFE metals same direction |
| `people_layer` | Industry tickers in `supportive_companies` | Industry tickers in `fragile_companies` | `max(score) ≥ 0.30` |
| `supply_chain` | Per-industry avg record score `≥ +0.15` | `≤ -0.15` | `|avg| ≥ 0.30` |

### Conviction tiers

- **HIGH**: 4+ agreeing components, with the strong-component count
  ≥ `MIN_COMPONENTS_FOR_MEDIUM` (3). Mixed-strength HIGH is allowed because
  4 agreeing voices is meaningful even when one component is borderline.
- **MEDIUM**: exactly 3 agreeing components.
- **LOW**: exactly 2 agreeing components — informational only, filtered out
  unless `min_conviction=low` is passed to the endpoint or `include_low=True`
  to the detector.

### Conflict handling

When both bullish and bearish sides hit the 2-component floor for the same
industry, neither side emits a composite — the existing conflict tracker in
`AltDataManager._build_conflict_summary` is the right surface for split
evidence and we don't want to double-report. The composite layer's job is
*agreement detection*, not contradiction detection.

### Idempotence

`detect_composite_signals` is pure given a snapshot: it reads from
`manager.latest_signals` and `manager.providers[*]._history`, never writes
anywhere, and produces a deterministic list ordered by
(conviction desc → aggregate_strength desc → target asc). Two calls on the
same input return identical `to_dict()` output (pinned by
`test_idempotent_same_input_same_output`).

### Endpoint shape

`GET /alt-data/composite-signals?min_conviction=medium` returns:

```json
{
  "composite_signals": [
    {
      "direction": "bullish",
      "target_kind": "industry",
      "target": "AI算力",
      "conviction": "high",
      "supporting_components": [
        {"component": "policy_radar", "direction": "bullish",
         "signal_strength": 0.45, "is_strong": true,
         "detail": "avg_impact=+0.450; mentions=12"},
        ...
      ],
      "supporting_components_count": 6,
      "aggregate_strength": 0.4173,
      "emit_at": "2026-05-17T10:00:00+00:00"
    }
  ],
  "total": 1,
  "min_conviction": "medium",
  "direction_filter": null,
  "snapshot_timestamp": "2026-05-17T07:50:05",
  "audit_doc_url": "docs/alt_data_audit.md",
  "tier_summary": {"high": 1, "medium": 0, "low": 0},
  "public_summary": {
    "top_3_bullish": [...],
    "top_3_bearish": [...],
    "total_bullish": 1,
    "total_bearish": 0
  }
}
```

### Public summary integration

`data/public/alt_data_summary.json` gains a `composite_signals` block populated
by `_build_composite_signals` in the export script. The build constructs a
duck-typed stub manager around the on-disk provider snapshots so the export
runs without booting akshare / yfinance — same pattern the rest of the
public-summary distillers follow. The block is purely additive against
`schema_version=1` (no breaking change).

### Frontend tile

`CompositeSignalTile.jsx` mounts in the GodEye dashboard's
「另类数据与物理世界」 section between `AltDataNarrativeTile` and
`AltDataHealthTile`. Two side-by-side columns (looking 5 + 5) show the top
bullish and top bearish composites with the conviction tag, direction tag,
aggregate strength, and the comma-separated supporting components — minimal
chrome on purpose so the operator can scan across the section in one glance.

### Tests

`tests/unit/test_composite_signal.py` (10 tests):

- `test_all_components_bullish_emits_high_conviction` — 4+ strong → HIGH.
- `test_three_components_emit_medium_conviction` — exactly 3 → MEDIUM.
- `test_mixed_directions_skipped` — conflict → no emit on either side.
- `test_neutral_inputs_emit_nothing` — sub-threshold → empty list.
- `test_policy_impact_threshold_boundary` — `avg_impact=0.20` is inclusive.
- `test_empty_manager_returns_empty_list` — `None` / empty `manager` → `[]`.
- `test_idempotent_same_input_same_output` — same input ⇒ identical dict.
- `test_include_low_emits_two_component_signals` — flag honored.
- `test_public_summary_top_3_caps` — public-summary distillation cap.
- `test_endpoint_respects_min_conviction` — endpoint filter + shape.

### Sample real-cache output (2026-05-17)

Running the detector against the live `cache/alt_data/providers/*.json`
checked into the repo today yields:

```
1 bearish low-conviction composite for 新能源汽车
  - policy_radar:    bearish, strength 0.388 (strong), avg_impact=-0.388
  - policy_execution: bearish, strength 0.388 (strong), 40 records
```

The 7 other industries don't agree across enough providers — `fund_holdings`
and `northbound` snapshots are not on disk (they require live akshare runs),
so today's coverage is policy + execution + macro_hf. As soon as the public-
disclosure feeds populate, AI算力 / 电网 should start appearing in the
bullish ladder.

## 18. Phase F4.1 actions (2026-05-17) — Composite signal time-series archive

Phase F4 ships a synchronous *snapshot* composite-signal layer. Phase F4.1
follows the same playbook the alt-data narrative used in Phase E4 (§ 13):
every time `detect_composite_signals` runs we persist the emitted
`CompositeSignal`s to a JSONL log so a research analyst can scroll a 14-day
timeline of how the cross-component agreement has evolved.

### Design

`src/data/alternative/composite_signal.py` adds:

- `ArchivedCompositeSignal` dataclass (`archived_at`, `direction`,
  `target_kind`, `target`, `conviction`, `supporting_components`,
  `aggregate_strength`, `original_emit_at`).
- `CompositeSignalArchive` class managing
  `cache/alt_data/composite_signal_history.jsonl`.
- Module-level singleton `get_composite_signal_archive()` plus the
  test-only `reset_composite_signal_archive_for_tests`. Mirrors the
  `NarrativeArchive` pattern 1:1.

Persistence strategy — identical to the narrative archive so the on-disk
hygiene story is one rule, not two:

- **Append**: each call opens the JSONL with `O_APPEND | O_CREAT |
  O_WRONLY`, writes one JSON line, fsyncs, and closes. Per-line
  `O_APPEND` keeps concurrent writers from interleaving bytes mid-record.
- **Rotation**: before each append we `stat()` the file; if it crosses
  `ARCHIVE_ROTATE_SIZE_BYTES` (default 10 MB) we `rename` it to
  `composite_signal_history.jsonl.<UTC-iso>.archive` and start fresh.
- **Memory cap**: the instance keeps the most recent
  `ARCHIVE_MEMORY_CAP` (default 100, tighter than the narrative's 200
  because each row carries a denormalised `supporting_components` list)
  entries in a `deque`; older reads stream from disk lazily.
- **Empty-state suppression**: when `detect_composite_signals` returns
  an empty list (the common case on a quiet refresh) `append_many` is a
  no-op. The endpoint hook only persists when there is at least one
  composite to log, so a quiet alt-data layer doesn't inflate the JSONL
  with nothing-rows.

### Endpoint shape

`GET /alt-data/composite-signals/history?days=<int>&industry=<name>&min_conviction=<level>`
returns

```json
{
  "archives": [
    {
      "archived_at": "2026-05-17T08:00:00+00:00",
      "direction": "bullish",
      "target_kind": "industry",
      "target": "AI算力",
      "conviction": "high",
      "supporting_components": [
        {"component": "policy_radar", "direction": "bullish",
         "signal_strength": 0.45, "is_strong": true,
         "detail": "avg_impact=+0.450; mentions=12"}
      ],
      "supporting_components_count": 1,
      "aggregate_strength": 0.42,
      "original_emit_at": "2026-05-17T07:55:00+00:00"
    }
  ],
  "total": 1,
  "days_window": 14,
  "industry_scope": "AI算力",
  "min_conviction": "high",
  "audit_doc_url": "docs/alt_data_audit.md"
}
```

- `days` defaults to 14, clamped to `[1, 90]` by FastAPI's `Query`
  validator. Out-of-range requests return 422 rather than a silent
  clamp so caller bugs surface early.
- `industry` is exact-match against the archived `target` (only
  industry-kind composites are emitted today; ticker support is reserved
  for a future phase).
- `min_conviction` follows the `high > medium > low` rank used by the
  underlying detector.
- Sort order is newest-first.

The existing `GET /alt-data/composite-signals` endpoint is unchanged
shape-wise; the only additive behaviour is that every detected composite
is now passed through `archive.append_many(composites)` *before*
filtering by the caller's `min_conviction` / `direction` knobs, so the
archive faithfully reflects the detector's full emission set.

### Frontend

`CompositeSignalTile.jsx` grows a "查看历史" button alongside the
refresh button. Clicking opens a right-side `Drawer`
(`data-testid="composite-signal-history-drawer"`) that lazy-fetches
`getCompositeSignalHistory({ days: 14 })` and renders the
`archives` list as an Antd `Timeline`. Each row shows the `archived_at`
timestamp, the target industry, a direction tag (看多/看空), a
conviction tag (★/★★/★★★), and the supporting component count.

### Storage estimate

A representative row JSON-encodes to ~500 bytes when 3 supporting
components are present (denormalised), bumping to ~750 bytes at the 6-
component HIGH-conviction tail. Endpoint cadence on a busy alt-data
layer is ~3-5 composites per refresh × the typical 30-min refresh
cadence — call it 200 rows/day worst case. That's ~100-150 KB/day, so
**30 days ≈ 4 MB and 90 days ≈ 13 MB**. The 10 MB rotation threshold
therefore rolls once every ~2 months on a high-fan-out workload; on a
quiet weekend cadence the file might live a quarter or more before
rolling.

### Test status after Phase F4.1

`tests/unit/test_composite_signal_history.py` covers (10 tests):

- `test_append_then_recent_roundtrip` — every field survives the JSONL
  serialisation including `supporting_components` and
  `aggregate_strength`.
- `test_recent_days_window_filters_old_entries` — backdated rows out
  of window are dropped; widening the window via a fresh archive
  instance surfaces them.
- `test_recent_industry_filter_exact_match` — `target`-based filter.
- `test_recent_min_conviction_filter` — `high > medium > low` rank
  filter works including None / empty disabling it.
- `test_rotation_when_file_exceeds_threshold` — `rotate_size_bytes=512`
  produces a `*.archive` rolled file once enough rows accumulate.
- `test_recent_skips_malformed_lines` — corrupt JSON line is logged +
  skipped at WARNING.
- `test_in_memory_cap_falls_back_to_disk` — `memory_cap=3` against an
  8-row disk file correctly merges.
- `test_append_many_skips_empty` — empty input is a no-op (no file
  created, no log inflation).
- `test_endpoint_shape_and_days_clamp` — endpoint surface + days clamp
  (422 on `days=0` and `days>90`).
- `test_composite_signals_endpoint_appends_to_archive` — calling
  `GET /alt-data/composite-signals` hooks into the archive.

Focused verification for this slice:

- `pytest tests/unit/test_composite_signal_history.py` — 10 passed
- `python3 scripts/check_openapi_diff.py --update` adds only the new
  `/alt-data/composite-signals/history` path; no breaking change.

## 19. Phase F5 actions (2026-05-17) — Macro daily briefing composer

Phase F5 introduces the **next narrative layer above** the per-component
`/alt-data/narrative` endpoint. While Phase E2's narrative only consumes
`policy_radar` + `macro_hf` (+ optional `fund_holdings` mention) to keep
its copy tight, Phase F5's macro briefing composer consumes **every
alt-data provider plus the composite signal detector** and produces a
single 1-page research-grade brief answering five questions:

1. 政策面: 最近 N 天政策方向偏向哪些行业?
2. 资金面: 公募 + 北向 + 大宗交易，资金流共振指向哪些 sector?
3. 商品面: SHFE+LME 库存信号，哪些金属正在累库 / 去化?
4. 公司治理面: people_layer 高警惕 ticker 有哪些?
5. 综合: 哪 2-3 个跨组件高置信度信号值得本周关注?

### What was added

- `src/data/alternative/macro_briefing.py` — `MacroBriefing` frozen
  dataclass (`generated_at`, `time_window_days`, `policy_section`,
  `capital_flow_section`, `commodity_section`, `governance_section`,
  `composite_section`, `summary_paragraph`, `evidence_links`) + the
  `compose_macro_briefing(manager, *, time_window_days=7)` entry point.
  Synthesis is strictly deterministic (no LLM, no network I/O); the
  same input snapshot always produces the same content fields, so the
  endpoint's 5-minute cache is safe.

  Per-section composers each return `(bullets, contributors, theme)`:

  - **policy_section**: ranks `policy_radar.industry_signals` by
    `|avg_impact|`, drops rows below `POLICY_INDUSTRY_IMPACT_FLOOR = 0.15`,
    surfaces the top 3 with direction labels (`偏多 / 偏空 / 中性`).
    Adds a `policy_execution` bullet when `chaotic_department_count > 0`
    or `reversal_count > 0`.
  - **capital_flow_section**: 3-source weave — `fund_holdings` crowded
    tickers (`holding_fund_count ≥ 15`), `northbound` top inflow /
    outflow industries (`|netbuy_cny_billion| ≥ 2 亿`), and
    `block_trades` top承接 / 减持 industries.
  - **commodity_section**: deduplicates `macro_hf._history` by
    `(region, metal)`, emits one bullet per `SHFE` / `LME` region plus
    an optional cross-region agreement bullet when both regions call
    the same metal destocking / restocking.
  - **governance_section**: lists `people_layer.fragile_companies` with
    `people_fragility_score ≥ 0.25`, sorted by score desc. Adds an
    "all-fragile aggregate" sentence when `fragile_company_count > 0`.
  - **composite_section**: runs `detect_composite_signals(manager,
    include_low=False)` and surfaces the top 3 (the detector itself
    already sorts by `conviction → aggregate_strength → target`).

- `summary_paragraph` rule: weave up to three section themes into a
  3-sentence `今日 alt-data 核心观察:` paragraph, prioritising
  `composite > policy > commodity > capital > governance` because the
  composite layer is the most informative cross-cutting takeaway. Falls
  back to the literal `EMPTY_BRIEFING_SUMMARY` only when every section
  returns empty.

- `GET /alt-data/macro-briefing?time_window_days=7` — returns the
  `MacroBriefing` to-dict payload + `audit_doc_url`. Carries
  `Cache-Control: max-age=300`. `time_window_days` is clamped to
  `[1, 30]`.

- `scripts/export_public_summary.py::_build_macro_briefing` —
  duck-typed stub-manager pattern (mirrors the existing
  `_build_composite_signals` helper) so the export path stays runnable
  without booting the heavy provider chain. Injects a
  `macro_briefing` block into `data/public/alt_data_summary.json`
  carrying only `summary_paragraph` + `top_3_themes` (one per
  non-empty section) + `time_window_days` + `generated_at`. Evidence
  links / per-bullet snapshot paths stay private.

- `frontend/src/components/GodEyeDashboard/MacroBriefingTile.jsx` —
  mounted after `CompositeSignalTile` and before `AltDataHealthTile`
  in the "另类数据与物理世界" section. `data-testid="alt-data-macro-briefing-tile"`.
  Renders the 5-section briefing with per-section
  `[stale]` evidence chips and a refresh button. The frontend API
  helper `getAltDataMacroBriefing` lives in
  `frontend/src/services/api/altDataAndMacro.js`.

### Sample output (current real cache)

```
今日 alt-data 核心观察: 政策面: 新能源汽车 avg_impact=-0.39 (偏空)。
商品面: LME 库存: 铜/铝 持稳。 治理面: BABA 脆弱度 0.33。
```

`policy_section`: `["政策雷达 新能源汽车 avg_impact=-0.39 (偏空,
mentions=94)。", "政策执行: 2 个部门标记 chaotic、累计 4 次反转。"]`;
`capital_flow_section`: `[]` (fund_holdings / northbound /
block_trades caches not yet on disk in dev); `commodity_section`:
`["LME 库存: 铜/铝 持稳。"]`; `governance_section`: `["高警惕公司:
BABA(脆弱度0.33, high)。", "治理面板: 共 1 家脆弱、平均脆弱度
0.20。"]`; `composite_section`: `[]`.

### Tests

`tests/unit/test_macro_briefing.py` — 9 pytest cases:

- `test_compose_returns_all_sections_when_all_providers_present` —
  full-coverage path emits all 5 sections + non-empty summary +
  evidence rows for every contributor.
- `test_compose_handles_empty_manager_gracefully` — bare `_StubManager`
  returns `EMPTY_BRIEFING_SUMMARY` + empty sections + zero links.
- `test_compose_handles_partial_providers_gracefully` — only policy +
  people seeded → three sections are empty, two populated.
- `test_time_window_days_is_threaded_through_and_clamped` —
  `time_window_days=14` survives onto the DTO; `<= 0` falls back to
  `DEFAULT_TIME_WINDOW_DAYS`.
- `test_compose_is_deterministic_same_inputs_same_output` — content
  fields identical across two invocations (only `generated_at`
  differs).
- `test_public_summary_distillation_surfaces_themes_only` —
  `macro_briefing_to_public_summary` keeps only `summary_paragraph` +
  `top_3_themes` + `time_window_days` + `generated_at`; no evidence
  links leak.
- `test_endpoint_returns_payload_with_cache_header` —
  `GET /alt-data/macro-briefing` → 200 with `Cache-Control: max-age=300`
  and the documented payload shape.
- `test_endpoint_validates_time_window_days` — 422 when out of
  `[1, 30]` range.
- `test_compose_returns_none_safe_for_none_manager` —
  `compose_macro_briefing(None)` returns the empty DTO without raising.

Focused verification for this slice:

- `pytest tests/unit/test_macro_briefing.py` — 9 passed
- `python3 scripts/check_openapi_diff.py --update` adds only the new
  `/alt-data/macro-briefing` path; no breaking change.

## 20. Phase F5.1 actions (2026-05-17) — Macro briefing day-over-day delta

Phase F5.1 adds a thin "diff and highlight" layer on top of the Phase F5
macro briefing composer. The motivation is that an analyst opening
`/alt-data/macro-briefing` sees today's snapshot but not whether
anything has *changed* — `-0.20 → -0.39` (a 95% deterioration in policy
avg_impact) is much more actionable than today's `-0.39` in isolation.

### What was added

- `src/data/alternative/macro_briefing_delta.py` —
  `MacroBriefingDelta` + `SectionDelta` frozen dataclasses,
  `compute_macro_briefing_delta(manager, *, today_briefing,
  yesterday_briefing) → MacroBriefingDelta` entry point, and
  `macro_briefing_delta_to_public_summary` distillation. The module
  reads the two :class:`MacroBriefing` DTOs (today + yesterday),
  parses each section's bullet copy back into structured rows, and
  emits one :class:`SectionDelta` per row whose direction lands in
  one of `intensified_bullish` / `intensified_bearish` /
  `softened_bullish` / `softened_bearish` / `reversed_to_bullish` /
  `reversed_to_bearish` / `new_today` / `dropped_today` / `stable`.

  Per-section diff rules:
  - **policy_deltas**: parse `政策雷达 <industry> avg_impact=<float>` rows,
    diff today vs yesterday `avg_impact`; rows below
    `POLICY_DELTA_THRESHOLD=0.05` are dropped as noise.
  - **capital_flow_deltas**: parse `北向资金净流入/净流出 <industry>(<+/-X.Y>亿)`
    blocks, diff industry netflow; rows below
    `CAPITAL_FLOW_DELTA_THRESHOLD=1.0` (亿) are dropped.
  - **commodity_deltas**: parse `<region> 库存: <metals> <label>` rows
    keyed by `region:metal`, categorical diff on `去化 / 累积 / 持稳`.
    No threshold filter — every label change matters at daily cadence.
  - **governance_deltas**: parse `<ticker>(脆弱度<score>, ...)` blocks,
    diff fragility; rows below `GOVERNANCE_DELTA_THRESHOLD=0.05` are
    dropped.
  - **composite_deltas**: parse `<target> 看多/看空 (<CONVICTION>, ...)`,
    diff conviction tier (low/medium/high). Emits upgrade /
    downgrade / new / dropped.

- `summary_delta`: weave the top per-section change into a
  3-sentence `今日 vs 昨日 核心变化:` paragraph following the same
  priority order as the F5 today briefing
  (composite > policy > commodity > capital > governance) so the
  frontend sees a consistent narrative shape across the two tabs.
  Falls back to `NO_CHANGE_NOTE` when every list is empty and to
  `EMPTY_DELTA_NOTE` when `yesterday_briefing is None`.

- `GET /alt-data/macro-briefing-delta?date=YYYY-MM-DD` — returns the
  `MacroBriefingDelta` to_dict payload + `audit_doc_url`, with
  `Cache-Control: max-age=300`. `date` is optional (defaults to today),
  ISO-8601-validated, and reserved for the planned archive-driven
  reconstruction path. The current endpoint sources `today_briefing`
  via :func:`compose_macro_briefing` and returns
  `has_baseline=False` until a snapshot archive lands.

- `scripts/export_public_summary.py::_build_macro_briefing_delta` —
  same duck-typed stub-manager pattern as the F5 macro briefing
  helper; emits the canonical `has_baseline=False` cold-start payload
  so the public schema stays forward-compatible.

- `frontend/src/components/GodEyeDashboard/MacroBriefingTile.jsx` —
  refactored to host two tabs: 今日 (existing F5 surface) and
  vs 昨日 (new delta surface). The delta pane lazy-loads on first
  click via the new `getAltDataMacroBriefingDelta` helper in
  `frontend/src/services/api/altDataAndMacro.js`. Each delta row
  renders an arrow icon + direction tag + headline ("新能源汽车:
  -0.20 → -0.39 (恶化 95%)").

### Sample delta output (synthetic 2-day comparison)

Today: 新能源汽车 avg_impact=-0.39, AI算力 avg_impact=+0.22, 锂电
avg_impact=+0.30 (new), 光伏 avg_impact=+0.18.
Yesterday: 新能源汽车 -0.20, AI算力 +0.40, 光伏 -0.18.

```
今日 vs 昨日 核心变化: 政策面变化: 新能源汽车: -0.20 → -0.39 (恶化 95%)。
商品面变化: SHFE:铜: 去化 → 累积。 治理面变化: BABA: 脆弱度 0.30 → 0.42 (恶化 Δ+0.12)。
```

The `policy_deltas` list (ordered by `|Δ|` desc) carries:
- 锂电 → `new_today` (avg_impact=+0.30)
- 新能源汽车 → `intensified_bearish` (Δ=-0.19)
- AI算力 → `softened_bullish` (Δ=-0.18)
- 光伏 → `reversed_to_bullish` (sign flip).

### "Actionable threshold" tuning

The per-section thresholds are tuned at roughly half of the today
composer's emission floor so that any move which materially reshapes
a previously-emitted bullet surfaces in the delta view:

| Section       | Composer floor               | Delta threshold              | Why                              |
|---------------|------------------------------|------------------------------|----------------------------------|
| policy        | `POLICY_INDUSTRY_IMPACT_FLOOR = 0.15` | `POLICY_DELTA_THRESHOLD = 0.05` | half of emission floor; lets noisy ±0.03 jitter wash out |
| capital_flow  | `NORTHBOUND_INDUSTRY_FLOW_FLOOR = 2.0 亿` | `CAPITAL_FLOW_DELTA_THRESHOLD = 1.0 亿` | matches intraday noise floor    |
| governance    | `PEOPLE_FRAGILITY_FLOOR = 0.25`       | `GOVERNANCE_DELTA_THRESHOLD = 0.05` | small enough to catch 0.30 → 0.35 transitions |
| commodity     | categorical (`去化 / 累积 / 持稳`) | no threshold                 | any label change is meaningful   |
| composite     | tier (`high / medium / low`)        | no threshold                 | any tier change is meaningful    |

`MAX_DELTAS_PER_SECTION = 5` caps the surface area so the rendered tile
stays scannable even if today's brief reshapes 20 industries at once.

### Tests

`tests/unit/test_macro_briefing_delta.py` — 16 pytest cases:

- `test_returns_cold_start_when_yesterday_missing` — `has_baseline=False`
  + `EMPTY_DELTA_NOTE` summary when no yesterday baseline.
- `test_intensification_detected_on_policy_section` — `-0.20 → -0.39`
  surfaces as `intensified_bearish`.
- `test_reversal_detected_on_policy_section` — `-0.18 → +0.18` surfaces
  as `reversed_to_bullish`.
- `test_new_and_dropped_today_surfaced_on_policy_section` — 锂电
  classifies as `new_today` with `yesterday=None`.
- `test_threshold_filtering_drops_small_deltas` — `Δ=+0.01` row dropped.
- `test_governance_delta_intensifies_when_fragility_rises` — BABA
  0.30 → 0.42 fires with `恶化` phrasing.
- `test_commodity_delta_categorical_reversal` — `SHFE:铜 去化 → 累积`
  surfaces.
- `test_composite_delta_new_today` — new composite signal target
  classifies as `new_today` with `新触发` headline.
- `test_summary_delta_starts_with_today_vs_yesterday_label` —
  paragraph framing.
- `test_compose_is_deterministic_same_inputs_same_output` — content
  fields identical across two invocations.
- `test_both_empty_briefings_yields_no_change_note` —
  `has_baseline=True` but no movement → `NO_CHANGE_NOTE` summary.
- `test_public_summary_distillation_keeps_only_safe_fields` —
  `macro_briefing_delta_to_public_summary` keeps only 6 documented keys.
- `test_endpoint_returns_delta_payload_with_cache_header` — endpoint
  returns documented payload + `Cache-Control: max-age=300`.
- `test_endpoint_cold_start_when_yesterday_missing` — missing baseline
  endpoint path returns empty deltas.
- `test_endpoint_validates_date_param` — bad date string → 422.
- `test_section_delta_to_dict_is_serialisable` — JSON-safe primitives only.

Focused verification for this slice:

- `pytest tests/unit/test_macro_briefing_delta.py` — 16 passed.
- `python3 scripts/check_openapi_diff.py --update` adds only the new
  `/alt-data/macro-briefing-delta` path; no breaking change.

## 21. Phase F5.2 actions (2026-05-17) — Macro briefing time-series archive

Phase F5.2 closes the loop on the F5.1 day-over-day delta endpoint by
adding the same time-series archive layer that backs Phase E4
narrative history (commit 2a7bd32) and Phase F4.1 composite signal
history (commit 03240f8) for the Phase F5 macro briefing composer
(commit 4e82548). Before this slice, `_compose_yesterday_briefing` in
`backend/app/api/v1/endpoints/alt_data.py` could only return `None`
because there was no place to read yesterday's briefing back from --
so the `/alt-data/macro-briefing-delta` endpoint always degraded to
`has_baseline=False`. F5.2 wires that helper up to a JSONL archive
that mirrors the E4 + F4.1 patterns 1:1, so the delta endpoint is
fully functional against real historical data the moment the
dashboard polls `/alt-data/macro-briefing` for two consecutive days.

### Persistence layer (extends `src/data/alternative/macro_briefing.py`)

- `MacroBriefingArchive` — manages
  `cache/alt_data/macro_briefing_history.jsonl`. Same JSONL append-only
  log shape as `NarrativeArchive` / `CompositeSignalArchive`.
- `append(briefing: MacroBriefing) → ArchivedMacroBriefing` — atomic
  append via `O_APPEND | O_CREAT` + `fsync` (crash-safe).
- `recent(*, days=14, time_window_days=None) → list[ArchivedMacroBriefing]`
  — newest-first reader with the merged memory + disk view.
- `find_for_date(*, target_date)` — F5.1's yesterday-reconstruction
  helper. Anchors the lookup to a UTC calendar-day match so the
  delta endpoint always picks up the most-recent row from yesterday's
  UTC date.
- `ArchivedMacroBriefing` frozen dataclass — preserves all 5 section
  lists + `summary_paragraph` + `evidence_links` (+ a denormalised
  `evidence_links_count` field for the frontend timeline view) +
  `original_generated_at` (so the materialised yesterday briefing
  carries the composer stamp, not the archive stamp).
- `ArchivedMacroBriefing.to_macro_briefing()` — round-trips the
  archived row back into a live `MacroBriefing` DTO. Used by the F5.1
  endpoint's reconstruction path.
- Rotation: 10 MB threshold → `macro_briefing_history.jsonl.<UTC-iso>.archive`.
- In-memory cap: 100 entries (vs narrative's 200; per-row payload
  carries 5 denormalised section lists so the cap is a little tighter
  to keep RAM usage predictable in long-running processes).
- Module singleton: `get_macro_briefing_archive()` +
  `reset_macro_briefing_archive_for_tests`.
- Empty briefings (all 5 sections empty, the cold-start
  `EMPTY_BRIEFING_SUMMARY` response) are **not** persisted — a
  timeline of "no signal" rows is uninformative and just inflates the
  log. The append still returns a fully-materialised entry so the
  endpoint response shape is uniform, but disk + memory remain
  untouched. Mirrors the E4 narrative archive's "skip empty bullets"
  policy.

### Hook into composition flow

- `GET /alt-data/macro-briefing` now calls `archive.append(briefing)`
  after composition. Empty-state briefings are skipped at the archive
  level so a quiet dashboard cannot inflate the log with cold-start
  rows. The append is wrapped in a try/except so an archive failure
  cannot break the endpoint response.

### F5.1 delta integration

- `_compose_yesterday_briefing(manager, target_date)` in
  `backend/app/api/v1/endpoints/alt_data.py` now reads from the
  `MacroBriefingArchive` singleton:
  1. Resolve the today-anchor: caller-supplied `date` parameter (ISO
     `YYYY-MM-DD`) or `datetime.now(UTC)` floor-to-day.
  2. Subtract 1 day to get the yesterday anchor.
  3. `archive.find_for_date(target_date=yesterday_anchor)` returns
     the most-recent archived row on that UTC calendar day, or `None`
     when no row matches.
  4. Materialise via `ArchivedMacroBriefing.to_macro_briefing()`.
- Result: `GET /alt-data/macro-briefing-delta` returns
  `has_baseline=True` whenever an archived row exists for yesterday's
  UTC date. The cold-start `has_baseline=False` path is preserved for
  the first-day-of-deployment case where the archive is still empty.

### New history endpoint

- `GET /alt-data/macro-briefing/history?days=14&time_window_days=<n>` →
  `{archives, total, days_window, time_window_days_filter,
  audit_doc_url}`. Sorted newest-first.
- `days` clamped to `[1, 90]` (FastAPI 422 on out-of-range).
- `time_window_days` optional filter — exact-match against the
  composer's stored `time_window_days` field. `None` matches every row.
- OpenAPI baseline refreshed additively; only the new
  `/alt-data/macro-briefing/history` path is added (200 + 422
  response envelopes). No breaking change.

### Frontend

- `MacroBriefingTile.jsx` extended with a `查看本周历史` button +
  right-side `Drawer`. `data-testid="macro-briefing-history-drawer"`.
  Lazy-loaded `Timeline` shows `archived_at`, `time_window_days`,
  `evidence_links_count`, and an ellipsis-clipped
  `summary_paragraph` for each day's briefing.
- `getAltDataMacroBriefingHistory({days, time_window_days})` lives in
  `frontend/src/services/api/altDataAndMacro.js`.

### Sample 3-day archive entries (synthetic)

```
2026-05-15T08:00:00Z  | window 7 | evidence 5
  今日 alt-data 核心观察: 政策面: 新能源汽车 avg_impact=-0.20 (偏空)。
  商品面: SHFE 库存: 铜 去化；铝 去化。 治理面: BABA 脆弱度 0.30。

2026-05-16T08:00:00Z  | window 7 | evidence 5
  今日 alt-data 核心观察: 政策面: 光伏 avg_impact=-0.18 (偏空)。
  商品面: LME 库存: 铜/铝 持稳。 治理面: BABA 脆弱度 0.33。

2026-05-17T08:00:00Z  | window 7 | evidence 5
  今日 alt-data 核心观察: 综合面: 新能源汽车 看空 (MEDIUM, 支撑:
  policy_radar, policy_execution, northbound)。
  政策面: 新能源汽车 avg_impact=-0.39 (偏空)。
  商品面: SHFE 库存: 铜 累积；铝 去化。
```

### Tests

`tests/unit/test_macro_briefing_archive.py` — 12 pytest cases:

- `test_append_then_recent_roundtrip` — full field roundtrip.
- `test_recent_days_window_filters_old_entries` — days clamp + disk
  fallback when memory cap is small.
- `test_recent_time_window_filter` — exact-match filter.
- `test_rotation_when_file_exceeds_threshold` — JSONL roll past
  10 MB threshold.
- `test_recent_skips_malformed_lines` — corrupt JSON logged + skipped.
- `test_empty_briefing_is_not_persisted` — cold-start row stays out
  of the log.
- `test_find_for_date_returns_yesterday_briefing` — most-recent row
  on the target UTC day wins.
- `test_compose_yesterday_briefing_resolves_from_archive` — endpoint
  helper reads from the archive.
- `test_compose_yesterday_briefing_returns_none_when_archive_empty` —
  cold-start fallback preserved.
- `test_macro_briefing_delta_endpoint_has_baseline_true_with_archive` —
  end-to-end: F5.1 delta returns `has_baseline=True` against an
  F5.2-populated archive.
- `test_history_endpoint_shape_and_days_clamp` — endpoint shape + days
  clamp + time_window_days filter.
- `test_history_endpoint_empty_archive_returns_empty_payload` — null
  archive surfaces as total=0 (not an error).

Focused verification for this slice:

- `pytest tests/unit/test_macro_briefing_archive.py` — 12 passed.
- `pytest tests/unit/test_macro_briefing.py tests/unit/test_macro_briefing_delta.py
  tests/unit/test_composite_signal_history.py tests/unit/test_alt_data_narrative_history.py`
  — 50 passed, no regression.
- `python3 scripts/check_openapi_diff.py --update` adds only the new
  `/alt-data/macro-briefing/history` path; no breaking change.

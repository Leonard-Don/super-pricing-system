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

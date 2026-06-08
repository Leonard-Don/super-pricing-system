# 信号可信度层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an honest point-in-time forward-validation layer that measures how well the mispricing signals predict realized returns, surfaced as credibility panels — credibility from rigor, never look-ahead.

**Architecture:** A pure-function backend module (`signal_validation.py`) computes metrics from `(signal_points, close_points)`; a ranking store captures screener output point-in-time; sync-`def` endpoints (threadpool) expose per-stock / macro / cross-sectional credibility reusing existing `valuation_history` + market data + the existing macro factor-backtest; a frontend `features/credibility/` renders panels with sample-size disclosure.

**Tech Stack:** Python (FastAPI, pytest) + React 19 / TS strict / Tailwind v4 / Recharts / Vitest. No new deps (Spearman implemented manually).

**Conventions:** sync `def` for blocking endpoints (lessons from #105/#107); JSON file stores with `threading.RLock` (like `MacroHistoryStore`); frontend reuses command primitives (`MicroBar`/`Sparkline`/`Reveal`/`GlassPanel`/`SectionFrame`/`GlassTooltip`).

---

## File Structure

**Create (backend):**
- `backend/app/services/signal_validation.py` — pure metric functions + orchestrator
- `backend/app/services/screener_ranking_store.py` — point-in-time ranking snapshots (RLock JSON store)
- `backend/app/api/v1/endpoints/credibility.py` — sync-`def` endpoints (or add routes to pricing/macro routers)
- Tests: `tests/unit/test_signal_validation.py`, `tests/unit/test_screener_ranking_store.py`, `tests/unit/test_credibility_endpoints.py`

**Create (frontend):**
- `frontend/src/features/credibility/types.ts`
- `frontend/src/features/credibility/api.ts`
- `frontend/src/features/credibility/components/CredibilityPanel.tsx`
- `frontend/src/features/credibility/components/CalibrationChart.tsx`
- `frontend/src/features/credibility/components/CredibilityBadge.tsx`
- matching `__tests__/*`

**Modify:**
- the screener endpoint (append a ranking snapshot — additive)
- `tests/unit/test_dashboard_endpoint_threadpool_offload.py` (extend guard)
- GodEye / pricing-analysis / valuation-lab / screener route files (mount panels)

**Data contract (used across all tasks):**
- `signal_point = {"ts": "<ISO datetime>", "signal": float, "confidence": float | None}`
- `close_point  = {"date": "YYYY-MM-DD", "close": float}` (ascending by date)
- `row = {"signal": float, "confidence": float | None, "forward_return": float}` (an aligned observation)
- metric result = `{"value": float | None, "sample_size": int, ...}`

---

## Track A — Backend pure functions (`signal_validation.py`)

### Task 1: `find_forward_return` + `build_evaluated_rows`

**Files:**
- Create: `backend/app/services/signal_validation.py`
- Test: `tests/unit/test_signal_validation.py`

- [ ] **Step 1: Write the failing test**

```python
from backend.app.services.signal_validation import find_forward_return, build_evaluated_rows

CLOSES = [
    {"date": "2026-01-01", "close": 100.0},
    {"date": "2026-01-02", "close": 101.0},
    {"date": "2026-01-03", "close": 99.0},
    {"date": "2026-01-04", "close": 110.0},
]

def test_find_forward_return_uses_first_close_on_or_after_anchor():
    # anchor 2026-01-01, horizon 2 -> close[0]=100 -> close[2]=99 -> -1%
    assert round(find_forward_return(CLOSES, "2026-01-01", 2), 4) == round(99.0 / 100.0 - 1.0, 4)

def test_find_forward_return_none_when_horizon_exceeds_series():
    assert find_forward_return(CLOSES, "2026-01-03", 5) is None

def test_build_evaluated_rows_aligns_signal_to_forward_return_no_lookahead():
    signals = [{"ts": "2026-01-01T00:00:00", "signal": 0.05, "confidence": 0.8}]
    rows = build_evaluated_rows(signals, CLOSES, horizon=2)
    assert len(rows) == 1
    assert rows[0]["signal"] == 0.05
    assert round(rows[0]["forward_return"], 4) == round(99.0 / 100.0 - 1.0, 4)

def test_build_evaluated_rows_drops_points_without_forward_window():
    signals = [{"ts": "2026-01-04T00:00:00", "signal": 0.05, "confidence": None}]
    assert build_evaluated_rows(signals, CLOSES, horizon=2) == []
```

- [ ] **Step 2: Run to verify it fails**

Run: `python3 -m pytest tests/unit/test_signal_validation.py -q` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```python
"""Point-in-time forward-validation of mispricing signals. Pure functions only —
no I/O, no globals. A signal at time T is evaluated against the realized return of
the close series from the first trading day on/after T to T+horizon. Never uses any
data dated before T to label T (no look-ahead)."""
from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional


def _to_date(value: Any) -> date:
    return date.fromisoformat(str(value)[:10])


def find_forward_return(close_points: List[Dict[str, Any]], anchor: Any, horizon: int) -> Optional[float]:
    anchor_d = _to_date(anchor)
    start = next((i for i, p in enumerate(close_points) if _to_date(p["date"]) >= anchor_d), None)
    if start is None:
        return None
    end = start + horizon
    if end >= len(close_points):
        return None
    start_close = float(close_points[start]["close"])
    end_close = float(close_points[end]["close"])
    if start_close <= 0:
        return None
    return end_close / start_close - 1.0


def build_evaluated_rows(
    signal_points: List[Dict[str, Any]], close_points: List[Dict[str, Any]], horizon: int
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for sp in signal_points:
        fr = find_forward_return(close_points, sp["ts"], horizon)
        if fr is None:
            continue
        rows.append({"signal": float(sp["signal"]), "confidence": sp.get("confidence"), "forward_return": fr})
    return rows
```

- [ ] **Step 4: Run to verify it passes** — Run the same pytest command → Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/signal_validation.py tests/unit/test_signal_validation.py
git commit -m "feat(api): signal_validation forward-return alignment (no look-ahead)"
```

### Task 2: `compute_hit_rate` + `compute_directional_returns`

**Files:** Modify `signal_validation.py`; Test `tests/unit/test_signal_validation.py`

- [ ] **Step 1: Add failing tests**

```python
from backend.app.services.signal_validation import compute_hit_rate, compute_directional_returns

ROWS = [
    {"signal": 0.05, "confidence": 0.8, "forward_return": 0.02},   # long, hit
    {"signal": 0.03, "confidence": 0.6, "forward_return": -0.01},  # long, miss
    {"signal": -0.04, "confidence": 0.7, "forward_return": -0.02}, # short, hit
    {"signal": 0.0, "confidence": 0.5, "forward_return": 0.05},    # flat, excluded
]

def test_compute_hit_rate_excludes_flat_signals():
    r = compute_hit_rate(ROWS)
    assert r["sample_size"] == 3
    assert round(r["value"], 4) == round(2 / 3, 4)  # 2 of 3 directional hits

def test_compute_directional_returns_long_short():
    r = compute_directional_returns(ROWS)
    assert round(r["long"], 4) == round((0.02 + -0.01) / 2, 4)
    assert round(r["short"], 4) == round(-0.02, 4)
    assert round(r["long_short_edge"], 4) == round(((0.02 - 0.01) / 2) - (-0.02), 4)

def test_compute_hit_rate_empty():
    assert compute_hit_rate([]) == {"value": None, "sample_size": 0}
```

- [ ] **Step 2: Run → fail** (`-k "hit_rate or directional"`).

- [ ] **Step 3: Implement** (append to `signal_validation.py`)

```python
def _directional(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [r for r in rows if r["signal"] != 0]


def compute_hit_rate(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    ev = _directional(rows)
    if not ev:
        return {"value": None, "sample_size": 0}
    hits = sum(1 for r in ev if (1 if r["signal"] > 0 else -1) * r["forward_return"] > 0)
    return {"value": hits / len(ev), "sample_size": len(ev)}


def compute_directional_returns(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    ev = _directional(rows)
    longs = [r["forward_return"] for r in ev if r["signal"] > 0]
    shorts = [r["forward_return"] for r in ev if r["signal"] < 0]
    long_avg = sum(longs) / len(longs) if longs else None
    short_avg = sum(shorts) / len(shorts) if shorts else None
    edge = (long_avg - short_avg) if (long_avg is not None and short_avg is not None) else None
    return {"long": long_avg, "short": short_avg, "long_short_edge": edge, "sample_size": len(ev)}
```

- [ ] **Step 4: Run → pass.**

- [ ] **Step 5: Commit** — `git commit -m "feat(api): hit-rate + directional returns metrics"`

### Task 3: `compute_ic` (Spearman, manual)

**Files:** Modify `signal_validation.py`; Test same.

- [ ] **Step 1: Add failing tests**

```python
from backend.app.services.signal_validation import compute_ic

def test_compute_ic_perfect_monotonic_is_one():
    rows = [{"signal": s, "confidence": None, "forward_return": s} for s in (-0.02, -0.01, 0.01, 0.03)]
    assert round(compute_ic(rows)["value"], 6) == 1.0

def test_compute_ic_inverse_is_minus_one():
    rows = [{"signal": s, "confidence": None, "forward_return": -s} for s in (-0.02, -0.01, 0.01, 0.03)]
    assert round(compute_ic(rows)["value"], 6) == -1.0

def test_compute_ic_too_few_points():
    assert compute_ic([{"signal": 0.1, "confidence": None, "forward_return": 0.1}])["value"] is None
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement**

```python
def _rank(values: List[float]) -> List[float]:
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        avg = (i + j) / 2.0 + 1.0  # average rank (1-based) for ties
        for k in range(i, j + 1):
            ranks[order[k]] = avg
        i = j + 1
    return ranks


def compute_ic(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    if len(rows) < 2:
        return {"value": None, "sample_size": len(rows)}
    rs = _rank([r["signal"] for r in rows])
    rf = _rank([r["forward_return"] for r in rows])
    n = len(rs)
    mean_s = sum(rs) / n
    mean_f = sum(rf) / n
    cov = sum((rs[i] - mean_s) * (rf[i] - mean_f) for i in range(n))
    var_s = sum((x - mean_s) ** 2 for x in rs)
    var_f = sum((x - mean_f) ** 2 for x in rf)
    if var_s <= 0 or var_f <= 0:
        return {"value": None, "sample_size": n}
    return {"value": cov / (var_s ** 0.5 * var_f ** 0.5), "sample_size": n}
```

- [ ] **Step 4: Run → pass.**  - [ ] **Step 5: Commit** — `git commit -m "feat(api): Spearman IC metric (manual, no scipy)"`

### Task 4: `compute_calibration`

**Files:** Modify `signal_validation.py`; Test same.

- [ ] **Step 1: Add failing test**

```python
from backend.app.services.signal_validation import compute_calibration

def test_compute_calibration_buckets_confidence_vs_hit_rate():
    rows = [
        {"signal": 0.05, "confidence": 0.9, "forward_return": 0.02},   # high conf, hit
        {"signal": 0.05, "confidence": 0.9, "forward_return": 0.01},   # high conf, hit
        {"signal": 0.05, "confidence": 0.2, "forward_return": -0.01},  # low conf, miss
        {"signal": -0.05, "confidence": 0.2, "forward_return": 0.01},  # low conf, miss
    ]
    out = compute_calibration(rows, buckets=2)
    hi = [b for b in out["buckets"] if b["sample_size"] and b["predicted"] >= 0.5][0]
    lo = [b for b in out["buckets"] if b["sample_size"] and b["predicted"] < 0.5][0]
    assert hi["realized_hit_rate"] == 1.0
    assert lo["realized_hit_rate"] == 0.0

def test_compute_calibration_skips_rows_without_confidence():
    rows = [{"signal": 0.05, "confidence": None, "forward_return": 0.02}]
    assert compute_calibration(rows, buckets=2)["sample_size"] == 0
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement**

```python
def compute_calibration(rows: List[Dict[str, Any]], buckets: int = 5) -> Dict[str, Any]:
    conf_rows = [r for r in rows if r.get("confidence") is not None and r["signal"] != 0]
    out_buckets = []
    for b in range(buckets):
        lo, hi = b / buckets, (b + 1) / buckets
        in_b = [r for r in conf_rows if (lo <= float(r["confidence"]) < hi) or (b == buckets - 1 and float(r["confidence"]) == 1.0)]
        if not in_b:
            out_buckets.append({"confidence_mid": (lo + hi) / 2, "predicted": (lo + hi) / 2, "realized_hit_rate": None, "sample_size": 0})
            continue
        hits = sum(1 for r in in_b if (1 if r["signal"] > 0 else -1) * r["forward_return"] > 0)
        out_buckets.append({
            "confidence_mid": (lo + hi) / 2,
            "predicted": sum(float(r["confidence"]) for r in in_b) / len(in_b),
            "realized_hit_rate": hits / len(in_b),
            "sample_size": len(in_b),
        })
    return {"buckets": out_buckets, "sample_size": len(conf_rows)}
```

- [ ] **Step 4: Run → pass.**  - [ ] **Step 5: Commit** — `git commit -m "feat(api): calibration metric (confidence vs realized hit-rate)"`

### Task 5: `compute_quantile_spread` (cross-sectional)

**Files:** Modify `signal_validation.py`; Test same.

- [ ] **Step 1: Add failing test**

```python
from backend.app.services.signal_validation import compute_quantile_spread

def test_compute_quantile_spread_top_minus_bottom():
    # signal correlates with return: top decile avg return > bottom decile
    rows = [{"signal": i / 10.0, "confidence": None, "forward_return": i / 100.0} for i in range(10)]
    out = compute_quantile_spread(rows, quantiles=2)
    assert out["sample_size"] == 10
    assert out["value"] > 0  # top half outperforms bottom half

def test_compute_quantile_spread_insufficient():
    assert compute_quantile_spread([{"signal": 1, "confidence": None, "forward_return": 1}], quantiles=10)["value"] is None
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement**

```python
def compute_quantile_spread(rows: List[Dict[str, Any]], quantiles: int = 10) -> Dict[str, Any]:
    if len(rows) < quantiles * 2:
        return {"value": None, "sample_size": len(rows)}
    ordered = sorted(rows, key=lambda r: r["signal"])
    size = len(ordered) // quantiles
    bottom = ordered[:size]
    top = ordered[-size:]
    top_avg = sum(r["forward_return"] for r in top) / len(top)
    bot_avg = sum(r["forward_return"] for r in bottom) / len(bottom)
    return {"value": top_avg - bot_avg, "top": top_avg, "bottom": bot_avg, "sample_size": len(ordered)}
```

- [ ] **Step 4: Run → pass.**  - [ ] **Step 5: Commit** — `git commit -m "feat(api): quantile-spread metric (cross-sectional)"`

### Task 6: `validate_signal_series` orchestrator + sample gating + look-ahead guard

**Files:** Modify `signal_validation.py`; Test same.

- [ ] **Step 1: Add failing tests**

```python
from backend.app.services.signal_validation import validate_signal_series

def _series(n):
    closes = [{"date": f"2026-{1 + i // 28:02d}-{1 + i % 28:02d}", "close": 100.0 + i} for i in range(n + 70)]
    signals = [{"ts": f"2026-{1 + i // 28:02d}-{1 + i % 28:02d}T00:00:00", "signal": 0.01 * (i % 5 - 2), "confidence": 0.6}
               for i in range(n)]
    return signals, closes

def test_validate_signal_series_reports_status_ok_when_enough_samples():
    signals, closes = _series(40)
    out = validate_signal_series(signals, closes, horizons=[5], min_sample=20)
    h = out["horizons"][0]
    assert h["horizon"] == 5
    assert h["status"] == "ok"
    assert h["sample_size"] >= 20
    assert "since_date" in out

def test_validate_signal_series_insufficient_data_status():
    signals, closes = _series(5)
    out = validate_signal_series(signals, closes, horizons=[5], min_sample=20)
    assert out["horizons"][0]["status"] == "insufficient_data"

def test_validate_signal_series_no_lookahead_signal_after_prices():
    # signal dated AFTER the price series end -> no forward window -> 0 samples
    closes = [{"date": "2026-01-01", "close": 100.0}, {"date": "2026-01-02", "close": 101.0}]
    signals = [{"ts": "2026-06-01T00:00:00", "signal": 0.05, "confidence": 0.9}]
    out = validate_signal_series(signals, closes, horizons=[1], min_sample=1)
    assert out["horizons"][0]["sample_size"] == 0
    assert out["horizons"][0]["status"] == "insufficient_data"
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement**

```python
def validate_signal_series(
    signal_points: List[Dict[str, Any]],
    close_points: List[Dict[str, Any]],
    horizons: List[int],
    min_sample: int = 20,
) -> Dict[str, Any]:
    closes = sorted(close_points, key=lambda p: _to_date(p["date"]))
    since = min((str(s["ts"])[:10] for s in signal_points), default=None)
    results = []
    for h in horizons:
        rows = build_evaluated_rows(signal_points, closes, h)
        n = len(_directional(rows))
        status = "ok" if n >= min_sample else "insufficient_data"
        results.append({
            "horizon": h,
            "status": status,
            "sample_size": n,
            "hit_rate": compute_hit_rate(rows),
            "ic": compute_ic(rows),
            "directional": compute_directional_returns(rows),
            "calibration": compute_calibration(rows),
        })
    return {"since_date": since, "min_sample": min_sample, "horizons": results}
```

- [ ] **Step 4: Run → pass (full file: `python3 -m pytest tests/unit/test_signal_validation.py -q`).**

- [ ] **Step 5: Commit** — `git commit -m "feat(api): validate_signal_series orchestrator + sample gating"`

---

## Track B — Backend store + endpoints

### Task 7: `screener_ranking_store.py`

**Files:** Create `backend/app/services/screener_ranking_store.py`; Test `tests/unit/test_screener_ranking_store.py`

- [ ] **Step 1: Failing test**

```python
import threading
from backend.app.services.screener_ranking_store import ScreenerRankingStore

def test_append_and_list(tmp_path):
    s = ScreenerRankingStore(storage_path=tmp_path / "rankings.json")
    s.append_ranking({"snapshot_timestamp": "2026-06-08T00:00:00", "rankings": [{"symbol": "AAPL", "score": 0.5}]})
    rows = s.list_rankings(limit=10)
    assert len(rows) == 1 and rows[0]["rankings"][0]["symbol"] == "AAPL"

def test_concurrent_appends_do_not_corrupt(tmp_path):
    s = ScreenerRankingStore(storage_path=tmp_path / "r.json")
    def worker(i):
        s.append_ranking({"snapshot_timestamp": f"2026-06-08T00:00:{i:02d}", "rankings": []})
    ts = [threading.Thread(target=worker, args=(i,)) for i in range(20)]
    [t.start() for t in ts]; [t.join() for t in ts]
    assert len(s.list_rankings(limit=100)) == 20
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** (mirror `src/analytics/macro_factors/history.py` RLock + JSON pattern)

```python
"""Point-in-time screener ranking snapshots (JSON, RLock-guarded)."""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any, Dict, List


class ScreenerRankingStore:
    def __init__(self, storage_path: str | Path, max_records: int = 500):
        self._path = Path(storage_path)
        self._max = max_records
        self._lock = threading.RLock()
        self._path.parent.mkdir(parents=True, exist_ok=True)

    def _load(self) -> List[Dict[str, Any]]:
        if not self._path.exists():
            return []
        try:
            return json.loads(self._path.read_text() or "[]")
        except (json.JSONDecodeError, OSError):
            return []

    def append_ranking(self, snapshot: Dict[str, Any]) -> None:
        with self._lock:
            data = self._load()
            data.append(snapshot)
            data = data[-self._max:]
            self._path.write_text(json.dumps(data))

    def list_rankings(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._lock:
            return self._load()[-limit:]
```

- [ ] **Step 4: Run → pass.**  - [ ] **Step 5: Commit** — `git commit -m "feat(api): screener ranking store (point-in-time, RLock)"`

### Task 8: per-stock + macro + screener credibility endpoints (sync def)

**Files:** Create `backend/app/api/v1/endpoints/credibility.py`; register router in `backend/app/api/v1/api.py`; Test `tests/unit/test_credibility_endpoints.py`

- [ ] **Step 1: Failing test** (TestClient smoke + shape + sync-def)

```python
import inspect
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.api.v1.endpoints import credibility

client = TestClient(app)

def test_pricing_signal_credibility_returns_shape():
    r = client.get("/api/v1/credibility/pricing?symbol=AAPL&horizons=5,20")
    assert r.status_code == 200
    body = r.json()
    assert "horizons" in body and "since_date" in body

def test_screener_credibility_accumulating_when_empty():
    r = client.get("/api/v1/credibility/screener")
    assert r.status_code == 200

def test_credibility_endpoints_are_sync_def():
    assert not inspect.iscoroutinefunction(credibility.get_pricing_credibility)
    assert not inspect.iscoroutinefunction(credibility.get_macro_credibility)
    assert not inspect.iscoroutinefunction(credibility.get_screener_credibility)
```

(Adjust the URL prefix to match how `api.py` mounts routers — check an existing endpoint test for the exact prefix.)

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** `credibility.py` — sync `def` handlers:
  - `get_pricing_credibility(symbol, horizons="5,20,60")`: read `valuation_history/{symbol}.json` (via the QuantLab valuation service's storage root), map each entry to `signal_point = {"ts": entry["timestamp"], "signal": entry["gap_pct"], "confidence": _conf_from_ci(entry)}`; pull `close_points` via the market data manager (`get_historical_data(symbol, period="2y", interval="1d")` → `[{"date","close"}]`); return `validate_signal_series(...)`. On missing history → `{"since_date": None, "horizons": [], "status": "insufficient_data"}`.
  - `get_macro_credibility()`: call the existing macro factor-backtest logic (reuse `get_macro_factor_backtest`'s computation or its cached payload) and re-shape into the same envelope. Do NOT duplicate its math.
  - `get_screener_credibility()`: read `ScreenerRankingStore`; if `< min_sample` snapshots → `{"status": "accumulating", "sample_size": n}`; else compute `compute_quantile_spread` over the latest aligned snapshot.
  - All three: plain `def` (threadpool). Wrap body in try/except → safe error envelope.
  - Register: `from .endpoints import credibility` + `api_router.include_router(credibility.router, prefix="/credibility", tags=["credibility"])` in `api.py` (match existing include pattern).

- [ ] **Step 4: Run → pass.**  - [ ] **Step 5: Commit** — `git commit -m "feat(api): credibility endpoints (per-stock/macro/screener, sync def)"`

### Task 9: screener ranking capture hook + threadpool guard

**Files:** Modify the screener endpoint (the `批量筛选` handler — find via `grep -rn "screen" backend/app/api/v1/endpoints/pricing*.py`); Modify `tests/unit/test_dashboard_endpoint_threadpool_offload.py`

- [ ] **Step 1: Add guard test** for the 3 credibility handlers (append to the existing offload guard test, asserting `not inspect.iscoroutinefunction` for each).

- [ ] **Step 2: Run → (passes once handlers are def; this locks it).**

- [ ] **Step 3: Implement the capture hook** — in the screener handler, after computing the ranked results, additively persist a snapshot:

```python
_get_screener_ranking_store().append_ranking({
    "snapshot_timestamp": _utcnow_iso(),
    "rankings": [{"symbol": row["symbol"], "score": row.get("opportunity_score")} for row in ranked_rows],
})
```

Wrap in try/except (capture must never break the screener response). Do not change the response body.

- [ ] **Step 4: Run** the screener endpoint test + guard test → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(api): capture screener rankings point-in-time + guard credibility endpoints"`

---

## Track C — Frontend credibility panels

### Task 10: types + api client + `CredibilityBadge`

**Files:** Create `frontend/src/features/credibility/{types.ts,api.ts}` + `components/CredibilityBadge.tsx`; Test `__tests__/CredibilityBadge.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { CredibilityBadge } from '@/features/credibility/components/CredibilityBadge';

it('shows accumulating state with sample size', () => {
  render(<CredibilityBadge status="insufficient_data" sampleSize={12} sinceDate="2026-04-01" />);
  expect(screen.getByText(/累积中/)).toBeTruthy();
  expect(screen.getByText(/12/)).toBeTruthy();
});
it('shows hit rate when ok', () => {
  render(<CredibilityBadge status="ok" sampleSize={40} sinceDate="2026-01-01" hitRate={0.62} />);
  expect(screen.getByText(/62/)).toBeTruthy();
});
```

- [ ] **Step 2: Run → fail** (`cd frontend && npx vitest run src/features/credibility`).

- [ ] **Step 3: Implement** `types.ts` (mirror the backend envelope: `HorizonResult`, `CredibilityResponse`), `api.ts` (`fetchPricingCredibility(symbol)`, `fetchMacroCredibility()`, `fetchScreenerCredibility()` via the existing axios `api` core), and `CredibilityBadge` (one-line verdict + sample-size disclosure; `累积中 · 样本 N · 自 DATE` when not ok; uses `DataNumber`).

- [ ] **Step 4: Run → pass.**  - [ ] **Step 5: Commit** — `git commit -m "feat(web): credibility types + api + badge"`

### Task 11: `CredibilityPanel` + `CalibrationChart`

**Files:** Create `components/CredibilityPanel.tsx`, `components/CalibrationChart.tsx` + tests

- [ ] **Step 1: Failing tests** — `CredibilityPanel` renders hit-rate/IC/directional per horizon with `MicroBar`s + sample disclosure; renders the accumulating state when status≠ok. `CalibrationChart` renders a Recharts line of predicted vs realized with `GlassTooltip` (assert it renders given a buckets array; insufficient → renders an empty-state note).

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** both, reusing `GlassPanel`/`SectionFrame`/`MicroBar`/`Reveal`/`GlassTooltip`; honest empty/accumulating states.

- [ ] **Step 4: Run → pass.**  - [ ] **Step 5: Commit** — `git commit -m "feat(web): CredibilityPanel + CalibrationChart"`

### Task 12: Mount panels (GodEye macro / pricing analysis / valuation lab / screener)

**Files:** Modify `routes/godeye/GodeyePage.tsx` (macro credibility), `features/pricing/components/` analysis + `routes/pricing/ValuationLabPage.tsx` (per-stock), screener results area (accumulating)

- [ ] **Step 1:** Mount `CredibilityPanel`/`CredibilityBadge`, fetching via the api client on the relevant symbol/route. Wrap in `<Reveal>`. Loading → `<Skeleton />`; error/empty → honest empty state (panel must never break the host page).

- [ ] **Step 2: Keep tests green** — `cd frontend && npx vitest run src/routes src/features` → PASS (preserve asserted text; panels are additive).

- [ ] **Step 3: tsc + eslint** → 0.

- [ ] **Step 4: Visual verify (controller)** — preview each: macro credibility on GodEye, per-stock on a run analysis/valuation, screener "累积中". Sample-size disclosure visible; zero console.

- [ ] **Step 5: Commit** — `git commit -m "feat(web): mount credibility panels (macro + per-stock + screener)"`

---

## Task 13: Full gate + finish branch

- [ ] **Step 1:** `cd frontend && npx vitest run 2>&1 | tail -5` → all PASS; `python3 -m pytest tests/unit -q 2>&1 | tail -5` → all PASS.
- [ ] **Step 2:** `npx tsc --noEmit` 0 · `npx eslint .` 0 · `npm run build` 0.
- [ ] **Step 3:** Visual sweep of the three credibility surfaces; zero console.
- [ ] **Step 4:** Use superpowers:finishing-a-development-branch (PR, CI green-guard, squash-merge, cleanup).

---

## Self-Review (against the spec)

- **§2 point-in-time / no look-ahead** → Task 1 (alignment) + Task 6 (look-ahead guard test) ✓
- **§4 metrics (hit-rate/IC/directional/calibration/quantile)** → Tasks 2–5 ✓
- **§3.1 per-stock from valuation_history** → Task 8 (pricing endpoint) ✓
- **§3.2 macro surfaced (reuse, no rewrite)** → Task 8 (macro endpoint reuses factor-backtest) ✓
- **§3.3 screener ranking capture** → Task 7 (store) + Task 9 (hook) + Task 8 (screener endpoint, accumulating) ✓
- **§2 sample-size + since-date disclosure** → Task 6 (`since_date`, `status`) + Tasks 10–12 (UI disclosure) ✓
- **§5 sync-def endpoints (concurrency)** → Task 8 def + Task 9 guard ✓
- **§5.2 frontend panels reusing command primitives** → Tasks 10–12 ✓
- **§8 testing (pure-fn units, look-ahead, gating, store concurrency, endpoints, UI)** → every task ✓
- **Type consistency:** envelope keys `{since_date, horizons:[{horizon,status,sample_size,hit_rate,ic,directional,calibration}]}` used identically in Tasks 6, 8, 10, 11 ✓

No placeholders; the only spec deviation: `find_forward_return` is freshly implemented in `signal_validation.py` (not extracted from macro.py) to avoid refactor risk to the working macro endpoint — a ~15-line, fully-tested duplication, intentional.

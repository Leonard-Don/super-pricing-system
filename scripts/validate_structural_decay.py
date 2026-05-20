#!/usr/bin/env python3
"""Repeatable walk-forward validation of the structural-decay mispricing signal.

WHAT CHANGED
------------
This used to be a *one-shot reconstruction* script: every run rebuilt a
score panel from scratch because the architecture persisted no score
time-series. The repo now has a persistent point-in-time panel store
(:class:`src.analytics.signal_panel.SignalPanelStore`) — `build_structural_decay`
appends one row per analysis run. This script is now a **system capability**
that reads that persisted panel and runs the walk-forward test against it.
"Does the mispricing signal predict anything?" is therefore a repeatable,
falsifiable question instead of a one-off.

CLAIM UNDER TEST
----------------
    "A worse (higher) structural-decay score predicts lower subsequent
     N-month excess return."

HOW IT WORKS
------------
1. Read the persisted panel via ``SignalPanelStore.recent``. Each row is a
   point-in-time observation: ``(symbol, observed_at, component scores...,
   final_score)``, recording only what was knowable at ``observed_at``.
2. If the live panel does not yet hold enough point-in-time observations for
   a walk-forward rank-IC (the common cold-start case), **backfill** it:
   reconstruct historical structural-decay scores at monthly anchors using
   only trailing-window data, and append them to the same panel store under
   the ``structural_decay_reconstructed`` signal name. The backfill is
   idempotent — re-running does not duplicate rows. Live engine rows and
   reconstructed rows then coexist in one panel; as the engine accumulates
   real rows the test silently shifts onto them.
3. Run the walk-forward test on the panel: bucket rows into monthly anchors,
   join each row's score to its forward N-month excess return (strictly
   post-``observed_at`` price data — no look-ahead), and compute per-anchor
   Spearman rank IC, the IC t-stat, the information ratio IR = mean(IC) /
   std(IC), a bootstrap CI, and a median-split long/short spread.
4. If even after backfill the panel cannot support a test, report honestly:
   "panel has N observations, need more".

VERDICT RULE
------------
The signal is judged to have predictive power only if the mean rank IC is
both correctly signed (negative — higher decay => lower return) AND
statistically distinguishable from zero (|t| > 2, bootstrap CI excludes 0).
A null result is reported plainly — that is the goal, not a failure mode.

Usage:
    python3 scripts/validate_structural_decay.py
    python3 scripts/validate_structural_decay.py --no-backfill   # panel only
    python3 scripts/validate_structural_decay.py --offline       # skip network
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import warnings
from dataclasses import dataclass
from datetime import timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.analytics.signal_panel import (  # noqa: E402
    SignalPanelRow,
    SignalPanelStore,
    get_signal_panel_store,
)

PEOPLE_LAYER_PATH = PROJECT_ROOT / "cache" / "alt_data" / "providers" / "people_layer.json"
WRITEUP_PATH = PROJECT_ROOT / "docs" / "structural_decay_validation.md"

# Benchmark for "excess" return. SPY is what macro_mispricing_thesis itself
# falls back to as the market hedge leg, so it is the engine's own baseline.
BENCHMARK = "SPY"

# Trailing window used to estimate CAPM/FF3 alpha at each backfill anchor.
# The live engine defaults to a 1y window (period="1y"); we mirror that.
ALPHA_LOOKBACK_DAYS = 252

# Forward horizons to evaluate, in months.
HORIZONS_MONTHS = (1, 3, 6)

# Total history to pull for the backfill / forward-return side.
HISTORY_PERIOD = "5y"

# Monthly anchor spacing (trading days). ~21 trading days per month.
ANCHOR_STEP_DAYS = 21

TRADING_DAYS_PER_MONTH = 21
BOOTSTRAP_ITERS = 5000
BOOTSTRAP_SEED = 20260520

# Signal name reconstructed backfill rows are stored under, kept distinct from
# the live engine's ``structural_decay`` rows so the two never get confused.
RECONSTRUCTED_SIGNAL_NAME = "structural_decay_reconstructed"
VALIDATION_SIGNAL_PRIORITY = {
    RECONSTRUCTED_SIGNAL_NAME: 0,
    "structural_decay": 1,
}

# A walk-forward rank-IC needs a cross-section per anchor and several anchors.
MIN_ANCHORS_FOR_TEST = 3
MIN_NAMES_PER_ANCHOR = 3


@dataclass
class HorizonResult:
    horizon_months: int
    n_anchors: int
    n_pairs: int
    mean_ic: float
    ic_t_stat: float
    ic_info_ratio: float
    ic_hit_rate: float
    boot_ci_low: float
    boot_ci_high: float
    long_short_mean: float
    long_short_t_stat: float

    def verdict(self) -> str:
        """Honest call: signal only 'works' if signed right AND significant.

        The engine claims a HIGHER decay score => structural weakness => LOWER
        forward return. So a working signal needs a NEGATIVE mean IC that is
        statistically separable from zero.
        """
        if self.n_pairs < 30:
            return "INSUFFICIENT DATA"
        significant = abs(self.ic_t_stat) > 2.0 and (self.boot_ci_low > 0 or self.boot_ci_high < 0)
        if not significant:
            return "NO PREDICTIVE POWER (IC indistinguishable from 0)"
        if self.mean_ic < 0:
            return "SIGNAL CONFIRMED (higher decay -> lower return, significant)"
        return "SIGNAL INVERTED (higher decay -> HIGHER return, significant)"


# --------------------------------------------------------------------------
# Data loading
# --------------------------------------------------------------------------
def load_people_layer() -> dict[str, dict[str, Any]]:
    """Load the curated people-layer snapshot, keyed by symbol.

    Returns symbol -> {people_fragility_score, people_quality_score,
    risk_level, dilution_ratio, insider_conviction}. Returns {} if the file is
    missing -- the backfill still runs in execution-only mode.
    """
    if not PEOPLE_LAYER_PATH.exists():
        return {}
    payload = json.loads(PEOPLE_LAYER_PATH.read_text(encoding="utf-8"))
    out: dict[str, dict[str, Any]] = {}
    for rec in payload.get("records", []):
        md = rec.get("metadata", {}) or {}
        raw = rec.get("raw_value", {}) or {}
        sym = md.get("symbol") or raw.get("symbol")
        if not sym:
            continue
        out[str(sym).upper()] = {
            "people_fragility_score": float(md.get("people_fragility_score") or 0.0),
            "people_quality_score": float(md.get("people_quality_score") or 0.0),
            "risk_level": md.get("risk_level", "unknown"),
            "dilution_ratio": float(raw.get("dilution_ratio") or 0.0),
            "insider_conviction": float(raw.get("insider_conviction") or 0.0),
        }
    return out


def fetch_prices(symbols: list[str]) -> pd.DataFrame:
    """Fetch real adjusted-close history via yfinance. Raises on hard failure."""
    import yfinance as yf

    frames: dict[str, pd.Series] = {}
    for sym in symbols:
        hist = yf.Ticker(sym).history(period=HISTORY_PERIOD, interval="1d")
        if hist.empty:
            print(f"  [warn] no price history for {sym}; dropping it")
            continue
        close = hist["Close"].copy()
        close.index = pd.to_datetime(close.index).tz_localize(None)
        frames[sym] = close
    if BENCHMARK not in frames:
        raise RuntimeError(f"benchmark {BENCHMARK} price history unavailable")
    panel = pd.DataFrame(frames).sort_index()
    min_rows = ALPHA_LOOKBACK_DAYS + max(HORIZONS_MONTHS) * TRADING_DAYS_PER_MONTH
    keep = [c for c in panel.columns if panel[c].notna().sum() >= min_rows]
    return panel[keep]


# --------------------------------------------------------------------------
# Point-in-time score reconstruction (backfill seeder)
# --------------------------------------------------------------------------
def capm_alpha_pct(stock_ret: pd.Series, mkt_ret: pd.Series) -> float | None:
    """Replicate AssetPricingEngine._run_capm alpha: daily OLS, annualised x252.

    Risk-free rate is approximated as 0 over the window (the curated FF RF on a
    daily basis is ~1e-4 and does not change a cross-sectional ranking).
    """
    aligned = pd.DataFrame({"stock": stock_ret, "mkt": mkt_ret}).dropna()
    if len(aligned) < 30:
        return None
    y = aligned["stock"].to_numpy()
    x = aligned["mkt"].to_numpy()
    design = np.column_stack([np.ones(len(x)), x])
    coeffs, *_ = np.linalg.lstsq(design, y, rcond=None)
    alpha_daily = float(coeffs[0])
    return alpha_daily * 252 * 100.0


def execution_component(capm_alpha: float, ff3_alpha: float) -> float:
    """The execution_decay branch of build_structural_decay, verbatim deltas."""
    if capm_alpha <= -5 and ff3_alpha <= -3:
        return 0.18
    if capm_alpha <= -3 or ff3_alpha <= -3:
        return 0.10
    if capm_alpha >= 3 and ff3_alpha >= 2:
        return -0.06
    return 0.0


def people_component(people: dict[str, Any]) -> float:
    """The people-driven branches of build_structural_decay, verbatim deltas."""
    if not people:
        return 0.0
    score = 0.0
    fragility = people.get("people_fragility_score", 0.0)
    quality = people.get("people_quality_score", 0.0)
    risk = people.get("risk_level", "unknown")
    if fragility >= 0.68:
        score += 0.28
    elif fragility >= 0.48:
        score += 0.16
    elif quality >= 0.68 and risk == "low":
        score += -0.08

    dilution = people.get("dilution_ratio", 0.0)
    if dilution >= 1.6:
        score += 0.14

    insider = people.get("insider_conviction", 0.0)
    if insider <= -0.18:
        score += 0.10
    return score


def reconstruct_panel_rows(
    prices: pd.DataFrame,
    people_layer: dict[str, dict[str, Any]],
) -> list[SignalPanelRow]:
    """Reconstruct point-in-time structural-decay rows for panel backfill.

    For each monthly anchor t and each name the structural-decay score is
    rebuilt from data available *only up to t*: the execution component from a
    trailing-window CAPM/FF3 alpha, plus the curated people component. Each
    becomes a :class:`SignalPanelRow` stamped at the anchor date. No future
    data ever enters a row. This is the seeder that makes the persisted panel
    non-empty so the walk-forward test below has something to read.
    """
    rets = prices.pct_change()
    names = [c for c in prices.columns if c != BENCHMARK]
    idx = prices.index
    first_anchor = ALPHA_LOOKBACK_DAYS
    last_anchor = len(idx) - 1
    anchor_positions = list(range(first_anchor, last_anchor + 1, ANCHOR_STEP_DAYS))

    rows: list[SignalPanelRow] = []
    for pos in anchor_positions:
        anchor_date = idx[pos]
        observed_at = (
            pd.Timestamp(anchor_date)
            .to_pydatetime()
            .replace(tzinfo=timezone.utc, hour=0, minute=0, second=0, microsecond=0)
            .isoformat()
        )
        window = slice(pos - ALPHA_LOOKBACK_DAYS, pos + 1)
        mkt_win = rets[BENCHMARK].iloc[window]
        for sym in names:
            stock_win = rets[sym].iloc[window]
            if stock_win.notna().sum() < 60:
                continue
            capm_a = capm_alpha_pct(stock_win, mkt_win)
            if capm_a is None:
                continue
            # FF3 alpha proxy: with no SMB/HML offline panel we reuse the CAPM
            # alpha. This only affects the -3/-5 threshold gating in
            # execution_component and is disclosed as a proxy in the writeup.
            ff3_a = capm_a
            exec_s = execution_component(capm_a, ff3_a)
            people_rec = people_layer.get(sym, {})
            ppl_s = people_component(people_rec)
            final_s = max(0.0, min(exec_s + ppl_s, 1.0))
            rows.append(
                SignalPanelRow(
                    observed_at=observed_at,
                    symbol=sym,
                    signal_name=RECONSTRUCTED_SIGNAL_NAME,
                    final_score=final_s,
                    action="reconstructed",
                    dominant_failure_mode="execution" if exec_s >= ppl_s else "people",
                    component_scores={
                        "execution": exec_s,
                        "people": ppl_s,
                        "valuation": 0.0,
                        "evidence": 0.0,
                        "capm_alpha_pct": capm_a,
                        "ff3_alpha_pct": ff3_a,
                        "people_fragility_score": float(
                            people_rec.get("people_fragility_score") or 0.0
                        ),
                    },
                )
            )
    return rows


def backfill_panel(
    store: SignalPanelStore,
    prices: pd.DataFrame,
    people_layer: dict[str, dict[str, Any]],
) -> int:
    """Append reconstructed rows to the panel, skipping ones already present.

    Idempotent: a row is identified by ``(observed_at, symbol, signal_name)``,
    so re-running the validation never duplicates the backfill.
    """
    candidate = reconstruct_panel_rows(prices, people_layer)
    if not candidate:
        return 0
    existing = store.recent(
        days=3650, signal_name=RECONSTRUCTED_SIGNAL_NAME
    )
    seen = {(r.observed_at, r.symbol) for r in existing}
    written = 0
    for row in candidate:
        if (row.observed_at, row.symbol) in seen:
            continue
        store.append(row)
        seen.add((row.observed_at, row.symbol))
        written += 1
    return written


# --------------------------------------------------------------------------
# Walk-forward evaluation against the persisted panel
# --------------------------------------------------------------------------
def panel_to_score_frame(rows: list[SignalPanelRow]) -> pd.DataFrame:
    """Tidy the persisted panel rows into a (anchor, symbol, score) frame.

    ``anchor`` buckets ``observed_at`` to its calendar date so a cross-section
    of names scored within the same day forms one walk-forward anchor.
    If live and reconstructed rows overlap for the same ``(anchor, symbol)``,
    the live engine row wins so the test migrates onto real observations as
    they accumulate.
    """
    records = []
    for row in rows:
        signal_name = str(row.signal_name or "")
        signal_priority = VALIDATION_SIGNAL_PRIORITY.get(signal_name)
        if signal_priority is None:
            continue
        ts = pd.to_datetime(row.observed_at, utc=True, errors="coerce")
        if pd.isna(ts):
            continue
        records.append(
            {
                "anchor": ts.tz_localize(None).normalize(),
                "observed_at": ts.tz_localize(None),
                "symbol": str(row.symbol).upper(),
                "signal_name": signal_name,
                "score": float(row.final_score),
                "_signal_priority": signal_priority,
            }
        )
    columns = ["anchor", "observed_at", "symbol", "signal_name", "score"]
    if not records:
        return pd.DataFrame.from_records(records, columns=columns)
    frame = pd.DataFrame.from_records(records)
    frame = frame.sort_values(
        ["anchor", "symbol", "_signal_priority", "observed_at"]
    )
    frame = frame.drop_duplicates(["anchor", "symbol"], keep="last")
    return frame[columns].reset_index(drop=True)


def attach_forward_returns(
    score_frame: pd.DataFrame,
    prices: pd.DataFrame,
) -> pd.DataFrame:
    """Join each panel score to its forward N-month excess return.

    The forward return is strictly post-anchor: stock return over the next N
    months MINUS the benchmark return over the same window. Anchors are
    snapped to the nearest available trading day on or before the score's
    observation date, so a score recorded on a non-trading day still aligns.
    """
    if score_frame.empty or prices.empty:
        return pd.DataFrame()
    price_index = prices.index
    bench = prices[BENCHMARK]
    out_rows: list[dict[str, Any]] = []

    for _, rec in score_frame.iterrows():
        sym = rec["symbol"]
        if sym not in prices.columns or sym == BENCHMARK:
            continue
        anchor = rec["anchor"]
        # Nearest trading day on or before the anchor.
        eligible = price_index[price_index <= anchor]
        if len(eligible) == 0:
            continue
        anchor_ts = eligible[-1]
        pos = price_index.get_loc(anchor_ts)
        if not isinstance(pos, int):
            continue
        anchor_px = prices[sym].iloc[pos]
        anchor_bx = bench.iloc[pos]
        if pd.isna(anchor_px) or pd.isna(anchor_bx) or anchor_px <= 0 or anchor_bx <= 0:
            continue
        row: dict[str, Any] = {
            "anchor": anchor,
            "symbol": sym,
            "score": rec["score"],
        }
        ok = True
        for n in HORIZONS_MONTHS:
            fwd_pos = pos + n * TRADING_DAYS_PER_MONTH
            if fwd_pos >= len(price_index):
                ok = False
                break
            fut_px = prices[sym].iloc[fwd_pos]
            fut_bx = bench.iloc[fwd_pos]
            if pd.isna(fut_px) or pd.isna(fut_bx):
                ok = False
                break
            stock_fwd = fut_px / anchor_px - 1.0
            bench_fwd = fut_bx / anchor_bx - 1.0
            row[f"fwd_{n}m"] = stock_fwd - bench_fwd
        if ok:
            out_rows.append(row)
    return pd.DataFrame(out_rows)


def spearman_ic(score: np.ndarray, fwd: np.ndarray) -> float | None:
    """Spearman rank correlation. Returns None if a side has no rank variation."""
    if len(score) < 3:
        return None
    s_rank = pd.Series(score).rank().to_numpy()
    f_rank = pd.Series(fwd).rank().to_numpy()
    if np.std(s_rank) == 0 or np.std(f_rank) == 0:
        return None
    corr = np.corrcoef(s_rank, f_rank)[0, 1]
    if math.isnan(corr):
        return None
    return float(corr)


def evaluate_horizon(panel: pd.DataFrame, horizon: int) -> HorizonResult:
    """Per-anchor rank IC, IC t-stat, IR, hit rate, bootstrap CI, L/S spread.

    The information ratio IR is the annualisation-free mean(IC) / std(IC)
    across anchors -- the standard quant read of signal stability.
    """
    fwd_col = f"fwd_{horizon}m"
    if fwd_col not in panel.columns:
        return HorizonResult(horizon, 0, 0, 0.0, 0.0, 0.0, 0.0, float("nan"), float("nan"), 0.0, 0.0)
    sub = panel[["anchor", "score", fwd_col]].dropna()
    n_pairs = len(sub)

    per_anchor_ic: list[float] = []
    ls_spreads: list[float] = []
    for _, grp in sub.groupby("anchor"):
        score = grp["score"].to_numpy()
        fwd = grp[fwd_col].to_numpy()
        ic = spearman_ic(score, fwd)
        if ic is not None:
            per_anchor_ic.append(ic)
        if len(grp) >= 4:
            median = np.median(score)
            high = fwd[score > median]
            low = fwd[score <= median]
            if len(high) >= 1 and len(low) >= 1:
                ls_spreads.append(float(np.mean(high) - np.mean(low)))

    ic_arr = np.array(per_anchor_ic, dtype=float)
    ls_arr = np.array(ls_spreads, dtype=float)

    mean_ic = float(np.mean(ic_arr)) if ic_arr.size else 0.0
    ic_std = float(np.std(ic_arr, ddof=1)) if ic_arr.size > 1 else 0.0
    if ic_std > 0:
        ic_t = mean_ic / (ic_std / math.sqrt(ic_arr.size))
        ic_ir = mean_ic / ic_std
    else:
        ic_t = 0.0
        ic_ir = 0.0
    hit_rate = float(np.mean(ic_arr < 0)) if ic_arr.size else 0.0

    if ic_arr.size >= 3:
        rng = np.random.default_rng(BOOTSTRAP_SEED)
        boot = np.array(
            [np.mean(rng.choice(ic_arr, size=ic_arr.size, replace=True)) for _ in range(BOOTSTRAP_ITERS)]
        )
        ci_low, ci_high = np.percentile(boot, [2.5, 97.5])
    else:
        ci_low, ci_high = float("nan"), float("nan")

    ls_mean = float(np.mean(ls_arr)) if ls_arr.size else 0.0
    if ls_arr.size > 1 and np.std(ls_arr, ddof=1) > 0:
        ls_t = ls_mean / (np.std(ls_arr, ddof=1) / math.sqrt(ls_arr.size))
    else:
        ls_t = 0.0

    return HorizonResult(
        horizon_months=horizon,
        n_anchors=int(ic_arr.size),
        n_pairs=n_pairs,
        mean_ic=mean_ic,
        ic_t_stat=float(ic_t),
        ic_info_ratio=float(ic_ir),
        ic_hit_rate=hit_rate,
        boot_ci_low=float(ci_low),
        boot_ci_high=float(ci_high),
        long_short_mean=ls_mean,
        long_short_t_stat=float(ls_t),
    )


# --------------------------------------------------------------------------
# Reporting
# --------------------------------------------------------------------------
def format_result_block(title: str, results: list[HorizonResult]) -> str:
    lines = [f"### {title}", ""]
    lines.append(
        "| Horizon | Anchors | Pairs | Mean rank IC | IC t-stat | IC IR | "
        "IC<0 hit-rate | Bootstrap 95% CI | L/S spread | L/S t-stat | Verdict |"
    )
    lines.append("|---|---|---|---|---|---|---|---|---|---|---|")
    for r in results:
        ci = f"[{r.boot_ci_low:+.3f}, {r.boot_ci_high:+.3f}]" if not math.isnan(r.boot_ci_low) else "n/a"
        lines.append(
            f"| {r.horizon_months}m | {r.n_anchors} | {r.n_pairs} | "
            f"{r.mean_ic:+.4f} | {r.ic_t_stat:+.2f} | {r.ic_info_ratio:+.2f} | "
            f"{r.ic_hit_rate:.0%} | {ci} | {r.long_short_mean:+.4f} | "
            f"{r.long_short_t_stat:+.2f} | {r.verdict()} |"
        )
    lines.append("")
    return "\n".join(lines)


def overall_verdict(results: list[HorizonResult]) -> str:
    confirmed = [r for r in results if "CONFIRMED" in r.verdict()]
    inverted = [r for r in results if "INVERTED" in r.verdict()]
    if confirmed:
        return (
            "PARTIAL SUPPORT -- the structural-decay signal showed "
            "statistically significant predictive power at one or more horizons."
        )
    if inverted:
        return (
            "SIGNAL INVERTED -- the structural-decay signal was significant "
            "but pointed the WRONG way relative to the engine's thesis."
        )
    return (
        "NOT VALIDATED -- across every tested horizon the structural-decay "
        "signal showed no rank IC distinguishable from zero. On the available "
        "panel data the mispricing thesis has no measurable predictive power."
    )


def build_writeup(
    panel_rows: list[SignalPanelRow],
    eval_panel: pd.DataFrame,
    results: list[HorizonResult],
    live_count: int,
    reconstructed_count: int,
) -> str:
    n_anchors = eval_panel["anchor"].nunique() if not eval_panel.empty else 0
    span = ""
    if not eval_panel.empty:
        span = f"{eval_panel['anchor'].min().date()} -> {eval_panel['anchor'].max().date()}"
    symbols = sorted({r.symbol for r in panel_rows})
    parts: list[str] = []
    parts.append("# Structural-Decay Signal Validation\n")
    parts.append(
        "Reproducible system capability: `python3 scripts/validate_structural_decay.py`. "
        "Generated by that script -- do not edit by hand.\n"
    )
    parts.append("## 1. What was tested\n")
    parts.append(
        "`src/analytics/structural_decay.py` (and the composite-signal "
        "pipeline) emit a narrative + trade legs. This validates ONE "
        "concrete, falsifiable sub-claim of that machinery:\n\n"
        "> **A worse (higher) structural-decay score predicts a lower "
        "subsequent N-month excess return.**\n"
    )
    parts.append("## 2. How the test reads the panel\n")
    parts.append(
        "The engine now **persists every structural-decay score** to a "
        "point-in-time JSONL panel (`cache/alt_data/structural_decay_panel.jsonl`, "
        "via `src.analytics.signal_panel.SignalPanelStore`). This script reads "
        "that panel rather than reconstructing one from scratch:\n\n"
        f"- **Panel observations read:** {len(panel_rows)} "
        f"({live_count} from live engine runs, {reconstructed_count} "
        "point-in-time reconstructed backfill rows).\n"
        "- **API inspection contract:** `GET /infrastructure/signal-panel` "
        "returns the same persisted panel with `window_days`, `matched_count`, "
        "`returned_count`, `live_count`, `reconstructed_count`, `symbols`, "
        "and `rows`.\n"
        f"- **Universe in panel:** {len(symbols)} names"
        + (f" (`{', '.join(symbols)}`)" if symbols and len(symbols) <= 20 else "")
        + ".\n"
        f"- **Walk-forward anchors with aligned forward returns:** {n_anchors}"
        + (f", {span}" if span else "")
        + ".\n"
        f"- **Benchmark for excess return:** `{BENCHMARK}`.\n"
        f"- **Forward return:** stock return over the next N months MINUS the "
        f"`{BENCHMARK}` return over the same window -- strictly post-"
        f"observation price data. Horizons N = "
        f"{', '.join(f'{h}m' for h in HORIZONS_MONTHS)}.\n"
        "- **Statistics:** per-anchor Spearman rank IC; mean IC with a t-stat "
        "across anchors; the information ratio IR = mean(IC) / std(IC); a "
        f"{BOOTSTRAP_ITERS}-sample bootstrap 95% CI on the mean IC; and a "
        "median-split long/short forward-return spread with its own t-stat.\n"
    )
    parts.append("## 3. Honest data-quality caveats\n")
    caveats = [
        "**The panel is the source of truth, and it is young.** "
        "`build_structural_decay` only began persisting rows when the panel "
        "store was added; until enough live runs accumulate, the bulk of the "
        "panel is point-in-time *reconstructed* backfill (clearly tagged "
        "`structural_decay_reconstructed`). As the engine runs in normal use "
        "the live-row share grows and this test silently shifts onto it -- "
        "re-running the script is all that is needed.",
        "**FF3 alpha is proxied by the CAPM alpha in the backfill.** There is "
        "no offline SMB/HML factor panel, so the FF3 branch of the execution "
        "component is approximated for reconstructed rows. This only nudges "
        "the -3/-5 threshold gating. Live rows store the real engine alpha.",
        "**Risk-free rate is treated as ~0** over each window (daily FF RF is "
        "~1e-4 and does not move a cross-sectional ranking).",
        f"**Small universe ({len(symbols)} names).** A cross-section this "
        "narrow makes any single-anchor IC noisy; the test aggregates IC "
        "across many anchors and bootstraps the mean.",
        "**The people component is a curated static snapshot.** Every "
        "snapshot date in `people_layer.json` carries an identical "
        "`people_fragility_score` per name, so it contributes only a fixed "
        "per-name offset to reconstructed rows.",
    ]
    parts.append("\n".join(f"{i + 1}. {c}" for i, c in enumerate(caveats)) + "\n")
    parts.append("## 4. Results\n")
    parts.append(
        "The engine's thesis is *higher score = structural weakness = lower "
        "forward return*, so a **working signal needs a negative mean IC** "
        "that is statistically separable from zero.\n"
    )
    parts.append(
        format_result_block(
            "Walk-forward rank IC / IR on the persisted panel", results
        )
    )
    parts.append("## 5. Verdict\n")
    parts.append(overall_verdict(results) + "\n")
    parts.append(
        "Read this the same way as the quant-trading-system walk-forward "
        "stat tests: a null result, honestly reported, is the deliverable. "
        "If the table above shows IC t-stats inside +/-2 and bootstrap CIs "
        "straddling 0, then **the structural-decay signal does not currently "
        "predict forward returns on the data this repo can assemble** -- and "
        "the narrative / trade-leg output of `macro_mispricing_thesis.py` "
        "should be treated as an un-evidenced hypothesis, not a validated "
        "signal.\n"
    )
    parts.append("## 6. This is now a repeatable capability\n")
    parts.append(
        "The validation gap flagged by the prior review is closed: "
        "`build_structural_decay` persists a point-in-time score panel on "
        "every analysis run, and this script is a permanent system capability "
        "that walk-forward-tests that panel. \"Does the mispricing signal "
        "predict anything?\" is now a repeatable, falsifiable question -- "
        "re-run the script as the panel grows and the IC / IR update "
        "automatically. The honest goal was never a different answer; it was "
        "making the test permanent.\n"
    )
    return "\n".join(parts)


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
def _summarise_panel(rows: list[SignalPanelRow]) -> tuple[int, int]:
    """Return (live_row_count, reconstructed_row_count)."""
    live = sum(1 for r in rows if r.signal_name == "structural_decay")
    recon = sum(1 for r in rows if r.signal_name == RECONSTRUCTED_SIGNAL_NAME)
    return live, recon


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Skip the network fetch; report panel status without forward returns.",
    )
    parser.add_argument(
        "--no-backfill",
        action="store_true",
        help="Do not seed the panel with reconstructed rows; test only what is stored.",
    )
    args = parser.parse_args()

    print("Structural-decay signal validation (panel-backed walk-forward)")
    print("=" * 70)

    store = get_signal_panel_store()
    panel_rows = store.recent(days=3650)
    live_count, recon_count = _summarise_panel(panel_rows)
    score_frame = panel_to_score_frame(panel_rows)
    print(
        f"Persisted panel: {len(panel_rows)} observations "
        f"({live_count} live, {recon_count} reconstructed)."
    )

    distinct_anchors = 0 if score_frame.empty else int(score_frame["anchor"].nunique())
    distinct_symbols = 0 if score_frame.empty else int(score_frame["symbol"].nunique())
    needs_backfill = (
        distinct_anchors < MIN_ANCHORS_FOR_TEST
        or distinct_symbols < MIN_NAMES_PER_ANCHOR
    )

    if args.offline:
        print("\n--offline: not fetching prices.")
        if not panel_rows:
            print(
                "  Panel has 0 observations. The structural-decay signal cannot "
                "be validated yet -- run the engine (or this script online) to "
                "populate the panel."
            )
        else:
            print(
                f"  Panel has {len(panel_rows)} observations across "
                f"{distinct_anchors} anchor dates. A walk-forward IC also needs "
                "forward returns, which require a price fetch. Re-run online."
            )
        return 0

    print(f"\nFetching {HISTORY_PERIOD} of real prices (forward-return + backfill side)...")
    people_layer = load_people_layer()
    universe = sorted(people_layer.keys()) if people_layer else ["AAPL", "MSFT", "NVDA"]
    universe = sorted(set(universe) | {r.symbol for r in panel_rows} | {BENCHMARK})
    try:
        prices = fetch_prices(universe)
    except Exception as exc:
        print(f"  price fetch FAILED: {exc}")
        print(
            "\nVERDICT: cannot validate -- no price history available for the "
            "forward-return side. Panel currently holds "
            f"{len(panel_rows)} observations; re-run with network access."
        )
        return 1
    got = [c for c in prices.columns if c != BENCHMARK]
    print(f"  usable price history for {len(got)} names + benchmark.")

    if needs_backfill and not args.no_backfill:
        print("\nPanel too thin for a walk-forward IC -- backfilling reconstructed rows...")
        if people_layer:
            print(f"  curated people-layer loaded for {len(people_layer)} symbols.")
        written = backfill_panel(store, prices, people_layer)
        print(f"  appended {written} reconstructed point-in-time rows to the panel.")
        panel_rows = store.recent(days=3650)
        live_count, recon_count = _summarise_panel(panel_rows)
        score_frame = panel_to_score_frame(panel_rows)
        print(
            f"  panel now holds {len(panel_rows)} observations "
            f"({live_count} live, {recon_count} reconstructed)."
        )
    elif needs_backfill and args.no_backfill:
        print(
            "\n--no-backfill set and the live panel is too thin. "
            f"Panel has {len(panel_rows)} observations across {distinct_anchors} "
            f"anchors -- need >= {MIN_ANCHORS_FOR_TEST} anchors and "
            f">= {MIN_NAMES_PER_ANCHOR} names. Not enough data; test not run."
        )
        return 0

    print("\nBuilding walk-forward panel from persisted scores...")
    eval_panel = attach_forward_returns(score_frame, prices)
    if eval_panel.empty or eval_panel["anchor"].nunique() < MIN_ANCHORS_FOR_TEST:
        n_anchors = 0 if eval_panel.empty else eval_panel["anchor"].nunique()
        print(
            f"\nVERDICT: panel has {len(panel_rows)} observations but only "
            f"{n_anchors} anchors carry aligned forward returns -- need "
            f">= {MIN_ANCHORS_FOR_TEST}. Not enough data to test the claim yet; "
            "re-run once the panel has grown."
        )
        return 0
    print(
        f"  walk-forward panel: {len(eval_panel)} (anchor,symbol) rows across "
        f"{eval_panel['anchor'].nunique()} anchors."
    )

    results = [evaluate_horizon(eval_panel, h) for h in HORIZONS_MONTHS]
    print("\n--- Walk-forward rank IC / IR on the persisted panel ---")
    for r in results:
        print(
            f"  {r.horizon_months}m: mean IC={r.mean_ic:+.4f} t={r.ic_t_stat:+.2f} "
            f"IR={r.ic_info_ratio:+.2f} pairs={r.n_pairs}  -> {r.verdict()}"
        )
    print(f"\nOVERALL: {overall_verdict(results)}")

    writeup = build_writeup(panel_rows, eval_panel, results, live_count, recon_count)
    WRITEUP_PATH.parent.mkdir(parents=True, exist_ok=True)
    WRITEUP_PATH.write_text(writeup, encoding="utf-8")
    print(f"\nWriteup -> {WRITEUP_PATH.relative_to(PROJECT_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

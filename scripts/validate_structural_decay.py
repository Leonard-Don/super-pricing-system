#!/usr/bin/env python3
"""Honest predictive-power test for the structural-decay mispricing signal.

The portfolio review flagged that ``src/analytics/macro_mispricing_thesis.py`` and
``src/analytics/structural_decay.py`` produce narrative + trade-leg strings with
zero statistical validation. This script runs a real, falsifiable backtest of one
concrete sub-claim instead of adding more infrastructure.

CLAIM UNDER TEST
----------------
    "A worse (higher) structural-decay score predicts lower subsequent
     N-month excess return."

HOW THE SCORE IS RECONSTRUCTED POINT-IN-TIME
--------------------------------------------
``build_structural_decay`` consumes six point-in-time dicts. Only a subset of
its inputs can honestly be reconstructed at a historical anchor date:

  * ``execution_decay``  -- driven by trailing-window CAPM / FF3 alpha. This IS
    genuinely point-in-time: at anchor ``t`` we regress only the trailing
    window ``[t - lookback, t]`` of real returns. No look-ahead.
  * ``people_fragility`` / ``hiring_dilution`` / ``insider_flow`` -- read from
    ``cache/alt_data/providers/people_layer.json``. That file is a *curated
    static snapshot* (``source_mode = curated``; identical scores across every
    snapshot date). It is applied as a per-name constant. This is an HONEST
    LIMITATION, disclosed in the writeup: it can only ever shift names by a
    fixed cross-sectional offset, never react to anything.
  * ``gap_pct`` / ``valuation_status`` / ``alignment`` / ``confidence`` -- need a
    historical DCF fair-value panel that does not exist. EXCLUDED entirely.

So the reconstructed score = the ``execution`` + ``people`` components of the
real engine. We therefore report TWO tests:

  (A) execution-only score  -- fully point-in-time, zero curated data. This is
      the cleanest, most honest signal.
  (B) execution + curated-people score -- the largest faithfully-reproducible
      subset of the real engine.

VERDICT RULE
------------
The signal is judged to have predictive power only if the mean rank IC is
both correctly signed AND statistically distinguishable from zero
(|t| > 2 across anchors, bootstrap CI excludes 0). A null result is reported
plainly -- that is the goal, not a failure mode.

Usage:
    python3 scripts/validate_structural_decay.py
    python3 scripts/validate_structural_decay.py --offline   # skip network, exit honestly
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

PEOPLE_LAYER_PATH = PROJECT_ROOT / "cache" / "alt_data" / "providers" / "people_layer.json"
WRITEUP_PATH = PROJECT_ROOT / "docs" / "structural_decay_validation.md"

# Benchmark for "excess" return. SPY is what macro_mispricing_thesis itself
# falls back to as the market hedge leg, so it is the engine's own baseline.
BENCHMARK = "SPY"

# Trailing window used to estimate CAPM/FF3 alpha at each anchor. The live
# engine defaults to a 1y window (period="1y"); we mirror that.
ALPHA_LOOKBACK_DAYS = 252

# Forward horizons to evaluate, in months.
HORIZONS_MONTHS = (1, 3, 6)

# Total history to pull. Needs ALPHA_LOOKBACK + longest forward horizon + slack.
HISTORY_PERIOD = "5y"

# Monthly anchor spacing (trading days). ~21 trading days per month.
ANCHOR_STEP_DAYS = 21

TRADING_DAYS_PER_MONTH = 21
BOOTSTRAP_ITERS = 5000
BOOTSTRAP_SEED = 20260520


@dataclass
class HorizonResult:
    horizon_months: int
    n_anchors: int
    n_pairs: int
    mean_ic: float
    ic_t_stat: float
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

    Returns a dict: symbol -> {people_fragility_score, people_quality_score,
    risk_level, dilution_ratio, insider_conviction}. Returns {} if the file is
    missing -- the test still runs in execution-only mode.
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
        # records repeat across snapshot dates; last write wins (all identical).
        out[str(sym).upper()] = {
            "people_fragility_score": float(md.get("people_fragility_score") or 0.0),
            "people_quality_score": float(md.get("people_quality_score") or 0.0),
            "risk_level": md.get("risk_level", "unknown"),
            # dilution / insider are not in this curated file; default to neutral
            # so the people component reduces to the fragility term only.
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
    # Require a name to have at least the alpha window + one horizon of data.
    min_rows = ALPHA_LOOKBACK_DAYS + max(HORIZONS_MONTHS) * TRADING_DAYS_PER_MONTH
    keep = [c for c in panel.columns if panel[c].notna().sum() >= min_rows]
    return panel[keep]


# --------------------------------------------------------------------------
# Point-in-time score reconstruction
# --------------------------------------------------------------------------
def capm_alpha_pct(stock_ret: pd.Series, mkt_ret: pd.Series) -> float | None:
    """Replicate AssetPricingEngine._run_capm alpha: daily OLS, annualised x252.

    Risk-free rate is approximated as 0 over the window (the curated FF RF on a
    daily basis is ~1e-4 and does not change the cross-sectional ranking). This
    matches the spirit of the engine while staying fully offline-reproducible.
    """
    aligned = pd.DataFrame({"stock": stock_ret, "mkt": mkt_ret}).dropna()
    if len(aligned) < 30:
        return None
    y = aligned["stock"].to_numpy()
    x = aligned["mkt"].to_numpy()
    design = np.column_stack([np.ones(len(x)), x])
    coeffs, *_ = np.linalg.lstsq(design, y, rcond=None)
    alpha_daily = float(coeffs[0])
    return alpha_daily * 252 * 100.0  # -> alpha_pct, same units as the engine


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
    """The people-driven branches of build_structural_decay, verbatim deltas.

    Uses the curated static snapshot. dilution/insider default to neutral when
    absent, so in practice this collapses to the fragility term.
    """
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


def build_panel(
    prices: pd.DataFrame,
    people_layer: dict[str, dict[str, Any]],
) -> pd.DataFrame:
    """Assemble the point-in-time score / forward-return panel.

    For each monthly anchor t and each name:
      * exec_score   = execution component from trailing-window CAPM & FF3 alpha
      * full_score   = clamp(exec_score + curated people component, 0, 1)
      * fwd_<n>m     = forward n-month return MINUS benchmark forward n-month
                       return (excess return), strictly using data after t.
    No future data ever enters the score side. No anchor data enters the
    return side. This is a clean walk-forward layout.
    """
    rets = prices.pct_change()
    names = [c for c in prices.columns if c != BENCHMARK]
    bench = prices[BENCHMARK]

    idx = prices.index
    first_anchor = ALPHA_LOOKBACK_DAYS
    last_anchor = len(idx) - max(HORIZONS_MONTHS) * TRADING_DAYS_PER_MONTH - 1
    anchor_positions = list(range(first_anchor, last_anchor + 1, ANCHOR_STEP_DAYS))

    rows: list[dict[str, Any]] = []
    for pos in anchor_positions:
        anchor_date = idx[pos]
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
            ppl_s = people_component(people_layer.get(sym, {}))
            full_s = max(0.0, min(exec_s + ppl_s, 1.0))

            row: dict[str, Any] = {
                "anchor": anchor_date,
                "symbol": sym,
                "capm_alpha_pct": capm_a,
                "exec_score": exec_s,
                "full_score": full_s,
            }
            anchor_px = prices[sym].iloc[pos]
            anchor_bx = bench.iloc[pos]
            ok = True
            for n in HORIZONS_MONTHS:
                fwd_pos = pos + n * TRADING_DAYS_PER_MONTH
                fut_px = prices[sym].iloc[fwd_pos]
                fut_bx = bench.iloc[fwd_pos]
                if (
                    pd.isna(anchor_px)
                    or pd.isna(fut_px)
                    or pd.isna(anchor_bx)
                    or pd.isna(fut_bx)
                    or anchor_px <= 0
                    or anchor_bx <= 0
                ):
                    ok = False
                    break
                stock_fwd = fut_px / anchor_px - 1.0
                bench_fwd = fut_bx / anchor_bx - 1.0
                row[f"fwd_{n}m"] = stock_fwd - bench_fwd
            if ok:
                rows.append(row)
    return pd.DataFrame(rows)


# --------------------------------------------------------------------------
# Statistics
# --------------------------------------------------------------------------
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


def evaluate_horizon(panel: pd.DataFrame, score_col: str, horizon: int) -> HorizonResult:
    """Per-anchor rank IC, IC t-stat, hit rate, bootstrap CI, long-short spread."""
    fwd_col = f"fwd_{horizon}m"
    sub = panel[["anchor", score_col, fwd_col]].dropna()
    n_pairs = len(sub)

    per_anchor_ic: list[float] = []
    ls_spreads: list[float] = []
    for _, grp in sub.groupby("anchor"):
        score = grp[score_col].to_numpy()
        fwd = grp[fwd_col].to_numpy()
        ic = spearman_ic(score, fwd)
        if ic is not None:
            per_anchor_ic.append(ic)
        # Long-short: top-half score MINUS bottom-half score forward return.
        # Engine logic = higher score is bearish, so a working signal makes
        # this spread NEGATIVE (shorting high-score names pays).
        if len(grp) >= 4:
            median = np.median(score)
            high = fwd[score > median]
            low = fwd[score <= median]
            if len(high) >= 1 and len(low) >= 1:
                ls_spreads.append(float(np.mean(high) - np.mean(low)))

    ic_arr = np.array(per_anchor_ic, dtype=float)
    ls_arr = np.array(ls_spreads, dtype=float)

    mean_ic = float(np.mean(ic_arr)) if ic_arr.size else 0.0
    if ic_arr.size > 1 and np.std(ic_arr, ddof=1) > 0:
        ic_t = mean_ic / (np.std(ic_arr, ddof=1) / math.sqrt(ic_arr.size))
    else:
        ic_t = 0.0
    hit_rate = float(np.mean(ic_arr < 0)) if ic_arr.size else 0.0

    # Bootstrap CI on the mean IC across anchors.
    if ic_arr.size >= 3:
        rng = np.random.default_rng(BOOTSTRAP_SEED)
        boot = np.array([np.mean(rng.choice(ic_arr, size=ic_arr.size, replace=True)) for _ in range(BOOTSTRAP_ITERS)])
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
        "| Horizon | Anchors | Pairs | Mean rank IC | IC t-stat | "
        "IC<0 hit-rate | Bootstrap 95% CI | L/S spread | L/S t-stat | Verdict |"
    )
    lines.append("|---|---|---|---|---|---|---|---|---|---|")
    for r in results:
        ci = f"[{r.boot_ci_low:+.3f}, {r.boot_ci_high:+.3f}]" if not math.isnan(r.boot_ci_low) else "n/a"
        lines.append(
            f"| {r.horizon_months}m | {r.n_anchors} | {r.n_pairs} | "
            f"{r.mean_ic:+.4f} | {r.ic_t_stat:+.2f} | {r.ic_hit_rate:.0%} | "
            f"{ci} | {r.long_short_mean:+.4f} | {r.long_short_t_stat:+.2f} | "
            f"{r.verdict()} |"
        )
    lines.append("")
    return "\n".join(lines)


def overall_verdict(exec_results: list[HorizonResult]) -> str:
    confirmed = [r for r in exec_results if "CONFIRMED" in r.verdict()]
    inverted = [r for r in exec_results if "INVERTED" in r.verdict()]
    if confirmed:
        return (
            "PARTIAL SUPPORT -- the execution-decay sub-signal showed "
            "statistically significant predictive power at one or more horizons."
        )
    if inverted:
        return (
            "SIGNAL INVERTED -- the execution-decay sub-signal was significant "
            "but pointed the WRONG way relative to the engine's thesis."
        )
    return (
        "NOT VALIDATED -- across every tested horizon the structural-decay "
        "signal showed no rank IC distinguishable from zero. On the available "
        "data the mispricing thesis has no measurable predictive power."
    )


def build_writeup(
    symbols: list[str],
    people_layer: dict[str, dict[str, Any]],
    panel: pd.DataFrame,
    exec_results: list[HorizonResult],
    full_results: list[HorizonResult],
    people_static: bool,
) -> str:
    n_anchors = panel["anchor"].nunique() if not panel.empty else 0
    span = ""
    if not panel.empty:
        span = f"{panel['anchor'].min().date()} -> {panel['anchor'].max().date()}"
    parts: list[str] = []
    parts.append("# Structural-Decay Signal Validation\n")
    parts.append(
        "Reproducible test: `python3 scripts/validate_structural_decay.py`. "
        "Generated by that script -- do not edit by hand.\n"
    )
    parts.append("## 1. What was tested\n")
    parts.append(
        "The portfolio review flagged that `src/analytics/structural_decay.py` "
        "and `src/analytics/macro_mispricing_thesis.py` emit a narrative + "
        "trade legs with **zero statistical validation and no backtest** "
        "(`grep mispric src/backtest/` returns nothing).\n\n"
        "This validates ONE concrete, falsifiable sub-claim of that machinery:\n\n"
        "> **A worse (higher) structural-decay score predicts a lower "
        "subsequent N-month excess return.**\n"
    )
    universe_syms = sorted(s for s in symbols if s != BENCHMARK)
    parts.append("## 2. Method\n")
    parts.append(
        f"- **Universe:** the {len(universe_syms)} names that have a curated "
        f"people-layer record AND usable price history: "
        f"`{', '.join(universe_syms)}`.\n"
        f"- **Benchmark for excess return:** `{BENCHMARK}` (the engine's own "
        f"fallback market-hedge leg in `macro_mispricing_thesis.py`).\n"
        f"- **Anchors:** monthly (~{ANCHOR_STEP_DAYS} trading days apart) over "
        f"`{HISTORY_PERIOD}` of real daily prices from yfinance. "
        f"{n_anchors} anchor dates, {span}.\n"
        f"- **Score, point-in-time:** at each anchor `t` the structural-decay "
        f"components are reconstructed using ONLY data up to `t`:\n"
        f"  - `execution_decay`: trailing {ALPHA_LOOKBACK_DAYS}-day CAPM alpha "
        f"(replicating `AssetPricingEngine._run_capm`: daily OLS, annualised "
        f"x252). **Genuinely walk-forward.**\n"
        f"  - `people` components: from the curated `people_layer.json` "
        f"snapshot. Verbatim delta thresholds from `build_structural_decay`.\n"
        f"- **Forward return:** stock return over the next N months MINUS the "
        f"`{BENCHMARK}` return over the same window -- strictly post-anchor "
        f"data. Horizons N = {', '.join(f'{h}m' for h in HORIZONS_MONTHS)}.\n"
        f"- **Statistics:** per-anchor Spearman rank IC; mean IC with a t-stat "
        f"across anchors; share of anchors with IC<0 (hit rate); a "
        f"{BOOTSTRAP_ITERS}-sample bootstrap 95% CI on the mean IC; and a "
        f"median-split long/short forward-return spread with its own t-stat.\n"
    )
    parts.append("## 3. Honest data-quality caveats\n")
    caveats = [
        "**No historical score panel exists.** `build_structural_decay` only "
        "ever runs point-in-time inside a request; nothing persists a time "
        "series of scores. This script *reconstructs* the panel -- it is not "
        "reading a stored one.",
        "**FF3 alpha is proxied by the CAPM alpha.** There is no offline "
        "SMB/HML factor panel, so the FF3 branch of `execution_component` is "
        "approximated. This only nudges the -3/-5 threshold gating.",
        "**Risk-free rate is treated as ~0** over each window (daily FF RF is "
        "~1e-4 and does not move a cross-sectional ranking).",
        f"**Small universe ({len(symbols) - 1} names).** A cross-section this "
        "narrow makes any single-anchor IC noisy; this is why the test "
        "aggregates IC across many anchors and bootstraps the mean.",
    ]
    if people_static:
        caveats.insert(
            1,
            "**The people-layer file is a CURATED STATIC SNAPSHOT.** Every "
            "snapshot date in `people_layer.json` carries an identical "
            "`people_fragility_score` per name (`source_mode = curated`, "
            "`fallback_reason = live_proxy_or_def14a_not_connected`). It "
            "therefore contributes only a fixed per-name offset and cannot "
            "react to anything. The execution-only test (A) is the clean read.",
        )
    parts.append("\n".join(f"{i + 1}. {c}" for i, c in enumerate(caveats)) + "\n")
    parts.append("## 4. Results\n")
    parts.append(
        "The engine's thesis is *higher score = structural weakness = lower "
        "forward return*, so a **working signal needs a negative mean IC** "
        "that is statistically separable from zero.\n"
    )
    parts.append(
        format_result_block(
            "Test A -- execution-decay component only (fully point-in-time)",
            exec_results,
        )
    )
    parts.append(
        format_result_block(
            "Test B -- execution + curated-people composite",
            full_results,
        )
    )
    parts.append("## 5. Verdict\n")
    parts.append(overall_verdict(exec_results) + "\n")
    parts.append(
        "Read this the same way as the quant-trading-system walk-forward stat "
        "tests: a null result, honestly reported, is the deliverable. If the "
        "table above shows IC t-stats inside +/-2 and bootstrap CIs straddling "
        "0, then **the structural-decay signal does not currently predict "
        "forward returns on the data this repo can assemble** -- and the "
        "narrative/trade-leg output of `macro_mispricing_thesis.py` should be "
        "treated as an un-evidenced hypothesis, not a validated signal.\n"
    )
    parts.append("## 6. The #1 thing to fix\n")
    parts.append(
        "To make the mispricing thesis testable for real, the repo needs a "
        "**persisted historical panel of structural-decay scores** (and of the "
        "people-layer inputs that feed them) captured point-in-time, not a "
        "curated static snapshot. Until a genuine longitudinal panel exists, "
        "every backtest of this signal is a partial reconstruction with the "
        "caveats listed in section 3. Persisting the scores -- one append per "
        "analysis run, keyed by `(symbol, timestamp)` -- is a small change and "
        "is the single highest-leverage fix for the validation gap.\n"
    )
    return "\n".join(parts)


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Skip the network fetch; report honestly that the test needs data.",
    )
    args = parser.parse_args()

    print("Structural-decay signal validation")
    print("=" * 70)

    people_layer = load_people_layer()
    if people_layer:
        print(f"Loaded curated people-layer for {len(people_layer)} symbols.")
        frag_values = {s: round(p["people_fragility_score"], 3) for s, p in people_layer.items()}
        print(f"  people_fragility_score per name: {frag_values}")
        people_static = True  # the file is documented-curated; see writeup
    else:
        print("No people-layer file found -- running execution-only.")
        people_static = False

    universe = sorted(people_layer.keys()) if people_layer else ["AAPL", "MSFT", "NVDA"]
    symbols = sorted(set(universe) | {BENCHMARK})

    if args.offline:
        print("\n--offline: not fetching prices. Honest status:")
        print(
            "  The structural-decay signal CANNOT be validated offline -- the "
            "repo persists no historical score panel, so a backtest needs a "
            "live price fetch to reconstruct one. Re-run without --offline."
        )
        return 0

    print(f"\nFetching {HISTORY_PERIOD} of real prices for {len(symbols)} symbols...")
    try:
        prices = fetch_prices(symbols)
    except Exception as exc:  # top-level honest failure path
        print(f"  price fetch FAILED: {exc}")
        print(
            "\nVERDICT: cannot validate -- no price history available and no "
            "persisted score panel in the repo. This inability is itself the "
            "finding: the mispricing thesis has no standing data to test it."
        )
        return 1

    got = [c for c in prices.columns if c != BENCHMARK]
    print(f"  usable price history for {len(got)} names + benchmark.")
    if len(got) < 3:
        print(
            "\nVERDICT: fewer than 3 names with usable history -- the "
            "cross-section is too thin for a rank IC. Test not run."
        )
        return 1

    print("\nReconstructing point-in-time score / forward-return panel...")
    panel = build_panel(prices, people_layer)
    if panel.empty or panel["anchor"].nunique() < 3:
        print(
            "\nVERDICT: could not assemble >=3 anchor dates with aligned "
            "scores and forward returns. Data insufficient to test the claim."
        )
        return 1
    print(f"  panel: {len(panel)} (anchor,symbol) rows across {panel['anchor'].nunique()} anchors.")

    exec_results = [evaluate_horizon(panel, "exec_score", h) for h in HORIZONS_MONTHS]
    full_results = [evaluate_horizon(panel, "full_score", h) for h in HORIZONS_MONTHS]

    print("\n--- Test A: execution-decay component only ---")
    for r in exec_results:
        print(
            f"  {r.horizon_months}m: mean IC={r.mean_ic:+.4f} t={r.ic_t_stat:+.2f} pairs={r.n_pairs}  -> {r.verdict()}"
        )
    print("\n--- Test B: execution + curated-people composite ---")
    for r in full_results:
        print(
            f"  {r.horizon_months}m: mean IC={r.mean_ic:+.4f} t={r.ic_t_stat:+.2f} pairs={r.n_pairs}  -> {r.verdict()}"
        )

    print(f"\nOVERALL: {overall_verdict(exec_results)}")

    writeup = build_writeup(symbols, people_layer, panel, exec_results, full_results, people_static)
    WRITEUP_PATH.parent.mkdir(parents=True, exist_ok=True)
    WRITEUP_PATH.write_text(writeup, encoding="utf-8")
    print(f"\nWriteup -> {WRITEUP_PATH.relative_to(PROJECT_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

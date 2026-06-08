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
        rows.append({"date": str(sp["ts"])[:10], "signal": float(sp["signal"]), "confidence": sp.get("confidence"), "forward_return": fr})
    return rows


def _independent_rows(rows: List[Dict[str, Any]], horizon: int) -> List[Dict[str, Any]]:
    """Collapse to non-overlapping observations so heavily-sampled point-in-time
    snapshots (e.g. many score snapshots per day) don't inflate apparent significance.
    Keep the last row per calendar day, then greedily keep rows whose date is >=
    `horizon` days after the last kept one — so the forward windows don't overlap.
    Without this, N autocorrelated overlapping windows masquerade as N independent
    samples (a 99%+ hit-rate artifact in a trending market)."""
    by_day: Dict[str, Dict[str, Any]] = {}
    for r in sorted(rows, key=lambda r: r["date"]):
        by_day[r["date"]] = r  # last observation wins per calendar day
    kept: List[Dict[str, Any]] = []
    last: Optional[date] = None
    for d_str in sorted(by_day):
        d = _to_date(d_str)
        if last is None or (d - last).days >= horizon:
            kept.append(by_day[d_str])
            last = d
    return kept


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
        aligned = build_evaluated_rows(signal_points, closes, h)
        rows = _independent_rows(aligned, h)
        n = len(_directional(rows))
        status = "ok" if n >= min_sample else "insufficient_data"
        results.append({
            "horizon": h,
            "status": status,
            "sample_size": n,
            "raw_observations": len(aligned),
            "hit_rate": compute_hit_rate(rows),
            "ic": compute_ic(rows),
            "directional": compute_directional_returns(rows),
            "calibration": compute_calibration(rows),
        })
    return {"since_date": since, "min_sample": min_sample, "horizons": results}

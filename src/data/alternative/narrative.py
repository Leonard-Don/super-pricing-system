"""Deterministic synthesizer for the "今日另类数据要点" narrative tile.

Phase E2 (audit doc § 11) ships a 2-3 sentence narrative summary alongside
the already-shipped `/alt-data/health` manifest endpoint. The intent is to
give research analysts the same one-glance read they would scratch out
themselves after spending five minutes on the dashboard:

  > 政策雷达本周捕获 12 条记录(fed/ecb 主导，CN 端 ndrc 新接入贡献 3 条)，
  > 最高影响力指向"新能源汽车"(avg_impact=-0.35, 偏空)。SHFE 铜库存
  > 95.5 万吨较周一 -2.5%(库存去化)，LME 同步呈现 destocking 信号。综合
  > 判读：能源金属上行压力，新能源板块短期承压。

Synthesis is **strictly deterministic** — there is no LLM call, no
network I/O, and no async dependency. The same input snapshot always
produces the same output, which makes the result safe to cache on the
endpoint side (`Cache-Control: max-age=300`).

The module exposes:

- :class:`AltDataNarrative`  — frozen dataclass returned to the endpoint
- :func:`build_alt_data_narrative` — the public entry point

The function consumes :class:`AltDataManager` directly so the synthesis
rules can read both ``latest_signals`` and the on-disk policy / macro
records via ``get_records``. Every generated bullet carries an
``evidence_link`` pointing back at the source provider snapshot path so
the frontend can deep-link from the narrative into the underlying data.
"""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Tuple

if TYPE_CHECKING:  # pragma: no cover - imported only for typing
    from .alt_data_manager import AltDataManager


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Default snapshot directory layout (matches AltDataSnapshotStore.providers_dir).
_PROVIDERS_SNAPSHOT_TEMPLATE = "cache/alt_data/providers/{provider}.json"

# A component is considered stale once its snapshot mtime is older than
# this many days. The constant mirrors the audit's "max_snapshot_age = 7d"
# rule of thumb for what an analyst would visually flag as "needs refresh".
STALE_THRESHOLD_DAYS = 7

# Empty-state copy. Surfaces in two places: the manager has zero providers
# with signals, or every signal has zero records.
EMPTY_NARRATIVE_SUMMARY = "alt-data 暂无信号"

# Industry-scoped empty-state copy. Surfaces when ``ticker_industry`` is
# supplied but no policy_radar / macro_hf signal touches that industry --
# the global narrative still has content, but the industry view has
# nothing to say.
EMPTY_INDUSTRY_NARRATIVE_SUMMARY = "本行业暂无显著另类数据信号"


# ---------------------------------------------------------------------------
# Output dataclass
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AltDataNarrative:
    """Frozen DTO returned by :func:`build_alt_data_narrative`.

    The endpoint serialises this directly via :meth:`to_dict`.

    Attributes
    ----------
    summary
        2-3 sentence narrative paragraph, joined with single spaces.
        Always non-empty (falls back to :data:`EMPTY_NARRATIVE_SUMMARY`).
    bullets
        Sentence-level breakdown of ``summary``. Each entry corresponds 1:1
        with one element of ``evidence_links`` -- consumers can render the
        bullet text alongside the underlying provider link.
    evidence_links
        One dict per bullet: ``{"component": str, "snapshot_path": str,
        "verdict": str, "stale": bool}``. ``snapshot_path`` is the
        repo-relative cache path; consumers should treat it as opaque and
        not try to fetch it client-side.
    generated_at
        UTC ISO-8601 second-precision timestamp at synthesis time.
    """

    summary: str
    bullets: List[str] = field(default_factory=list)
    evidence_links: List[Dict[str, Any]] = field(default_factory=list)
    generated_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _utc_now_iso() -> str:
    return (
        datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()
    )


def _provider_snapshot_path(provider: str) -> str:
    return _PROVIDERS_SNAPSHOT_TEMPLATE.format(provider=provider)


def _is_stale(last_refresh_at: Optional[str], *, now: Optional[datetime] = None) -> bool:
    """Return True when ``last_refresh_at`` is older than the stale threshold.

    Accepts either a UTC-aware or naive ISO-8601 string; falls back to
    "fresh" when the value is missing or unparsable (so we don't flag a
    component as stale just because the mtime helper returned None on a
    fresh tmp_path).
    """

    if not last_refresh_at:
        return False
    try:
        parsed = datetime.fromisoformat(last_refresh_at.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return False
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    reference = (now or datetime.now(tz=timezone.utc))
    if reference.tzinfo is None:
        reference = reference.replace(tzinfo=timezone.utc)
    return (reference - parsed) > timedelta(days=STALE_THRESHOLD_DAYS)


def _component_last_refresh(
    manager: "AltDataManager",
    provider_key: str,
) -> Optional[str]:
    """Read the on-disk snapshot mtime for ``provider_key``.

    Returns an ISO-8601 string (UTC, second-precision) or ``None`` when
    the snapshot file does not exist. Mirrors
    :func:`health_manifest._format_mtime`.
    """

    providers_dir = manager.snapshot_store.providers_dir
    snapshot_path = providers_dir / f"{provider_key}.json"
    try:
        if not snapshot_path.exists():
            return None
        mtime_epoch = snapshot_path.stat().st_mtime
    except OSError:
        return None
    return (
        datetime.fromtimestamp(mtime_epoch, tz=timezone.utc)
        .replace(microsecond=0)
        .isoformat()
    )


def _format_sentence(text: str, *, stale: bool) -> str:
    """Prefix a sentence with ``[stale]`` when its component is stale."""
    if stale and not text.startswith("[stale]"):
        return f"[stale] {text}"
    return text


# ---------------------------------------------------------------------------
# Policy radar synthesis
# ---------------------------------------------------------------------------


def _count_policy_sources(records: List[Any]) -> Dict[str, int]:
    """Count records per ``policy_radar:<source>`` token."""

    counts: Dict[str, int] = {}
    for record in records:
        source = getattr(record, "source", "") or ""
        if not source.startswith("policy_radar"):
            continue
        # source format is "policy_radar:fed", "policy_radar:ndrc", ...
        if ":" in source:
            short = source.split(":", 1)[1]
        else:
            short = source
        counts[short] = counts.get(short, 0) + 1
    return counts


_CN_POLICY_SOURCES = frozenset({"ndrc", "nea", "mof", "mofcom", "pboc"})


def _classify_policy_sources(source_counts: Dict[str, int]) -> Tuple[List[str], List[str]]:
    """Split policy sources into (cn, non_cn) sorted-by-count lists."""

    cn_sources = sorted(
        ((src, cnt) for src, cnt in source_counts.items() if src.lower() in _CN_POLICY_SOURCES),
        key=lambda pair: (-pair[1], pair[0]),
    )
    non_cn_sources = sorted(
        ((src, cnt) for src, cnt in source_counts.items() if src.lower() not in _CN_POLICY_SOURCES),
        key=lambda pair: (-pair[1], pair[0]),
    )
    return (
        [f"{src}={cnt}" for src, cnt in cn_sources],
        [f"{src}={cnt}" for src, cnt in non_cn_sources],
    )


def _top_industry_impact(signal: Dict[str, Any]) -> Optional[Tuple[str, float, str]]:
    """Return (industry, avg_impact, signal_label) with the highest |avg_impact|.

    Returns ``None`` when ``industry_signals`` is empty or all impacts are 0.
    """

    industry_signals = signal.get("industry_signals") or {}
    if not isinstance(industry_signals, dict) or not industry_signals:
        return None

    best: Optional[Tuple[str, float, str]] = None
    best_magnitude = 0.0
    # Sort by industry name as the tiebreaker keeps output deterministic
    # across runs even when avg_impact ties exactly.
    for industry in sorted(industry_signals.keys()):
        data = industry_signals.get(industry)
        if not isinstance(data, dict):
            continue
        try:
            avg_impact = float(data.get("avg_impact", 0.0) or 0.0)
        except (TypeError, ValueError):
            avg_impact = 0.0
        magnitude = abs(avg_impact)
        if magnitude <= 0.0:
            continue
        if best is None or magnitude > best_magnitude:
            signal_label = str(data.get("signal") or ("bearish" if avg_impact < 0 else "bullish"))
            best = (industry, avg_impact, signal_label)
            best_magnitude = magnitude
    return best


def _impact_direction_label(avg_impact: float) -> str:
    if avg_impact <= -0.05:
        return "偏空"
    if avg_impact >= 0.05:
        return "偏多"
    return "中性"


def _policy_records_for_industry(
    records: List[Any],
    industry: str,
) -> List[Any]:
    """Filter ``records`` down to those tagged with ``industry``."""

    # Local import keeps ticker_industry an opt-in dependency surface --
    # the global path never touches it.
    from .ticker_industry import filter_records_by_industry

    return filter_records_by_industry(records, industry)


def _build_policy_sentence(
    manager: "AltDataManager",
    *,
    timeframe: str = "7d",
    ticker_industry: Optional[str] = None,
) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """Synthesize sentence #1 from the policy_radar latest signal + records.

    Returns ``(sentence, evidence)`` or ``(None, None)`` when there is
    insufficient policy data.

    When ``ticker_industry`` is supplied, the breakdown is rebuilt from
    industry-tagged records only and the industry clause is pinned to
    that industry (rather than the global top-impact one).
    """

    signal = manager.latest_signals.get("policy_radar")
    if not isinstance(signal, dict) or int(signal.get("record_count", 0) or 0) <= 0:
        return None, None

    # Recent policy records drive the per-source breakdown. We rely on the
    # manager's own filtering so we do not have to re-implement timeframe
    # parsing here. If the time-windowed view is empty (e.g. last refresh
    # is older than ``timeframe``) we fall back to ``source_health`` on
    # the signal payload, which always carries the post-refresh
    # per-source record counts regardless of age.
    records = manager.get_records(category="policy", timeframe=timeframe, limit=120)
    industry_filtered = False
    if ticker_industry:
        scoped = _policy_records_for_industry(records, ticker_industry)
        if scoped:
            records = scoped
            industry_filtered = True
        else:
            # No time-windowed records tagged with this industry. Fall
            # back to the in-memory history on the provider (records may
            # be older than the timeframe but still relevant) before
            # giving up.
            provider = manager.providers.get("policy_radar")
            if provider is not None:
                history = list(getattr(provider, "_history", []) or [])
                scoped = _policy_records_for_industry(history, ticker_industry)
                if scoped:
                    records = scoped
                    industry_filtered = True
            if not industry_filtered:
                # Surface the industry signal payload directly when the
                # provider history is also empty -- the signal carries
                # post-refresh aggregates that can still drive a
                # one-sentence narrative.
                industry_signals = signal.get("industry_signals") or {}
                if isinstance(industry_signals, dict) and ticker_industry in industry_signals:
                    industry_filtered = True
                    records = []
                else:
                    return None, None

    source_counts = _count_policy_sources(records)
    if not source_counts and not industry_filtered:
        source_health = signal.get("source_health") or {}
        if isinstance(source_health, dict):
            for src, payload in source_health.items():
                if isinstance(payload, dict):
                    count = int(payload.get("record_count", 0) or 0)
                    if count > 0:
                        source_counts[str(src)] = count
    industry_signal_mentions: Optional[int] = None
    if industry_filtered:
        industry_signals = signal.get("industry_signals") or {}
        if isinstance(industry_signals, dict):
            payload = industry_signals.get(ticker_industry or "")
            if isinstance(payload, dict):
                try:
                    industry_signal_mentions = int(payload.get("mentions", 0) or 0)
                except (TypeError, ValueError):
                    industry_signal_mentions = None
    total = sum(source_counts.values()) or (
        (industry_signal_mentions or len(records)) if industry_filtered
        else int(signal.get("record_count", 0) or 0)
    )

    cn_parts, non_cn_parts = _classify_policy_sources(source_counts)

    detail_chunks: List[str] = []
    if non_cn_parts:
        detail_chunks.append("、".join(non_cn_parts) + " 主导")
    if cn_parts:
        cn_total = sum(int(piece.split("=", 1)[1]) for piece in cn_parts if "=" in piece)
        detail_chunks.append(
            f"CN 端 {'、'.join(cn_parts)} 贡献 {cn_total} 条"
        )
    if not detail_chunks:
        detail_chunks.append("数据源覆盖未知")

    if ticker_industry:
        industry_clause = _industry_clause_for_scope(signal, ticker_industry)
        framing = f"政策雷达本周捕获 {total} 条 {ticker_industry} 相关政策记录"
    else:
        industry_part = _top_industry_impact(signal)
        if industry_part is not None:
            industry, avg_impact, _ = industry_part
            industry_clause = (
                f"，最高影响力指向 \"{industry}\""
                f"(avg_impact={avg_impact:+.2f}, {_impact_direction_label(avg_impact)})"
            )
        else:
            industry_clause = "，行业影响力分布平淡"
        framing = f"政策雷达本周捕获 {total} 条政策记录"

    sentence = (
        f"{framing}"
        f"({'，'.join(detail_chunks)}){industry_clause}。"
    )

    last_refresh = _component_last_refresh(manager, "policy_radar")
    stale = _is_stale(last_refresh)
    evidence = {
        "component": "policy_radar",
        "snapshot_path": _provider_snapshot_path("policy_radar"),
        "verdict": "WORKING-PROTOTYPE",
        "stale": stale,
        "last_refresh_at": last_refresh,
    }
    return _format_sentence(sentence, stale=stale), evidence


def _industry_clause_for_scope(signal: Dict[str, Any], industry: str) -> str:
    """Build the ``"...avg_impact=..., 偏空"`` clause for a scoped industry."""

    industry_signals = signal.get("industry_signals") or {}
    payload = industry_signals.get(industry) if isinstance(industry_signals, dict) else None
    if not isinstance(payload, dict):
        return f"，{industry} 行业影响力未上榜"
    try:
        avg_impact = float(payload.get("avg_impact", 0.0) or 0.0)
    except (TypeError, ValueError):
        avg_impact = 0.0
    return (
        f"，{industry} 行业影响力 "
        f"avg_impact={avg_impact:+.2f}, {_impact_direction_label(avg_impact)}"
    )


# ---------------------------------------------------------------------------
# Macro HF (LME + SHFE inventory) synthesis
# ---------------------------------------------------------------------------


# Map metal-name aliases (zh + en) onto a canonical Chinese label so that
# LME (proxy, English-tagged) and SHFE (live, Chinese-tagged) collapse to
# the same row when we compare destocking vs. restocking.
_METAL_CANONICAL = {
    "copper": "铜",
    "cu": "铜",
    "铜": "铜",
    "aluminium": "铝",
    "aluminum": "铝",
    "al": "铝",
    "铝": "铝",
    "zinc": "锌",
    "zn": "锌",
    "锌": "锌",
    "nickel": "镍",
    "ni": "镍",
    "镍": "镍",
}


def _canonical_metal(label: str) -> Optional[str]:
    if not label:
        return None
    normalized = str(label).strip().lower()
    return _METAL_CANONICAL.get(normalized) or _METAL_CANONICAL.get(label.strip())


def _classify_inventory_record(record: Any) -> Tuple[Optional[str], str, str]:
    """Return (metal, region, trend) for a single macro_hf inventory record.

    ``region`` is one of ``"LME"`` / ``"SHFE"`` / ``""`` and ``trend`` is
    the literal value from the raw payload (``"destocking"`` /
    ``"restocking"`` / ``"stable"`` / ``"unknown"``).
    """

    source = getattr(record, "source", "") or ""
    raw = getattr(record, "raw_value", None) or {}
    metadata = getattr(record, "metadata", None) or {}
    if not isinstance(raw, dict):
        raw = {}
    if not isinstance(metadata, dict):
        metadata = {}

    if "shfe" in source.lower() or str(metadata.get("region", "")).upper() == "SHFE":
        region = "SHFE"
    elif "lme" in source.lower() or "inventory" in source.lower():
        region = "LME"
    else:
        region = str(metadata.get("region", "")).upper()

    metal_label = (
        raw.get("name")
        or raw.get("metal")
        or metadata.get("label")
        or ""
    )
    metal = _canonical_metal(str(metal_label))
    trend = str(raw.get("trend") or "unknown")
    return metal, region, trend


def _summarize_inventory_by_region(records: List[Any]) -> Dict[str, Dict[str, List[str]]]:
    """Group inventory records into ``{region: {trend: [metal]}}``.

    Only the metals with a known canonical name + a real trend tag are
    included. Records pointing at LME and SHFE for the same metal are
    counted independently so we can detect agreement.
    """

    buckets: Dict[str, Dict[str, List[str]]] = {}
    seen: Dict[Tuple[str, str], str] = {}
    for record in records:
        metal, region, trend = _classify_inventory_record(record)
        if metal is None or region not in {"LME", "SHFE"} or trend == "unknown":
            continue
        # De-duplicate on (region, metal); first record wins -- get_records
        # returns newest first so this keeps the freshest read.
        if (region, metal) in seen:
            continue
        seen[(region, metal)] = trend
        buckets.setdefault(region, {}).setdefault(trend, []).append(metal)
    # Sort metal lists for deterministic output.
    for region_bucket in buckets.values():
        for trend_list in region_bucket.values():
            trend_list.sort()
    return buckets


_TREND_LABEL = {
    "destocking": "destocking (库存去化)",
    "restocking": "restocking (库存累积)",
    "stable": "stable",
}


def _format_region_chunk(region: str, region_bucket: Dict[str, List[str]]) -> Optional[str]:
    """Format ``"SHFE 铜/铝 destocking, 锌 restocking"`` for one region."""

    if not region_bucket:
        return None
    parts: List[str] = []
    # Sort by trend so destocking always comes before stable / restocking.
    for trend in sorted(region_bucket.keys()):
        metals = region_bucket[trend]
        if not metals:
            continue
        label = _TREND_LABEL.get(trend, trend)
        parts.append(f"{'/'.join(metals)} {label}")
    if not parts:
        return None
    return f"{region} {'; '.join(parts)}"


def _dominant_trend_set(buckets: Dict[str, Dict[str, List[str]]]) -> Dict[str, str]:
    """Return ``{metal: trend}`` aggregating cross-region agreement.

    For each metal that appears in both LME and SHFE, the metal's
    "dominant" trend is the one both regions agree on; on disagreement we
    fall back to whichever region is the live source (SHFE) so the
    cross-cutting takeaway reflects reality.
    """

    per_metal_per_region: Dict[str, Dict[str, str]] = {}
    for region, region_bucket in buckets.items():
        for trend, metals in region_bucket.items():
            for metal in metals:
                per_metal_per_region.setdefault(metal, {})[region] = trend

    dominant: Dict[str, str] = {}
    for metal, regions in per_metal_per_region.items():
        if len(regions) == 1:
            dominant[metal] = next(iter(regions.values()))
        elif len(set(regions.values())) == 1:
            dominant[metal] = next(iter(regions.values()))
        else:
            # Conflict -- prefer SHFE (live) over LME (proxy).
            dominant[metal] = regions.get("SHFE") or next(iter(regions.values()))
    return dominant


def _filter_buckets_to_metals(
    buckets: Dict[str, Dict[str, List[str]]],
    metals: "frozenset",
) -> Dict[str, Dict[str, List[str]]]:
    """Drop metals from each region's bucket that are not in ``metals``."""

    filtered: Dict[str, Dict[str, List[str]]] = {}
    for region, region_bucket in buckets.items():
        region_out: Dict[str, List[str]] = {}
        for trend, names in region_bucket.items():
            keep = [m for m in names if m in metals]
            if keep:
                region_out[trend] = keep
        if region_out:
            filtered[region] = region_out
    return filtered


def _build_macro_sentence(
    manager: "AltDataManager",
    *,
    timeframe: str = "7d",
    ticker_industry: Optional[str] = None,
) -> Tuple[Optional[str], Optional[Dict[str, Any]], Dict[str, str]]:
    """Synthesize sentence #2 from macro_hf inventory records.

    Returns ``(sentence, evidence, dominant_trends)``. ``dominant_trends``
    is forwarded to the cross-cutting synthesis even if the sentence
    itself is None so the takeaway can still mention raw direction.

    When ``ticker_industry`` is supplied, the inventory buckets are
    filtered to the metals relevant to that industry
    (e.g. ``新能源汽车`` -> ``{铜, 铝, 镍, 锂}``); if none of those
    metals have a trend reading, the sentence is dropped.
    """

    signal = manager.latest_signals.get("macro_hf")
    if not isinstance(signal, dict):
        return None, None, {}

    records = manager.get_records(category="commodity_inventory", timeframe=timeframe, limit=80)
    buckets = _summarize_inventory_by_region(records)
    if not buckets:
        # Fall back to whatever the provider currently has in its
        # in-memory history -- mirrors the policy-radar source_health
        # fallback. This keeps the sentence non-empty when the snapshot
        # is older than the requested timeframe.
        macro_provider = manager.providers.get("macro_hf")
        if macro_provider is not None:
            history = list(getattr(macro_provider, "_history", []) or [])
            buckets = _summarize_inventory_by_region(history)
    if not buckets:
        return None, None, {}

    industry_scoped = False
    if ticker_industry:
        # Local import keeps the dependency optional at module-import
        # time -- the global path never reaches ticker_industry.
        from .ticker_industry import metals_for_industry

        metals = metals_for_industry(ticker_industry)
        if metals:
            scoped = _filter_buckets_to_metals(buckets, metals)
            if not scoped:
                # Industry has no overlap with current inventory reads.
                # Surface dominant_trends as empty so the cross-cutting
                # sentence doesn't claim a takeaway we can't support.
                return None, None, {}
            buckets = scoped
            industry_scoped = True
        else:
            # Industry not mapped to commodities -- the macro sentence
            # is not relevant for this query. Caller still gets a
            # policy-only narrative.
            return None, None, {}

    chunks: List[str] = []
    for region in ("SHFE", "LME"):  # SHFE first -- live > proxy.
        chunk = _format_region_chunk(region, buckets.get(region, {}))
        if chunk:
            chunks.append(chunk)

    if not chunks:
        return None, None, {}

    if industry_scoped:
        sentence = f"宏观高频库存信号（{ticker_industry} 相关金属）：{'；'.join(chunks)}。"
    else:
        sentence = f"宏观高频库存信号：{'；'.join(chunks)}。"

    last_refresh = _component_last_refresh(manager, "macro_hf")
    stale = _is_stale(last_refresh)
    evidence = {
        "component": "macro_hf",
        "snapshot_path": _provider_snapshot_path("macro_hf"),
        "verdict": "WORKING-PROTOTYPE",
        "stale": stale,
        "last_refresh_at": last_refresh,
    }
    return (
        _format_sentence(sentence, stale=stale),
        evidence,
        _dominant_trend_set(buckets),
    )


# ---------------------------------------------------------------------------
# Fund holdings synthesis
# ---------------------------------------------------------------------------


# Minimum holding-fund count for a ticker to be eligible for the
# "公募集中持有" sentence. Mirrors the threshold the audit doc suggests
# (≥15 funds = visibly crowded).
_FUND_CONCENTRATION_THRESHOLD = 15

# Cap on the number of tickers we name in the narrative sentence to keep
# the copy readable.
_FUND_CONCENTRATION_NARRATIVE_LIMIT = 3


def _build_fund_holdings_sentence(
    manager: "AltDataManager",
) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """Synthesise the optional fund_holdings sentence.

    Returns ``(sentence, evidence)`` or ``(None, None)`` when no
    high-concentration ticker reaches the threshold.

    The sentence shape mirrors the task brief:

        本季公募高度集中持有: 600519, 300750, 000858（各 ≥15 只基金）

    The threshold (≥15 funds) is exposed via
    :data:`_FUND_CONCENTRATION_THRESHOLD`; the narrative only fires when
    at least one ticker crosses it. This keeps the copy from
    fabricating "high concentration" claims off thin fund coverage.
    """

    signal = manager.latest_signals.get("fund_holdings")
    if not isinstance(signal, dict):
        return None, None
    top = signal.get("top_concentration_tickers") or []
    if not isinstance(top, list) or not top:
        return None, None

    eligible: List[Dict[str, Any]] = []
    for entry in top:
        if not isinstance(entry, dict):
            continue
        try:
            fund_count = int(entry.get("holding_fund_count", 0) or 0)
        except (TypeError, ValueError):
            fund_count = 0
        if fund_count >= _FUND_CONCENTRATION_THRESHOLD and entry.get("ticker"):
            eligible.append(entry)
        if len(eligible) >= _FUND_CONCENTRATION_NARRATIVE_LIMIT:
            break

    if not eligible:
        return None, None

    fund_count_floor = min(int(item.get("holding_fund_count", 0) or 0) for item in eligible)
    tickers_text = ", ".join(str(item.get("ticker", "")) for item in eligible)
    sentence = (
        f"本季公募高度集中持有: {tickers_text}"
        f"(各 ≥{fund_count_floor} 只基金)。"
    )

    last_refresh = _component_last_refresh(manager, "fund_holdings")
    stale = _is_stale(last_refresh)
    evidence = {
        "component": "fund_holdings",
        "snapshot_path": _provider_snapshot_path("fund_holdings"),
        "verdict": "WORKING-PROTOTYPE",
        "stale": stale,
        "last_refresh_at": last_refresh,
    }
    return _format_sentence(sentence, stale=stale), evidence


# ---------------------------------------------------------------------------
# Cross-cutting takeaway synthesis
# ---------------------------------------------------------------------------


def _build_cross_cutting_sentence(
    *,
    industry: Optional[Tuple[str, float, str]],
    dominant_trends: Dict[str, str],
) -> Optional[str]:
    """Derive the third sentence from policy + macro reads.

    The rule set is intentionally narrow -- if there's no clear directional
    overlap we return ``None`` rather than fabricating a takeaway.
    """

    metals_destocking = sorted(metal for metal, trend in dominant_trends.items() if trend == "destocking")
    metals_restocking = sorted(metal for metal, trend in dominant_trends.items() if trend == "restocking")

    parts: List[str] = []
    if metals_destocking:
        parts.append(f"{'/'.join(metals_destocking)} 等能源金属库存去化，价格上行压力")
    if metals_restocking:
        parts.append(f"{'/'.join(metals_restocking)} 库存累积，价格下行压力")

    if industry is not None:
        industry_name, avg_impact, _ = industry
        if avg_impact <= -0.1:
            parts.append(f"{industry_name} 板块短期承压")
        elif avg_impact >= 0.1:
            parts.append(f"{industry_name} 板块短期偏多")

    if not parts:
        return None
    return f"综合判读：{'，'.join(parts)}。"


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def build_alt_data_narrative(
    manager: "AltDataManager",
    *,
    timeframe: str = "7d",
    ticker_industry: Optional[str] = None,
) -> AltDataNarrative:
    """Build a deterministic 2-3 sentence narrative from ``manager`` state.

    Reads:

    - ``manager.latest_signals`` (already populated from on-disk snapshots
      by ``AltDataManager._bootstrap_from_snapshots``)
    - ``manager.get_records(category, timeframe)`` for per-source counts

    Writes: nothing -- the function is pure aside from reading the
    snapshot directory mtime via :func:`_component_last_refresh`.

    Parameters
    ----------
    manager
        The alt-data manager instance; usually retrieved via
        ``get_alt_data_manager()`` in the endpoint.
    timeframe
        Window string passed through to :meth:`AltDataManager.get_records`.
        Default ``"7d"`` mirrors the "本周" framing in the rendered copy.
    ticker_industry
        Optional canonical industry label (one of
        :data:`ticker_industry.KNOWN_INDUSTRIES`). When supplied, the
        policy_radar source breakdown is filtered to records tagged
        with that industry and the macro_hf inventory is filtered to
        commodities relevant to that industry. If neither layer has
        coverage for the industry, the returned narrative carries the
        degraded :data:`EMPTY_INDUSTRY_NARRATIVE_SUMMARY` copy.

    Returns
    -------
    AltDataNarrative
        Frozen DTO with ``summary``, ``bullets``, ``evidence_links``, and
        ``generated_at`` populated.
    """

    bullets: List[str] = []
    evidence_links: List[Dict[str, Any]] = []

    policy_sentence, policy_evidence = _build_policy_sentence(
        manager,
        timeframe=timeframe,
        ticker_industry=ticker_industry,
    )
    if policy_sentence and policy_evidence is not None:
        bullets.append(policy_sentence)
        evidence_links.append(policy_evidence)

    macro_sentence, macro_evidence, dominant_trends = _build_macro_sentence(
        manager,
        timeframe=timeframe,
        ticker_industry=ticker_industry,
    )
    if macro_sentence and macro_evidence is not None:
        bullets.append(macro_sentence)
        evidence_links.append(macro_evidence)

    # Fund holdings is industry-agnostic — emit only on the global path so
    # an industry-scoped narrative stays focused on policy + macro context.
    if not ticker_industry:
        fund_sentence, fund_evidence = _build_fund_holdings_sentence(manager)
        if fund_sentence and fund_evidence is not None:
            bullets.append(fund_sentence)
            evidence_links.append(fund_evidence)

    # Re-derive the industry context for the cross-cutting takeaway. In
    # global mode this is the top-impact industry from the policy
    # signal; in industry-scoped mode we keep the requested label so
    # the takeaway stays coherent.
    policy_signal_payload = manager.latest_signals.get("policy_radar") or {}
    if ticker_industry:
        industry_payload = (
            policy_signal_payload.get("industry_signals", {}) or {}
        ).get(ticker_industry) if isinstance(policy_signal_payload, dict) else None
        if isinstance(industry_payload, dict):
            try:
                avg_impact = float(industry_payload.get("avg_impact", 0.0) or 0.0)
            except (TypeError, ValueError):
                avg_impact = 0.0
            signal_label = str(
                industry_payload.get("signal")
                or ("bearish" if avg_impact < 0 else "bullish")
            )
            industry = (ticker_industry, avg_impact, signal_label)
        else:
            industry = None
    else:
        industry = (
            _top_industry_impact(policy_signal_payload)
            if isinstance(policy_signal_payload, dict)
            else None
        )

    cross_sentence = _build_cross_cutting_sentence(
        industry=industry,
        dominant_trends=dominant_trends,
    )
    if cross_sentence:
        bullets.append(cross_sentence)
        # The cross-cutting takeaway is synthesised; its evidence is the
        # union of the two upstream snapshots. We point at the audit doc
        # so the consumer can hop into the per-component evidence trail.
        evidence_links.append({
            "component": "alt_data_audit",
            "snapshot_path": "docs/alt_data_audit.md",
            "verdict": "DERIVED",
            "stale": False,
            "last_refresh_at": None,
        })

    if not bullets:
        # Industry-scoped requests get a distinct empty copy so the
        # frontend can render "no industry signal" without losing the
        # general-purpose "alt-data 暂无信号" message that callers rely
        # on for the global tile.
        empty_summary = (
            EMPTY_INDUSTRY_NARRATIVE_SUMMARY if ticker_industry else EMPTY_NARRATIVE_SUMMARY
        )
        return AltDataNarrative(
            summary=empty_summary,
            bullets=[],
            evidence_links=[],
            generated_at=_utc_now_iso(),
        )

    return AltDataNarrative(
        summary=" ".join(bullets),
        bullets=list(bullets),
        evidence_links=list(evidence_links),
        generated_at=_utc_now_iso(),
    )


# ---------------------------------------------------------------------------
# Phase E4: time-series archive of narrative generations
# (implementation lives in narrative_archive.py; re-exported here for
# backward compatibility so every existing caller remains unaffected)
# ---------------------------------------------------------------------------

from .narrative_archive import (  # noqa: E402
    ARCHIVE_DEFAULT_DAYS_WINDOW,
    ARCHIVE_MAX_DAYS_WINDOW,
    ARCHIVE_MEMORY_CAP,
    ARCHIVE_ROTATE_SIZE_BYTES,
    ArchivedNarrative,
    NarrativeArchive,
    get_narrative_archive,
    reset_narrative_archive_for_tests,
)


__all__ = [
    "AltDataNarrative",
    "ArchivedNarrative",
    "ARCHIVE_DEFAULT_DAYS_WINDOW",
    "ARCHIVE_MAX_DAYS_WINDOW",
    "ARCHIVE_MEMORY_CAP",
    "ARCHIVE_ROTATE_SIZE_BYTES",
    "build_alt_data_narrative",
    "EMPTY_INDUSTRY_NARRATIVE_SUMMARY",
    "EMPTY_NARRATIVE_SUMMARY",
    "get_narrative_archive",
    "NarrativeArchive",
    "reset_narrative_archive_for_tests",
    "STALE_THRESHOLD_DAYS",
]

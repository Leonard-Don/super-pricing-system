"""Macro daily briefing composer (Phase F5 — broader-scope narrative layer).

The existing :mod:`narrative` synthesizer produces a 2-3 sentence per-snapshot
read (one policy clause + one inventory clause + one cross-cutting tie). It
intentionally only consumes ``policy_radar`` + ``macro_hf`` + an optional
``fund_holdings`` mention so the copy stays tight.

This module is the **next narrative layer above** that one: it consumes
**every alt-data provider** the manager has registered (currently 10 logical
components: policy_radar, policy_execution, supply_chain, macro_hf
LME+SHFE, people_layer, entity_resolution, governance, fund_holdings,
northbound, block_trades) plus the cross-component composite signal
detector, and emits a single 1-page macro brief that answers five
questions an analyst would otherwise have to assemble by clicking through
four GodEye tiles:

1. 政策面: 最近 N 天政策方向偏向哪些行业?
2. 资金面: 公募 + 北向 + 大宗交易，资金流共振指向哪些 sector?
3. 商品面: SHFE+LME 库存信号，哪些金属正在累库 / 去库?
4. 公司治理面: people_layer 高警惕 ticker 有哪些?
5. 综合: 哪 2-3 个跨组件高置信度信号值得本周关注?

Like :mod:`narrative`, synthesis is **strictly deterministic** — no LLM
call, no async dependency, no network I/O. Same input snapshot always
produces the same output (modulo ``generated_at``), so the FastAPI layer
can safely apply ``Cache-Control: max-age=300``.

The module exposes:

- :class:`MacroBriefing` — frozen DTO returned to the endpoint
- :func:`compose_macro_briefing` — public entry point
- :func:`macro_briefing_to_public_summary` — distillation for the
  sanitised ``data/public/alt_data_summary.json`` shape

See ``docs/alt_data_audit.md`` § 19 for the architecture writeup.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from collections import deque
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any, Deque, Dict, List, Optional, Tuple

from .composite_signal import (
    CompositeSignal,
    detect_composite_signals,
)
from .narrative import (
    _classify_inventory_record,
    _component_last_refresh,
    _is_stale,
    _provider_snapshot_path,
)

if TYPE_CHECKING:  # pragma: no cover - typing only
    from .alt_data_manager import AltDataManager


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Default lookback window for "本周" framing in the brief. Matches the
# /alt-data/narrative endpoint default so the two surfaces stay in sync.
DEFAULT_TIME_WINDOW_DAYS = 7

# Maximum number of bullets per section. The brief is a 1-page artifact;
# 2-3 bullets per section keeps the rendered tile under one screen.
MAX_SECTION_BULLETS = 3

# Cap on how many highlights the composite section names. The full composite
# layer can emit 5+ industries; the brief is meant to surface the 2-3 most
# salient cross-component agreements.
COMPOSITE_HIGHLIGHTS_LIMIT = 3

# Policy radar industry signal floor: ``|avg_impact|`` must clear this for
# a row to qualify as a policy-section bullet. Matches the cross-cutting
# threshold the narrative module uses, but exposed here so a different
# threshold can be tuned for the broader-scope brief without disturbing
# the per-component narrative.
POLICY_INDUSTRY_IMPACT_FLOOR = 0.15

# Fund holdings: only mention tickers where N ≥ this many funds hold them.
# Mirrors ``narrative._FUND_CONCENTRATION_THRESHOLD`` — 15 funds is the
# "visibly crowded" line our audit doc settled on.
FUND_CONCENTRATION_THRESHOLD = 15

# Northbound netflow: 2 亿 is the smallest move that clears intraday noise
# (see composite_signal.py). The brief surfaces inflow/outflow industries
# above this threshold.
NORTHBOUND_INDUSTRY_FLOW_FLOOR = 2.0  # CNY billions

# People layer: surface tickers with people_fragility_score ≥ this.
# 0.25 is the line our governance tile uses to flag "medium / high" risk.
PEOPLE_FRAGILITY_FLOOR = 0.25

# Empty-state copy used when no provider produced section-eligible content.
EMPTY_BRIEFING_SUMMARY = "alt-data 暂无可发布的宏观日报"


# ---------------------------------------------------------------------------
# Output dataclass
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class MacroBriefing:
    """Frozen DTO returned by :func:`compose_macro_briefing`.

    Each ``*_section`` is a list of 2-3 deterministic bullets. Lists are
    intentionally allowed to be empty when a section has no content —
    callers should render only the non-empty sections.

    Attributes
    ----------
    generated_at
        UTC ISO-8601 second-precision wall-clock stamp at synthesis time.
    time_window_days
        Lookback window the synthesis applied (mirrors
        :data:`DEFAULT_TIME_WINDOW_DAYS` by default).
    policy_section
        Bullets covering policy direction (policy_radar +
        policy_execution).
    capital_flow_section
        Bullets covering capital flows (fund_holdings + northbound +
        block_trades).
    commodity_section
        Bullets covering commodity inventory (macro_hf LME + SHFE).
    governance_section
        Bullets covering company-level governance / insider signals
        (people_layer).
    composite_section
        Bullets covering cross-component composite signals (output of
        ``composite_signal.detect_composite_signals``).
    summary_paragraph
        Rule-based "今日 alt-data 核心观察" — 3 short sentences that
        weave the strongest section reads into a single paragraph.
        Falls back to :data:`EMPTY_BRIEFING_SUMMARY` when every section
        is empty.
    evidence_links
        One link per non-empty section: ``{section, component,
        snapshot_path, stale, last_refresh_at}``. Frontends should
        treat ``snapshot_path`` as opaque — they are repo-relative
        paths into ``cache/alt_data/`` and are not fetchable client-side.
    """

    generated_at: str
    time_window_days: int
    policy_section: List[str] = field(default_factory=list)
    capital_flow_section: List[str] = field(default_factory=list)
    commodity_section: List[str] = field(default_factory=list)
    governance_section: List[str] = field(default_factory=list)
    composite_section: List[str] = field(default_factory=list)
    summary_paragraph: str = EMPTY_BRIEFING_SUMMARY
    evidence_links: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _utc_now_iso() -> str:
    return (
        datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()
    )


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
        if number != number:  # NaN
            return default
        return number
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _direction_label(value: float) -> str:
    if value <= -0.05:
        return "偏空"
    if value >= 0.05:
        return "偏多"
    return "中性"


def _build_evidence_link(
    manager: "AltDataManager", *, section: str, component: str
) -> Dict[str, Any]:
    # ``_component_last_refresh`` reads ``manager.snapshot_store.providers_dir``;
    # the export-script stub-manager pattern (see
    # ``scripts/export_public_summary.py::_build_macro_briefing``) does not
    # carry a snapshot store. Tolerate missing attributes gracefully so the
    # public-summary export path stays runnable without booting the heavy
    # provider chain.
    last_refresh: Optional[str]
    try:
        last_refresh = _component_last_refresh(manager, component)
    except AttributeError:
        last_refresh = None
    return {
        "section": section,
        "component": component,
        "snapshot_path": _provider_snapshot_path(component),
        "stale": _is_stale(last_refresh),
        "last_refresh_at": last_refresh,
    }


# ---------------------------------------------------------------------------
# Section composers — each returns (bullets, contributing_components, theme)
# where ``theme`` is a one-line summary used by ``summary_paragraph``.
# ---------------------------------------------------------------------------


def _compose_policy_section(
    manager: "AltDataManager",
) -> Tuple[List[str], List[str], Optional[str]]:
    """Bullets covering policy direction.

    Reads ``policy_radar.industry_signals`` (always the densest per-industry
    view) and ``policy_execution.chaotic_department_count`` /
    ``reversal_count``. Returns up to :data:`MAX_SECTION_BULLETS` bullets.
    """

    bullets: List[str] = []
    contributors: List[str] = []
    theme: Optional[str] = None

    policy_signal = manager.latest_signals.get("policy_radar") or {}
    industry_signals = policy_signal.get("industry_signals") or {}
    if isinstance(industry_signals, dict) and industry_signals:
        # Rank by |avg_impact| descending so the most-directional industries
        # surface first; ties broken by industry name for determinism.
        ranked: List[Tuple[str, float, int]] = []
        for industry in sorted(industry_signals.keys()):
            payload = industry_signals.get(industry)
            if not isinstance(payload, dict):
                continue
            impact = _safe_float(payload.get("avg_impact", 0.0))
            if abs(impact) < POLICY_INDUSTRY_IMPACT_FLOOR:
                continue
            mentions = _safe_int(payload.get("mentions", 0))
            ranked.append((industry, impact, mentions))
        ranked.sort(key=lambda row: (-abs(row[1]), row[0]))
        for industry, impact, mentions in ranked[:MAX_SECTION_BULLETS]:
            bullets.append(
                f"政策雷达 {industry} avg_impact={impact:+.2f} "
                f"({_direction_label(impact)}, mentions={mentions})。"
            )
        if ranked:
            top = ranked[0]
            theme = (
                f"政策面: {top[0]} avg_impact={top[1]:+.2f}"
                f" ({_direction_label(top[1])})"
            )
            contributors.append("policy_radar")

    exec_signal = manager.latest_signals.get("policy_execution") or {}
    chaotic = _safe_int(exec_signal.get("chaotic_department_count", 0))
    reversals = _safe_int(exec_signal.get("reversal_count", 0))
    if chaotic > 0 or reversals > 0:
        if len(bullets) < MAX_SECTION_BULLETS:
            bullets.append(
                f"政策执行: {chaotic} 个部门标记 chaotic、累计 {reversals} 次反转。"
            )
        contributors.append("policy_execution")
        if theme is None:
            theme = f"政策面: 执行端 {chaotic} 部门 chaotic"

    return bullets, contributors, theme


def _compose_capital_flow_section(
    manager: "AltDataManager",
) -> Tuple[List[str], List[str], Optional[str]]:
    """Bullets covering capital flows: fund_holdings + northbound + block_trades."""

    bullets: List[str] = []
    contributors: List[str] = []
    themes: List[str] = []

    fund_signal = manager.latest_signals.get("fund_holdings") or {}
    top_tickers = fund_signal.get("top_concentration_tickers") or []
    if isinstance(top_tickers, list):
        crowded: List[str] = []
        for entry in top_tickers:
            if not isinstance(entry, dict):
                continue
            fund_count = _safe_int(entry.get("holding_fund_count", 0))
            ticker = str(entry.get("ticker", "") or "").strip()
            if fund_count >= FUND_CONCENTRATION_THRESHOLD and ticker:
                crowded.append(f"{ticker}({fund_count}只)")
            if len(crowded) >= MAX_SECTION_BULLETS:
                break
        if crowded:
            bullets.append(
                f"公募集中持有: {', '.join(crowded)}。"
            )
            contributors.append("fund_holdings")
            themes.append(f"资金面: 公募聚焦 {crowded[0].split('(')[0]}")

    nb_signal = manager.latest_signals.get("northbound") or {}
    inflow_industries = nb_signal.get("top_inflow_industries") or []
    outflow_industries = nb_signal.get("top_outflow_industries") or []

    def _format_flow(entries: List[Any], *, direction: str) -> Optional[str]:
        named: List[str] = []
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            industry = str(entry.get("industry", "") or "").strip()
            netflow = _safe_float(entry.get("netbuy_cny_billion", 0.0))
            if not industry or abs(netflow) < NORTHBOUND_INDUSTRY_FLOW_FLOOR:
                continue
            named.append(f"{industry}({netflow:+.1f}亿)")
            if len(named) >= MAX_SECTION_BULLETS:
                break
        if not named:
            return None
        verb = "净流入" if direction == "inflow" else "净流出"
        return f"北向资金{verb} {', '.join(named)}"

    nb_in_clause = _format_flow(inflow_industries, direction="inflow")
    nb_out_clause = _format_flow(outflow_industries, direction="outflow")
    nb_clauses = [c for c in (nb_in_clause, nb_out_clause) if c]
    if nb_clauses and len(bullets) < MAX_SECTION_BULLETS:
        bullets.append("；".join(nb_clauses) + "。")
        contributors.append("northbound")
        if nb_in_clause:
            themes.append(f"资金面: 北向 {nb_in_clause}")

    block_signal = manager.latest_signals.get("block_trades") or {}
    block_inflow = block_signal.get("top_inflow_industries") or []
    block_outflow = block_signal.get("top_outflow_industries") or []
    if (isinstance(block_inflow, list) and block_inflow) or (
        isinstance(block_outflow, list) and block_outflow
    ):
        named_blocks: List[str] = []
        for entry in (block_inflow or [])[:2]:
            if not isinstance(entry, dict):
                continue
            industry = str(entry.get("industry", "") or "").strip()
            if industry:
                named_blocks.append(f"{industry}(承接)")
        for entry in (block_outflow or [])[:1]:
            if not isinstance(entry, dict):
                continue
            industry = str(entry.get("industry", "") or "").strip()
            if industry:
                named_blocks.append(f"{industry}(减持)")
        if named_blocks and len(bullets) < MAX_SECTION_BULLETS:
            bullets.append(f"大宗交易: {', '.join(named_blocks)}。")
            contributors.append("block_trades")

    theme = themes[0] if themes else None
    return bullets, contributors, theme


def _compose_commodity_section(
    manager: "AltDataManager",
) -> Tuple[List[str], List[str], Optional[str]]:
    """Bullets covering LME + SHFE inventory direction."""

    bullets: List[str] = []
    contributors: List[str] = []
    theme: Optional[str] = None

    macro_provider = manager.providers.get("macro_hf")
    if macro_provider is None:
        return bullets, contributors, theme

    history = list(getattr(macro_provider, "_history", []) or [])
    region_buckets: Dict[str, Dict[str, List[str]]] = {}
    seen: Dict[Tuple[str, str], str] = {}
    for record in history:
        metal, region, trend = _classify_inventory_record(record)
        if metal is None or region not in {"LME", "SHFE"} or trend == "unknown":
            continue
        if (region, metal) in seen:
            continue
        seen[(region, metal)] = trend
        region_buckets.setdefault(region, {}).setdefault(trend, []).append(metal)

    if not region_buckets:
        return bullets, contributors, theme

    contributors.append("macro_hf")

    # Per-region bullets — SHFE first since it's the live read.
    for region in ("SHFE", "LME"):
        bucket = region_buckets.get(region)
        if not bucket:
            continue
        parts: List[str] = []
        for trend in sorted(bucket.keys()):
            metals = sorted(set(bucket[trend]))
            if not metals:
                continue
            label = {"destocking": "去化", "restocking": "累积", "stable": "持稳"}.get(
                trend, trend
            )
            parts.append(f"{'/'.join(metals)} {label}")
        if parts and len(bullets) < MAX_SECTION_BULLETS:
            bullets.append(f"{region} 库存: {'；'.join(parts)}。")

    # Cross-region agreement bullet — when SHFE + LME both call the same
    # metal destocking it's worth flagging explicitly because it removes
    # the "proxy vs live" ambiguity that the narrative tile carries.
    per_metal: Dict[str, set] = {}
    for region, bucket in region_buckets.items():
        for trend, metals in bucket.items():
            for metal in metals:
                per_metal.setdefault(metal, set()).add(trend)
    agreed_destock = sorted(
        metal for metal, trends in per_metal.items() if trends == {"destocking"}
    )
    agreed_restock = sorted(
        metal for metal, trends in per_metal.items() if trends == {"restocking"}
    )
    cross_parts: List[str] = []
    if agreed_destock:
        cross_parts.append(f"{'/'.join(agreed_destock)} 双侧去化")
    if agreed_restock:
        cross_parts.append(f"{'/'.join(agreed_restock)} 双侧累积")
    if cross_parts and len(bullets) < MAX_SECTION_BULLETS:
        bullets.append(f"跨区共振: {', '.join(cross_parts)}。")
        theme = "商品面: " + cross_parts[0]
    elif bullets and theme is None:
        # Fall back to the SHFE / LME single-region summary for the theme.
        theme = "商品面: " + bullets[0].rstrip("。")

    return bullets, contributors, theme


def _compose_governance_section(
    manager: "AltDataManager",
) -> Tuple[List[str], List[str], Optional[str]]:
    """Bullets covering people_layer fragile companies."""

    bullets: List[str] = []
    contributors: List[str] = []
    theme: Optional[str] = None

    people_signal = manager.latest_signals.get("people_layer") or {}
    fragile = people_signal.get("fragile_companies") or []
    if not isinstance(fragile, list):
        return bullets, contributors, theme

    high_risk: List[Tuple[str, float, str]] = []
    for entry in fragile:
        if not isinstance(entry, dict):
            continue
        score = _safe_float(entry.get("people_fragility_score", 0.0))
        if score < PEOPLE_FRAGILITY_FLOOR:
            continue
        symbol = str(entry.get("symbol", "") or "").strip()
        risk = str(entry.get("risk_level", "") or "").strip() or "—"
        if symbol:
            high_risk.append((symbol, score, risk))

    if not high_risk:
        return bullets, contributors, theme

    high_risk.sort(key=lambda row: (-row[1], row[0]))
    named: List[str] = []
    for symbol, score, risk in high_risk[:MAX_SECTION_BULLETS]:
        named.append(f"{symbol}(脆弱度{score:.2f}, {risk})")
    bullets.append(f"高警惕公司: {', '.join(named)}。")

    avg_fragility = _safe_float(people_signal.get("avg_fragility_score", 0.0))
    fragile_count = _safe_int(people_signal.get("fragile_company_count", 0))
    if fragile_count > 0 and len(bullets) < MAX_SECTION_BULLETS:
        bullets.append(
            f"治理面板: 共 {fragile_count} 家脆弱、平均脆弱度 {avg_fragility:.2f}。"
        )

    contributors.append("people_layer")
    theme = f"治理面: {high_risk[0][0]} 脆弱度 {high_risk[0][1]:.2f}"
    return bullets, contributors, theme


def _compose_composite_section(
    manager: "AltDataManager",
    *,
    composites: Optional[List[CompositeSignal]] = None,
) -> Tuple[List[str], List[str], Optional[str]]:
    """Bullets covering cross-component composite signals."""

    bullets: List[str] = []
    contributors: List[str] = []
    theme: Optional[str] = None

    if composites is None:
        try:
            composites = detect_composite_signals(manager, include_low=False)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Failed to detect composite signals for brief: %s", exc)
            composites = []

    if not composites:
        return bullets, contributors, theme

    contributors.append("composite_signals")
    for signal in composites[:COMPOSITE_HIGHLIGHTS_LIMIT]:
        components = [
            sc.component for sc in signal.supporting_components
        ]
        direction_label = "看多" if signal.direction == "bullish" else "看空"
        bullets.append(
            f"{signal.target} {direction_label} ({signal.conviction.upper()}, "
            f"{len(components)} 组件: {', '.join(components)})。"
        )
    top = composites[0]
    top_components = ", ".join(
        sc.component for sc in top.supporting_components[:3]
    )
    theme = (
        f"综合面: {top.target} {('看多' if top.direction == 'bullish' else '看空')}"
        f" ({top.conviction.upper()}, 支撑: {top_components})"
    )
    return bullets, contributors, theme


# ---------------------------------------------------------------------------
# Summary paragraph
# ---------------------------------------------------------------------------


def _compose_summary_paragraph(themes: List[str]) -> str:
    """Weave up to three section themes into a 3-sentence paragraph."""

    themes = [t for t in themes if t]
    if not themes:
        return EMPTY_BRIEFING_SUMMARY
    sentences: List[str] = []
    for theme in themes[:3]:
        sentences.append(theme + "。")
    # Always lead with the "今日 alt-data 核心观察:" framing so the brief
    # opens with a predictable headline an analyst can grep.
    return "今日 alt-data 核心观察: " + " ".join(sentences)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def compose_macro_briefing(
    manager: "AltDataManager",
    *,
    time_window_days: int = DEFAULT_TIME_WINDOW_DAYS,
) -> MacroBriefing:
    """Compose a deterministic 5-section macro briefing from ``manager`` state.

    Reads every provider's ``latest_signals`` + the composite signal
    detector. The function is **side-effect free** — it does not call the
    refresh path, does not write to disk, and does not retain state across
    invocations. The output is suitable for a 5-min HTTP cache.

    Parameters
    ----------
    manager
        Live ``AltDataManager``. Tests can pass a duck-typed object that
        exposes ``latest_signals`` and ``providers`` (mirrors the contract
        used by :func:`composite_signal.detect_composite_signals`).
    time_window_days
        Lookback window framing. Stored on the output but currently does
        not affect signal aggregation (per-provider signals already
        carry the latest snapshot view). The field is preserved for
        forward-compatibility with a planned policy/macro lookback
        narrowing.

    Returns
    -------
    MacroBriefing
        Frozen DTO with all sections + summary + evidence_links
        populated. Empty sections are returned as empty lists; the
        summary falls back to :data:`EMPTY_BRIEFING_SUMMARY` only when
        every section came back empty.
    """

    if manager is None:
        return MacroBriefing(
            generated_at=_utc_now_iso(),
            time_window_days=int(time_window_days),
            summary_paragraph=EMPTY_BRIEFING_SUMMARY,
        )

    if time_window_days <= 0:
        time_window_days = DEFAULT_TIME_WINDOW_DAYS

    # Detect composites once so the section composer + summary share output.
    try:
        composites = detect_composite_signals(manager, include_low=False)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Failed to detect composite signals: %s", exc)
        composites = []

    policy_bullets, policy_contribs, policy_theme = _compose_policy_section(manager)
    capital_bullets, capital_contribs, capital_theme = _compose_capital_flow_section(
        manager
    )
    commodity_bullets, commodity_contribs, commodity_theme = (
        _compose_commodity_section(manager)
    )
    governance_bullets, governance_contribs, governance_theme = (
        _compose_governance_section(manager)
    )
    composite_bullets, composite_contribs, composite_theme = _compose_composite_section(
        manager, composites=composites
    )

    # Evidence links — one row per contributing component per section. We
    # de-dupe per (section, component) so the same provider doesn't show
    # up twice in a section, but the same provider may appear in two
    # different sections (e.g. policy_radar in policy + composite).
    evidence_links: List[Dict[str, Any]] = []
    seen_links: set = set()

    def _add_links(section: str, contributors: List[str]) -> None:
        for component in contributors:
            key = (section, component)
            if key in seen_links:
                continue
            seen_links.add(key)
            # composite_signals is synthetic; point at the audit doc.
            if component == "composite_signals":
                evidence_links.append(
                    {
                        "section": section,
                        "component": component,
                        "snapshot_path": "docs/alt_data_audit.md",
                        "stale": False,
                        "last_refresh_at": None,
                    }
                )
                continue
            evidence_links.append(
                _build_evidence_link(manager, section=section, component=component)
            )

    _add_links("policy", policy_contribs)
    _add_links("capital_flow", capital_contribs)
    _add_links("commodity", commodity_contribs)
    _add_links("governance", governance_contribs)
    _add_links("composite", composite_contribs)

    # Summary paragraph: weave up to three section themes. We prioritise
    # composite > policy > commodity > capital > governance because the
    # composite layer is the most informative cross-cutting takeaway.
    themes_in_order = [
        composite_theme,
        policy_theme,
        commodity_theme,
        capital_theme,
        governance_theme,
    ]
    summary_paragraph = _compose_summary_paragraph(themes_in_order)

    return MacroBriefing(
        generated_at=_utc_now_iso(),
        time_window_days=int(time_window_days),
        policy_section=policy_bullets,
        capital_flow_section=capital_bullets,
        commodity_section=commodity_bullets,
        governance_section=governance_bullets,
        composite_section=composite_bullets,
        summary_paragraph=summary_paragraph,
        evidence_links=evidence_links,
    )


def macro_briefing_to_public_summary(
    briefing: MacroBriefing,
) -> Dict[str, Any]:
    """Distill a :class:`MacroBriefing` for ``data/public/alt_data_summary.json``.

    Only the safe-to-publish fields make the trip — ``summary_paragraph``
    and one ``top_3_themes`` entry per non-empty section. Evidence links
    and per-bullet snapshot paths stay private since they reference the
    runtime cache directory.
    """

    top_3_themes: List[Dict[str, str]] = []

    def _first_bullet(section: str, bullets: List[str]) -> Optional[Dict[str, str]]:
        if not bullets:
            return None
        return {"section": section, "headline": bullets[0]}

    for section, bullets in (
        ("policy", briefing.policy_section),
        ("capital_flow", briefing.capital_flow_section),
        ("commodity", briefing.commodity_section),
        ("governance", briefing.governance_section),
        ("composite", briefing.composite_section),
    ):
        entry = _first_bullet(section, bullets)
        if entry is not None:
            top_3_themes.append(entry)
        if len(top_3_themes) >= 3:
            break

    return {
        "summary_paragraph": briefing.summary_paragraph,
        "top_3_themes": top_3_themes,
        "time_window_days": briefing.time_window_days,
        "generated_at": briefing.generated_at,
    }


# ---------------------------------------------------------------------------
# Phase F5.2: time-series archive of macro briefing generations
# ---------------------------------------------------------------------------


# JSONL archive default path. Lives next to the narrative archive and
# composite-signal archive under ``cache/alt_data/`` so it inherits the
# same on-disk hygiene + git-ignore rules already in place for runtime
# caches.
_DEFAULT_ARCHIVE_PATH_REL = (
    Path("cache") / "alt_data" / "macro_briefing_history.jsonl"
)

# Rotation threshold: roll the JSONL once it grows past this many bytes.
# 10 MB matches the E4 narrative + F4.1 composite archives so the on-disk
# hygiene story is uniform. Each macro briefing row is ~1.5-3 KB after
# JSON encoding (5 sections of bullets + summary_paragraph + evidence
# links in UTF-8 Chinese), so 10 MB buys ~3500-6700 entries before
# rotation — comfortably more than a year of hourly emissions even when
# the dashboard polls aggressively.
ARCHIVE_ROTATE_SIZE_BYTES = 10 * 1024 * 1024

# In-memory cap so a hot-path read never materialises every line on disk.
# Older reads fall through to the on-disk JSONL and stream lazily. We pick
# 100 (vs the narrative archive's 200) because each briefing row carries
# five denormalised section lists plus a redundant summary_paragraph and
# evidence_links payload — keeping the deque cap a little tighter avoids
# a memory blow-up in a long-running process.
ARCHIVE_MEMORY_CAP = 100

# Hard maximum the endpoint will honour for the ``days`` query string.
ARCHIVE_DEFAULT_DAYS_WINDOW = 14
ARCHIVE_MAX_DAYS_WINDOW = 90


def _archive_default_path() -> Path:
    """Return the repo-relative default archive path.

    Resolved lazily so test code can monkey-patch it (and so importing
    this module never touches the filesystem). Anchors to the project
    root via the same ``parents[3]`` jump used by
    ``governance.PROJECT_ROOT`` so the path is identical regardless of
    cwd.
    """

    project_root = Path(__file__).resolve().parents[3]
    return project_root / _DEFAULT_ARCHIVE_PATH_REL


def _parse_archive_timestamp(value: Optional[str]) -> Optional[datetime]:
    """Parse an archive timestamp; tolerates missing tz by treating as UTC."""

    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


@dataclass(frozen=True)
class ArchivedMacroBriefing:
    """One archived macro briefing entry.

    Mirrors the surface that the frontend needs to render a Timeline view
    without dragging along the composer's internal mutable
    :class:`MacroBriefing` dataclass. ``original_generated_at`` preserves
    the composer stamp from :attr:`MacroBriefing.generated_at` so two
    appends derived from the same snapshot stay distinguishable from the
    wall-clock ``archived_at`` field.

    All 5 section lists from the source briefing are preserved verbatim
    so the F5.1 day-over-day delta layer can reconstruct yesterday's
    briefing from this archive (which is the whole motivation for the
    F5.2 phase). ``evidence_links_count`` is denormalised onto the row
    so the history endpoint can show "本日有 5 条证据链接" without
    forcing every consumer to scan ``evidence_links`` end-to-end. The
    full ``evidence_links`` payload itself is preserved too so the
    reconstructed yesterday briefing carries its provenance.
    """

    archived_at: str
    time_window_days: int
    policy_section: List[str] = field(default_factory=list)
    capital_flow_section: List[str] = field(default_factory=list)
    commodity_section: List[str] = field(default_factory=list)
    governance_section: List[str] = field(default_factory=list)
    composite_section: List[str] = field(default_factory=list)
    summary_paragraph: str = ""
    evidence_links: List[Dict[str, Any]] = field(default_factory=list)
    evidence_links_count: int = 0
    original_generated_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        payload = asdict(self)
        # Re-compute the denormalised counter at serialisation time so a
        # mismatch between stored ``evidence_links_count`` and the actual
        # list length cannot leak through the endpoint.
        payload["evidence_links_count"] = len(self.evidence_links)
        return payload

    @classmethod
    def from_dict(cls, payload: Dict[str, Any]) -> "ArchivedMacroBriefing":
        def _coerce_section(value: Any) -> List[str]:
            if not isinstance(value, list):
                return []
            return [str(item) for item in value]

        links_raw = payload.get("evidence_links")
        evidence_links: List[Dict[str, Any]] = (
            [dict(link) for link in links_raw if isinstance(link, dict)]
            if isinstance(links_raw, list)
            else []
        )
        try:
            time_window_days = int(payload.get("time_window_days", 0) or 0)
        except (TypeError, ValueError):
            time_window_days = 0
        try:
            evidence_count = int(payload.get("evidence_links_count", 0) or 0)
        except (TypeError, ValueError):
            evidence_count = 0
        # The denormalised counter can drift if a row was hand-edited; the
        # actual list length wins on reload.
        if evidence_count != len(evidence_links):
            evidence_count = len(evidence_links)
        return cls(
            archived_at=str(payload.get("archived_at") or ""),
            time_window_days=time_window_days,
            policy_section=_coerce_section(payload.get("policy_section")),
            capital_flow_section=_coerce_section(
                payload.get("capital_flow_section")
            ),
            commodity_section=_coerce_section(payload.get("commodity_section")),
            governance_section=_coerce_section(payload.get("governance_section")),
            composite_section=_coerce_section(payload.get("composite_section")),
            summary_paragraph=str(payload.get("summary_paragraph") or ""),
            evidence_links=evidence_links,
            evidence_links_count=evidence_count,
            original_generated_at=str(payload.get("original_generated_at") or ""),
        )

    def to_macro_briefing(self) -> MacroBriefing:
        """Materialise the archived row back into a live :class:`MacroBriefing`.

        Used by the F5.1 delta endpoint's yesterday reconstruction path
        (see ``backend.app.api.v1.endpoints.alt_data._compose_yesterday_briefing``).
        ``generated_at`` echoes ``original_generated_at`` so the
        downstream delta layer's ``yesterday_generated_at`` field
        points at the *composer* stamp rather than the *archive* stamp.
        """

        return MacroBriefing(
            generated_at=self.original_generated_at or self.archived_at,
            time_window_days=self.time_window_days,
            policy_section=list(self.policy_section),
            capital_flow_section=list(self.capital_flow_section),
            commodity_section=list(self.commodity_section),
            governance_section=list(self.governance_section),
            composite_section=list(self.composite_section),
            summary_paragraph=self.summary_paragraph,
            evidence_links=[dict(link) for link in self.evidence_links],
        )


class MacroBriefingArchive:
    """JSONL-backed archive of macro briefing generations.

    Mirrors :class:`src.data.alternative.narrative.NarrativeArchive` and
    :class:`src.data.alternative.composite_signal.CompositeSignalArchive`
    1:1 so the on-disk hygiene story is identical across the three
    Phase E4-style archives. See the module-level constants for the
    rotation threshold and memory cap.

    Persistence strategy
    --------------------

    Each call to :meth:`append` writes one JSON document followed by a
    newline. The file is opened with ``O_APPEND`` so concurrent writers
    cannot interleave bytes mid-record. The write is followed by an
    ``fsync`` so a crash never leaves a partial line behind (a partial
    line is still possible if power is yanked between the write and the
    fsync, but :meth:`recent` skips malformed lines with a warning so
    the archive degrades gracefully rather than blowing up the
    endpoint).

    Rotation
    --------

    Before each append we check the file size. Once it crosses
    :data:`ARCHIVE_ROTATE_SIZE_BYTES`, we ``rename`` it to
    ``macro_briefing_history.jsonl.<utc-iso>.archive`` and start a fresh
    file. :meth:`recent` only reads the live file -- archived rolls are
    out of band until an operator manually merges them.

    Memory cap
    ----------

    The instance keeps the most recent :data:`ARCHIVE_MEMORY_CAP`
    entries in a ``deque`` for hot-path reads. Anything older than that
    is read from disk via a forward scan whose results are filtered to
    the requested window. This keeps a long-running process from
    accumulating an unbounded list while still serving the common-case
    14-day window from RAM.
    """

    def __init__(
        self,
        storage_path: Optional[Path] = None,
        *,
        rotate_size_bytes: int = ARCHIVE_ROTATE_SIZE_BYTES,
        memory_cap: int = ARCHIVE_MEMORY_CAP,
    ) -> None:
        self.storage_path = (
            Path(storage_path) if storage_path else _archive_default_path()
        )
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        self.rotate_size_bytes = max(int(rotate_size_bytes), 1)
        self._memory_cap = max(int(memory_cap), 1)
        self._lock = threading.RLock()
        self._memory: Deque[ArchivedMacroBriefing] = deque(
            maxlen=self._memory_cap
        )
        self._memory_seeded = False
        self._observed_disk_signature: Optional[Tuple[int, int, int]] = None

    # ---- Internal helpers ----

    @staticmethod
    def _stat_signature(stat_result: os.stat_result) -> Tuple[int, int, int]:
        """Return a compact file identity used to detect external appends."""

        mtime_ns = getattr(
            stat_result,
            "st_mtime_ns",
            int(getattr(stat_result, "st_mtime", 0.0) * 1_000_000_000),
        )
        return (
            int(getattr(stat_result, "st_ino", 0)),
            int(getattr(stat_result, "st_size", 0)),
            int(mtime_ns),
        )

    def _current_disk_signature(self) -> Optional[Tuple[int, int, int]]:
        try:
            return self._stat_signature(self.storage_path.stat())
        except FileNotFoundError:
            return None
        except OSError as exc:
            logger.warning(
                "Failed to stat macro briefing archive %s: %s",
                self.storage_path,
                exc,
            )
            return None

    def _seed_memory_from_disk(self) -> None:
        """Lazily pre-populate the in-memory deque from the tail of the file."""

        if self._memory_seeded:
            return
        self._memory_seeded = True
        if not self.storage_path.exists():
            self._observed_disk_signature = None
            return
        tail: List[ArchivedMacroBriefing] = []
        try:
            with self.storage_path.open("r", encoding="utf-8") as handle:
                for line in handle:
                    stripped = line.strip()
                    if not stripped:
                        continue
                    try:
                        payload = json.loads(stripped)
                    except json.JSONDecodeError:
                        logger.warning(
                            "Skipping malformed line in %s while seeding memory",
                            self.storage_path,
                        )
                        continue
                    if not isinstance(payload, dict):
                        continue
                    tail.append(ArchivedMacroBriefing.from_dict(payload))
        except OSError as exc:
            logger.warning(
                "Failed to seed macro briefing archive memory from %s: %s",
                self.storage_path,
                exc,
            )
            return
        for entry in tail[-self._memory_cap :]:
            self._memory.append(entry)
        self._observed_disk_signature = self._current_disk_signature()

    def _maybe_rotate(self) -> None:
        """Roll the JSONL once it crosses :attr:`rotate_size_bytes`."""

        try:
            size = (
                self.storage_path.stat().st_size if self.storage_path.exists() else 0
            )
        except OSError as exc:
            logger.warning(
                "Failed to stat macro briefing archive %s for rotation: %s",
                self.storage_path,
                exc,
            )
            return
        if size < self.rotate_size_bytes:
            return
        timestamp = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        rolled = self.storage_path.with_name(
            f"{self.storage_path.name}.{timestamp}.archive"
        )
        try:
            self.storage_path.rename(rolled)
            logger.info(
                "Rotated macro briefing archive %s -> %s (size=%d bytes)",
                self.storage_path,
                rolled,
                size,
            )
        except OSError as exc:
            logger.warning(
                "Failed to rotate macro briefing archive %s: %s",
                self.storage_path,
                exc,
            )

    @staticmethod
    def _is_empty_briefing(briefing: MacroBriefing) -> bool:
        """Return True when every section is empty.

        Empty briefings -- the ``EMPTY_BRIEFING_SUMMARY`` cold-start
        response -- are *not* persisted: a timeline of "no signal" rows
        is uninformative and only inflates the log. This mirrors the E4
        narrative archive's "skip empty bullets" policy.
        """

        for section in (
            briefing.policy_section,
            briefing.capital_flow_section,
            briefing.commodity_section,
            briefing.governance_section,
            briefing.composite_section,
        ):
            if section:
                return False
        return True

    # ---- Public API ----

    def append(self, briefing: MacroBriefing) -> ArchivedMacroBriefing:
        """Append ``briefing`` to the JSONL and to the in-memory deque.

        Empty briefings (every section empty) are skipped per the
        documented policy. The returned :class:`ArchivedMacroBriefing`
        still carries the synthesised wall-clock + the original
        composer stamp so callers can mirror it onto their own UI state
        without re-reading the file.
        """

        with self._lock:
            self._seed_memory_from_disk()

            archived_at = _utc_now_iso()
            entry = ArchivedMacroBriefing(
                archived_at=archived_at,
                time_window_days=int(briefing.time_window_days or 0),
                policy_section=list(briefing.policy_section),
                capital_flow_section=list(briefing.capital_flow_section),
                commodity_section=list(briefing.commodity_section),
                governance_section=list(briefing.governance_section),
                composite_section=list(briefing.composite_section),
                summary_paragraph=str(briefing.summary_paragraph or ""),
                evidence_links=[dict(link) for link in briefing.evidence_links],
                evidence_links_count=len(briefing.evidence_links),
                original_generated_at=str(briefing.generated_at or archived_at),
            )

            if self._is_empty_briefing(briefing):
                # Return the materialised entry so the endpoint can mirror
                # it into its own response shape, but do not write it to
                # disk and do not push it onto the in-memory deque -- the
                # frontend timeline view would only render an empty card.
                return entry

            self._maybe_rotate()

            payload = json.dumps(
                entry.to_dict(), ensure_ascii=False, default=str
            )
            flags = os.O_WRONLY | os.O_CREAT | os.O_APPEND
            try:
                fd = os.open(str(self.storage_path), flags, 0o644)
            except OSError as exc:
                logger.warning(
                    "Failed to open macro briefing archive %s for append: %s",
                    self.storage_path,
                    exc,
                )
                self._memory.append(entry)
                return entry
            try:
                os.write(fd, (payload + "\n").encode("utf-8"))
                os.fsync(fd)
                self._observed_disk_signature = self._stat_signature(
                    os.fstat(fd)
                )
            except OSError as exc:
                logger.warning(
                    "Failed to append to macro briefing archive %s: %s",
                    self.storage_path,
                    exc,
                )
            finally:
                os.close(fd)

            self._memory.append(entry)
            return entry

    def recent(
        self,
        *,
        days: int = ARCHIVE_DEFAULT_DAYS_WINDOW,
        time_window_days: Optional[int] = None,
        now: Optional[datetime] = None,
    ) -> List[ArchivedMacroBriefing]:
        """Return archive entries from the last ``days`` days.

        ``time_window_days`` (exact-match against the stored
        ``time_window_days`` carried on each row) is an optional filter
        applied *after* the time-window cutoff. A ``None`` value
        disables the filter -- the common case is to return every
        briefing regardless of which composer window produced it.

        Reads newest-first; malformed lines are logged + skipped so a
        single corrupt row cannot break the endpoint.
        """

        days = max(int(days), 1)
        days = min(days, ARCHIVE_MAX_DAYS_WINDOW)
        reference = now or datetime.now(tz=timezone.utc)
        if reference.tzinfo is None:
            reference = reference.replace(tzinfo=timezone.utc)
        cutoff = reference - timedelta(days=days)

        with self._lock:
            self._seed_memory_from_disk()
            all_entries: List[ArchivedMacroBriefing] = list(self._memory)
            disk_signature = self._current_disk_signature()
            disk_changed = disk_signature != self._observed_disk_signature
            if len(all_entries) >= self._memory_cap or disk_changed:
                disk_tail = self._read_disk_after(cutoff)
                seen_keys = {
                    self._entry_identity(entry) for entry in all_entries
                }
                missing_entries: List[ArchivedMacroBriefing] = []
                for entry in disk_tail:
                    key = self._entry_identity(entry)
                    if key in seen_keys:
                        continue
                    seen_keys.add(key)
                    missing_entries.append(entry)
                    all_entries.append(entry)
                if disk_changed:
                    for entry in missing_entries:
                        self._memory.append(entry)
                    self._observed_disk_signature = disk_signature

        results: List[ArchivedMacroBriefing] = []
        for entry in all_entries:
            entry_at = _parse_archive_timestamp(entry.archived_at)
            if entry_at is None or entry_at < cutoff:
                continue
            if time_window_days is not None and entry.time_window_days != int(
                time_window_days
            ):
                continue
            results.append(entry)
        results.sort(key=lambda e: e.archived_at, reverse=True)
        return results

    def find_for_date(
        self,
        *,
        target_date: datetime,
    ) -> Optional[ArchivedMacroBriefing]:
        """Return the most-recent archived briefing whose UTC date matches.

        Used by the F5.1 delta endpoint's yesterday reconstruction path:
        given ``target_date = today - 1 day`` (UTC), the helper scans the
        merged memory + disk view and returns the newest row whose
        ``archived_at`` falls on the same UTC calendar day. Returns
        ``None`` when no matching row exists, which the delta endpoint
        surfaces as ``has_baseline=False``.

        The day comparison is done in UTC. A small lookback (``+1`` day
        beyond the requested date) is used as the lower window so the
        merged view always includes the candidate row even when it
        landed near the end of the prior day.
        """

        if target_date.tzinfo is None:
            target_date = target_date.replace(tzinfo=timezone.utc)
        target_day = target_date.date()
        # Pull a small window that brackets the day so the merged memory
        # + disk read picks up the row even when memory_cap has rotated
        # past it.
        candidates = self.recent(
            days=2,
            now=target_date + timedelta(days=1, hours=12),
        )
        for entry in candidates:
            entry_at = _parse_archive_timestamp(entry.archived_at)
            if entry_at is None:
                continue
            if entry_at.date() == target_day:
                return entry
        return None

    @staticmethod
    def _entry_identity(
        entry: ArchivedMacroBriefing,
    ) -> Tuple[Any, ...]:
        """Build a collision-resistant identity for RAM/disk merge de-duping."""

        return (
            entry.archived_at,
            entry.original_generated_at,
            entry.time_window_days,
            entry.summary_paragraph,
            tuple(entry.policy_section),
            tuple(entry.capital_flow_section),
            tuple(entry.commodity_section),
            tuple(entry.governance_section),
            tuple(entry.composite_section),
        )

    def _read_disk_after(
        self, cutoff: datetime
    ) -> List[ArchivedMacroBriefing]:
        """Read every archive entry on disk whose timestamp is >= ``cutoff``."""

        if not self.storage_path.exists():
            return []
        out: List[ArchivedMacroBriefing] = []
        try:
            with self.storage_path.open("r", encoding="utf-8") as handle:
                for line in handle:
                    stripped = line.strip()
                    if not stripped:
                        continue
                    try:
                        payload = json.loads(stripped)
                    except json.JSONDecodeError:
                        logger.warning(
                            "Skipping malformed line in macro briefing archive %s",
                            self.storage_path,
                        )
                        continue
                    if not isinstance(payload, dict):
                        continue
                    entry = ArchivedMacroBriefing.from_dict(payload)
                    entry_at = _parse_archive_timestamp(entry.archived_at)
                    if entry_at is None or entry_at < cutoff:
                        continue
                    out.append(entry)
        except OSError as exc:
            logger.warning(
                "Failed to read macro briefing archive %s: %s",
                self.storage_path,
                exc,
            )
        return out


# Module-level singleton (mirrors NarrativeArchive / CompositeSignalArchive).
# Tests inject a fresh archive via ``reset_macro_briefing_archive_for_tests``.
_macro_briefing_archive: Optional[MacroBriefingArchive] = None
_archive_lock = threading.Lock()


def get_macro_briefing_archive() -> MacroBriefingArchive:
    """Return the process-wide :class:`MacroBriefingArchive` instance."""

    global _macro_briefing_archive
    if _macro_briefing_archive is None:
        with _archive_lock:
            if _macro_briefing_archive is None:
                _macro_briefing_archive = MacroBriefingArchive()
    return _macro_briefing_archive


def reset_macro_briefing_archive_for_tests(
    archive: Optional[MacroBriefingArchive] = None,
) -> None:
    """Inject a fresh :class:`MacroBriefingArchive` (test-only hook)."""

    global _macro_briefing_archive
    with _archive_lock:
        _macro_briefing_archive = archive


__all__ = [
    "ARCHIVE_DEFAULT_DAYS_WINDOW",
    "ARCHIVE_MAX_DAYS_WINDOW",
    "ARCHIVE_MEMORY_CAP",
    "ARCHIVE_ROTATE_SIZE_BYTES",
    "ArchivedMacroBriefing",
    "DEFAULT_TIME_WINDOW_DAYS",
    "EMPTY_BRIEFING_SUMMARY",
    "MacroBriefing",
    "MacroBriefingArchive",
    "compose_macro_briefing",
    "get_macro_briefing_archive",
    "macro_briefing_to_public_summary",
    "reset_macro_briefing_archive_for_tests",
]

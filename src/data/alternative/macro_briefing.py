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

import logging
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Tuple

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
# (implementation lives in macro_briefing_archive; re-exported here for
# backward compatibility so all existing callers and tests are unaffected)
# ---------------------------------------------------------------------------

from .macro_briefing_archive import (  # noqa: E402
    ARCHIVE_DEFAULT_DAYS_WINDOW,
    ARCHIVE_MAX_DAYS_WINDOW,
    ARCHIVE_MEMORY_CAP,
    ARCHIVE_ROTATE_SIZE_BYTES,
    ArchivedMacroBriefing,
    MacroBriefingArchive,
    get_macro_briefing_archive,
    reset_macro_briefing_archive_for_tests,
)

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

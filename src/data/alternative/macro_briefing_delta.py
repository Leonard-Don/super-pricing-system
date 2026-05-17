"""Day-over-day delta detection for the macro briefing (Phase F5.1).

While ``compose_macro_briefing`` answers "what does today's snapshot look
like?", traders and researchers most often want to know "what
CHANGED?" — a -0.20 → -0.39 worsening of an industry's policy avg_impact
is far more actionable than today's score in isolation.

This module sits on top of the Phase E4 narrative archive and Phase F4.1
composite-signal archive plus the in-process macro briefing composer.
Given today's and yesterday's :class:`MacroBriefing`, it emits a
:class:`MacroBriefingDelta` that walks each section's entries and
classifies the per-row diff as one of:

- ``intensified_bullish`` / ``intensified_bearish`` — magnitude grew
  while direction stayed the same.
- ``softened`` — magnitude shrank toward zero (still same direction).
- ``reversed`` — sign flipped (e.g. 偏多 → 偏空).
- ``new_today`` — present today, absent yesterday.
- ``dropped_today`` — present yesterday, absent today.

Synthesis is **strictly deterministic** — same inputs always produce the
same content fields, so the FastAPI endpoint can safely apply
``Cache-Control: max-age=300``. Unlike ``compose_macro_briefing`` this
module does **not** read providers directly: it operates on two already-
composed :class:`MacroBriefing` DTOs. The endpoint layer is responsible
for sourcing yesterday's brief either from the live composer (when the
historical snapshot is still around) or by reconstructing it from the
narrative archive.

See ``docs/alt_data_audit.md`` § 20 for the architecture writeup.
"""

from __future__ import annotations

import logging
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Tuple

from .composite_signal import detect_composite_signals
from .macro_briefing import (
    DEFAULT_TIME_WINDOW_DAYS,
    MacroBriefing,
    compose_macro_briefing,
)

if TYPE_CHECKING:  # pragma: no cover - typing only
    from .alt_data_manager import AltDataManager


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tuning constants — "actionable threshold" gates
# ---------------------------------------------------------------------------

# Minimum absolute change in ``avg_impact`` for a policy-section row to
# qualify as an actionable delta. Below this, day-to-day noise dominates
# and the diff is suppressed. Matched against the per-industry
# ``avg_impact`` (which lives in [-1, +1]). 0.05 is roughly half of the
# composer's ``POLICY_INDUSTRY_IMPACT_FLOOR=0.15`` so we surface any
# move that meaningfully reshapes a previously-emitted bullet.
POLICY_DELTA_THRESHOLD = 0.05

# Minimum absolute change (CNY billions) in industry netflow for a
# capital-flow delta to surface. 1.0 亿 = half of the composer's
# ``NORTHBOUND_INDUSTRY_FLOW_FLOOR=2.0``.
CAPITAL_FLOW_DELTA_THRESHOLD = 1.0

# Minimum absolute change in people_fragility_score for a governance
# delta to surface. 0.05 = half of the composer's
# ``PEOPLE_FRAGILITY_FLOOR=0.25``.
GOVERNANCE_DELTA_THRESHOLD = 0.05

# Conviction tier rank used to order composite-signal conviction
# transitions. Mirrors composite_signal._CONVICTION_TIER_RANK but copied
# inline so this module doesn't reach into the detector's private API.
_CONVICTION_RANK: Dict[str, int] = {"low": 1, "medium": 2, "high": 3}

# Cap on emitted deltas per section. Two-day diffs over a 5-section
# brief can balloon quickly; keep the surface bounded so the tile stays
# scannable.
MAX_DELTAS_PER_SECTION = 5

# Empty-state copy used when there is no yesterday briefing to compare
# against (cold-start day-one or first observation after a long outage).
EMPTY_DELTA_NOTE = "无昨日 briefing 可对比 (首日基线或归档缺失)"

# Empty-state copy used when both briefings exist but no row clears the
# actionable threshold. Distinct from EMPTY_DELTA_NOTE so downstream
# consumers can tell "missing baseline" apart from "stable day".
NO_CHANGE_NOTE = "昨日至今日无显著变化 (所有 delta 均在阈值内)"


# ---------------------------------------------------------------------------
# Output dataclasses
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SectionDelta:
    """One per-entry day-over-day delta within a briefing section.

    Carries enough metadata for a frontend to render a single line like
    "新能源汽车: -0.20 → -0.39 (恶化 95%)" without needing to re-parse
    the underlying bullets.

    Attributes
    ----------
    key
        Stable identity for the changed entity — industry name for
        policy / capital_flow, metal/region key for commodity, ticker
        for governance, target for composite.
    today
        Today's numeric reading (``None`` if the entity was absent
        today, i.e. a ``dropped_today`` event).
    yesterday
        Yesterday's numeric reading (``None`` if the entity was absent
        yesterday, i.e. a ``new_today`` event).
    delta
        Today − yesterday. ``None`` only when both readings are absent
        (which never happens — we'd skip such rows).
    direction
        One of ``intensified_bullish``, ``intensified_bearish``,
        ``softened_bullish``, ``softened_bearish``, ``reversed_to_bullish``,
        ``reversed_to_bearish``, ``new_today``, ``dropped_today``,
        ``stable``. ``stable`` is only used by composite-signal
        conviction transitions where there's no numeric direction.
    headline
        Human-readable Chinese summary line. The frontend can use this
        directly or substitute its own formatter.
    """

    key: str
    today: Optional[float]
    yesterday: Optional[float]
    delta: Optional[float]
    direction: str
    headline: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class MacroBriefingDelta:
    """Day-over-day delta view across all five briefing sections.

    Returned by :func:`compute_macro_briefing_delta`. Sections mirror
    :class:`MacroBriefing` 1:1 so consumers can iterate the two DTOs
    in lockstep. ``summary_delta`` is a single-paragraph rule-based
    weave of the most-actionable per-section change, intentionally
    distinct from :attr:`MacroBriefing.summary_paragraph` (today's
    snapshot) so a frontend Tab/Toggle can show both side by side.

    Attributes
    ----------
    generated_at
        UTC ISO-8601 second-precision wall-clock stamp at diff time.
    today_generated_at
        Echoed from the today briefing for traceability.
    yesterday_generated_at
        Echoed from the yesterday briefing (empty string when there
        was no yesterday baseline).
    has_baseline
        ``False`` when yesterday's briefing was unavailable; the rest
        of the fields are then empty lists and ``summary_delta`` falls
        back to :data:`EMPTY_DELTA_NOTE`.
    policy_deltas / capital_flow_deltas / commodity_deltas /
    governance_deltas / composite_deltas
        Per-section :class:`SectionDelta` lists, ordered by
        |delta| descending so the most-actionable rows surface first.
        Each list is capped at :data:`MAX_DELTAS_PER_SECTION`.
    summary_delta
        Three-sentence rule-based "今日 vs 昨日 核心变化" paragraph.
    """

    generated_at: str
    today_generated_at: str
    yesterday_generated_at: str
    has_baseline: bool
    policy_deltas: List[SectionDelta] = field(default_factory=list)
    capital_flow_deltas: List[SectionDelta] = field(default_factory=list)
    commodity_deltas: List[SectionDelta] = field(default_factory=list)
    governance_deltas: List[SectionDelta] = field(default_factory=list)
    composite_deltas: List[SectionDelta] = field(default_factory=list)
    summary_delta: str = EMPTY_DELTA_NOTE

    def to_dict(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "generated_at": self.generated_at,
            "today_generated_at": self.today_generated_at,
            "yesterday_generated_at": self.yesterday_generated_at,
            "has_baseline": self.has_baseline,
            "policy_deltas": [d.to_dict() for d in self.policy_deltas],
            "capital_flow_deltas": [
                d.to_dict() for d in self.capital_flow_deltas
            ],
            "commodity_deltas": [d.to_dict() for d in self.commodity_deltas],
            "governance_deltas": [d.to_dict() for d in self.governance_deltas],
            "composite_deltas": [d.to_dict() for d in self.composite_deltas],
            "summary_delta": self.summary_delta,
        }
        return payload


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _utc_now_iso() -> str:
    return (
        datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()
    )


# Match "<industry> avg_impact=<signed-float>" used by the policy
# composer. Industry name is anything before the literal " avg_impact=".
_POLICY_BULLET_RE = re.compile(
    r"政策雷达\s+(?P<industry>.+?)\s+avg_impact="
    r"(?P<impact>[+-]?\d+(?:\.\d+)?)"
)

# Capital-flow industry block formatted as "<industry>(<+/-X.Y>亿)" —
# the composer emits one such block per industry inside a 北向资金
# bullet. We match all of them out of a single bullet line.
_NB_INDUSTRY_BLOCK_RE = re.compile(
    r"(?P<industry>[^,;。\s(（]+?)\("
    r"(?P<netflow>[+-]?\d+(?:\.\d+)?)亿\)"
)

# Governance bullet formatted as "<ticker>(脆弱度<score>, <risk>)".
_GOVERNANCE_BLOCK_RE = re.compile(
    r"(?P<ticker>[A-Za-z0-9.\-]+)\(脆弱度"
    r"(?P<score>\d+(?:\.\d+)?)"
)

# Commodity bullet formatted as "<region> 库存: <metals> <label>" and
# the cross-region "<metals> 双侧<label>".
_COMMODITY_REGION_RE = re.compile(
    r"^(?P<region>SHFE|LME)\s+库存:\s*(?P<body>.+?)。\s*$"
)
_COMMODITY_CROSS_RE = re.compile(
    r"^跨区共振:\s*(?P<body>.+?)。\s*$"
)


def _parse_policy_section(
    bullets: List[str],
) -> Dict[str, float]:
    """Extract ``{industry: avg_impact}`` mapping from policy bullets.

    Only rows whose composer-emitted shape we recognise contribute; the
    optional ``政策执行`` summary bullet (no per-industry payload) is
    silently skipped.
    """

    out: Dict[str, float] = {}
    for bullet in bullets or []:
        match = _POLICY_BULLET_RE.search(bullet)
        if match is None:
            continue
        industry = match.group("industry").strip()
        try:
            impact = float(match.group("impact"))
        except (TypeError, ValueError):
            continue
        if industry:
            out[industry] = impact
    return out


def _parse_capital_flow_section(
    bullets: List[str],
) -> Dict[str, float]:
    """Extract ``{industry: netflow_cny_billion}`` mapping from northbound bullets.

    Recognises both inflow and outflow phrasings — the composer joins
    them with "；" so a single bullet may yield multiple industries.
    Other capital-flow bullets (fund_holdings ticker concentration,
    block_trades 承接/减持) do not carry numeric per-industry signals
    in their bullet text and are not surfaced here. We deliberately keep
    the capital-flow delta surface narrow rather than parsing dense
    Chinese phrasing into structured rows.
    """

    out: Dict[str, float] = {}
    for bullet in bullets or []:
        # Only consider 北向资金 bullets — fund_holdings and
        # block_trades bullets share the section but use different
        # phrasing.
        if "北向资金" not in bullet:
            continue
        for match in _NB_INDUSTRY_BLOCK_RE.finditer(bullet):
            industry = match.group("industry").strip()
            try:
                netflow = float(match.group("netflow"))
            except (TypeError, ValueError):
                continue
            if industry:
                out[industry] = netflow
    return out


def _parse_governance_section(
    bullets: List[str],
) -> Dict[str, float]:
    """Extract ``{ticker: fragility_score}`` mapping from governance bullets."""

    out: Dict[str, float] = {}
    for bullet in bullets or []:
        if "脆弱度" not in bullet:
            continue
        for match in _GOVERNANCE_BLOCK_RE.finditer(bullet):
            ticker = match.group("ticker").strip()
            try:
                score = float(match.group("score"))
            except (TypeError, ValueError):
                continue
            if ticker:
                out[ticker] = score
    return out


def _parse_commodity_section(
    bullets: List[str],
) -> Dict[str, str]:
    """Extract ``{<region>:<metal>: trend_label}`` mapping from commodity bullets.

    Trend labels are kept as the composer-emitted Chinese strings
    ("去化" / "累积" / "持稳") so the diff layer can compare them as
    opaque tokens. Cross-region bullets contribute under a synthetic
    ``CROSS`` region key.
    """

    out: Dict[str, str] = {}
    for bullet in bullets or []:
        bullet_stripped = bullet.strip()
        region_match = _COMMODITY_REGION_RE.match(bullet_stripped)
        if region_match is not None:
            region = region_match.group("region")
            body = region_match.group("body")
            for clause in body.split("；"):
                clause = clause.strip()
                if not clause:
                    continue
                parts = clause.rsplit(" ", 1)
                if len(parts) != 2:
                    continue
                metals_blob, label = parts
                label = label.strip()
                for metal in metals_blob.split("/"):
                    metal = metal.strip()
                    if metal and label:
                        out[f"{region}:{metal}"] = label
            continue
        cross_match = _COMMODITY_CROSS_RE.match(bullet_stripped)
        if cross_match is not None:
            body = cross_match.group("body")
            for clause in body.split(","):
                clause = clause.strip()
                if not clause:
                    continue
                # Cross-region clause shape: "<metals> 双侧去化"
                # or "<metals> 双侧累积". Split off the metals prefix.
                for marker, label in (
                    ("双侧去化", "去化"),
                    ("双侧累积", "累积"),
                ):
                    if clause.endswith(marker):
                        metals_blob = clause[: -len(marker)].strip()
                        for metal in metals_blob.split("/"):
                            metal = metal.strip()
                            if metal:
                                out[f"CROSS:{metal}"] = label
                        break
    return out


def _parse_composite_section(
    bullets: List[str],
) -> Dict[str, str]:
    """Extract ``{target: conviction_lower}`` mapping from composite bullets.

    Composer formats each composite bullet as
    ``"<target> <方向> (<CONVICTION>, N 组件: ...)"`` so the conviction
    token is the upper-cased word right after the open paren.
    """

    out: Dict[str, str] = {}
    pattern = re.compile(
        r"^(?P<target>.+?)\s+(?:看多|看空)\s+\("
        r"(?P<conviction>HIGH|MEDIUM|LOW)"
    )
    for bullet in bullets or []:
        match = pattern.match(bullet.strip())
        if match is None:
            continue
        target = match.group("target").strip()
        conviction = match.group("conviction").strip().lower()
        if target and conviction in _CONVICTION_RANK:
            out[target] = conviction
    return out


# ---------------------------------------------------------------------------
# Per-section diff builders
# ---------------------------------------------------------------------------


def _classify_numeric_direction(
    today: Optional[float], yesterday: Optional[float]
) -> str:
    """Classify a numeric day-over-day transition into a direction label."""

    if yesterday is None and today is not None:
        return "new_today"
    if today is None and yesterday is not None:
        return "dropped_today"
    if today is None or yesterday is None:
        # Both None — should never reach this branch because we skip
        # such rows upstream — but keep it defensive.
        return "stable"
    # Sign flip (one or both non-zero with opposite signs).
    if (today > 0 and yesterday < 0) or (today < 0 and yesterday > 0):
        return "reversed_to_bullish" if today > 0 else "reversed_to_bearish"
    # Same-sign comparison: intensified vs softened.
    if abs(today) >= abs(yesterday):
        return (
            "intensified_bullish" if today >= 0 else "intensified_bearish"
        )
    return "softened_bullish" if today >= 0 else "softened_bearish"


def _pct_change_label(today: float, yesterday: float) -> str:
    """Render a parenthetical magnitude descriptor for the headline.

    Uses absolute-value percent change so "-0.20 → -0.39" reads as
    "恶化 95%" rather than "-95%". When the baseline is zero, we fall
    back to a delta-only label.
    """

    if yesterday == 0:
        return f"Δ={today - yesterday:+.2f}"
    pct = abs((today - yesterday) / yesterday) * 100.0
    if today == 0 or (today * yesterday < 0):
        # Sign flip or collapse to zero: lead with the transition word.
        return f"反转 ({today - yesterday:+.2f})"
    if abs(today) > abs(yesterday):
        return f"恶化 {pct:.0f}%" if today < 0 else f"加强 {pct:.0f}%"
    return f"缓解 {pct:.0f}%" if today < 0 else f"减弱 {pct:.0f}%"


def _build_policy_deltas(
    today: Dict[str, float], yesterday: Dict[str, float]
) -> List[SectionDelta]:
    """Diff today vs yesterday policy-industry impacts."""

    deltas: List[SectionDelta] = []
    keys = set(today) | set(yesterday)
    for key in sorted(keys):  # Deterministic order pre-sort
        t_val = today.get(key)
        y_val = yesterday.get(key)
        # Threshold filter — small moves are noise.
        if t_val is not None and y_val is not None:
            if abs(t_val - y_val) < POLICY_DELTA_THRESHOLD:
                continue
        direction = _classify_numeric_direction(t_val, y_val)
        if direction == "stable":
            continue
        delta_val: Optional[float]
        if t_val is not None and y_val is not None:
            delta_val = t_val - y_val
            descriptor = _pct_change_label(t_val, y_val)
            headline = (
                f"{key}: {y_val:+.2f} → {t_val:+.2f} ({descriptor})"
            )
        elif direction == "new_today":
            delta_val = t_val  # type: ignore[assignment]
            headline = f"{key}: 新增今日 (avg_impact={t_val:+.2f})"
        else:  # dropped_today
            delta_val = -(y_val or 0.0)
            headline = f"{key}: 昨日存在已退出 (avg_impact={y_val:+.2f})"
        deltas.append(
            SectionDelta(
                key=key,
                today=t_val,
                yesterday=y_val,
                delta=delta_val,
                direction=direction,
                headline=headline,
            )
        )
    return _rank_and_cap(deltas)


def _build_capital_flow_deltas(
    today: Dict[str, float], yesterday: Dict[str, float]
) -> List[SectionDelta]:
    """Diff today vs yesterday northbound industry netflows."""

    deltas: List[SectionDelta] = []
    keys = set(today) | set(yesterday)
    for key in sorted(keys):
        t_val = today.get(key)
        y_val = yesterday.get(key)
        if t_val is not None and y_val is not None:
            if abs(t_val - y_val) < CAPITAL_FLOW_DELTA_THRESHOLD:
                continue
        direction = _classify_numeric_direction(t_val, y_val)
        if direction == "stable":
            continue
        if t_val is not None and y_val is not None:
            delta_val = t_val - y_val
            headline = (
                f"{key}: 北向 {y_val:+.1f}亿 → {t_val:+.1f}亿 "
                f"(Δ {delta_val:+.1f}亿)"
            )
        elif direction == "new_today":
            delta_val = t_val  # type: ignore[assignment]
            headline = f"{key}: 北向新增今日 ({t_val:+.1f}亿)"
        else:
            delta_val = -(y_val or 0.0)
            headline = f"{key}: 北向昨日存在已退出 ({y_val:+.1f}亿)"
        deltas.append(
            SectionDelta(
                key=key,
                today=t_val,
                yesterday=y_val,
                delta=delta_val,
                direction=direction,
                headline=headline,
            )
        )
    return _rank_and_cap(deltas)


def _build_governance_deltas(
    today: Dict[str, float], yesterday: Dict[str, float]
) -> List[SectionDelta]:
    """Diff today vs yesterday people_layer fragility scores."""

    deltas: List[SectionDelta] = []
    keys = set(today) | set(yesterday)
    for key in sorted(keys):
        t_val = today.get(key)
        y_val = yesterday.get(key)
        if t_val is not None and y_val is not None:
            if abs(t_val - y_val) < GOVERNANCE_DELTA_THRESHOLD:
                continue
        # Fragility lives in [0, 1] so there is no real "sign flip"
        # case; use the numeric classifier but the labels degrade to
        # intensified_bullish / softened_bullish which we relabel for
        # clarity in the headline.
        direction = _classify_numeric_direction(t_val, y_val)
        if direction == "stable":
            continue
        if t_val is not None and y_val is not None:
            delta_val = t_val - y_val
            verb = "恶化" if delta_val > 0 else "缓解"
            headline = (
                f"{key}: 脆弱度 {y_val:.2f} → {t_val:.2f}"
                f" ({verb} Δ{delta_val:+.2f})"
            )
        elif direction == "new_today":
            delta_val = t_val  # type: ignore[assignment]
            headline = f"{key}: 新进高警惕名单 (脆弱度 {t_val:.2f})"
        else:
            delta_val = -(y_val or 0.0)
            headline = f"{key}: 昨日高警惕已退出 (脆弱度 {y_val:.2f})"
        deltas.append(
            SectionDelta(
                key=key,
                today=t_val,
                yesterday=y_val,
                delta=delta_val,
                direction=direction,
                headline=headline,
            )
        )
    return _rank_and_cap(deltas)


def _build_commodity_deltas(
    today: Dict[str, str], yesterday: Dict[str, str]
) -> List[SectionDelta]:
    """Diff today vs yesterday region:metal trend labels.

    Commodity diffs are categorical (持稳 / 去化 / 累积), so we emit
    one delta per label transition. No threshold filter — every label
    change is meaningful at the daily cadence.
    """

    deltas: List[SectionDelta] = []
    keys = set(today) | set(yesterday)
    for key in sorted(keys):
        t_label = today.get(key)
        y_label = yesterday.get(key)
        if t_label == y_label:
            continue
        if y_label is None and t_label is not None:
            direction = "new_today"
            headline = f"{key}: 新出现 ({t_label})"
        elif t_label is None and y_label is not None:
            direction = "dropped_today"
            headline = f"{key}: 昨日存在已退出 (曾为 {y_label})"
        else:
            # Both labels present and different → categorical reversal.
            direction = "reversed_to_bullish" if t_label == "去化" else "reversed_to_bearish"
            headline = f"{key}: {y_label} → {t_label}"
        deltas.append(
            SectionDelta(
                key=key,
                today=None,
                yesterday=None,
                delta=None,
                direction=direction,
                headline=headline,
            )
        )
    return deltas[:MAX_DELTAS_PER_SECTION]


def _build_composite_deltas(
    today: Dict[str, str], yesterday: Dict[str, str]
) -> List[SectionDelta]:
    """Diff today vs yesterday composite-signal conviction tiers.

    Conviction is the categorical ranking ``low < medium < high``; we
    classify each transition as upgraded, downgraded, new, or dropped.
    """

    deltas: List[SectionDelta] = []
    keys = set(today) | set(yesterday)
    for key in sorted(keys):
        t_conv = today.get(key)
        y_conv = yesterday.get(key)
        if t_conv == y_conv:
            continue
        if y_conv is None and t_conv is not None:
            direction = "new_today"
            headline = f"{key}: 新触发复合信号 ({t_conv.upper()})"
        elif t_conv is None and y_conv is not None:
            direction = "dropped_today"
            headline = f"{key}: 昨日复合信号已消失 (曾为 {y_conv.upper()})"
        else:
            t_rank = _CONVICTION_RANK.get(t_conv or "", 0)
            y_rank = _CONVICTION_RANK.get(y_conv or "", 0)
            if t_rank > y_rank:
                direction = "intensified_bullish"
                headline = (
                    f"{key}: conviction {y_conv.upper()} → {t_conv.upper()}"
                    f" (升级)"
                )
            else:
                direction = "softened_bullish"
                headline = (
                    f"{key}: conviction {y_conv.upper()} → {t_conv.upper()}"
                    f" (降级)"
                )
        deltas.append(
            SectionDelta(
                key=key,
                today=None,
                yesterday=None,
                delta=None,
                direction=direction,
                headline=headline,
            )
        )
    return deltas[:MAX_DELTAS_PER_SECTION]


def _rank_and_cap(deltas: List[SectionDelta]) -> List[SectionDelta]:
    """Order numeric deltas by |delta| desc, then by key for stability."""

    def sort_key(item: SectionDelta) -> Tuple[float, str]:
        magnitude = abs(float(item.delta)) if item.delta is not None else 0.0
        return (-magnitude, item.key)

    deltas.sort(key=sort_key)
    return deltas[:MAX_DELTAS_PER_SECTION]


# ---------------------------------------------------------------------------
# Summary delta paragraph
# ---------------------------------------------------------------------------


def _compose_summary_delta(
    *,
    policy: List[SectionDelta],
    capital_flow: List[SectionDelta],
    commodity: List[SectionDelta],
    governance: List[SectionDelta],
    composite: List[SectionDelta],
) -> str:
    """Weave the top per-section delta into a 3-sentence paragraph."""

    fragments: List[str] = []
    # Priority order mirrors the today briefing's summary precedence
    # (composite > policy > commodity > capital > governance) so the
    # frontend sees a stable narrative order across snapshot and diff.
    if composite:
        fragments.append(f"综合面变化: {composite[0].headline}")
    if policy:
        fragments.append(f"政策面变化: {policy[0].headline}")
    if commodity:
        fragments.append(f"商品面变化: {commodity[0].headline}")
    if capital_flow:
        fragments.append(f"资金面变化: {capital_flow[0].headline}")
    if governance:
        fragments.append(f"治理面变化: {governance[0].headline}")
    if not fragments:
        return NO_CHANGE_NOTE
    return "今日 vs 昨日 核心变化: " + "。 ".join(fragments[:3]) + "。"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def compute_macro_briefing_delta(
    manager: Optional["AltDataManager"] = None,
    *,
    today_briefing: MacroBriefing,
    yesterday_briefing: Optional[MacroBriefing],
) -> MacroBriefingDelta:
    """Compute a day-over-day delta over two :class:`MacroBriefing` DTOs.

    The ``manager`` parameter is reserved for future extensions that may
    want to enrich the delta with per-provider history (e.g. show the
    snapshot path that produced a given delta row); the current
    implementation operates purely on the two briefings.

    Parameters
    ----------
    manager
        Reserved (currently unused at the diff layer). Accepted as a
        keyword-or-positional argument so the endpoint can pass through
        the live manager without adapting the call site later.
    today_briefing
        The "current" :class:`MacroBriefing` — typically the live
        composer output.
    yesterday_briefing
        The "baseline" :class:`MacroBriefing`. ``None`` triggers the
        ``has_baseline=False`` cold-start path.

    Returns
    -------
    MacroBriefingDelta
        Per-section deltas + a rule-based summary. ``generated_at``
        carries the diff wall-clock; the two ``*_generated_at`` fields
        echo the source briefings' stamps.
    """

    if today_briefing is None:
        return MacroBriefingDelta(
            generated_at=_utc_now_iso(),
            today_generated_at="",
            yesterday_generated_at="",
            has_baseline=False,
            summary_delta=EMPTY_DELTA_NOTE,
        )

    if yesterday_briefing is None:
        return MacroBriefingDelta(
            generated_at=_utc_now_iso(),
            today_generated_at=today_briefing.generated_at,
            yesterday_generated_at="",
            has_baseline=False,
            summary_delta=EMPTY_DELTA_NOTE,
        )

    # Reference the manager kw-only param to keep mypy happy without a
    # noqa pragma. The reserved-for-future-use path is documented in
    # the docstring; no code path consumes it today.
    _reserved = manager  # noqa: F841

    today_policy = _parse_policy_section(today_briefing.policy_section)
    yesterday_policy = _parse_policy_section(yesterday_briefing.policy_section)

    today_cf = _parse_capital_flow_section(today_briefing.capital_flow_section)
    yesterday_cf = _parse_capital_flow_section(
        yesterday_briefing.capital_flow_section
    )

    today_commodity = _parse_commodity_section(today_briefing.commodity_section)
    yesterday_commodity = _parse_commodity_section(
        yesterday_briefing.commodity_section
    )

    today_governance = _parse_governance_section(
        today_briefing.governance_section
    )
    yesterday_governance = _parse_governance_section(
        yesterday_briefing.governance_section
    )

    today_composite = _parse_composite_section(today_briefing.composite_section)
    yesterday_composite = _parse_composite_section(
        yesterday_briefing.composite_section
    )

    policy_deltas = _build_policy_deltas(today_policy, yesterday_policy)
    capital_deltas = _build_capital_flow_deltas(today_cf, yesterday_cf)
    commodity_deltas = _build_commodity_deltas(today_commodity, yesterday_commodity)
    governance_deltas = _build_governance_deltas(
        today_governance, yesterday_governance
    )
    composite_deltas = _build_composite_deltas(
        today_composite, yesterday_composite
    )

    summary_delta = _compose_summary_delta(
        policy=policy_deltas,
        capital_flow=capital_deltas,
        commodity=commodity_deltas,
        governance=governance_deltas,
        composite=composite_deltas,
    )

    return MacroBriefingDelta(
        generated_at=_utc_now_iso(),
        today_generated_at=today_briefing.generated_at,
        yesterday_generated_at=yesterday_briefing.generated_at,
        has_baseline=True,
        policy_deltas=policy_deltas,
        capital_flow_deltas=capital_deltas,
        commodity_deltas=commodity_deltas,
        governance_deltas=governance_deltas,
        composite_deltas=composite_deltas,
        summary_delta=summary_delta,
    )


def macro_briefing_delta_to_public_summary(
    delta: MacroBriefingDelta,
) -> Dict[str, Any]:
    """Distill a :class:`MacroBriefingDelta` for the public summary export.

    Only the safe-to-publish fields make the trip — the section-level
    headlines and the ``summary_delta`` paragraph. Per-section raw
    today/yesterday numbers stay private since they reference the
    runtime cache state.
    """

    top_deltas: List[Dict[str, str]] = []
    for section_name, section_deltas in (
        ("policy", delta.policy_deltas),
        ("capital_flow", delta.capital_flow_deltas),
        ("commodity", delta.commodity_deltas),
        ("governance", delta.governance_deltas),
        ("composite", delta.composite_deltas),
    ):
        if not section_deltas:
            continue
        top_deltas.append(
            {
                "section": section_name,
                "headline": section_deltas[0].headline,
                "direction": section_deltas[0].direction,
            }
        )
        if len(top_deltas) >= 3:
            break

    return {
        "summary_delta": delta.summary_delta,
        "top_deltas": top_deltas,
        "has_baseline": delta.has_baseline,
        "today_generated_at": delta.today_generated_at,
        "yesterday_generated_at": delta.yesterday_generated_at,
        "generated_at": delta.generated_at,
    }


# ---------------------------------------------------------------------------
# Implementation note — keeping module-level imports alive
# ---------------------------------------------------------------------------
# ``compose_macro_briefing`` and ``detect_composite_signals`` are reserved
# for the planned reconstruction path where the endpoint synthesises a
# yesterday briefing from the narrative archive + a yesterday-shaped
# stub manager. The current endpoint sources yesterday's briefing from
# the live archive replay instead. We import them here so future changes
# don't have to thread fresh imports through the helpers.
_RESERVED_COMPOSE = compose_macro_briefing
_RESERVED_DETECT = detect_composite_signals
_RESERVED_DEFAULT_WINDOW = DEFAULT_TIME_WINDOW_DAYS


__all__ = [
    "CAPITAL_FLOW_DELTA_THRESHOLD",
    "EMPTY_DELTA_NOTE",
    "GOVERNANCE_DELTA_THRESHOLD",
    "MacroBriefingDelta",
    "MAX_DELTAS_PER_SECTION",
    "NO_CHANGE_NOTE",
    "POLICY_DELTA_THRESHOLD",
    "SectionDelta",
    "compute_macro_briefing_delta",
    "macro_briefing_delta_to_public_summary",
]

"""Cross-archive theme detector (Phase F6).

Phases E4 (`narrative_history.jsonl`), F4.1
(`composite_signal_history.jsonl`) and F5.2
(`macro_briefing_history.jsonl`) each landed a JSONL time-series
archive on top of a different per-day alt-data layer. Each archive in
isolation already supports a "look back 14 days" timeline. This module
is the **synthesis layer above all three**: it scans the merged view
and surfaces the industries / sectors that appear in **multiple
archives over multiple days** — the "high-conviction long-running
narratives" we now have enough infrastructure to actually find.

The motivation is simple. A single archive can say "AI算力 was bullish
on the F4 composite signal layer 6 of the last 14 days". That's
useful, but it doesn't tell you whether the policy radar and the
deterministic macro briefing layer were also pointing at AI算力 over
the same window. When **all three** archives mention the same industry
for **3+ days each**, the cross-archive co-occurrence is the actually
high-conviction read.

Synthesis is **strictly deterministic** — no LLM call, no network
I/O, no async dependency. The detector reads the three archives via
their public ``recent(days=...)`` API, slices each archived row into
``(industry, utc-day)`` pairs, and counts cross-archive occurrences.
Same archives in → same themes out (modulo ``generated_at``), so the
FastAPI layer can safely apply ``Cache-Control: max-age=300``.

The module exposes:

- :class:`CrossArchiveTheme` — frozen DTO returned to the endpoint
- :func:`detect_themes` — public entry point
- :func:`themes_to_public_summary` — distillation for the
  sanitised ``data/public/alt_data_summary.json`` shape

See ``docs/alt_data_audit.md`` § 22 for the architecture writeup.
"""

from __future__ import annotations

import logging
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from .composite_signal_archive import (
    ArchivedCompositeSignal,
    CompositeSignalArchive,
    get_composite_signal_archive,
)
from .macro_briefing import (
    ArchivedMacroBriefing,
    MacroBriefingArchive,
    get_macro_briefing_archive,
)
from .narrative import (
    ArchivedNarrative,
    NarrativeArchive,
    get_narrative_archive,
)
from .ticker_industry import KNOWN_INDUSTRIES

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tuning constants
# ---------------------------------------------------------------------------

# Default lookback applied when callers don't pass ``days_window``. Matches
# the per-archive endpoints (E4 / F4.1 / F5.2) so the cross-archive read
# stays consistent with the underlying timelines.
DEFAULT_DAYS_WINDOW = 14

# Hard upper bound -- mirrors the per-archive ``ARCHIVE_MAX_DAYS_WINDOW``
# clamp so the FastAPI layer can validate identically without an explicit
# cross-reference.
MAX_DAYS_WINDOW = 90

# Conviction tier rules. Each tier is expressed as "(# archives, min days
# per archive)" so the rule is auditable directly from the conviction tag.
#
# HIGH: an industry shows up in all 3 archives, each ≥ 3 distinct UTC days.
#       This is the "high-conviction long-running narrative" outcome the
#       phase is named after — the signal has survived the per-day filter
#       on three independently-engineered surfaces.
# MEDIUM: an industry shows up in any 2 archives, each ≥ 3 distinct days.
#       Useful as a watchlist — one more day's appearance on the missing
#       archive promotes it to high.
# LOW: an industry appears in exactly 1 archive but persistently (≥ 5
#       distinct days). Single-archive persistence is informational only;
#       the public surface filters this out by default (``min_conviction
#       = medium``).
MIN_DAYS_PER_ARCHIVE_HIGH = 3
MIN_DAYS_PER_ARCHIVE_MEDIUM = 3
MIN_DAYS_SINGLE_ARCHIVE_LOW = 5

# Conviction rank used both for sorting and for the ``min_conviction``
# filter on the endpoint. High > medium > low > none. The string→int
# mapping is the source of truth — do not infer ordering from the
# string values themselves.
CONVICTION_RANK: Dict[str, int] = {
    "high": 3,
    "medium": 2,
    "low": 1,
}

# Bounded result cap. Each theme row is ~250 bytes after JSON encoding,
# so 30 rows keeps the public-surface payload well under 10 KB even when
# every industry hits.
MAX_THEMES = 30


# Compiled industry-extraction regex. We pre-compile a single regex per
# call site, matching any canonical industry name as a token boundary.
# Building it at module import time keeps the hot-path detector cheap.
_INDUSTRY_RE = re.compile(
    "|".join(re.escape(industry) for industry in sorted(KNOWN_INDUSTRIES))
)


# ---------------------------------------------------------------------------
# Output dataclass
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CrossArchiveTheme:
    """One cross-archive theme entry.

    Surfaces an industry that the detector saw across multiple
    archives over multiple days. The per-archive day counts are kept
    on the row so a consumer can render the "3 / 5 / 2" attribution
    without re-running the detector.

    Attributes
    ----------
    industry
        Canonical industry label (one of
        :data:`src.data.alternative.ticker_industry.KNOWN_INDUSTRIES`).
    days_in_narrative
        Number of distinct UTC days the industry appeared in the
        narrative archive (E4) over the lookback window.
    days_in_composite
        Number of distinct UTC days the industry appeared in the
        composite signal archive (F4.1) over the lookback window.
    days_in_macro_briefing
        Number of distinct UTC days the industry appeared in the
        macro briefing archive (F5.2) over the lookback window.
    first_seen
        ISO-8601 UTC string of the earliest archive entry mentioning
        the industry across any of the three archives.
    last_seen
        ISO-8601 UTC string of the most-recent archive entry
        mentioning the industry across any of the three archives.
    conviction
        One of ``high`` / ``medium`` / ``low``. Computed from the
        per-archive day counts via the tier rules documented at module
        scope.
    conviction_score
        Normalised float in ``[0, 1]`` used for ranking. Equal to
        ``conviction_rank / 3 * 0.7 + cumulative_strength * 0.3`` so
        a high-conviction theme always outranks a medium-conviction
        one even when the medium row has more days; ties break on
        cumulative day count.
    trend_direction
        ``bullish`` / ``bearish`` / ``mixed`` / ``neutral`` — read off
        the composite archive's ``direction`` field. ``mixed`` when the
        archive saw both bullish and bearish rows for the industry over
        the window. ``neutral`` when the industry never landed on the
        composite archive (NARRATIVE-only / MACRO-BRIEFING-only).
    supporting_archives
        Sorted tuple of the archive keys this industry appears in
        (subset of ``{"narrative", "composite", "macro_briefing"}``).
        Denormalised here so the endpoint payload doesn't need to
        re-derive it from the per-archive day counts.
    """

    industry: str
    days_in_narrative: int
    days_in_composite: int
    days_in_macro_briefing: int
    first_seen: str
    last_seen: str
    conviction: str
    conviction_score: float
    trend_direction: str
    supporting_archives: Tuple[str, ...] = field(default_factory=tuple)

    def to_dict(self) -> Dict[str, Any]:
        payload = asdict(self)
        # asdict() returns the tuple as-is; coerce to list so the JSON
        # encoder doesn't have to do the work and the shape is stable
        # across Python versions.
        payload["supporting_archives"] = list(self.supporting_archives)
        payload["conviction_score"] = round(float(self.conviction_score), 4)
        return payload


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    """Parse an archive timestamp; tolerates ``Z`` suffix + naive strings."""

    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _industry_from_text(text: str) -> Set[str]:
    """Extract canonical industry mentions from a free-text bullet.

    The macro briefing and narrative archives carry their industry
    references inside free-text bullets (e.g. ``"政策雷达 AI算力
    avg_impact=+0.22"``). We scan with a pre-compiled regex against
    the closed set of canonical industries -- intentionally not
    fuzzy-matching, because alias normalisation has already been done
    at the provider layer.
    """

    if not text:
        return set()
    return set(_INDUSTRY_RE.findall(text))


def _narrative_industries(entry: ArchivedNarrative) -> Set[str]:
    """Industries referenced by one archived narrative row.

    Three signals stack here: the explicit ``industry`` scope field
    (set when the row was generated via the industry-scoped narrative
    endpoint), and any canonical industry name mentioned in the
    ``summary`` paragraph or in the bullet list.
    """

    found: Set[str] = set()
    industry = (entry.industry or "").strip()
    if industry in KNOWN_INDUSTRIES:
        found.add(industry)
    found.update(_industry_from_text(entry.summary or ""))
    for bullet in entry.bullets or []:
        found.update(_industry_from_text(bullet))
    return found


def _composite_industry(entry: ArchivedCompositeSignal) -> Optional[str]:
    """Industry tied to one archived composite-signal row.

    The composite archive stores the industry verbatim under
    ``target`` when ``target_kind == 'industry'``. We do not scan
    other fields -- the detector's whole purpose is to give us a
    clean ``industry`` axis to begin with.
    """

    if entry.target_kind != "industry":
        return None
    target = (entry.target or "").strip()
    return target if target in KNOWN_INDUSTRIES else None


def _macro_briefing_industries(entry: ArchivedMacroBriefing) -> Set[str]:
    """Industries referenced anywhere across the 5 macro-briefing sections."""

    found: Set[str] = set()
    for section in (
        entry.policy_section,
        entry.capital_flow_section,
        entry.commodity_section,
        entry.governance_section,
        entry.composite_section,
    ):
        for bullet in section or []:
            found.update(_industry_from_text(bullet))
    found.update(_industry_from_text(entry.summary_paragraph or ""))
    return found


def _ts_iso(value: datetime) -> str:
    """Format a datetime as second-precision UTC ISO-8601."""

    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def _classify_conviction(
    *,
    days_narrative: int,
    days_composite: int,
    days_macro: int,
) -> Optional[str]:
    """Compute the conviction tier from per-archive day counts.

    Returns ``None`` when no tier applies, in which case the industry
    is dropped from the output set entirely (it doesn't even clear the
    LOW tier's single-archive persistence floor).
    """

    archives_with_threshold_for_high = sum(
        1
        for d in (days_narrative, days_composite, days_macro)
        if d >= MIN_DAYS_PER_ARCHIVE_HIGH
    )
    if archives_with_threshold_for_high >= 3:
        return "high"

    archives_with_threshold_for_medium = sum(
        1
        for d in (days_narrative, days_composite, days_macro)
        if d >= MIN_DAYS_PER_ARCHIVE_MEDIUM
    )
    if archives_with_threshold_for_medium >= 2:
        return "medium"

    # LOW: exactly one archive but ≥ MIN_DAYS_SINGLE_ARCHIVE_LOW days.
    days = [days_narrative, days_composite, days_macro]
    archives_present = sum(1 for d in days if d > 0)
    if archives_present == 1 and max(days) >= MIN_DAYS_SINGLE_ARCHIVE_LOW:
        return "low"

    return None


def _trend_direction_from_composite(
    directions: Iterable[str],
) -> str:
    """Reduce a stream of composite-archive directions to one tag.

    ``bullish`` / ``bearish`` when every direction agrees; ``mixed``
    when both appear; ``neutral`` when the iterable is empty (the
    industry never landed on the composite archive). Any direction we
    don't recognise is ignored.
    """

    seen: Set[str] = set()
    for direction in directions:
        clean = (direction or "").strip().lower()
        if clean in {"bullish", "bearish"}:
            seen.add(clean)
    if not seen:
        return "neutral"
    if seen == {"bullish"}:
        return "bullish"
    if seen == {"bearish"}:
        return "bearish"
    return "mixed"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def detect_themes(
    *,
    days_window: int = DEFAULT_DAYS_WINDOW,
    narrative_archive: Optional[NarrativeArchive] = None,
    composite_archive: Optional[CompositeSignalArchive] = None,
    macro_briefing_archive: Optional[MacroBriefingArchive] = None,
    now: Optional[datetime] = None,
) -> List[CrossArchiveTheme]:
    """Detect cross-archive themes over the last ``days_window`` days.

    Reads the three time-series archives via their public
    ``recent(days=N)`` API, slices each archived row into
    ``(industry, utc-day)`` pairs, and classifies each industry into
    HIGH / MEDIUM / LOW per the tier rules. The output is sorted by
    ``conviction_score`` desc (which already encodes the tier order
    plus cumulative day count), capped at :data:`MAX_THEMES`.

    Parameters
    ----------
    days_window
        Lookback window in days. Clamped to ``[1, MAX_DAYS_WINDOW]``.
    narrative_archive, composite_archive, macro_briefing_archive
        Optional explicit archive instances. Tests pass fresh tmp_path
        archives here; the default falls back to the process-wide
        singletons via the ``get_*_archive()`` accessors so the
        endpoint path doesn't have to plumb them through manually.
    now
        Reference "now" for the day-window cutoff. Tests pin this for
        deterministic assertions; production passes ``None`` and gets
        the wall clock.

    Returns
    -------
    List[CrossArchiveTheme]
        Themes sorted newest-strongest first. Empty list when no
        industry clears even the LOW tier.
    """

    days_window = max(int(days_window), 1)
    days_window = min(days_window, MAX_DAYS_WINDOW)

    narrative_archive = narrative_archive or get_narrative_archive()
    composite_archive = composite_archive or get_composite_signal_archive()
    macro_briefing_archive = (
        macro_briefing_archive or get_macro_briefing_archive()
    )

    # Per-archive lookups are wrapped in defensive try/except so a single
    # archive being unavailable (a fresh deployment that hasn't run any
    # endpoint yet) only suppresses its own contribution, not the whole
    # detector.
    try:
        narrative_entries = narrative_archive.recent(days=days_window, now=now)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "Failed to read narrative archive for cross-archive themes: %s",
            exc,
            exc_info=True,
        )
        narrative_entries = []

    try:
        composite_entries = composite_archive.recent(days=days_window, now=now)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "Failed to read composite archive for cross-archive themes: %s",
            exc,
            exc_info=True,
        )
        composite_entries = []

    try:
        macro_entries = macro_briefing_archive.recent(days=days_window, now=now)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "Failed to read macro briefing archive for cross-archive themes: %s",
            exc,
            exc_info=True,
        )
        macro_entries = []

    # Per-archive ``(industry → set[utc-day])`` maps so we never double-count
    # multiple intra-day appends of the same industry on the same archive.
    narrative_days: Dict[str, Set[str]] = {}
    composite_days: Dict[str, Set[str]] = {}
    macro_days: Dict[str, Set[str]] = {}

    # Track first/last seen timestamps per industry across all archives.
    first_seen: Dict[str, datetime] = {}
    last_seen: Dict[str, datetime] = {}

    # Composite direction stream per industry (only the composite archive
    # carries a direction signal, so the trend tag only reads from it).
    composite_directions: Dict[str, List[str]] = {}

    def _record_industry(
        per_archive_map: Dict[str, Set[str]],
        industry: str,
        archived_at: Optional[datetime],
    ) -> None:
        if archived_at is None:
            return
        day_key = archived_at.astimezone(timezone.utc).date().isoformat()
        per_archive_map.setdefault(industry, set()).add(day_key)
        prior_first = first_seen.get(industry)
        if prior_first is None or archived_at < prior_first:
            first_seen[industry] = archived_at
        prior_last = last_seen.get(industry)
        if prior_last is None or archived_at > prior_last:
            last_seen[industry] = archived_at

    for entry in narrative_entries:
        archived_at = _parse_iso(entry.archived_at)
        for industry in _narrative_industries(entry):
            _record_industry(narrative_days, industry, archived_at)

    for entry in composite_entries:
        industry = _composite_industry(entry)
        if industry is None:
            continue
        archived_at = _parse_iso(entry.archived_at)
        _record_industry(composite_days, industry, archived_at)
        composite_directions.setdefault(industry, []).append(entry.direction or "")

    for entry in macro_entries:
        archived_at = _parse_iso(entry.archived_at)
        for industry in _macro_briefing_industries(entry):
            _record_industry(macro_days, industry, archived_at)

    all_industries = (
        set(narrative_days.keys())
        | set(composite_days.keys())
        | set(macro_days.keys())
    )

    themes: List[CrossArchiveTheme] = []
    for industry in sorted(all_industries):
        d_narr = len(narrative_days.get(industry, set()))
        d_comp = len(composite_days.get(industry, set()))
        d_macro = len(macro_days.get(industry, set()))
        conviction = _classify_conviction(
            days_narrative=d_narr,
            days_composite=d_comp,
            days_macro=d_macro,
        )
        if conviction is None:
            continue

        # Cumulative day count is the secondary ranking signal -- a HIGH
        # theme with 9 cumulative days outranks a HIGH theme with 6.
        cumulative_days = d_narr + d_comp + d_macro
        rank = CONVICTION_RANK.get(conviction, 0)
        # Normalise cumulative days into [0, 1] by dividing by 3 *
        # days_window (the theoretical max). This guarantees the
        # contribution from cumulative_days can never flip a tier
        # ordering since rank/3 jumps by ~0.33 between adjacent tiers.
        normalised_days = min(
            cumulative_days / max(3 * days_window, 1), 1.0
        )
        conviction_score = rank / 3.0 * 0.7 + normalised_days * 0.3

        supporting_archives: List[str] = []
        if d_narr > 0:
            supporting_archives.append("narrative")
        if d_comp > 0:
            supporting_archives.append("composite")
        if d_macro > 0:
            supporting_archives.append("macro_briefing")

        first_ts = first_seen.get(industry)
        last_ts = last_seen.get(industry)
        trend = _trend_direction_from_composite(
            composite_directions.get(industry, [])
        )

        themes.append(
            CrossArchiveTheme(
                industry=industry,
                days_in_narrative=d_narr,
                days_in_composite=d_comp,
                days_in_macro_briefing=d_macro,
                first_seen=_ts_iso(first_ts) if first_ts else "",
                last_seen=_ts_iso(last_ts) if last_ts else "",
                conviction=conviction,
                conviction_score=conviction_score,
                trend_direction=trend,
                supporting_archives=tuple(supporting_archives),
            )
        )

    # Sort by conviction_score desc; ties break by cumulative day count
    # desc then by industry name asc so the order is deterministic.
    themes.sort(
        key=lambda t: (
            -t.conviction_score,
            -(t.days_in_narrative + t.days_in_composite + t.days_in_macro_briefing),
            t.industry,
        )
    )
    return themes[:MAX_THEMES]


def themes_to_public_summary(
    themes: List[CrossArchiveTheme],
) -> Dict[str, Any]:
    """Distill a list of themes for ``data/public/alt_data_summary.json``.

    Returns the top-3 HIGH-conviction + top-3 MEDIUM-conviction themes
    in a stable shape suitable for the committed public summary.
    Each themed row carries only the fields safe to publish: industry,
    conviction, days_visible (cumulative across archives) and
    supporting_archives.
    """

    high_rows: List[Dict[str, Any]] = []
    medium_rows: List[Dict[str, Any]] = []

    for theme in themes:
        row = {
            "industry": theme.industry,
            "conviction": theme.conviction,
            "days_visible": (
                theme.days_in_narrative
                + theme.days_in_composite
                + theme.days_in_macro_briefing
            ),
            "supporting_archives": list(theme.supporting_archives),
            "trend_direction": theme.trend_direction,
        }
        if theme.conviction == "high" and len(high_rows) < 3:
            high_rows.append(row)
        elif theme.conviction == "medium" and len(medium_rows) < 3:
            medium_rows.append(row)

    return {
        "top_3_high_conviction": high_rows,
        "top_3_medium_conviction": medium_rows,
        "total_high_conviction": sum(
            1 for t in themes if t.conviction == "high"
        ),
        "total_medium_conviction": sum(
            1 for t in themes if t.conviction == "medium"
        ),
        "total_low_conviction": sum(
            1 for t in themes if t.conviction == "low"
        ),
    }


__all__ = [
    "CONVICTION_RANK",
    "CrossArchiveTheme",
    "DEFAULT_DAYS_WINDOW",
    "MAX_DAYS_WINDOW",
    "MAX_THEMES",
    "MIN_DAYS_PER_ARCHIVE_HIGH",
    "MIN_DAYS_PER_ARCHIVE_MEDIUM",
    "MIN_DAYS_SINGLE_ARCHIVE_LOW",
    "detect_themes",
    "themes_to_public_summary",
]

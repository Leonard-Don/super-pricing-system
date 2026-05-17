"""Cross-component composite signal detector (Phase F4).

The 9 alt-data providers (`policy_radar`, `policy_execution`, `supply_chain`,
`macro_hf`, `people_layer`, `fund_holdings`, `northbound`, and the
`shfe_inventory` / `lme_inventory` sub-feeds underneath `macro_hf`)
each live behind their own subpackage and surface their own signal
shape. Until now they have only been read individually. This module
turns them into a single **cross-component composite signal** layer:
when 3+ independent providers agree on a direction for the same target
(an industry, today), we emit a :class:`CompositeSignal` whose
``supporting_components`` carries the per-provider strength snapshot
that justified the call.

The synthesizer is intentionally **read-only** across providers — no
callback into any provider's pipeline — and **idempotent** for a given
input snapshot, so the FastAPI endpoint and the public-summary export
can both call it without coordinating state. See
``docs/alt_data_audit.md`` § 17 for the architecture writeup.
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
from typing import Any, Deque, Dict, List, Optional, Tuple

from .narrative import _canonical_metal  # type: ignore[attr-defined]
from .ticker_industry import INDUSTRY_RELEVANT_METALS, KNOWN_INDUSTRIES

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tuning constants
# ---------------------------------------------------------------------------

# A component is considered to have a **direction** (bullish / bearish) for an
# industry only when its component-specific strength exceeds these absolute
# thresholds. Sub-threshold magnitudes are reported as ``neutral`` and do not
# contribute to the agreement count.
POLICY_IMPACT_BULLISH_THRESHOLD = 0.20
POLICY_IMPACT_BEARISH_THRESHOLD = -0.20

# Northbound: industry-level netflow lives in ``top_inflow_industries`` /
# ``top_outflow_industries`` in CNY billions. 2 亿 is the smallest move that
# clears intraday noise (~5% of a typical industry daily flow). 5 亿 is
# our "strong" threshold so high-conviction emissions need real flow.
NORTHBOUND_INDUSTRY_BULLISH_THRESHOLD = 2.0  # CNY billions
NORTHBOUND_INDUSTRY_BEARISH_THRESHOLD = -2.0
NORTHBOUND_INDUSTRY_STRONG_THRESHOLD = 5.0  # |netflow| ≥ this is "strong"

# Fund holdings: concentration only counts as bullish when the aggregate
# score per industry exceeds this. Bearish doesn't apply here (concentration
# is a one-sided signal — funds piling in is bullish, but absence of funds
# isn't bearish).
FUND_HOLDINGS_BULLISH_THRESHOLD = 0.35
FUND_HOLDINGS_STRONG_THRESHOLD = 0.55

# Macro HF inventory: destocking ≡ bullish for industries that consume that
# metal; restocking ≡ bearish. We require at least 1 metal per industry to
# point the same way before counting macro_hf as agreeing.
MACRO_HF_STRONG_MIN_METALS = 2  # 2+ metals all destocking → "strong"

# SHFE inventory mirrors macro_hf at the live-feed level. We piggyback on the
# same record set since both flow through ``macro_hf`` records.

# People layer: bullish if a supportive_companies stance exists for a ticker
# mapped to the industry; bearish if a fragile stance exists. Strong = score
# above this absolute threshold on the fragility/quality axis.
PEOPLE_LAYER_STRONG_THRESHOLD = 0.30

# Supply chain: investment_activity / project_pipeline / talent_structure
# need to clear this absolute score before they count.
SUPPLY_CHAIN_THRESHOLD = 0.15

# Conviction tiers based on number of agreeing components.
CONVICTION_LEVELS = ("low", "medium", "high")
MIN_COMPONENTS_FOR_HIGH = 4  # 4+ components and all "strong"
MIN_COMPONENTS_FOR_MEDIUM = 3
MIN_COMPONENTS_FOR_LOW = 2


# Component details are useful in the live endpoint, but they must never become
# an accidental carrier for provider runtime cache paths or raw snapshot rows.
_REDACTED_COMPONENT_DETAIL = "[redacted internal detail]"
_INTERNAL_DETAIL_MARKERS = (
    "cache/alt_data",
    "cache\\alt_data",
    "snapshot_path",
    "provider_info",
    "refresh_status",
    "raw_value",
    "record_payload",
    '"records"',
    "'records'",
    "records=[",
    "records: [",
    "/private/",
    "/users/",
    "/var/folders/",
    "file://",
)
_PUBLIC_SUPPORTING_COMPONENT_KEYS = (
    "component",
    "direction",
    "signal_strength",
    "is_strong",
    "detail",
)


def _sanitize_component_detail(detail: Any) -> str:
    text = str(detail or "")
    lowered = text.lower()
    if any(marker in lowered for marker in _INTERNAL_DETAIL_MARKERS):
        return _REDACTED_COMPONENT_DETAIL
    return text


def _sanitize_supporting_component_payload(
    component: Dict[str, Any],
) -> Dict[str, Any]:
    payload = {
        key: component.get(key)
        for key in _PUBLIC_SUPPORTING_COMPONENT_KEYS
        if key in component
    }
    if "detail" in payload:
        payload["detail"] = _sanitize_component_detail(payload.get("detail"))
    return payload


# ---------------------------------------------------------------------------
# Dataclass
# ---------------------------------------------------------------------------


@dataclass
class SupportingComponent:
    """Per-component contribution to a composite signal."""

    component: str
    direction: str  # "bullish" / "bearish" / "neutral"
    signal_strength: float
    is_strong: bool = False
    detail: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "component": self.component,
            "direction": self.direction,
            "signal_strength": round(float(self.signal_strength), 4),
            "is_strong": bool(self.is_strong),
            "detail": _sanitize_component_detail(self.detail),
        }


@dataclass
class CompositeSignal:
    """Cross-component composite signal.

    Emitted when 2+ providers point the same direction for the same target
    (an industry today; ticker support is reserved for a future phase).
    Conviction is derived from the number of agreeing components and whether
    each one cleared its component-specific "strong" threshold.
    """

    direction: str  # "bullish" / "bearish"
    target_kind: str  # "industry" / "ticker"
    target: str
    conviction: str  # "high" / "medium" / "low"
    supporting_components: List[SupportingComponent] = field(default_factory=list)
    emit_at: str = ""
    aggregate_strength: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "direction": self.direction,
            "target_kind": self.target_kind,
            "target": self.target,
            "conviction": self.conviction,
            "supporting_components": [
                component.to_dict() for component in self.supporting_components
            ],
            "supporting_components_count": len(self.supporting_components),
            "aggregate_strength": round(float(self.aggregate_strength), 4),
            "emit_at": self.emit_at,
        }


# ---------------------------------------------------------------------------
# Per-component readers — extract per-industry direction + strength
# ---------------------------------------------------------------------------


def _read_policy_radar_for_industry(
    manager: Any, industry: str
) -> Optional[SupportingComponent]:
    """policy_radar contribution: industry_signals[industry].avg_impact."""

    signal = (manager.latest_signals or {}).get("policy_radar") or {}
    industry_signals = signal.get("industry_signals") or {}
    if not isinstance(industry_signals, dict):
        return None
    payload = industry_signals.get(industry)
    if not isinstance(payload, dict):
        return None
    avg_impact = float(payload.get("avg_impact", 0.0) or 0.0)
    if avg_impact >= POLICY_IMPACT_BULLISH_THRESHOLD:
        direction = "bullish"
    elif avg_impact <= POLICY_IMPACT_BEARISH_THRESHOLD:
        direction = "bearish"
    else:
        return None  # Neutral — do not contribute
    is_strong = abs(avg_impact) >= 0.30
    return SupportingComponent(
        component="policy_radar",
        direction=direction,
        signal_strength=abs(avg_impact),
        is_strong=is_strong,
        detail=(
            f"avg_impact={avg_impact:+.3f}; mentions="
            f"{int(payload.get('mentions', 0) or 0)}"
        ),
    )


def _read_policy_execution_for_industry(
    manager: Any, industry: str
) -> Optional[SupportingComponent]:
    """policy_execution: re-uses policy_radar's per-industry tilt when execution
    department records exist and the avg_impact is meaningful.

    This component is essentially a confirmation signal — when policy_execution
    has fresh records it amplifies whatever policy_radar already says about
    the industry. We only count it as a contributor when it has its own
    record_count > 0 to avoid double-counting an empty execution feed.
    """

    signal = (manager.latest_signals or {}).get("policy_execution") or {}
    record_count = int(signal.get("record_count", 0) or 0)
    if record_count <= 0:
        return None

    # Same per-industry tilt source as policy_radar (execution_status drives
    # confirmation, not a separate per-industry score). We use policy_radar's
    # industry_signals as the directional indicator and use execution's
    # record_count + chaos to scale the strength.
    policy_signal = (manager.latest_signals or {}).get("policy_radar") or {}
    industry_signals = policy_signal.get("industry_signals") or {}
    if not isinstance(industry_signals, dict):
        return None
    payload = industry_signals.get(industry)
    if not isinstance(payload, dict):
        return None
    avg_impact = float(payload.get("avg_impact", 0.0) or 0.0)
    if avg_impact >= POLICY_IMPACT_BULLISH_THRESHOLD:
        direction = "bullish"
    elif avg_impact <= POLICY_IMPACT_BEARISH_THRESHOLD:
        direction = "bearish"
    else:
        return None
    # Execution amplifies but the source is policy_radar — flag is_strong only
    # if both impact AND execution record count are non-trivial.
    is_strong = abs(avg_impact) >= 0.30 and record_count >= 3
    return SupportingComponent(
        component="policy_execution",
        direction=direction,
        signal_strength=abs(avg_impact),
        is_strong=is_strong,
        detail=(
            f"records={record_count}; aligns_with_policy_radar=true"
        ),
    )


def _read_northbound_for_industry(
    manager: Any, industry: str
) -> Optional[SupportingComponent]:
    """northbound: industry-level netflow lookup."""

    signal = (manager.latest_signals or {}).get("northbound") or {}
    inflow = signal.get("top_inflow_industries") or []
    outflow = signal.get("top_outflow_industries") or []
    netflow_billion: Optional[float] = None
    for entry in inflow + outflow:
        if isinstance(entry, dict) and str(entry.get("industry") or "") == industry:
            try:
                netflow_billion = float(entry.get("netbuy_cny_billion", 0.0) or 0.0)
            except (TypeError, ValueError):
                netflow_billion = None
            break
    if netflow_billion is None:
        return None

    if netflow_billion >= NORTHBOUND_INDUSTRY_BULLISH_THRESHOLD:
        direction = "bullish"
    elif netflow_billion <= NORTHBOUND_INDUSTRY_BEARISH_THRESHOLD:
        direction = "bearish"
    else:
        return None
    is_strong = abs(netflow_billion) >= NORTHBOUND_INDUSTRY_STRONG_THRESHOLD
    return SupportingComponent(
        component="northbound",
        direction=direction,
        signal_strength=min(abs(netflow_billion) / 50.0, 1.0),
        is_strong=is_strong,
        detail=f"industry_netflow_cny_billion={netflow_billion:+.2f}",
    )


def _read_fund_holdings_for_industry(
    manager: Any, industry: str
) -> Optional[SupportingComponent]:
    """fund_holdings: industry contribution via ticker → industry mapping.

    We aggregate the top_concentration_tickers leaderboard by resolving each
    ticker to its alt-data industry label (via the static fallback in
    ``ticker_industry``) and summing the per-ticker total_aum_weight_pct.
    """

    from .ticker_industry import _TICKER_INDUSTRY_FALLBACK  # type: ignore[attr-defined]

    signal = (manager.latest_signals or {}).get("fund_holdings") or {}
    leaderboard = signal.get("top_concentration_tickers") or []
    if not isinstance(leaderboard, list):
        return None

    industry_aum_weight = 0.0
    matched_tickers: List[str] = []
    for entry in leaderboard:
        if not isinstance(entry, dict):
            continue
        ticker = str(entry.get("ticker") or "").strip()
        if not ticker:
            continue
        # The ticker_industry fallback uses upper-case symbols and code suffixes;
        # try both the normalised form and the raw form.
        for candidate in (ticker.upper(), ticker):
            if _TICKER_INDUSTRY_FALLBACK.get(candidate) == industry:
                try:
                    industry_aum_weight += float(
                        entry.get("total_aum_weight_pct", 0.0) or 0.0
                    )
                except (TypeError, ValueError):
                    continue
                matched_tickers.append(ticker)
                break

    if industry_aum_weight < FUND_HOLDINGS_BULLISH_THRESHOLD:
        return None
    is_strong = industry_aum_weight >= FUND_HOLDINGS_STRONG_THRESHOLD
    return SupportingComponent(
        component="fund_holdings",
        direction="bullish",  # concentration is one-sided
        signal_strength=min(industry_aum_weight, 1.0),
        is_strong=is_strong,
        detail=(
            f"summed_aum_weight_pct={industry_aum_weight:.3f}; "
            f"tickers={','.join(matched_tickers[:3])}"
        ),
    )


def _read_macro_hf_for_industry(
    manager: Any, industry: str
) -> Optional[SupportingComponent]:
    """macro_hf: inventory destocking/restocking for industry-relevant metals.

    Uses the same ``INDUSTRY_RELEVANT_METALS`` mapping that the alt-data
    narrative consults. When the relevant metals are predominantly destocking,
    we treat that as bullish (lower inventory implies higher prices, which
    helps producers / hurts heavy consumers — but in the A-share
    "industry equities" frame the dominant industries here are *producers*).
    Restocking ≡ bearish.
    """

    relevant_metals = INDUSTRY_RELEVANT_METALS.get(industry)
    if not relevant_metals:
        return None

    # Pull macro_hf records from the provider's history.
    provider = (manager.providers or {}).get("macro_hf")
    if provider is None:
        return None
    history = getattr(provider, "_history", []) or []
    # De-dupe on metal — first sighting wins (history is newest-first).
    metal_trends: Dict[str, str] = {}
    for record in history:
        raw = getattr(record, "raw_value", None) or {}
        if not isinstance(raw, dict):
            continue
        if raw.get("data_type") not in {"inventory", None}:
            # Only inventory records carry destocking/restocking
            continue
        metal_label = raw.get("name") or raw.get("metal") or ""
        metal = _canonical_metal(str(metal_label))
        if not metal or metal not in relevant_metals:
            continue
        trend = str(raw.get("trend") or "unknown")
        if trend in {"unknown", ""}:
            continue
        metal_trends.setdefault(metal, trend)

    if not metal_trends:
        return None
    destocking = [m for m, t in metal_trends.items() if t == "destocking"]
    restocking = [m for m, t in metal_trends.items() if t == "restocking"]
    if destocking and not restocking:
        direction = "bullish"
        strength = min(len(destocking) / 3.0, 1.0)
        is_strong = len(destocking) >= MACRO_HF_STRONG_MIN_METALS
        metals_repr = "/".join(sorted(destocking))
    elif restocking and not destocking:
        direction = "bearish"
        strength = min(len(restocking) / 3.0, 1.0)
        is_strong = len(restocking) >= MACRO_HF_STRONG_MIN_METALS
        metals_repr = "/".join(sorted(restocking))
    else:
        # Mixed signal — skip rather than emit conflicting half-truth
        return None
    return SupportingComponent(
        component="macro_hf",
        direction=direction,
        signal_strength=strength,
        is_strong=is_strong,
        detail=(
            f"metals={metals_repr}; "
            f"trend={'destocking' if direction == 'bullish' else 'restocking'}"
        ),
    )


def _read_shfe_inventory_for_industry(
    manager: Any, industry: str
) -> Optional[SupportingComponent]:
    """shfe_inventory: SHFE-region inventory subset of macro_hf.

    We separate the SHFE live reads from the LME proxy reads so a strong
    SHFE-only call doesn't piggyback on a weaker LME signal (and vice versa).
    """

    relevant_metals = INDUSTRY_RELEVANT_METALS.get(industry)
    if not relevant_metals:
        return None
    provider = (manager.providers or {}).get("macro_hf")
    if provider is None:
        return None
    history = getattr(provider, "_history", []) or []
    metal_trends: Dict[str, str] = {}
    for record in history:
        source = str(getattr(record, "source", "") or "").lower()
        metadata = getattr(record, "metadata", None) or {}
        if not isinstance(metadata, dict):
            metadata = {}
        is_shfe = (
            "shfe" in source
            or str(metadata.get("region", "")).upper() == "SHFE"
        )
        if not is_shfe:
            continue
        raw = getattr(record, "raw_value", None) or {}
        if not isinstance(raw, dict):
            continue
        metal_label = raw.get("name") or raw.get("metal") or ""
        metal = _canonical_metal(str(metal_label))
        if not metal or metal not in relevant_metals:
            continue
        trend = str(raw.get("trend") or "unknown")
        if trend in {"unknown", ""}:
            continue
        metal_trends.setdefault(metal, trend)
    if not metal_trends:
        return None
    destocking = [m for m, t in metal_trends.items() if t == "destocking"]
    restocking = [m for m, t in metal_trends.items() if t == "restocking"]
    if destocking and not restocking:
        direction = "bullish"
        strength = min(len(destocking) / 2.0, 1.0)
        is_strong = len(destocking) >= MACRO_HF_STRONG_MIN_METALS
    elif restocking and not destocking:
        direction = "bearish"
        strength = min(len(restocking) / 2.0, 1.0)
        is_strong = len(restocking) >= MACRO_HF_STRONG_MIN_METALS
    else:
        return None
    return SupportingComponent(
        component="shfe_inventory",
        direction=direction,
        signal_strength=strength,
        is_strong=is_strong,
        detail=f"shfe_live_metals={'/'.join(sorted(metal_trends.keys()))}",
    )


def _read_people_layer_for_industry(
    manager: Any, industry: str
) -> Optional[SupportingComponent]:
    """people_layer: industry mapped through fragile/supportive companies."""

    from .ticker_industry import _TICKER_INDUSTRY_FALLBACK  # type: ignore[attr-defined]

    signal = (manager.latest_signals or {}).get("people_layer") or {}
    fragile = signal.get("fragile_companies") or []
    supportive = signal.get("supportive_companies") or []
    if not isinstance(fragile, list) or not isinstance(supportive, list):
        return None

    def _company_industry_matches(entry: Dict[str, Any]) -> Optional[float]:
        symbol = str(entry.get("symbol") or "").strip().upper()
        if not symbol:
            return None
        if _TICKER_INDUSTRY_FALLBACK.get(symbol) != industry:
            return None
        try:
            return float(entry.get("people_fragility_score", 0.0) or 0.0)
        except (TypeError, ValueError):
            return None

    fragile_scores: List[float] = []
    supportive_scores: List[float] = []
    for entry in fragile:
        if not isinstance(entry, dict):
            continue
        score = _company_industry_matches(entry)
        if score is not None:
            fragile_scores.append(score)
    for entry in supportive:
        if not isinstance(entry, dict):
            continue
        score = _company_industry_matches(entry)
        if score is not None:
            supportive_scores.append(score)

    if not fragile_scores and not supportive_scores:
        return None
    if supportive_scores and not fragile_scores:
        direction = "bullish"
        score = max(supportive_scores) if supportive_scores else 0.0
    elif fragile_scores and not supportive_scores:
        direction = "bearish"
        score = max(fragile_scores) if fragile_scores else 0.0
    else:
        # Mixed → do not emit
        return None
    is_strong = score >= PEOPLE_LAYER_STRONG_THRESHOLD
    detail = (
        f"supportive_count={len(supportive_scores)}; "
        f"fragile_count={len(fragile_scores)}"
    )
    return SupportingComponent(
        component="people_layer",
        direction=direction,
        signal_strength=score,
        is_strong=is_strong,
        detail=detail,
    )


def _read_supply_chain_for_industry(
    manager: Any, industry: str
) -> Optional[SupportingComponent]:
    """supply_chain: aggregate per-industry score from bidding / env / hiring records."""

    provider = (manager.providers or {}).get("supply_chain")
    if provider is None:
        return None
    history = getattr(provider, "_history", []) or []
    if not history:
        return None

    matched_scores: List[float] = []
    for record in history:
        raw = getattr(record, "raw_value", None) or {}
        tags = getattr(record, "tags", None) or []
        record_industry = (
            (raw.get("industry") if isinstance(raw, dict) else None) or ""
        )
        # Match either by industry tag or by industry_id (provider stores
        # English keys in raw_value['industry'] but tags[0] uses the same).
        # Try both English and Chinese alias.
        from .supply_chain.bidding_crawler import INDUSTRY_FILTERS  # type: ignore[attr-defined]

        # Build alias set: English keys (solar, wind, ...) and their Chinese
        # name (光伏, 风电, ...).
        alias_match = False
        for industry_id, meta in INDUSTRY_FILTERS.items():
            if meta.get("name") == industry:
                if record_industry == industry_id or industry_id in tags:
                    alias_match = True
                    break
        # Direct Chinese-label match in tags
        if industry in tags or record_industry == industry:
            alias_match = True
        if not alias_match:
            continue
        try:
            matched_scores.append(float(getattr(record, "normalized_score", 0.0) or 0.0))
        except (TypeError, ValueError):
            continue

    if not matched_scores:
        return None
    avg_score = sum(matched_scores) / len(matched_scores)
    if avg_score >= SUPPLY_CHAIN_THRESHOLD:
        direction = "bullish"
    elif avg_score <= -SUPPLY_CHAIN_THRESHOLD:
        direction = "bearish"
    else:
        return None
    is_strong = abs(avg_score) >= 0.30
    return SupportingComponent(
        component="supply_chain",
        direction=direction,
        signal_strength=abs(avg_score),
        is_strong=is_strong,
        detail=f"avg_score={avg_score:+.3f}; records={len(matched_scores)}",
    )


# Registry: order is the priority order in the supporting_components list.
_COMPONENT_READERS = (
    ("policy_radar", _read_policy_radar_for_industry),
    ("policy_execution", _read_policy_execution_for_industry),
    ("northbound", _read_northbound_for_industry),
    ("fund_holdings", _read_fund_holdings_for_industry),
    ("macro_hf", _read_macro_hf_for_industry),
    ("shfe_inventory", _read_shfe_inventory_for_industry),
    ("people_layer", _read_people_layer_for_industry),
    ("supply_chain", _read_supply_chain_for_industry),
)


# ---------------------------------------------------------------------------
# Industry universe assembly
# ---------------------------------------------------------------------------


def _collect_target_industries(manager: Any) -> List[str]:
    """Build the universe of industries to score.

    Start from policy_radar (which is the densest per-industry coverage we
    have) and union in any extra industries that show up in northbound's
    top-N leaderboards. We always fall back to ``KNOWN_INDUSTRIES`` so the
    detector still emits useful output when policy_radar is empty.
    """

    industries: set = set()
    policy_signal = (manager.latest_signals or {}).get("policy_radar") or {}
    industry_signals = policy_signal.get("industry_signals") or {}
    if isinstance(industry_signals, dict):
        industries.update(industry_signals.keys())
    nb_signal = (manager.latest_signals or {}).get("northbound") or {}
    for entry in (nb_signal.get("top_inflow_industries") or []):
        if isinstance(entry, dict) and entry.get("industry"):
            industries.add(str(entry["industry"]))
    for entry in (nb_signal.get("top_outflow_industries") or []):
        if isinstance(entry, dict) and entry.get("industry"):
            industries.add(str(entry["industry"]))
    # Always include the canonical industries even if no provider mentioned
    # them — keeps the output stable when caches are empty.
    industries.update(KNOWN_INDUSTRIES)
    return sorted(industries)


# ---------------------------------------------------------------------------
# Conviction classifier
# ---------------------------------------------------------------------------


def _classify_conviction(
    agreeing: List[SupportingComponent],
) -> str:
    """Return ``"high" | "medium" | "low"`` given the agreeing component list."""

    n = len(agreeing)
    strong_count = sum(1 for c in agreeing if c.is_strong)
    if n >= MIN_COMPONENTS_FOR_HIGH and strong_count == n:
        return "high"
    if n >= MIN_COMPONENTS_FOR_HIGH and strong_count >= MIN_COMPONENTS_FOR_MEDIUM:
        # 4+ agreeing but mixed strength → still high if most are strong.
        return "high"
    if n >= MIN_COMPONENTS_FOR_MEDIUM:
        return "medium"
    return "low"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def detect_composite_signals(
    manager: Any,
    *,
    include_low: bool = False,
    emit_at: Optional[str] = None,
) -> List[CompositeSignal]:
    """Synthesize cross-component composite signals from ``manager``.

    Parameters
    ----------
    manager:
        An ``AltDataManager`` (or duck-typed equivalent exposing
        ``latest_signals`` and ``providers``).
    include_low:
        When ``True`` we emit ``low``-conviction signals (2 agreeing
        components) in addition to ``medium`` / ``high``. Default is
        ``False`` because low-conviction signals are informational only.
    emit_at:
        Override for the timestamp in ``emit_at``. Defaults to current UTC.
        Tests pass a fixed value for deterministic assertions.

    Returns
    -------
    list[CompositeSignal]
        Sorted by ``conviction`` (high > medium > low) then by aggregate
        signal strength descending, then by target name for determinism.
        Two invocations on the same input return the same list — the
        detector is idempotent and side-effect free.
    """

    if manager is None:
        return []

    timestamp = emit_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    industries = _collect_target_industries(manager)
    composites: List[CompositeSignal] = []

    for industry in industries:
        contributions: List[SupportingComponent] = []
        for _name, reader in _COMPONENT_READERS:
            try:
                contribution = reader(manager, industry)
            except Exception:
                # Component readers are read-only against provider state but
                # an exotic provider may raise; treat as no-contribution.
                contribution = None
            if contribution is not None and contribution.direction in {
                "bullish",
                "bearish",
            }:
                contributions.append(contribution)

        if not contributions:
            continue

        # Partition by direction.
        bullish = [c for c in contributions if c.direction == "bullish"]
        bearish = [c for c in contributions if c.direction == "bearish"]

        # We emit a composite only when one side clearly dominates. A "mixed"
        # state where both sides hit the minimum is reported by emitting
        # nothing (the conflict tracker elsewhere is the right surface for
        # contradictory evidence).
        for direction, agreeing in (("bullish", bullish), ("bearish", bearish)):
            if len(agreeing) < MIN_COMPONENTS_FOR_LOW:
                continue
            if direction == "bullish" and len(bearish) >= MIN_COMPONENTS_FOR_LOW:
                # Conflict — skip both sides; downstream conflict tracker
                # will report it.
                continue
            if direction == "bearish" and len(bullish) >= MIN_COMPONENTS_FOR_LOW:
                continue
            conviction = _classify_conviction(agreeing)
            if not include_low and conviction == "low":
                continue
            aggregate_strength = (
                sum(c.signal_strength for c in agreeing) / len(agreeing)
            )
            composite = CompositeSignal(
                direction=direction,
                target_kind="industry",
                target=industry,
                conviction=conviction,
                supporting_components=list(agreeing),
                emit_at=timestamp,
                aggregate_strength=aggregate_strength,
            )
            composites.append(composite)

    # Sort: conviction desc (high > medium > low) → aggregate_strength desc → target asc.
    conviction_rank = {"high": 3, "medium": 2, "low": 1}
    composites.sort(
        key=lambda c: (
            -conviction_rank.get(c.conviction, 0),
            -c.aggregate_strength,
            c.target,
        )
    )
    return composites


def composite_signals_to_public_summary(
    composites: List[CompositeSignal],
    *,
    top_n: int = 3,
) -> Dict[str, Any]:
    """Distill detector output into the alt_data_summary.json shape.

    Returns ``{top_n_bullish, top_n_bearish}`` with each row carrying just
    the public-safe fields (no raw provider details — only the component
    name and per-component direction).
    """

    def _row(c: CompositeSignal) -> Dict[str, Any]:
        return {
            "industry": c.target,
            "direction": c.direction,
            "conviction": c.conviction,
            "supporting_components_count": len(c.supporting_components),
            "supporting_components": [
                sc.component for sc in c.supporting_components
            ],
            "aggregate_strength": round(float(c.aggregate_strength), 4),
        }

    bullish = [c for c in composites if c.direction == "bullish"]
    bearish = [c for c in composites if c.direction == "bearish"]
    return {
        f"top_{top_n}_bullish": [_row(c) for c in bullish[:top_n]],
        f"top_{top_n}_bearish": [_row(c) for c in bearish[:top_n]],
        "total_bullish": len(bullish),
        "total_bearish": len(bearish),
    }


# ---------------------------------------------------------------------------
# Phase F4.1: time-series archive of composite-signal generations
# ---------------------------------------------------------------------------


# JSONL archive default path. Lives next to the narrative archive under
# ``cache/alt_data/`` so it inherits the same on-disk hygiene + git-ignore
# rules already in place for runtime caches.
_DEFAULT_ARCHIVE_PATH_REL = (
    Path("cache") / "alt_data" / "composite_signal_history.jsonl"
)

# Rotation threshold: roll the JSONL once it grows past this many bytes.
# 10 MB at ~400-600 bytes/row gives us ~17-25k entries before rotation,
# which is comfortably more than a year of hourly emissions even when
# each refresh fires multiple composites at once. Mirrors the narrative
# archive's threshold so on-disk hygiene is identical across the two
# Phase E4-style archives.
ARCHIVE_ROTATE_SIZE_BYTES = 10 * 1024 * 1024

# In-memory cap so a hot-path read never materialises every line on disk.
# Older reads fall through to the on-disk JSONL and stream lazily. We
# pick 100 (vs the narrative archive's 200) because each composite row
# carries a denormalised supporting_components list and therefore takes
# more RAM per entry — keeping the deque cap a little tighter avoids a
# memory blow-up in a long-running process when many high-fan-out
# composites are emitted per refresh.
ARCHIVE_MEMORY_CAP = 100

# Hard maximum the endpoint will honour for the ``days`` query string.
ARCHIVE_DEFAULT_DAYS_WINDOW = 14
ARCHIVE_MAX_DAYS_WINDOW = 90

# Conviction tier ranking used by ``recent()`` so callers can ask for
# "give me every composite at or above MEDIUM" without re-implementing
# the comparison locally.
_CONVICTION_RANK = {"high": 3, "medium": 2, "low": 1}


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


def _utc_now_iso() -> str:
    return (
        datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()
    )


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
class ArchivedCompositeSignal:
    """One archived composite-signal entry.

    Mirrors the surface that the frontend needs to render a timeline
    view without dragging along the detector's internal mutable
    ``CompositeSignal`` dataclass. ``original_emit_at`` preserves the
    detector stamp from :attr:`CompositeSignal.emit_at` so two appends
    derived from the same snapshot stay distinguishable from the
    wall-clock ``archived_at`` field.
    """

    archived_at: str
    direction: str
    target_kind: str
    target: str
    conviction: str
    supporting_components: List[Dict[str, Any]] = field(default_factory=list)
    aggregate_strength: float = 0.0
    original_emit_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        payload = asdict(self)
        # The ``supporting_components`` list is already a list-of-dicts
        # courtesy of the append-time serialisation; ``asdict`` returns
        # it as such. Round the aggregate to keep the JSON stable across
        # platform float repr drift.
        payload["supporting_components"] = [
            _sanitize_supporting_component_payload(component)
            for component in self.supporting_components
            if isinstance(component, dict)
        ]
        payload["aggregate_strength"] = round(
            float(self.aggregate_strength), 4
        )
        payload["supporting_components_count"] = len(
            payload["supporting_components"]
        )
        return payload

    @classmethod
    def from_dict(cls, payload: Dict[str, Any]) -> "ArchivedCompositeSignal":
        components_raw = payload.get("supporting_components")
        components: List[Dict[str, Any]] = (
            [
                _sanitize_supporting_component_payload(item)
                for item in components_raw
                if isinstance(item, dict)
            ]
            if isinstance(components_raw, list)
            else []
        )
        try:
            aggregate = float(payload.get("aggregate_strength", 0.0) or 0.0)
        except (TypeError, ValueError):
            aggregate = 0.0
        return cls(
            archived_at=str(payload.get("archived_at") or ""),
            direction=str(payload.get("direction") or ""),
            target_kind=str(payload.get("target_kind") or ""),
            target=str(payload.get("target") or ""),
            conviction=str(payload.get("conviction") or ""),
            supporting_components=components,
            aggregate_strength=aggregate,
            original_emit_at=str(payload.get("original_emit_at") or ""),
        )

    @property
    def industry(self) -> Optional[str]:
        """Return ``target`` when ``target_kind == 'industry'``, else ``None``."""

        return self.target if self.target_kind == "industry" else None


class CompositeSignalArchive:
    """JSONL-backed archive of composite-signal emissions.

    Mirrors :class:`src.data.alternative.narrative.NarrativeArchive` 1:1
    so the on-disk hygiene story is identical across the two
    Phase E4-style archives. See the module-level constants for the
    rotation threshold and memory cap.
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
        self._memory: Deque[ArchivedCompositeSignal] = deque(
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
                "Failed to stat composite signal archive %s: %s",
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
        tail: List[ArchivedCompositeSignal] = []
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
                    tail.append(ArchivedCompositeSignal.from_dict(payload))
        except OSError as exc:
            logger.warning(
                "Failed to seed composite signal archive memory from %s: %s",
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
                "Failed to stat composite signal archive %s for rotation: %s",
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
                "Rotated composite signal archive %s -> %s (size=%d bytes)",
                self.storage_path,
                rolled,
                size,
            )
        except OSError as exc:
            logger.warning(
                "Failed to rotate composite signal archive %s: %s",
                self.storage_path,
                exc,
            )

    # ---- Public API ----

    def append(self, signal: CompositeSignal) -> ArchivedCompositeSignal:
        """Append ``signal`` to the JSONL and to the in-memory deque.

        Returns the materialised :class:`ArchivedCompositeSignal` so callers
        can mirror it onto their own UI state without re-reading the file.
        """

        with self._lock:
            self._seed_memory_from_disk()
            self._maybe_rotate()

            archived_at = _utc_now_iso()
            components_payload: List[Dict[str, Any]] = []
            for component in signal.supporting_components or []:
                if hasattr(component, "to_dict"):
                    components_payload.append(dict(component.to_dict()))
                elif isinstance(component, dict):
                    components_payload.append(dict(component))
            entry = ArchivedCompositeSignal(
                archived_at=archived_at,
                direction=str(signal.direction or ""),
                target_kind=str(signal.target_kind or ""),
                target=str(signal.target or ""),
                conviction=str(signal.conviction or ""),
                supporting_components=components_payload,
                aggregate_strength=float(signal.aggregate_strength or 0.0),
                original_emit_at=str(signal.emit_at or archived_at),
            )

            payload = json.dumps(
                entry.to_dict(), ensure_ascii=False, default=str
            )
            flags = os.O_WRONLY | os.O_CREAT | os.O_APPEND
            try:
                fd = os.open(str(self.storage_path), flags, 0o644)
            except OSError as exc:
                logger.warning(
                    "Failed to open composite signal archive %s for append: %s",
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
                    "Failed to append to composite signal archive %s: %s",
                    self.storage_path,
                    exc,
                )
            finally:
                os.close(fd)

            self._memory.append(entry)
            return entry

    def append_many(
        self, signals: List[CompositeSignal]
    ) -> List[ArchivedCompositeSignal]:
        """Convenience: append a list of signals, skipping empty input.

        The endpoint and any scheduler hook call ``detect_composite_signals``
        and want to persist the *whole batch* in one shot. Skipping the
        empty case keeps a "no composite this refresh" run from inflating
        the on-disk log with nothing useful.
        """

        if not signals:
            return []
        return [self.append(signal) for signal in signals]

    def recent(
        self,
        *,
        days: int = ARCHIVE_DEFAULT_DAYS_WINDOW,
        industry: Optional[str] = None,
        min_conviction: Optional[str] = None,
        now: Optional[datetime] = None,
    ) -> List[ArchivedCompositeSignal]:
        """Return archive entries from the last ``days`` days.

        ``industry`` (exact-match against ``target`` when ``target_kind``
        is ``industry``) and ``min_conviction`` (one of ``high`` /
        ``medium`` / ``low``) are both applied *after* the time-window
        filter. A ``None`` / empty value disables the filter.

        Reads newest-first; malformed lines are logged + skipped so a
        single corrupt row cannot break the endpoint.
        """

        days = max(int(days), 1)
        days = min(days, ARCHIVE_MAX_DAYS_WINDOW)
        reference = now or datetime.now(tz=timezone.utc)
        if reference.tzinfo is None:
            reference = reference.replace(tzinfo=timezone.utc)
        cutoff = reference - timedelta(days=days)

        min_rank: Optional[int] = None
        if min_conviction:
            min_rank = _CONVICTION_RANK.get(str(min_conviction).lower())

        with self._lock:
            self._seed_memory_from_disk()
            all_entries: List[ArchivedCompositeSignal] = list(self._memory)
            disk_signature = self._current_disk_signature()
            disk_changed = disk_signature != self._observed_disk_signature
            if len(all_entries) >= self._memory_cap or disk_changed:
                disk_tail = self._read_disk_after(cutoff)
                seen_keys = {
                    self._entry_identity(entry) for entry in all_entries
                }
                missing_entries: List[ArchivedCompositeSignal] = []
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

        results: List[ArchivedCompositeSignal] = []
        for entry in all_entries:
            entry_at = _parse_archive_timestamp(entry.archived_at)
            if entry_at is None or entry_at < cutoff:
                continue
            if industry and entry.target != industry:
                continue
            if min_rank is not None:
                entry_rank = _CONVICTION_RANK.get(
                    str(entry.conviction).lower(), 0
                )
                if entry_rank < min_rank:
                    continue
            results.append(entry)
        results.sort(key=lambda e: e.archived_at, reverse=True)
        return results

    @staticmethod
    def _entry_identity(
        entry: ArchivedCompositeSignal,
    ) -> Tuple[Any, ...]:
        """Build a collision-resistant identity for RAM/disk merge de-duping."""

        return (
            entry.archived_at,
            entry.original_emit_at,
            entry.direction,
            entry.target_kind,
            entry.target,
            entry.conviction,
        )

    def _read_disk_after(
        self, cutoff: datetime
    ) -> List[ArchivedCompositeSignal]:
        """Read every archive entry on disk whose timestamp is >= ``cutoff``."""

        if not self.storage_path.exists():
            return []
        out: List[ArchivedCompositeSignal] = []
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
                            "Skipping malformed line in composite signal archive %s",
                            self.storage_path,
                        )
                        continue
                    if not isinstance(payload, dict):
                        continue
                    entry = ArchivedCompositeSignal.from_dict(payload)
                    entry_at = _parse_archive_timestamp(entry.archived_at)
                    if entry_at is None or entry_at < cutoff:
                        continue
                    out.append(entry)
        except OSError as exc:
            logger.warning(
                "Failed to read composite signal archive %s: %s",
                self.storage_path,
                exc,
            )
        return out


# Module-level singleton (mirrors NarrativeArchive). Tests inject a fresh
# archive via ``reset_composite_signal_archive_for_tests``.
_composite_archive: Optional[CompositeSignalArchive] = None
_archive_lock = threading.Lock()


def get_composite_signal_archive() -> CompositeSignalArchive:
    """Return the process-wide :class:`CompositeSignalArchive` instance."""

    global _composite_archive
    if _composite_archive is None:
        with _archive_lock:
            if _composite_archive is None:
                _composite_archive = CompositeSignalArchive()
    return _composite_archive


def reset_composite_signal_archive_for_tests(
    archive: Optional[CompositeSignalArchive] = None,
) -> None:
    """Inject a fresh :class:`CompositeSignalArchive` (test-only hook)."""

    global _composite_archive
    with _archive_lock:
        _composite_archive = archive


__all__ = [
    "ARCHIVE_DEFAULT_DAYS_WINDOW",
    "ARCHIVE_MAX_DAYS_WINDOW",
    "ARCHIVE_MEMORY_CAP",
    "ARCHIVE_ROTATE_SIZE_BYTES",
    "ArchivedCompositeSignal",
    "CompositeSignal",
    "CompositeSignalArchive",
    "SupportingComponent",
    "composite_signals_to_public_summary",
    "detect_composite_signals",
    "get_composite_signal_archive",
    "reset_composite_signal_archive_for_tests",
]

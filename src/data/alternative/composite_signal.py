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

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .narrative import _canonical_metal  # type: ignore[attr-defined]
from .ticker_industry import INDUSTRY_RELEVANT_METALS, KNOWN_INDUSTRIES


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
            "detail": self.detail,
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


__all__ = [
    "CompositeSignal",
    "SupportingComponent",
    "composite_signals_to_public_summary",
    "detect_composite_signals",
]

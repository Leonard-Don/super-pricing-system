"""Resolve an A-share / US ticker to one of the alt-data industry labels.

This module exists because the Pricing Gap analysis page needs to ask
:func:`build_alt_data_narrative` for context scoped to a single stock's
industry. The alt-data layer indexes signals by Chinese industry labels
("新能源汽车", "电网", "风电", "AI算力", ...) — matching the
``industry_signals`` keys that policy_radar emits — but the upstream
fundamental data uses provider-specific labels (Yahoo Finance returns
strings like "Auto Manufacturers", Shenwan returns code-named groups).

The resolver works in two layers:

1. **Provider-backed lookup** — if a ``data_manager`` is supplied with a
   ``get_fundamental_data(symbol)`` method, we read ``industry`` /
   ``sector`` from the result and try to canonicalise it.

2. **Static fallback** — for the smoke-test cases the pricing UI cares
   about (the audit corpus' four named industries) we keep a tiny
   in-memory mapping. Tickers not covered get ``None`` back, which the
   narrative builder treats as "本行业暂无显著另类数据信号".

The function is intentionally synchronous and side-effect free so it can
be called from the FastAPI handler without an event loop.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, Optional

# Industry labels we recognise. These mirror the keys that
# ``policy_radar`` emits under ``industry_signals`` (see
# ``cache/alt_data/providers/policy_radar.json``); keeping them in one
# place lets us validate user-supplied ``industry=`` query params and
# avoid letting unrelated free-form strings reach the synthesizer.
KNOWN_INDUSTRIES = frozenset({
    "新能源汽车",
    "电网",
    "风电",
    "AI算力",
    "光伏",
    "储能",
})

# Provider-supplied industry/sector labels mapped to our canonical set.
# Lower-case keys, so callers can lookup case-insensitively.
_INDUSTRY_ALIASES: Dict[str, str] = {
    # 新能源汽车
    "auto manufacturers": "新能源汽车",
    "automobile manufacturers": "新能源汽车",
    "electric vehicles": "新能源汽车",
    "ev": "新能源汽车",
    "electric vehicle": "新能源汽车",
    "新能源汽车": "新能源汽车",
    "汽车": "新能源汽车",
    "动力电池": "新能源汽车",
    "充电桩": "新能源汽车",
    # 电网
    "electric utilities": "电网",
    "utilities—regulated electric": "电网",
    "utilities-regulated electric": "电网",
    "电网": "电网",
    "电力": "电网",
    # 风电
    "wind": "风电",
    "wind power": "风电",
    "风电": "风电",
    "风机": "风电",
    # AI算力
    "semiconductors": "AI算力",
    "ai": "AI算力",
    "artificial intelligence": "AI算力",
    "ai算力": "AI算力",
    "算力": "AI算力",
    "internet content & information": "AI算力",
    "internet content": "AI算力",
    "interactive media": "AI算力",
    "digital advertising": "AI算力",
    "search engine": "AI算力",
    "cloud computing": "AI算力",
    "alphabet": "AI算力",
    "google": "AI算力",
    # 光伏
    "solar": "光伏",
    "solar industry": "光伏",
    "光伏": "光伏",
    # 储能
    "energy storage": "储能",
    "battery storage": "储能",
    "储能": "储能",
}

# Symbol-level fallback for the deterministic test corpus + common
# A-share / US tickers an analyst is likely to drop into the Pricing Gap
# view. Coverage is intentionally narrow — anything not here returns
# None and the narrative falls back to the degraded "本行业暂无显著
# 另类数据信号" copy.
_TICKER_INDUSTRY_FALLBACK: Dict[str, str] = {
    # 新能源汽车
    "300750": "新能源汽车",  # 宁德时代
    "300750.SZ": "新能源汽车",
    "002594": "新能源汽车",  # 比亚迪
    "002594.SZ": "新能源汽车",
    "TSLA": "新能源汽车",
    "NIO": "新能源汽车",
    "BYD": "新能源汽车",
    # 电网
    "600900": "电网",  # 长江电力
    "600900.SH": "电网",
    # AI算力
    "NVDA": "AI算力",
    "AMD": "AI算力",
    "GOOG": "AI算力",
    "GOOGL": "AI算力",
    "688981": "AI算力",  # 中芯国际
    "688981.SH": "AI算力",
    # 风电
    "601865": "风电",  # 福莱特 (related; placeholder)
    "601179": "风电",  # 中国西电
    # 光伏
    "600438": "光伏",  # 通威
    "600438.SH": "光伏",
    "601012": "光伏",  # 隆基绿能
    "601012.SH": "光伏",
}


def _canonical_industry_label(raw: Any) -> Optional[str]:
    """Map a raw provider industry/sector label onto the canonical set.

    Returns the canonical industry name (one of :data:`KNOWN_INDUSTRIES`)
    or ``None`` when the input does not match any known alias.
    """

    if not raw:
        return None
    text = str(raw).strip()
    if not text:
        return None

    # Direct hit on the canonical set (covers both 中/英 already-canonical
    # inputs from the resolver caller).
    if text in KNOWN_INDUSTRIES:
        return text

    key = text.lower()
    if key in _INDUSTRY_ALIASES:
        return _INDUSTRY_ALIASES[key]

    # Substring matches catch verbose Yahoo labels like
    # "Auto Manufacturers - Major" → 新能源汽车.
    for alias, canonical in _INDUSTRY_ALIASES.items():
        if alias and alias in key:
            return canonical
    return None


def _normalize_ticker(ticker: str) -> str:
    return str(ticker or "").strip().upper()


def resolve_ticker_industry(
    ticker: str,
    *,
    data_manager: Optional[Any] = None,
) -> Optional[str]:
    """Return the canonical alt-data industry label for ``ticker`` or ``None``.

    Resolution order:

    1. Static symbol → industry fallback (lets unit tests pin behaviour
       without an HTTP-bound data provider).
    2. ``data_manager.get_fundamental_data(symbol)`` if supplied — we
       read ``industry`` first and fall back to ``sector``.

    The function never raises on bad input; it returns ``None`` and the
    caller (typically the FastAPI handler) is expected to forward a
    degraded narrative.
    """

    normalized = _normalize_ticker(ticker)
    if not normalized:
        return None

    # 1. Static fallback first -- cheap and deterministic.
    canonical = _TICKER_INDUSTRY_FALLBACK.get(normalized)
    if canonical:
        return canonical

    # 2. Data manager lookup.
    if data_manager is not None and hasattr(data_manager, "get_fundamental_data"):
        try:
            fundamentals = data_manager.get_fundamental_data(normalized)
        except Exception:
            fundamentals = None
        if isinstance(fundamentals, dict) and "error" not in fundamentals:
            for key in ("industry", "sector"):
                resolved = _canonical_industry_label(fundamentals.get(key))
                if resolved:
                    return resolved

    return None


def is_known_industry(label: Optional[str]) -> bool:
    """Return True when ``label`` is in the alt-data canonical set."""

    if not label:
        return False
    return str(label).strip() in KNOWN_INDUSTRIES


def filter_records_by_industry(
    records: Iterable[Any],
    industry: str,
) -> list:
    """Return only records whose ``tags`` or ``raw_value`` mention ``industry``.

    ``records`` is the iterable returned by ``AltDataManager.get_records``;
    each record is expected to expose ``tags`` (list[str]),
    ``metadata`` (dict), and ``raw_value`` (dict). Matching is a
    case-sensitive substring sweep — sufficient because the policy_radar
    pipeline already canonicalises industry tags before persisting them.
    """

    target = str(industry or "").strip()
    if not target:
        return list(records)

    filtered: list = []
    for record in records:
        tags = getattr(record, "tags", None) or []
        if any(target in str(tag) for tag in tags):
            filtered.append(record)
            continue
        metadata = getattr(record, "metadata", None) or {}
        if isinstance(metadata, dict):
            industries = metadata.get("industries") or []
            if isinstance(industries, list) and any(target in str(item) for item in industries):
                filtered.append(record)
                continue
            if target in str(metadata.get("industry", "")):
                filtered.append(record)
                continue
        raw = getattr(record, "raw_value", None) or {}
        if isinstance(raw, dict):
            if target in str(raw.get("industry", "")) or target in str(raw.get("title", "")):
                filtered.append(record)
    return filtered


# Industries that are heavily driven by industrial-metal inventory. The
# narrative builder consults this when scoping macro_hf signals so a
# 新能源汽车 query surfaces only 铜 / 铝 reads (not gold). Industries
# absent from the map fall through to the global macro view.
INDUSTRY_RELEVANT_METALS: Dict[str, frozenset] = {
    "新能源汽车": frozenset({"铜", "铝", "镍", "锂"}),
    "电网": frozenset({"铜", "铝"}),
    "风电": frozenset({"铜", "铝"}),
    "AI算力": frozenset({"铜"}),
    "光伏": frozenset({"铝", "铜"}),
    "储能": frozenset({"铜", "镍", "锂"}),
}


def metals_for_industry(industry: Optional[str]) -> Optional[frozenset]:
    """Return the relevant metals for an industry, or ``None`` for global."""

    if not industry:
        return None
    return INDUSTRY_RELEVANT_METALS.get(industry)


__all__ = [
    "INDUSTRY_RELEVANT_METALS",
    "KNOWN_INDUSTRIES",
    "filter_records_by_industry",
    "is_known_industry",
    "metals_for_industry",
    "resolve_ticker_industry",
]

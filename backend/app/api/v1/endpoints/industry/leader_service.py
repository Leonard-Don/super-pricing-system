"""Leader service: business logic for ``/leaders`` and ``/leaders/{symbol}/detail``.

Owns the heavy hot/core leader scoring pipeline plus the helpers that
support it (data-quality diagnostics, mini-trend attachment, dedupe).
Module-level state stays in ``_helpers``; we access it via ``_helpers``
attribute lookup so monkey-patches done by tests remain authoritative.
"""

import concurrent.futures
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import Any, List, Optional

from fastapi import HTTPException

from backend.app.schemas.industry import (
    LeaderDetailResponse,
    LeaderStockResponse,
)
from src.analytics.industry_stock_details import (
    has_meaningful_numeric,
    normalize_symbol,
)

from . import _helpers


logger = logging.getLogger(__name__)


# =============================================================================
# Sparkline / mini-trend helpers
# =============================================================================

def _normalize_sparkline_points(points: list[float], max_points: int = 20) -> list[float]:
    normalized = []
    for point in points or []:
        try:
            value = float(point)
        except (TypeError, ValueError):
            continue
        if value > 0:
            normalized.append(round(value, 3))
    if len(normalized) <= max_points:
        return normalized
    step = max(1, len(normalized) // max_points)
    sampled = normalized[::step][:max_points]
    if sampled[-1] != normalized[-1]:
        sampled[-1] = normalized[-1]
    return sampled


def _load_symbol_mini_trend(symbol: str) -> list[float]:
    scorer = _helpers.get_leader_scorer()
    provider = getattr(scorer, "provider", None)
    if provider is None or not hasattr(provider, "get_historical_data"):
        return []

    try:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=45)
        hist_data = provider.get_historical_data(symbol, start_date, end_date)
        if hist_data is None or hist_data.empty or "close" not in hist_data.columns:
            return []
        return _normalize_sparkline_points(hist_data["close"].tail(20).tolist(), max_points=20)
    except Exception as exc:
        logger.warning("Failed to load mini trend for leader %s: %s", symbol, exc)
        return []


def _attach_leader_mini_trends(leaders: list[LeaderStockResponse]) -> list[LeaderStockResponse]:
    if not leaders:
        return leaders

    symbols = [leader.symbol for leader in leaders if re.fullmatch(r"\d{6}", leader.symbol or "")]
    if not symbols:
        return leaders

    with ThreadPoolExecutor(max_workers=min(6, len(symbols))) as executor:
        trend_values = list(executor.map(_load_symbol_mini_trend, symbols))

    trend_map = {symbol: trend for symbol, trend in zip(symbols, trend_values)}
    for leader in leaders:
        leader.mini_trend = trend_map.get(leader.symbol, [])
    return leaders


# =============================================================================
# Dedupe / diagnostics
# =============================================================================

def _dedupe_leader_responses(leaders: List[LeaderStockResponse]) -> List[LeaderStockResponse]:
    """按 symbol 去重，保留总分更高、信息更完整的记录。"""
    best_by_symbol: dict[str, LeaderStockResponse] = {}

    for leader in leaders:
        symbol = normalize_symbol(getattr(leader, "symbol", ""))
        if not re.fullmatch(r"\d{6}", symbol):
            continue

        leader.symbol = symbol
        current = best_by_symbol.get(symbol)
        if current is None:
            best_by_symbol[symbol] = leader
            continue

        current_score = float(getattr(current, "total_score", 0) or 0)
        next_score = float(getattr(leader, "total_score", 0) or 0)
        current_cap = float(getattr(current, "market_cap", 0) or 0)
        next_cap = float(getattr(leader, "market_cap", 0) or 0)

        if (next_score, next_cap) > (current_score, current_cap):
            best_by_symbol[symbol] = leader

    deduped = list(best_by_symbol.values())
    deduped.sort(key=lambda item: float(getattr(item, "total_score", 0) or 0), reverse=True)
    for idx, leader in enumerate(deduped, 1):
        leader.global_rank = idx
    return deduped


def _build_leader_data_diagnostics(
    *,
    source: str,
    market_cap: Any,
    pe_ratio: Any,
    change_pct: Any,
    score_source: str,
    source_path: str,
) -> tuple[str, str, dict[str, Any]]:
    """Build a compact data-quality contract for leader-list rows."""
    def _numeric_value(value: Any) -> Optional[float]:
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    normalized_market_cap = _numeric_value(market_cap)
    normalized_pe_ratio = _numeric_value(pe_ratio)
    normalized_change_pct = _numeric_value(change_pct)
    has_market_cap = normalized_market_cap is not None and normalized_market_cap > 0
    has_pe_ratio = normalized_pe_ratio is not None and normalized_pe_ratio > 0
    has_change_pct = normalized_change_pct is not None

    if has_market_cap and has_pe_ratio and has_change_pct:
        quality = "complete"
    elif has_change_pct and (has_market_cap or has_pe_ratio):
        quality = "partial"
    elif has_change_pct:
        quality = "degraded"
    else:
        quality = "unknown"

    return source, quality, {
        "source": source,
        "source_path": source_path,
        "score_source": score_source,
        "has_market_cap": has_market_cap,
        "has_pe_ratio": has_pe_ratio,
        "has_change_pct": has_change_pct,
    }


# =============================================================================
# Endpoint services
# =============================================================================

def get_leader_stocks(
    top_n: int,
    top_industries: int,
    per_industry: int,
    list_type: str,
) -> List[LeaderStockResponse]:
    """获取龙头股推荐列表"""
    cache_key = f"leaders:v3:{list_type}:{top_n}:{top_industries}:{per_industry}"
    try:
        cached = _helpers._get_endpoint_cache(cache_key)
        if cached is not None:
            return cached

        analyzer = _helpers.get_industry_analyzer()
        hot_industries = analyzer.rank_industries(top_n=top_industries)
        top_industry_names = set(ind.get("industry_name") for ind in hot_industries)

        # ========== 核心资产 (Core Leaders) 逻辑 ==========
        if list_type == "core":
            scorer = _helpers.get_leader_scorer()
            provider = analyzer.provider

            def _process_core_industry(industry):
                ind_name = industry.get("industry_name")
                if not ind_name:
                    return []
                try:
                    stocks = provider.get_stock_list_by_industry(ind_name)
                    if not stocks:
                        return []

                    candidate_pool = []
                    for stock in stocks:
                        sym = normalize_symbol(stock.get("symbol") or stock.get("code") or "")
                        if not re.fullmatch(r"\d{6}", sym):
                            continue
                        candidate_pool.append({
                            "symbol": sym,
                            "name": stock.get("name", ""),
                            "market_cap": float(stock.get("market_cap") or 0),
                            "pe_ratio": float(stock.get("pe_ratio") or 0),
                            "change_pct": float(stock.get("change_pct") or 0),
                            "amount": float(stock.get("amount") or 0),
                        })

                    if not candidate_pool:
                        return []

                    candidate_pool.sort(
                        key=lambda item: (
                            item["market_cap"] > 0,
                            item["market_cap"],
                            item["amount"],
                            abs(item["change_pct"]),
                        ),
                        reverse=True,
                    )

                    valid_stocks = []
                    for item in candidate_pool[: max(5, per_industry * 2)]:
                        mkt_cap = item["market_cap"]
                        pe = item["pe_ratio"]
                        if mkt_cap > 0 and mkt_cap < 3000000000:
                            continue
                        if pe != 0 and (pe < 0 or pe > 150):
                            continue
                        valid_stocks.append(item["symbol"])

                    if not valid_stocks:
                        valid_stocks = [item["symbol"] for item in candidate_pool[: min(5, len(candidate_pool))]]

                    logger.info(f"For {ind_name}, selected {len(valid_stocks)} valid core candidates.")
                    candidate_map = {item["symbol"]: item for item in candidate_pool}
                    industry_stats = scorer.calculate_industry_stats(candidate_pool)

                    fast_results = []
                    for sym in valid_stocks[:max(5, int(per_industry * 1.5))]:
                        snapshot = candidate_map.get(sym, {"symbol": sym, "name": sym})
                        sd = scorer.score_stock_from_snapshot(snapshot, industry_stats=industry_stats, enrich_financial=False)
                        ds = sd.get("dimension_scores", {})
                        roe = sd.get("raw_data", {}).get("roe")
                        if roe is not None and roe < 0:
                            continue
                        fast_score = sd.get("total_score", 0)
                        fast_results.append((sym, fast_score, sd))

                    fast_results.sort(key=lambda x: x[1], reverse=True)
                    top_syms = [sym for sym, _, _ in fast_results[:per_industry]]

                    ind_core_list = []
                    for sym in top_syms:
                        snapshot = candidate_map.get(sym, {"symbol": sym, "name": sym})
                        sd = None
                        try:
                            sd = scorer.score_stock_from_snapshot(
                                snapshot,
                                industry_stats=industry_stats,
                                enrich_financial=True,
                                cached_only=True,
                            )
                        except Exception:
                            pass
                        if not sd or "error" in sd:
                            sd = scorer.score_stock_from_snapshot(snapshot, industry_stats=industry_stats, enrich_financial=False)
                        ds = sd.get("dimension_scores", {})
                        roe = sd.get("raw_data", {}).get("roe")
                        if roe is not None and roe < 0:
                            continue
                        total_score = round(sd.get("total_score", 0), 2)
                        market_cap = sd.get("raw_data", {}).get("market_cap", snapshot.get("market_cap", 0))
                        pe_ratio = sd.get("raw_data", {}).get("pe_ttm", snapshot.get("pe_ratio", 0))
                        change_pct = sd.get("raw_data", {}).get("change_pct", snapshot.get("change_pct", 0))
                        data_source, data_quality, data_diagnostics = _build_leader_data_diagnostics(
                            source="constituent_snapshot",
                            market_cap=market_cap,
                            pe_ratio=pe_ratio,
                            change_pct=change_pct,
                            score_source="leader_scorer_snapshot",
                            source_path="core.constituent_snapshot",
                        )
                        ind_core_list.append(LeaderStockResponse(
                            symbol=sym,
                            name=sd.get("name", sym),
                            industry=ind_name,
                            score_type="core",
                            global_rank=0,
                            industry_rank=0,
                            total_score=total_score,
                            market_cap=market_cap,
                            pe_ratio=pe_ratio,
                            change_pct=change_pct,
                            dimension_scores=ds,
                            mini_trend=[],
                            data_source=data_source,
                            data_quality=data_quality,
                            data_diagnostics=data_diagnostics,
                        ))

                    ind_core_list.sort(key=lambda x: x.total_score, reverse=True)
                    for rank_idx, stock in enumerate(ind_core_list[:per_industry], 1):
                        stock.industry_rank = rank_idx
                    return ind_core_list[:per_industry]
                except Exception as e:
                    logger.error(f"Error fetching core stocks for {ind_name}: {e}")
                    return []

            core_leaders = []
            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                industry_results = list(executor.map(
                    _process_core_industry, hot_industries[:top_industries]
                ))
            for result in industry_results:
                core_leaders.extend(result)

            try:
                from src.analytics.leader_stock_scorer import LeaderStockScorer
                LeaderStockScorer._persist_financial_cache()
            except Exception:
                pass

            core_leaders = _helpers._dedupe_leader_responses(core_leaders)[:top_n]

            if core_leaders:
                _helpers._set_endpoint_cache(cache_key, core_leaders)
                for leader in core_leaders:
                    _helpers._set_parity_cache(leader.symbol, "core", leader)
            else:
                stale = _helpers._get_stale_endpoint_cache(cache_key)
                if stale is not None:
                    logger.warning("Core leaders empty, using stale cache: %s", cache_key)
                    return stale
            return core_leaders

        # ========== 热点先锋 (Hot Movers) 逻辑 ==========
        heatmap_df = analyzer.analyze_money_flow(days=1)
        leaders_from_heatmap: list[LeaderStockResponse] = []
        deferred_heatmap_leaders: list[LeaderStockResponse] = []
        scorer = _helpers.get_leader_scorer()
        valuation_provider = getattr(analyzer, "provider", None)

        if not heatmap_df.empty and "leading_stock" in heatmap_df.columns:
            sort_col = "main_net_inflow" if "main_net_inflow" in heatmap_df.columns else "change_pct"
            sorted_df = heatmap_df.sort_values(sort_col, ascending=False)

            seen_stocks = set()
            hot_candidates = []
            for _, row in sorted_df.iterrows():
                industry_name = row.get("industry_name", "")
                leading_stock = row.get("leading_stock")
                if not leading_stock or not isinstance(leading_stock, str):
                    continue
                if top_industry_names and industry_name not in top_industry_names:
                    continue
                if leading_stock in seen_stocks:
                    continue
                seen_stocks.add(leading_stock)
                hot_candidates.append(row)
                if len(hot_candidates) >= int(top_n * 1.2):
                    break

            industry_snapshot_index: dict[str, dict[str, dict[str, Any]]] = {}

            def _snapshot_indexes_for_industry(industry_name: str) -> dict[str, dict[str, Any]]:
                normalized_industry = str(industry_name or "").strip()
                if not normalized_industry or normalized_industry in industry_snapshot_index:
                    return industry_snapshot_index.get(normalized_industry, {})

                rows = []
                if valuation_provider is not None:
                    cached_loader = getattr(valuation_provider, "get_cached_stock_list_by_industry", None)
                    if callable(cached_loader):
                        try:
                            rows = cached_loader(normalized_industry) or []
                        except Exception as exc:
                            logger.warning(
                                "Failed to load cached hot-leader constituents for %s: %s",
                                normalized_industry,
                                exc,
                            )

                    if not rows and hasattr(valuation_provider, "get_stock_list_by_industry"):
                        try:
                            rows = valuation_provider.get_stock_list_by_industry(normalized_industry) or []
                        except Exception as exc:
                            logger.warning(
                                "Failed to load hot-leader constituents for %s: %s",
                                normalized_industry,
                                exc,
                            )

                by_symbol: dict[str, dict[str, Any]] = {}
                by_name: dict[str, dict[str, Any]] = {}
                for stock in rows:
                    symbol = normalize_symbol(stock.get("symbol") or stock.get("code") or "")
                    name = str(stock.get("name") or "").strip()
                    if symbol:
                        by_symbol[symbol] = stock
                    if name:
                        by_name[name] = stock

                index = {"by_symbol": by_symbol, "by_name": by_name}
                industry_snapshot_index[normalized_industry] = index
                return index

            def _find_hot_leader_snapshot(industry_name: str, leading_stock: str) -> dict[str, Any]:
                indexes = _snapshot_indexes_for_industry(industry_name)
                if not indexes:
                    return {}

                quick_symbol = normalize_symbol(leading_stock)
                if quick_symbol and quick_symbol in indexes.get("by_symbol", {}):
                    return indexes["by_symbol"][quick_symbol]

                return indexes.get("by_name", {}).get(str(leading_stock or "").strip(), {})

            def _score_hot_stock(row):
                industry_name = row.get("industry_name", "")
                leading_stock = row.get("leading_stock")
                change_pct = float(row.get("leading_stock_change", row.get("change_pct", 0)) or 0)
                net_inflow_ratio = float(row.get("main_net_ratio", 0) or 0)
                snapshot = _find_hot_leader_snapshot(industry_name, leading_stock)

                quick_symbol = normalize_symbol(
                    snapshot.get("symbol")
                    or snapshot.get("code")
                    or leading_stock
                )
                if re.fullmatch(r"\d{6}", quick_symbol):
                    real_symbol = quick_symbol
                else:
                    real_symbol = _helpers._resolve_symbol_with_provider(leading_stock)

                market_cap = (
                    float(snapshot.get("market_cap") or 0)
                    or float(snapshot.get("mktcap") or 0) * 10000
                    or float(snapshot.get("nmc") or 0) * 10000
                )
                pe_ratio = float(
                    snapshot.get("pe_ratio")
                    or snapshot.get("pe_ttm")
                    or snapshot.get("per")
                    or 0
                )
                amount = float(
                    snapshot.get("amount")
                    or snapshot.get("turnover")
                    or abs(float(row.get("main_net_inflow", 0) or 0))
                )
                turnover = float(
                    snapshot.get("turnover_rate")
                    or snapshot.get("turnover_ratio")
                    or snapshot.get("turnover")
                    or 0
                )
                if snapshot.get("change_pct") not in (None, ""):
                    change_pct = float(snapshot.get("change_pct") or change_pct)

                snapshot_data = {
                    "symbol": real_symbol,
                    "name": snapshot.get("name") or leading_stock,
                    "market_cap": market_cap,
                    "pe_ratio": pe_ratio,
                    "change_pct": change_pct,
                    "amount": amount,
                    "turnover": turnover,
                    "net_inflow_ratio": net_inflow_ratio,
                }

                score_detail = scorer.score_stock_from_snapshot(snapshot_data, score_type="hot")

                if "error" not in score_detail:
                    scored_symbol = normalize_symbol(score_detail.get("symbol", real_symbol))
                    market_cap = score_detail.get("raw_data", {}).get("market_cap", 0)
                    pe_ratio = score_detail.get("raw_data", {}).get("pe_ttm", 0)
                    dimension_scores = score_detail.get("dimension_scores", {})
                    total_score = score_detail.get("total_score", 0)
                    score_source = "leader_scorer_snapshot"
                else:
                    scored_symbol = real_symbol
                    total_score = round(min(100, max(0, (change_pct + 15) / 30 * 50 + max(0, min(50, net_inflow_ratio * 5 + 25)))), 2)
                    market_cap = 0
                    pe_ratio = 0
                    score_source = "heatmap_fallback_formula"
                    dimension_scores = {
                        "momentum": min(1.0, max(0.0, (change_pct + 15) / 30)),
                        "money_flow": min(1.0, max(0.0, (net_inflow_ratio + 10) / 20)),
                        "valuation": 0.5,
                        "profitability": 0.5,
                        "growth": 0.5,
                        "activity": 0.5,
                        "score_type": "hot",
                    }

                if not re.fullmatch(r"\d{6}", scored_symbol):
                    logger.warning(f"Skipping leader '{leading_stock}' because symbol could not be resolved: {scored_symbol}")
                    return None

                data_source, data_quality, data_diagnostics = _build_leader_data_diagnostics(
                    source="heatmap_constituent_snapshot" if snapshot else "heatmap_leading_stock",
                    market_cap=market_cap,
                    pe_ratio=pe_ratio,
                    change_pct=change_pct,
                    score_source=score_source,
                    source_path="hot.heatmap.snapshot" if snapshot else "hot.heatmap.leading_stock",
                )
                return LeaderStockResponse(
                    symbol=scored_symbol,
                    name=snapshot_data["name"],
                    industry=industry_name,
                    score_type="hot",
                    global_rank=0,
                    industry_rank=1,
                    total_score=total_score,
                    market_cap=market_cap,
                    pe_ratio=pe_ratio,
                    change_pct=change_pct,
                    dimension_scores=dimension_scores,
                    mini_trend=[],
                    data_source=data_source,
                    data_quality=data_quality,
                    data_diagnostics=data_diagnostics,
                )

            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
                results = list(executor.map(_score_hot_stock, hot_candidates))

            deduped_heatmap = _helpers._dedupe_leader_responses([res for res in results if res])
            for leader in deduped_heatmap:
                market_cap = float(getattr(leader, "market_cap", 0) or 0)
                pe_ratio = float(getattr(leader, "pe_ratio", 0) or 0)
                if market_cap > 0 and pe_ratio > 0:
                    leaders_from_heatmap.append(leader)
                else:
                    deferred_heatmap_leaders.append(leader)

            leaders_from_heatmap = leaders_from_heatmap[:top_n]

        if (leaders_from_heatmap or deferred_heatmap_leaders) and len(leaders_from_heatmap) < top_n:
            logger.info(
                "Heatmap hot leaders underfilled (%s/%s), backfilling from constituent snapshots",
                len(leaders_from_heatmap),
                top_n,
            )
            needed_count = max(0, top_n - len(leaders_from_heatmap))
            seen_symbols = {
                normalize_symbol(leader.symbol)
                for leader in leaders_from_heatmap
                if normalize_symbol(leader.symbol)
            }
            snapshot_backfills: list[LeaderStockResponse] = []

            for industry in hot_industries[:top_industries]:
                industry_name = industry.get("industry_name")
                if not industry_name:
                    continue

                snapshot_indexes = _snapshot_indexes_for_industry(industry_name)
                rows = list(snapshot_indexes.get("by_symbol", {}).values())
                if not rows:
                    continue

                try:
                    industry_stats = scorer.calculate_industry_stats(rows)
                except Exception:
                    industry_stats = {}

                for stock in rows:
                    symbol = normalize_symbol(stock.get("symbol") or stock.get("code") or "")
                    if not re.fullmatch(r"\d{6}", symbol) or symbol in seen_symbols:
                        continue

                    try:
                        score_detail = scorer.score_stock_from_industry_snapshot(
                            stock,
                            industry_stats,
                            score_type="hot",
                        )
                    except Exception:
                        score_detail = {}
                    if not isinstance(score_detail, dict):
                        score_detail = {}

                    dimension_scores = score_detail.get("dimension_scores", {})
                    raw_data = score_detail.get("raw_data", {})
                    total_score = score_detail.get("total_score")
                    if total_score is None:
                        total_score = float(stock.get("total_score") or 0)

                    market_cap = raw_data.get("market_cap", stock.get("market_cap", 0))
                    pe_ratio = raw_data.get(
                        "pe_ttm",
                        stock.get("pe_ratio") or stock.get("pe_ttm") or 0,
                    )
                    change_pct = raw_data.get("change_pct", stock.get("change_pct", 0))
                    data_source, data_quality, data_diagnostics = _build_leader_data_diagnostics(
                        source="constituent_snapshot",
                        market_cap=market_cap,
                        pe_ratio=pe_ratio,
                        change_pct=change_pct,
                        score_source="leader_scorer_industry_snapshot",
                        source_path="hot.constituent_snapshot_backfill",
                    )
                    snapshot_backfills.append(
                        LeaderStockResponse(
                            symbol=symbol,
                            name=score_detail.get("name") or stock.get("name", symbol),
                            industry=industry_name,
                            score_type="hot",
                            global_rank=0,
                            industry_rank=0,
                            total_score=total_score,
                            market_cap=market_cap,
                            pe_ratio=pe_ratio,
                            change_pct=change_pct,
                            dimension_scores=dimension_scores,
                            mini_trend=[],
                            data_source=data_source,
                            data_quality=data_quality,
                            data_diagnostics=data_diagnostics,
                        )
                    )
                    seen_symbols.add(symbol)

                    if len(snapshot_backfills) >= needed_count:
                        break
                if len(snapshot_backfills) >= needed_count:
                    break

            leaders_from_heatmap.extend(snapshot_backfills)
            leaders_from_heatmap = _helpers._dedupe_leader_responses(leaders_from_heatmap)[:top_n]

            if deferred_heatmap_leaders and len(leaders_from_heatmap) < top_n:
                seen_symbols = {
                    normalize_symbol(leader.symbol)
                    for leader in leaders_from_heatmap
                    if normalize_symbol(leader.symbol)
                }
                for leader in deferred_heatmap_leaders:
                    symbol = normalize_symbol(leader.symbol)
                    if not symbol or symbol in seen_symbols:
                        continue
                    leaders_from_heatmap.append(leader)
                    seen_symbols.add(symbol)
                    if len(leaders_from_heatmap) >= top_n:
                        break
                leaders_from_heatmap = _helpers._dedupe_leader_responses(leaders_from_heatmap)[:top_n]

        if leaders_from_heatmap:
            _helpers._set_endpoint_cache(cache_key, leaders_from_heatmap)
            for leader in leaders_from_heatmap:
                _helpers._set_parity_cache(leader.symbol, "hot", leader)
            return leaders_from_heatmap

        # ⬇️ 降级路径
        logger.warning("Heatmap leading_stock unavailable, falling back to LeaderStockScorer")
        scorer = _helpers.get_leader_scorer()
        industry_names = [ind.get("industry_name") for ind in hot_industries]
        leaders = scorer.get_leader_stocks(industry_names, top_per_industry=per_industry, score_type="hot")
        leaders = leaders[:top_n]

        result = []
        for leader in leaders:
            market_cap = leader.get("market_cap", 0)
            pe_ratio = leader.get("pe_ratio", 0)
            change_pct = leader.get("change_pct", 0)
            data_source, data_quality, data_diagnostics = _build_leader_data_diagnostics(
                source="leader_scorer_fallback",
                market_cap=market_cap,
                pe_ratio=pe_ratio,
                change_pct=change_pct,
                score_source="leader_scorer_full_scan",
                source_path="hot.leader_scorer_fallback",
            )
            result.append(
                LeaderStockResponse(
                    symbol=leader.get("symbol", ""),
                    name=leader.get("name", ""),
                    industry=leader.get("industry", ""),
                    score_type="hot",
                    global_rank=leader.get("global_rank", 0),
                    industry_rank=leader.get("rank", 0),
                    total_score=leader.get("total_score", 0),
                    market_cap=market_cap,
                    pe_ratio=pe_ratio,
                    change_pct=change_pct,
                    dimension_scores=leader.get("dimension_scores", {}),
                    mini_trend=leader.get("mini_trend", []),
                    data_source=data_source,
                    data_quality=data_quality,
                    data_diagnostics=data_diagnostics,
                )
            )
        result = _helpers._dedupe_leader_responses(result)[:top_n]
        if result:
            _helpers._set_endpoint_cache(cache_key, result)
            for leader in result:
                _helpers._set_parity_cache(leader.symbol, "hot", leader)
        else:
            stale = _helpers._get_stale_endpoint_cache(cache_key)
            if stale is not None:
                logger.warning("Hot leaders empty, using stale cache: %s", cache_key)
                return stale
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting leader stocks: {e}")
        stale = _helpers._get_stale_endpoint_cache(cache_key)
        if stale is not None:
            logger.warning(f"Using stale cache for leaders: {cache_key}")
            return stale
        raise HTTPException(status_code=500, detail=str(e))


def get_leader_detail(
    symbol: str,
    score_type: str,
) -> LeaderDetailResponse:
    """获取龙头股详细分析"""
    try:
        resolved_symbol = _helpers._resolve_symbol_with_provider(symbol)

        cache_key = f"leader_detail:v2:{resolved_symbol}:{score_type}"
        cached = _helpers._get_endpoint_cache(cache_key)
        if cached is not None:
            return cached

        scorer = _helpers.get_leader_scorer()
        detail = scorer.get_leader_detail(resolved_symbol, score_type=score_type)

        if "error" in detail:
            raise HTTPException(status_code=404, detail=detail["error"])

        # 列表/详情评分一致性
        parity = _helpers._get_parity_cache(resolved_symbol, score_type)
        if parity is None:
            parity = _helpers._get_stale_parity_cache(resolved_symbol, score_type)
            if parity:
                logger.info(f"Using stale parity cache for {resolved_symbol}:{score_type}")

        if parity:
            detail["total_score"] = parity.total_score
            if hasattr(parity, "dimension_scores") and parity.dimension_scores:
                detail["dimension_scores"] = parity.dimension_scores
            raw_data = detail.setdefault("raw_data", {})
            if hasattr(parity, "change_pct") and not has_meaningful_numeric(raw_data.get("change_pct")):
                raw_data["change_pct"] = parity.change_pct
            if hasattr(parity, "market_cap") and has_meaningful_numeric(parity.market_cap) and not has_meaningful_numeric(raw_data.get("market_cap")):
                raw_data["market_cap"] = parity.market_cap
            if hasattr(parity, "pe_ratio") and has_meaningful_numeric(parity.pe_ratio) and not has_meaningful_numeric(raw_data.get("pe_ttm")):
                raw_data["pe_ttm"] = parity.pe_ratio

        result = LeaderDetailResponse(
            symbol=normalize_symbol(detail.get("symbol", resolved_symbol)),
            name=detail.get("name", ""),
            total_score=detail.get("total_score", 0),
            score_type=score_type,
            dimension_scores=detail.get("dimension_scores", {}),
            raw_data=detail.get("raw_data", {}),
            technical_analysis=detail.get("technical_analysis", {}),
            price_data=detail.get("price_data", []),
        )
        _helpers._set_endpoint_cache(cache_key, result)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting leader detail: {e}")
        raise HTTPException(status_code=500, detail=str(e))

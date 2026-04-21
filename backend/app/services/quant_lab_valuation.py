"""Valuation lab domain service for Quant Lab."""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import numpy as np
import pandas as pd


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        numeric = float(value)
        if math.isnan(numeric) or math.isinf(numeric):
            return default
        return numeric
    except (TypeError, ValueError):
        return default


def _json_ready(value: Any) -> Any:
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, (pd.Series, pd.Index)):
        return [_json_ready(item) for item in value.tolist()]
    if isinstance(value, pd.DataFrame):
        return [_json_ready(item) for item in value.to_dict("records")]
    if isinstance(value, dict):
        return {str(key): _json_ready(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_ready(item) for item in value]
    return value


def _utcnow_iso() -> str:
    return pd.Timestamp.utcnow().tz_localize(None).isoformat()


def _pick_metric(payload: Dict[str, Any], *keys: str) -> Optional[float]:
    for key in keys:
        if key in payload and payload.get(key) not in (None, ""):
            return _safe_float(payload.get(key), None)
    return None


def _normalize_ratio(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    numeric = float(value)
    if abs(numeric) > 1.5:
        numeric = numeric / 100.0
    return numeric


def _score_higher_better(value: Optional[float], floor: float = -0.2, ceiling: float = 0.4) -> Optional[float]:
    if value is None:
        return None
    clipped = min(max(value, floor), ceiling)
    return (clipped - floor) / (ceiling - floor)


def _score_lower_better(value: Optional[float], floor: float = -0.5, ceiling: float = 0.5) -> Optional[float]:
    if value is None:
        return None
    clipped = min(max(value, floor), ceiling)
    return 1.0 - ((clipped - floor) / (ceiling - floor))


class QuantLabValuationService:
    """Owns Quant Lab valuation analysis, history tracking, and peer scoring."""

    def __init__(
        self,
        *,
        data_manager: Any,
        pricing_analyzer: Any,
        storage_root: str | Path,
        read_store: Callable[[Path, Any], Any],
        write_store: Callable[[Path, Any], None],
        peer_candidate_pool_fn: Callable[[str], Any],
    ) -> None:
        self._data_manager = data_manager
        self._pricing_analyzer = pricing_analyzer
        self._storage_root = Path(storage_root)
        self._read_store = read_store
        self._write_store = write_store
        self._peer_candidate_pool_fn = peer_candidate_pool_fn

    def analyze_valuation_lab(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        symbol = str(payload.get("symbol") or "").strip().upper()
        if not symbol:
            raise ValueError("symbol is required")
        period = str(payload.get("period") or "1y")
        requested_peers = [
            str(item or "").strip().upper()
            for item in (payload.get("peer_symbols") or [])
            if str(item or "").strip()
        ]
        peer_limit = max(2, min(int(payload.get("peer_limit") or 6), 12))

        analysis = self._pricing_analyzer.analyze(symbol, period)
        valuation = analysis.get("valuation") or {}
        monte_carlo = valuation.get("monte_carlo") or {}
        fair_value = valuation.get("fair_value") or {}
        dcf = valuation.get("dcf") or {}

        ensemble = self._build_valuation_ensemble(
            current_price=_safe_float(valuation.get("current_price")),
            dcf_value=_safe_float(dcf.get("intrinsic_value"), None),
            comparable_value=_safe_float(fair_value.get("mid"), None),
            monte_carlo=monte_carlo,
        )
        history = self._append_valuation_history(symbol, period, ensemble, analysis)
        peer_matrix = self._build_peer_matrix(symbol, requested_peers, peer_limit)

        return _json_ready(
            {
                "symbol": symbol,
                "period": period,
                "analysis": analysis,
                "ensemble_valuation": ensemble,
                "valuation_history": history,
                "peer_matrix": peer_matrix,
            }
        )

    def _build_valuation_ensemble(
        self,
        *,
        current_price: float,
        dcf_value: Optional[float],
        comparable_value: Optional[float],
        monte_carlo: Dict[str, Any],
    ) -> Dict[str, Any]:
        anchors = []
        if dcf_value:
            anchors.append(("dcf", dcf_value, 0.45))
        if comparable_value:
            anchors.append(("comparable", comparable_value, 0.35))
        monte_carlo_p50 = monte_carlo.get("p50")
        if monte_carlo_p50:
            anchors.append(("monte_carlo", _safe_float(monte_carlo_p50), 0.20))
        if not anchors:
            return {"fair_value": None, "confidence_interval": None, "gap_pct": None, "models": []}

        total_weight = sum(weight for _, _, weight in anchors) or 1.0
        fair_value = sum(value * weight for _, value, weight in anchors) / total_weight
        confidence_low = monte_carlo.get("p10") or min(value for _, value, _ in anchors)
        confidence_high = monte_carlo.get("p90") or max(value for _, value, _ in anchors)
        gap_pct = ((current_price - fair_value) / fair_value) * 100 if fair_value else None
        return {
            "fair_value": round(float(fair_value), 2),
            "confidence_interval": {
                "low": round(float(confidence_low), 2),
                "high": round(float(confidence_high), 2),
            },
            "gap_pct": round(float(gap_pct), 2) if gap_pct is not None else None,
            "models": [
                {"model": name, "value": round(float(value), 2), "weight": round(float(weight / total_weight), 4)}
                for name, value, weight in anchors
            ],
        }

    def _append_valuation_history(
        self,
        symbol: str,
        period: str,
        ensemble: Dict[str, Any],
        analysis: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        filepath = self._storage_root / "valuation_history" / f"{symbol}.json"
        filepath.parent.mkdir(parents=True, exist_ok=True)
        payload = self._read_store(filepath, default=[])
        entry = {
            "timestamp": _utcnow_iso(),
            "period": period,
            "fair_value": ensemble.get("fair_value"),
            "gap_pct": ensemble.get("gap_pct"),
            "market_price": ((analysis.get("valuation") or {}).get("current_price")),
            "confidence_interval": ensemble.get("confidence_interval"),
        }
        payload = [entry, *(payload or [])][:60]
        self._write_store(filepath, payload)
        return payload[:30]

    def _build_peer_matrix(self, symbol: str, requested_peers: List[str], peer_limit: int) -> Dict[str, Any]:
        candidate_symbols = requested_peers or list(self._peer_candidate_pool_fn(symbol))
        comparison = self._pricing_analyzer.build_peer_comparison(symbol, candidate_symbols, limit=peer_limit)
        rows = [comparison.get("target"), *(comparison.get("peers") or [])]
        rows = [row for row in rows if row]
        if not rows:
            return {
                "rows": [],
                "summary": {
                    "peer_count": 0,
                    "custom_peer_count": len(requested_peers),
                    "auto_candidate_count": len(candidate_symbols),
                },
            }

        enriched_rows = []
        for row in rows:
            fundamentals = self._data_manager.get_fundamental_data(row.get("symbol")) or {}
            revenue_growth = _normalize_ratio(
                _pick_metric(
                    fundamentals,
                    "revenue_growth",
                    "revenue_growth_yoy",
                    "revenue_growth_rate",
                )
            )
            earnings_growth = _normalize_ratio(
                _pick_metric(
                    fundamentals,
                    "earnings_growth",
                    "eps_growth",
                    "net_income_growth",
                    "profit_growth",
                )
            )
            roe = _normalize_ratio(
                _pick_metric(
                    fundamentals,
                    "return_on_equity",
                    "roe",
                )
            )
            profit_margin = _normalize_ratio(
                _pick_metric(
                    fundamentals,
                    "profit_margin",
                    "net_margin",
                    "operating_margin",
                )
            )

            growth_score_components = [
                _score_higher_better(revenue_growth, -0.2, 0.35),
                _score_higher_better(earnings_growth, -0.2, 0.35),
            ]
            quality_score_components = [
                _score_higher_better(roe, -0.05, 0.35),
                _score_higher_better(profit_margin, -0.1, 0.3),
            ]
            value_score_components = [
                _score_lower_better(_normalize_ratio(_pick_metric(row, "premium_discount")), -0.5, 0.5),
                _score_lower_better(_normalize_ratio(_pick_metric(row, "pe_ratio")), 0.0, 0.6),
                _score_lower_better(_normalize_ratio(_pick_metric(row, "price_to_sales")), 0.0, 0.4),
            ]

            growth_values = [item for item in growth_score_components if item is not None]
            quality_values = [item for item in quality_score_components if item is not None]
            value_values = [item for item in value_score_components if item is not None]

            growth_score = sum(growth_values) / len(growth_values) if growth_values else None
            quality_score = sum(quality_values) / len(quality_values) if quality_values else None
            value_score = sum(value_values) / len(value_values) if value_values else None

            overall_components = [item for item in [value_score, growth_score, quality_score] if item is not None]
            overall_score = sum(overall_components) / len(overall_components) if overall_components else None
            enriched_rows.append(
                {
                    **row,
                    "revenue_growth": revenue_growth,
                    "earnings_growth": earnings_growth,
                    "return_on_equity": roe,
                    "profit_margin": profit_margin,
                    "value_score": round(float(value_score), 4) if value_score is not None else None,
                    "growth_score": round(float(growth_score), 4) if growth_score is not None else None,
                    "quality_score": round(float(quality_score), 4) if quality_score is not None else None,
                    "overall_score": round(float(overall_score), 4) if overall_score is not None else None,
                    "peer_source": "custom" if row.get("symbol") in requested_peers else "auto",
                }
            )

        ranked_rows = sorted(
            enriched_rows,
            key=lambda item: (
                int(bool(item.get("is_target"))),
                float(item.get("overall_score") or 0.0),
                -float(item.get("premium_discount") or 0.0),
            ),
            reverse=True,
        )
        for index, row in enumerate(ranked_rows, start=1):
            row["rank"] = index

        peer_rows = [row for row in ranked_rows if not row.get("is_target")]
        summary = {
            "peer_count": len(peer_rows),
            "custom_peer_count": sum(1 for row in peer_rows if row.get("peer_source") == "custom"),
            "auto_candidate_count": len(candidate_symbols),
            "median_peer_premium_discount": round(float(pd.Series([item.get("premium_discount") for item in peer_rows]).dropna().median()), 2)
            if peer_rows and pd.Series([item.get("premium_discount") for item in peer_rows]).dropna().size
            else None,
            "median_peer_value_score": round(float(pd.Series([item.get("value_score") for item in peer_rows]).dropna().median()), 4)
            if peer_rows and pd.Series([item.get("value_score") for item in peer_rows]).dropna().size
            else None,
        }
        return {
            "rows": ranked_rows,
            "summary": summary,
            "sector": comparison.get("sector"),
            "industry": comparison.get("industry"),
        }

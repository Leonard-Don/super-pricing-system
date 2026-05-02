"""Allocation helpers extracted from CrossMarketBacktester.

Pure relocation of weight rebalancing, allocation-constraint application,
and template overlay construction. The class keeps thin forwarders so call
sites and ``setattr`` test patches continue to work unchanged.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional

import numpy as np

from src.trading.cross_market import AssetSide, AssetUniverse

if TYPE_CHECKING:  # pragma: no cover - typing only
    from src.backtest.cross_market_backtester import CrossMarketBacktester


def rebalance_side_weights(
    weights: np.ndarray,
    *,
    min_weight: Optional[float],
    max_weight: Optional[float],
) -> np.ndarray:
    size = len(weights)
    if size == 0:
        return weights
    if max_weight is not None and max_weight * size < 1 - 1e-9:
        raise ValueError(
            f"max_single_weight={max_weight:.2f} is infeasible for a basket with {size} assets"
        )
    if min_weight is not None and min_weight * size > 1 + 1e-9:
        raise ValueError(
            f"min_single_weight={min_weight:.2f} is infeasible for a basket with {size} assets"
        )

    adjusted = np.zeros(size, dtype=float)
    locked = np.zeros(size, dtype=bool)
    base_weights = np.array(weights, dtype=float)

    while not locked.all():
        remaining = 1.0 - adjusted[locked].sum()
        if remaining < -1e-9:
            raise ValueError("Allocation constraints produced negative remaining weight")

        free_idx = np.where(~locked)[0]
        if len(free_idx) == 0:
            break

        free_base = base_weights[free_idx]
        base_sum = free_base.sum()
        if base_sum <= 0:
            proposed = np.full(len(free_idx), remaining / len(free_idx))
        else:
            proposed = free_base / base_sum * remaining

        changed = False
        if min_weight is not None:
            low_mask = proposed < min_weight - 1e-9
            if low_mask.any():
                for idx in free_idx[low_mask]:
                    adjusted[idx] = float(min_weight)
                    locked[idx] = True
                changed = True

        if max_weight is not None:
            high_mask = proposed > max_weight + 1e-9
            if high_mask.any():
                for idx in free_idx[high_mask]:
                    adjusted[idx] = float(max_weight)
                    locked[idx] = True
                changed = True

        if changed:
            continue

        adjusted[free_idx] = proposed
        break

    adjusted = adjusted / adjusted.sum()
    return adjusted


def apply_allocation_constraints(
    backtester: "CrossMarketBacktester",
    universe: AssetUniverse,
    allocation_constraints: Dict[str, Any],
) -> tuple[AssetUniverse, Dict[str, Any]]:
    max_single_weight = allocation_constraints.get("max_single_weight")
    min_single_weight = allocation_constraints.get("min_single_weight")

    if max_single_weight is None and min_single_weight is None:
        return universe, {
            "applied": False,
            "constraints": {},
            "binding_assets": [],
            "binding_count": 0,
            "max_delta_weight": 0.0,
            "rows": [],
        }

    constrained_assets: List[Dict[str, Any]] = []
    rows: List[Dict[str, Any]] = []
    binding_assets: List[str] = []

    for side in (AssetSide.LONG, AssetSide.SHORT):
        side_assets = universe.get_assets(side)
        original_weights = np.array([float(asset.weight) for asset in side_assets], dtype=float)
        adjusted_weights = backtester._rebalance_side_weights(
            original_weights,
            min_weight=float(min_single_weight) if min_single_weight is not None else None,
            max_weight=float(max_single_weight) if max_single_weight is not None else None,
        )
        for asset, adjusted_weight in zip(side_assets, adjusted_weights):
            delta_weight = float(adjusted_weight - asset.weight)
            binding = None
            if max_single_weight is not None and abs(adjusted_weight - float(max_single_weight)) < 1e-6:
                binding = "max"
            elif min_single_weight is not None and abs(adjusted_weight - float(min_single_weight)) < 1e-6:
                binding = "min"

            if binding:
                binding_assets.append(asset.symbol)

            constrained_assets.append(
                {
                    "symbol": asset.symbol,
                    "asset_class": asset.asset_class.value,
                    "side": asset.side.value,
                    "weight": float(adjusted_weight),
                }
            )
            rows.append(
                {
                    "symbol": asset.symbol,
                    "side": asset.side.value,
                    "asset_class": asset.asset_class.value,
                    "base_weight": round(float(asset.weight), 6),
                    "constrained_weight": round(float(adjusted_weight), 6),
                    "delta_weight": round(delta_weight, 6),
                    "binding": binding or "",
                }
            )

    constrained_universe = AssetUniverse(constrained_assets)
    max_delta = max((abs(float(item["delta_weight"])) for item in rows), default=0.0)
    rows.sort(key=lambda item: (item["side"], -abs(item["delta_weight"]), item["symbol"]))

    return constrained_universe, {
        "applied": True,
        "constraints": {
            "max_single_weight": float(max_single_weight) if max_single_weight is not None else None,
            "min_single_weight": float(min_single_weight) if min_single_weight is not None else None,
        },
        "binding_assets": sorted(set(binding_assets)),
        "binding_count": len(set(binding_assets)),
        "max_delta_weight": round(max_delta, 6),
        "rows": rows,
    }


def build_allocation_overlay(
    *,
    template_context: Dict[str, Any],
    effective_assets: List[Dict[str, Any]],
) -> Dict[str, Any]:
    base_assets = template_context.get("base_assets") or []
    raw_bias_assets = template_context.get("raw_bias_assets") or []
    base_lookup = {
        (str(asset.get("symbol", "")).upper(), str(asset.get("side", "")).lower()): asset
        for asset in base_assets
    }
    raw_bias_lookup = {
        (str(asset.get("symbol", "")).upper(), str(asset.get("side", "")).lower()): asset
        for asset in raw_bias_assets
    }
    rows: List[Dict[str, Any]] = []
    for asset in effective_assets:
        key = (str(asset.get("symbol", "")).upper(), str(asset.get("side", "")).lower())
        base_asset = base_lookup.get(key, {})
        raw_bias_asset = raw_bias_lookup.get(key, {})
        base_weight = float(base_asset.get("weight") or 0.0)
        raw_bias_weight = float(raw_bias_asset.get("weight") or base_weight)
        effective_weight = float(asset.get("weight") or 0.0)
        delta_weight = effective_weight - base_weight
        compression_delta = raw_bias_weight - effective_weight
        rows.append(
            {
                "symbol": asset.get("symbol"),
                "side": asset.get("side"),
                "asset_class": asset.get("asset_class"),
                "base_weight": round(base_weight, 6),
                "raw_bias_weight": round(raw_bias_weight, 6),
                "effective_weight": round(effective_weight, 6),
                "delta_weight": round(delta_weight, 6),
                "compression_delta": round(compression_delta, 6),
            }
        )

    rows.sort(key=lambda item: (item["side"], -abs(item["delta_weight"]), item["symbol"]))
    max_delta = max((abs(item["delta_weight"]) for item in rows), default=0.0)
    shifted_assets = [item["symbol"] for item in rows if abs(item["delta_weight"]) >= 0.02]
    compressed_rows = [
        item for item in rows if abs(float(item.get("compression_delta") or 0.0)) >= 0.005
    ]
    compressed_rows.sort(key=lambda item: -abs(float(item.get("compression_delta") or 0.0)))
    long_raw_total = sum(
        float(item["raw_bias_weight"]) for item in rows if str(item.get("side")) == "long"
    )
    long_effective_total = sum(
        float(item["effective_weight"]) for item in rows if str(item.get("side")) == "long"
    )
    short_raw_total = sum(
        float(item["raw_bias_weight"]) for item in rows if str(item.get("side")) == "short"
    )
    short_effective_total = sum(
        float(item["effective_weight"]) for item in rows if str(item.get("side")) == "short"
    )
    bias_strength_raw = float(template_context.get("bias_strength_raw") or 0.0)
    bias_strength = float(template_context.get("bias_strength") or 0.0)
    compression_effect = round(bias_strength_raw - bias_strength, 6)
    base_recommendation_score = float(template_context.get("base_recommendation_score") or 0.0)
    recommendation_score = float(
        template_context.get("recommendation_score")
        if template_context.get("recommendation_score") is not None
        else base_recommendation_score
    )
    ranking_penalty = float(template_context.get("ranking_penalty") or 0.0)
    ranking_penalty_reason = template_context.get("ranking_penalty_reason") or ""
    input_reliability_label = template_context.get("input_reliability_label") or "unknown"
    input_reliability_score = float(template_context.get("input_reliability_score") or 0.0)
    input_reliability_lead = template_context.get("input_reliability_lead") or ""
    input_reliability_posture = template_context.get("input_reliability_posture") or ""
    input_reliability_reason = template_context.get("input_reliability_reason") or ""
    input_reliability_action_hint = template_context.get("input_reliability_action_hint") or ""
    department_chaos_label = template_context.get("department_chaos_label") or "unknown"
    department_chaos_score = float(template_context.get("department_chaos_score") or 0.0)
    department_chaos_top_department = template_context.get("department_chaos_top_department") or ""
    department_chaos_reason = template_context.get("department_chaos_reason") or ""
    department_chaos_risk_budget_scale = float(
        template_context.get("department_chaos_risk_budget_scale") or 1.0
    )
    policy_execution_label = template_context.get("policy_execution_label") or "unknown"
    policy_execution_score = float(template_context.get("policy_execution_score") or 0.0)
    policy_execution_top_department = template_context.get("policy_execution_top_department") or ""
    policy_execution_reason = template_context.get("policy_execution_reason") or ""
    policy_execution_risk_budget_scale = float(
        template_context.get("policy_execution_risk_budget_scale") or 1.0
    )
    people_fragility_label = template_context.get("people_fragility_label") or "stable"
    people_fragility_score = float(template_context.get("people_fragility_score") or 0.0)
    people_fragility_focus = template_context.get("people_fragility_focus") or ""
    people_fragility_reason = template_context.get("people_fragility_reason") or ""
    people_fragility_risk_budget_scale = float(
        template_context.get("people_fragility_risk_budget_scale") or 1.0
    )
    source_mode_label = template_context.get("source_mode_label") or "mixed"
    source_mode_dominant = template_context.get("source_mode_dominant") or ""
    source_mode_reason = template_context.get("source_mode_reason") or ""
    source_mode_risk_budget_scale = float(
        template_context.get("source_mode_risk_budget_scale") or 1.0
    )
    structural_decay_radar_label = template_context.get("structural_decay_radar_label") or "stable"
    structural_decay_radar_display_label = template_context.get("structural_decay_radar_display_label") or ""
    structural_decay_radar_score = float(template_context.get("structural_decay_radar_score") or 0.0)
    structural_decay_radar_action_hint = template_context.get("structural_decay_radar_action_hint") or ""
    structural_decay_radar_risk_budget_scale = float(
        template_context.get("structural_decay_radar_risk_budget_scale") or 1.0
    )
    structural_decay_radar_top_signals = template_context.get("structural_decay_radar_top_signals") or []

    return {
        "template_id": template_context.get("template_id") or "",
        "template_name": template_context.get("template_name") or "",
        "theme": template_context.get("theme") or "",
        "allocation_mode": template_context.get("allocation_mode") or "template_base",
        "bias_summary": template_context.get("bias_summary") or "",
        "bias_strength_raw": float(template_context.get("bias_strength_raw") or 0.0),
        "bias_strength": float(template_context.get("bias_strength") or 0.0),
        "bias_scale": float(template_context.get("bias_scale") or 1.0),
        "bias_quality_label": template_context.get("bias_quality_label") or "full",
        "bias_quality_reason": template_context.get("bias_quality_reason") or "",
        "base_recommendation_score": base_recommendation_score,
        "recommendation_score": recommendation_score,
        "base_recommendation_tier": template_context.get("base_recommendation_tier") or "",
        "recommendation_tier": template_context.get("recommendation_tier") or "",
        "ranking_penalty": ranking_penalty,
        "ranking_penalty_reason": ranking_penalty_reason,
        "bias_highlights_raw": template_context.get("bias_highlights_raw") or [],
        "bias_highlights": template_context.get("bias_highlights") or [],
        "bias_actions": template_context.get("bias_actions") or [],
        "signal_attribution": template_context.get("signal_attribution") or [],
        "driver_summary": template_context.get("driver_summary") or [],
        "dominant_drivers": template_context.get("dominant_drivers") or [],
        "core_legs": template_context.get("core_legs") or [],
        "support_legs": template_context.get("support_legs") or [],
        "theme_core": template_context.get("theme_core") or "",
        "theme_support": template_context.get("theme_support") or "",
        "execution_posture": template_context.get("execution_posture") or "",
        "bias_compression_effect": compression_effect,
        "compression_summary": {
            "label": (
                "compressed"
                if compression_effect >= 3
                else "cautious"
                if compression_effect >= 1
                else "full"
            ),
            "raw_bias_strength": bias_strength_raw,
            "effective_bias_strength": bias_strength,
            "compression_effect": compression_effect,
            "compression_ratio": round(
                (compression_effect / bias_strength_raw) if bias_strength_raw > 0 else 0.0,
                6,
            ),
            "quality_label": template_context.get("bias_quality_label") or "full",
            "reason": template_context.get("bias_quality_reason") or "",
        },
        "selection_quality": {
            "label": (
                "auto_downgraded"
                if ranking_penalty >= 0.4
                else "softened"
                if ranking_penalty > 0
                else "original"
            ),
            "base_recommendation_score": base_recommendation_score,
            "effective_recommendation_score": recommendation_score,
            "base_recommendation_tier": template_context.get("base_recommendation_tier") or "",
            "effective_recommendation_tier": template_context.get("recommendation_tier") or "",
            "ranking_penalty": ranking_penalty,
            "reason": ranking_penalty_reason,
            "input_reliability_posture": input_reliability_posture,
            "input_reliability_action_hint": input_reliability_action_hint,
        },
        "input_reliability": {
            "label": input_reliability_label,
            "score": input_reliability_score,
            "lead": input_reliability_lead,
            "posture": input_reliability_posture,
            "reason": input_reliability_reason,
            "action_hint": input_reliability_action_hint,
        },
        "department_chaos": {
            "label": department_chaos_label,
            "score": department_chaos_score,
            "top_department": department_chaos_top_department,
            "reason": department_chaos_reason,
            "risk_budget_scale": department_chaos_risk_budget_scale,
            "active": department_chaos_label in {"chaotic", "chaos_guarded"}
            or department_chaos_score >= 0.58,
        },
        "policy_execution": {
            "label": policy_execution_label,
            "score": policy_execution_score,
            "top_department": policy_execution_top_department,
            "reason": policy_execution_reason,
            "risk_budget_scale": policy_execution_risk_budget_scale,
            "active": policy_execution_label in {"chaotic", "watch", "guarded"}
            or policy_execution_score >= 0.54,
        },
        "people_fragility": {
            "label": people_fragility_label,
            "score": people_fragility_score,
            "focus": people_fragility_focus,
            "reason": people_fragility_reason,
            "risk_budget_scale": people_fragility_risk_budget_scale,
            "active": people_fragility_label in {"fragile", "people_guarded"}
            or people_fragility_score >= 0.68,
        },
        "source_mode_summary": {
            "label": source_mode_label,
            "dominant": source_mode_dominant,
            "reason": source_mode_reason,
            "risk_budget_scale": source_mode_risk_budget_scale,
            "active": source_mode_label in {"fallback-heavy", "watch"}
            or source_mode_risk_budget_scale < 0.95,
        },
        "structural_decay_radar": {
            "label": structural_decay_radar_label,
            "display_label": structural_decay_radar_display_label,
            "score": structural_decay_radar_score,
            "action_hint": structural_decay_radar_action_hint,
            "risk_budget_scale": structural_decay_radar_risk_budget_scale,
            "top_signals": structural_decay_radar_top_signals,
            "active": structural_decay_radar_label in {"decay_alert", "decay_guarded"}
            or structural_decay_radar_score >= 0.68,
        },
        "side_bias_summary": {
            "long_raw_weight": round(long_raw_total, 6),
            "long_effective_weight": round(long_effective_total, 6),
            "short_raw_weight": round(short_raw_total, 6),
            "short_effective_weight": round(short_effective_total, 6),
        },
        "max_delta_weight": round(max_delta, 6),
        "shifted_asset_count": len(shifted_assets),
        "shifted_assets": shifted_assets,
        "compressed_asset_count": len(compressed_rows),
        "compressed_assets": [item["symbol"] for item in compressed_rows[:4]],
        "rows": rows,
    }

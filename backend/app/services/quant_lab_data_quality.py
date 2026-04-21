"""Data quality domain service for Quant Lab."""

from __future__ import annotations

import math
import time
from collections import Counter
from datetime import datetime, timezone
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
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


class QuantLabDataQualityService:
    """Owns Quant Lab provider health, audit, and failover quality views."""

    def __init__(
        self,
        *,
        data_manager: Any,
        storage_root: str | Path,
        read_store: Callable[[Path, Any], Any],
        write_store: Callable[[Path, Any], None],
    ) -> None:
        self._data_manager = data_manager
        self._storage_root = Path(storage_root)
        self._read_store = read_store
        self._write_store = write_store

    def get_data_quality(self) -> Dict[str, Any]:
        provider_factory = getattr(self._data_manager, "provider_factory", None)
        if provider_factory is None:
            return {
                "providers": [],
                "summary": {"available": 0, "unavailable": 0},
                "failover_log": [],
                "audit_report": {"findings": [], "provider_status_mix": [], "weakest_provider": None},
                "backtest_quality_report": {"overall_score": 0.0, "risk_level": "unknown", "recommendation": "数据源未初始化"},
            }

        provider_rows = []
        failover_log = []
        probe_symbol = "SPY"
        for name, provider in (provider_factory.providers or {}).items():
            started = time.perf_counter()
            status = "available"
            error_message = ""
            freshness = None
            completeness = None
            latest_points = None
            try:
                history = provider.get_historical_data(probe_symbol)
                latency_ms = round((time.perf_counter() - started) * 1000, 2)
                if history is None or history.empty:
                    status = "degraded"
                    error_message = "empty response"
                    failover_log.append(self._failover_event(name, error_message))
                else:
                    latest_points = len(history)
                    completeness = round(min(len(history.tail(60)) / 60.0, 1.0), 2)
                    freshness = self._calculate_freshness(history.index.max())
            except Exception as exc:  # pragma: no cover - provider/network variance
                latency_ms = round((time.perf_counter() - started) * 1000, 2)
                status = "down"
                error_message = str(exc)
                failover_log.append(self._failover_event(name, error_message))

            provider_rows.append(
                {
                    "provider": name,
                    "status": status,
                    "latency_ms": latency_ms,
                    "freshness_minutes": freshness,
                    "freshness_label": self._label_freshness(freshness),
                    "completeness_score": completeness,
                    "sample_points": latest_points,
                    "error_rate_proxy": 1.0 if status == "down" else 0.35 if status == "degraded" else 0.0,
                    "quality_score": self._score_provider_quality(
                        status=status,
                        freshness_minutes=freshness,
                        completeness_score=completeness,
                        latency_ms=latency_ms,
                    ),
                    "audit_flags": self._build_provider_audit_flags(
                        status=status,
                        freshness_minutes=freshness,
                        completeness_score=completeness,
                        latency_ms=latency_ms,
                    ),
                    "last_error": error_message or None,
                }
            )

        log_path = self._storage_root / "data_quality_failover_log.json"
        historical_log = self._read_store(log_path, default=[])
        combined_log = (failover_log + historical_log)[:60]
        self._write_store(log_path, combined_log)
        audit_report = self._build_data_quality_audit(provider_rows, combined_log)
        backtest_quality_report = self._build_backtest_quality_report(provider_rows, combined_log)

        return _json_ready(
            {
                "summary": {
                    "available": sum(1 for row in provider_rows if row["status"] == "available"),
                    "degraded": sum(1 for row in provider_rows if row["status"] == "degraded"),
                    "down": sum(1 for row in provider_rows if row["status"] == "down"),
                    "stale": sum(1 for row in provider_rows if row.get("freshness_label") == "stale"),
                    "average_latency_ms": round(
                        sum(_safe_float(row.get("latency_ms")) for row in provider_rows) / max(len(provider_rows), 1),
                        2,
                    ),
                    "average_completeness": round(
                        sum(_safe_float(row.get("completeness_score")) for row in provider_rows) / max(len(provider_rows), 1),
                        4,
                    ),
                    "average_quality_score": round(
                        sum(_safe_float(row.get("quality_score")) for row in provider_rows) / max(len(provider_rows), 1),
                        4,
                    ),
                },
                "providers": provider_rows,
                "failover_log": combined_log[:24],
                "audit_report": audit_report,
                "backtest_quality_report": backtest_quality_report,
            }
        )

    def _calculate_freshness(self, timestamp: Any) -> Optional[float]:
        try:
            ts = pd.Timestamp(timestamp).tz_localize(None) if pd.Timestamp(timestamp).tzinfo else pd.Timestamp(timestamp)
            delta = pd.Timestamp.now(tz="UTC").tz_localize(None) - ts
            return round(delta.total_seconds() / 60.0, 2)
        except Exception:
            return None

    def _label_freshness(self, freshness_minutes: Optional[float]) -> str:
        if freshness_minutes is None:
            return "unknown"
        if freshness_minutes <= 30:
            return "fresh"
        if freshness_minutes <= 240:
            return "recent"
        if freshness_minutes <= 1440:
            return "aging"
        return "stale"

    def _score_provider_quality(
        self,
        *,
        status: str,
        freshness_minutes: Optional[float],
        completeness_score: Optional[float],
        latency_ms: float,
    ) -> float:
        score = 1.0
        if status == "degraded":
            score -= 0.25
        elif status == "down":
            score -= 0.55
        freshness_label = self._label_freshness(freshness_minutes)
        freshness_penalty = {
            "fresh": 0.0,
            "recent": 0.08,
            "aging": 0.18,
            "stale": 0.3,
            "unknown": 0.15,
        }.get(freshness_label, 0.15)
        score -= freshness_penalty
        score -= max(0.0, 1.0 - _safe_float(completeness_score, 0.0)) * 0.25
        if latency_ms >= 5000:
            score -= 0.2
        elif latency_ms >= 2000:
            score -= 0.12
        elif latency_ms >= 1000:
            score -= 0.06
        return round(max(0.0, min(score, 1.0)), 4)

    def _build_provider_audit_flags(
        self,
        *,
        status: str,
        freshness_minutes: Optional[float],
        completeness_score: Optional[float],
        latency_ms: float,
    ) -> List[str]:
        flags: List[str] = []
        freshness_label = self._label_freshness(freshness_minutes)
        if status in {"degraded", "down"}:
            flags.append(status)
        if freshness_label in {"aging", "stale"}:
            flags.append(f"{freshness_label}_data")
        if completeness_score is not None and completeness_score < 0.85:
            flags.append("low_completeness")
        if latency_ms >= 2000:
            flags.append("high_latency")
        return flags

    def _build_data_quality_audit(
        self,
        provider_rows: List[Dict[str, Any]],
        failover_log: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        findings: List[Dict[str, Any]] = []
        stale_providers = [row for row in provider_rows if row.get("freshness_label") == "stale"]
        degraded_providers = [row for row in provider_rows if row.get("status") in {"degraded", "down"}]
        incomplete_providers = [row for row in provider_rows if _safe_float(row.get("completeness_score"), 0.0) < 0.85]
        high_latency_providers = [row for row in provider_rows if _safe_float(row.get("latency_ms"), 0.0) >= 2000]

        if degraded_providers:
            findings.append(
                {
                    "severity": "high",
                    "title": "Provider 可用性退化",
                    "detail": f"{len(degraded_providers)} 个数据源处于 degraded/down，优先检查故障转移链路。",
                }
            )
        if stale_providers:
            findings.append(
                {
                    "severity": "high",
                    "title": "存在过期数据源",
                    "detail": f"{', '.join(row['provider'] for row in stale_providers[:4])} 数据新鲜度已进入 stale 区间。",
                }
            )
        if incomplete_providers:
            findings.append(
                {
                    "severity": "medium",
                    "title": "数据完整性不足",
                    "detail": f"{len(incomplete_providers)} 个数据源最近样本覆盖不足，可能影响回测稳定性。",
                }
            )
        if high_latency_providers:
            findings.append(
                {
                    "severity": "medium",
                    "title": "高延迟数据源",
                    "detail": f"{len(high_latency_providers)} 个数据源延迟超过 2000ms，实时联动会偏慢。",
                }
            )
        if not findings:
            findings.append(
                {
                    "severity": "low",
                    "title": "数据质量稳定",
                    "detail": "当前 provider 可用性、完整性和新鲜度都处在可接受范围。",
                }
            )

        weakest_provider = None
        if provider_rows:
            weakest_provider = min(
                provider_rows,
                key=lambda item: (
                    _safe_float(item.get("quality_score"), 0.0),
                    -_safe_float(item.get("error_rate_proxy"), 0.0),
                ),
            )

        provider_status_mix = Counter(str(row.get("status") or "unknown") for row in provider_rows)
        failover_hotspots = Counter(str(item.get("provider") or "unknown") for item in failover_log or [])

        return {
            "findings": findings,
            "provider_status_mix": [{"status": status, "count": count} for status, count in provider_status_mix.most_common()],
            "weakest_provider": weakest_provider,
            "failover_hotspots": [{"provider": provider, "count": count} for provider, count in failover_hotspots.most_common(8)],
        }

    def _build_backtest_quality_report(
        self,
        provider_rows: List[Dict[str, Any]],
        failover_log: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        if not provider_rows:
            return {
                "overall_score": 0.0,
                "risk_level": "unknown",
                "recommendation": "暂无 provider 数据，暂不建议运行正式回测。",
                "drivers": [],
            }

        overall_score = round(
            sum(_safe_float(row.get("quality_score"), 0.0) for row in provider_rows) / max(len(provider_rows), 1),
            4,
        )
        failover_pressure = len(failover_log[:12])
        if overall_score >= 0.82 and failover_pressure <= 2:
            risk_level = "low"
            recommendation = "当前数据质量适合直接进行研究与回测。"
        elif overall_score >= 0.65:
            risk_level = "medium"
            recommendation = "建议先关注过期或高延迟 provider，再运行关键策略回测。"
        else:
            risk_level = "high"
            recommendation = "不建议把当前数据直接用于关键回测，优先处理 provider 退化与故障转移。"

        sorted_rows = sorted(provider_rows, key=lambda item: _safe_float(item.get("quality_score"), 0.0))
        drivers = [
            {
                "provider": row.get("provider"),
                "quality_score": row.get("quality_score"),
                "freshness_label": row.get("freshness_label"),
                "status": row.get("status"),
                "flags": row.get("audit_flags") or [],
            }
            for row in sorted_rows[:5]
        ]
        return {
            "overall_score": overall_score,
            "risk_level": risk_level,
            "recommendation": recommendation,
            "drivers": drivers,
        }

    def _failover_event(self, provider_name: str, reason: str) -> Dict[str, Any]:
        return {
            "timestamp": _utcnow_iso(),
            "provider": provider_name,
            "reason": reason,
        }

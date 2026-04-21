"""Trading journal domain service for Quant Lab."""

from __future__ import annotations

import math
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


class QuantLabTradingJournalService:
    """Owns Quant Lab trading journal reads, writes, and lifecycle summaries."""

    def __init__(
        self,
        *,
        lock: Any,
        profile_file: Callable[[str, Optional[str]], Path],
        read_store: Callable[[Path, Any], Any],
        write_store: Callable[[Path, Any], None],
        trade_manager: Any,
    ) -> None:
        self._lock = lock
        self._profile_file = profile_file
        self._read_store = read_store
        self._write_store = write_store
        self._trade_manager = trade_manager

    def get_trading_journal(self, profile_id: str | None = None) -> Dict[str, Any]:
        stored = self._read_store(self._profile_file("trading_journal", profile_id), default={"notes": {}, "strategy_lifecycle": []})
        history = self._trade_manager.get_history(limit=500)
        notes = stored.get("notes") or {}

        trades = []
        for trade in history:
            note_payload = notes.get(trade.get("id"), {})
            pnl = trade.get("pnl")
            symbol = str(trade.get("symbol") or "").upper()
            total_amount = _safe_float(trade.get("total_amount"))
            trades.append(
                {
                    **trade,
                    "symbol": symbol,
                    "notes": note_payload.get("notes", ""),
                    "strategy_source": note_payload.get("strategy_source", "manual"),
                    "signal_strength": note_payload.get("signal_strength"),
                    "reason_category": note_payload.get("reason_category") or self._infer_trade_reason(trade),
                    "error_category": note_payload.get("error_category") or self._infer_error_category(trade),
                    "risk_bucket": "high" if total_amount >= 15000 else "medium" if total_amount >= 5000 else "low",
                    "pnl": pnl,
                }
            )

        daily_report = self._group_trade_report(trades, freq="D")
        weekly_report = self._group_trade_report(trades, freq="W")
        bias_detection = self._detect_trading_biases(trades)
        lifecycle_entries = self._normalize_strategy_lifecycle(stored.get("strategy_lifecycle") or [])

        losing_trades = [trade for trade in trades if _safe_float(trade.get("pnl")) < 0]
        source_breakdown = Counter(trade.get("strategy_source") or "manual" for trade in trades)
        risk_breakdown = Counter(trade.get("risk_bucket") or "unknown" for trade in trades)

        return _json_ready(
            {
                "profile_id": profile_id or "default",
                "summary": {
                    "total_trades": len(trades),
                    "winning_trades": sum(1 for trade in trades if _safe_float(trade.get("pnl")) > 0),
                    "losing_trades": sum(1 for trade in trades if _safe_float(trade.get("pnl")) < 0),
                    "realized_pnl": round(sum(_safe_float(trade.get("pnl")) for trade in trades), 2),
                    "win_rate": round(
                        sum(1 for trade in trades if _safe_float(trade.get("pnl")) > 0) / max(len([trade for trade in trades if trade.get("pnl") is not None]), 1),
                        4,
                    ),
                    "average_signal_strength": round(
                        np.nanmean([
                            _safe_float(trade.get("signal_strength"), np.nan)
                            for trade in trades
                            if trade.get("signal_strength") not in (None, "")
                        ]) if any(trade.get("signal_strength") not in (None, "") for trade in trades) else 0.0,
                        4,
                    ),
                },
                "trades": trades[:120],
                "daily_report": daily_report[:20],
                "weekly_report": weekly_report[:16],
                "loss_analysis": self._build_loss_analysis(losing_trades),
                "bias_detection": bias_detection,
                "source_breakdown": [
                    {"source": source, "count": count}
                    for source, count in source_breakdown.most_common()
                ],
                "risk_breakdown": [
                    {"bucket": bucket, "count": count}
                    for bucket, count in risk_breakdown.most_common()
                ],
                "strategy_lifecycle": lifecycle_entries,
                "strategy_lifecycle_summary": self._build_strategy_lifecycle_summary(lifecycle_entries),
            }
        )

    def update_trading_journal(self, payload: Dict[str, Any], profile_id: str | None = None) -> Dict[str, Any]:
        filepath = self._profile_file("trading_journal", profile_id)
        with self._lock:
            current = self._read_store(filepath, default={"notes": {}, "strategy_lifecycle": []})
            next_notes = current.get("notes") or {}
            for trade_id, value in (payload.get("notes") or {}).items():
                if isinstance(value, dict):
                    next_notes[str(trade_id)] = value
            current["notes"] = next_notes
            if isinstance(payload.get("strategy_lifecycle"), list):
                current["strategy_lifecycle"] = self._normalize_strategy_lifecycle(payload["strategy_lifecycle"])
            self._write_store(filepath, current)
        return self.get_trading_journal(profile_id)

    def _infer_trade_reason(self, trade: Dict[str, Any]) -> str:
        pnl = trade.get("pnl")
        action = str(trade.get("action") or "").upper()
        if action == "BUY":
            return "signal_entry"
        if pnl is None:
            return "position_adjustment"
        return "profit_taking" if _safe_float(pnl) > 0 else "risk_exit"

    def _infer_error_category(self, trade: Dict[str, Any]) -> str:
        pnl = _safe_float(trade.get("pnl"))
        total_amount = _safe_float(trade.get("total_amount"))
        if pnl >= 0:
            return "none"
        if total_amount >= 15000:
            return "oversized_position"
        if total_amount <= 2000:
            return "noise_trade"
        return "timing_error"

    def _group_trade_report(self, trades: List[Dict[str, Any]], *, freq: str) -> List[Dict[str, Any]]:
        if not trades:
            return []
        frame = pd.DataFrame(trades)
        if frame.empty or "timestamp" not in frame.columns:
            return []
        frame["timestamp"] = pd.to_datetime(frame["timestamp"], errors="coerce")
        frame = frame.dropna(subset=["timestamp"])
        if frame.empty:
            return []
        frame["has_realized_pnl"] = frame["pnl"].notna()
        frame["pnl"] = frame["pnl"].fillna(0.0)
        if "signal_strength" not in frame.columns:
            frame["signal_strength"] = np.nan
        frame["signal_strength"] = pd.to_numeric(frame["signal_strength"], errors="coerce")
        grouped = frame.groupby(pd.Grouper(key="timestamp", freq=freq))
        rows = []
        for key, group in grouped:
            if group.empty:
                continue
            closed_group = group[group["has_realized_pnl"]]
            winning = int((closed_group["pnl"] > 0).sum())
            closed_count = int(len(closed_group))
            rows.append(
                {
                    "period": key.strftime("%Y-%m-%d"),
                    "trade_count": int(len(group)),
                    "realized_pnl": round(float(group["pnl"].sum()), 2),
                    "winning_trades": winning,
                    "losing_trades": int((closed_group["pnl"] < 0).sum()),
                    "win_rate": round(winning / max(closed_count, 1), 4),
                    "average_pnl": round(float(closed_group["pnl"].mean()), 2) if closed_count else 0.0,
                    "average_signal_strength": round(float(group["signal_strength"].mean()), 3) if group["signal_strength"].notna().any() else None,
                }
            )
        rows.reverse()
        return rows

    def _build_loss_analysis(self, losing_trades: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not losing_trades:
            return []
        frame = pd.DataFrame(losing_trades)
        if frame.empty:
            return []
        frame["error_category"] = frame["error_category"].fillna("uncategorized")
        frame["risk_bucket"] = frame["risk_bucket"].fillna("unknown")
        frame["pnl"] = pd.to_numeric(frame["pnl"], errors="coerce").fillna(0.0)
        frame["total_amount"] = pd.to_numeric(frame["total_amount"], errors="coerce").fillna(0.0)
        total_abs_loss = abs(float(frame["pnl"].sum())) or 1.0
        rows = []
        for category, group in frame.groupby("error_category"):
            risk_mix = Counter(str(bucket or "unknown") for bucket in group["risk_bucket"].tolist())
            symbols = [symbol for symbol in group["symbol"].value_counts().head(3).index.tolist() if symbol]
            rows.append(
                {
                    "category": category,
                    "count": int(len(group)),
                    "realized_pnl": round(float(group["pnl"].sum()), 2),
                    "share_of_losses": round(abs(float(group["pnl"].sum())) / total_abs_loss, 4),
                    "average_loss": round(float(group["pnl"].mean()), 2),
                    "average_size": round(float(group["total_amount"].mean()), 2),
                    "top_symbols": symbols,
                    "dominant_risk_bucket": risk_mix.most_common(1)[0][0] if risk_mix else "unknown",
                }
            )
        rows.sort(key=lambda item: (item["count"], abs(item["realized_pnl"])), reverse=True)
        return rows

    def _normalize_strategy_lifecycle(self, entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        normalized = []
        for index, entry in enumerate(entries):
            if not isinstance(entry, dict):
                continue
            strategy = str(entry.get("strategy") or entry.get("name") or "").strip()
            if not strategy:
                continue
            stage = str(entry.get("stage") or "discovered").strip().lower().replace(" ", "_")
            status = str(entry.get("status") or ("closed" if stage in {"retired", "archived"} else "active")).strip().lower()
            conviction = entry.get("conviction")
            conviction_value = None
            if conviction not in (None, ""):
                conviction_value = _safe_float(conviction, 0.0)
                if conviction_value > 1:
                    conviction_value = conviction_value / 100.0
                conviction_value = max(0.0, min(conviction_value, 1.0))
            updated_at = str(entry.get("updated_at") or _utcnow_iso())
            normalized.append(
                {
                    "id": str(entry.get("id") or f"{strategy.lower().replace(' ', '_')}-{index + 1}"),
                    "strategy": strategy,
                    "stage": stage,
                    "status": status,
                    "owner": str(entry.get("owner") or "research").strip(),
                    "conviction": round(conviction_value, 4) if conviction_value is not None else None,
                    "next_action": str(entry.get("next_action") or "").strip(),
                    "notes": str(entry.get("notes") or "").strip(),
                    "created_at": str(entry.get("created_at") or updated_at),
                    "updated_at": updated_at,
                }
            )
        normalized.sort(key=lambda item: item.get("updated_at") or "", reverse=True)
        return normalized

    def _build_strategy_lifecycle_summary(self, entries: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not entries:
            return {
                "total": 0,
                "active": 0,
                "average_conviction": 0.0,
                "stage_breakdown": [],
                "status_breakdown": [],
            }
        stage_breakdown = Counter(str(entry.get("stage") or "unknown") for entry in entries)
        status_breakdown = Counter(str(entry.get("status") or "unknown") for entry in entries)
        convictions = [
            _safe_float(entry.get("conviction"), np.nan)
            for entry in entries
            if entry.get("conviction") not in (None, "")
        ]
        finite_convictions = [value for value in convictions if not math.isnan(value)]
        return {
            "total": len(entries),
            "active": sum(1 for entry in entries if str(entry.get("status") or "").lower() == "active"),
            "average_conviction": round(float(sum(finite_convictions) / len(finite_convictions)), 4) if finite_convictions else 0.0,
            "stage_breakdown": [{"stage": stage, "count": count} for stage, count in stage_breakdown.most_common()],
            "status_breakdown": [{"status": status, "count": count} for status, count in status_breakdown.most_common()],
        }

    def _detect_trading_biases(self, trades: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not trades:
            return []
        frame = pd.DataFrame(trades)
        frame["timestamp"] = pd.to_datetime(frame["timestamp"], errors="coerce")
        frame["pnl"] = frame["pnl"].fillna(0.0)
        active_days = max(frame["timestamp"].dt.date.nunique(), 1)
        trades_per_day = len(frame) / active_days
        avg_win = frame.loc[frame["pnl"] > 0, "pnl"].mean() if (frame["pnl"] > 0).any() else 0.0
        avg_loss = frame.loc[frame["pnl"] < 0, "pnl"].mean() if (frame["pnl"] < 0).any() else 0.0
        top_symbol_share = frame["symbol"].value_counts(normalize=True).max()

        findings = []
        if trades_per_day >= 3:
            findings.append({"bias": "overtrading", "severity": "high", "evidence": f"平均每日 {trades_per_day:.1f} 笔交易"})
        if avg_win and avg_loss and abs(avg_loss) > avg_win * 1.5:
            findings.append({"bias": "disposition_effect", "severity": "medium", "evidence": f"平均亏损 {abs(avg_loss):.2f} 明显大于平均盈利 {avg_win:.2f}"})
        if top_symbol_share and top_symbol_share >= 0.45:
            findings.append({"bias": "concentration_bias", "severity": "medium", "evidence": f"单一标的占交易数 {top_symbol_share:.0%}"})
        if not findings:
            findings.append({"bias": "balanced", "severity": "low", "evidence": "当前交易行为未见明显偏差模式"})
        return findings

#!/usr/bin/env python3
"""
导出另类数据公开摘要 (Phase F1).

把 runtime 私有缓存 ``cache/alt_data/providers/*.json`` 蒸馏为一份小而稳定、
可安全提交到版本库的 ``data/public/alt_data_summary.json``：

- 上游 runtime 缓存被 ``.gitignore`` 排除、含进程内调试字段、原始 RSS 正文、
  文件路径等内部数据，不能直接对外暴露。
- 下游消费者（例如 sibling 项目 ``cn-altdata-brief``、未来的 GitHub Pages
  日报）只读这份精简文件即可，不需要直接访问 runtime cache。

设计要点：

1. **schema 稳定**：顶层 ``schema_version`` 控制破坏性变更；同输入同输出
   （除了 ``generated_at`` 是当前运行时刻），方便 ``git diff`` 看出真实
   数据变化而不是元数据噪音。
2. **安全过滤**：永远不写入文件路径、原始 HTML 正文、debug 字段、
   ``_internal_*`` 命名字段、provider info 等内部 metadata。
3. **大小可控**：每个 provider 只保留聚合维度（行业信号 top-N、库存
   按金属/区域聚合等），不带 records 明细，单次输出预期 < 10 KB。

脚本自包含：可在不启动 FastAPI 的情况下直接 ``python scripts/export_public_summary.py``。
Celery beat 路径在 ``backend/app/core/alt_data_tasks.py:export_public_summary``
里调用同一个 ``build_public_summary`` 函数，保证两条路径输出一致。
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PROVIDERS_DIR = PROJECT_ROOT / "cache" / "alt_data" / "providers"
DEFAULT_OUTPUT_PATH = PROJECT_ROOT / "data" / "public" / "alt_data_summary.json"
DEFAULT_VERSION_PATH = PROJECT_ROOT / "VERSION"

# Ensure the script can resolve ``src.data.alternative.*`` and
# ``backend.app.*`` imports when invoked via ``python scripts/...``.
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Stable schema version. Bumps when the *shape* of any output field
# changes in a breaking way. Additive fields do not bump.
SCHEMA_VERSION = 1

# Cap industry_signals to top-N by |avg_impact| so the file stays bounded
# even when policy_radar gets richer per-industry coverage. The current
# snapshot only has ~5 industries; this is precautionary headroom.
MAX_INDUSTRY_SIGNALS = 25

# Cap people_layer watchlist preview entries. Each entry is just
# {symbol, risk_level, stance} -- no per-symbol evidence detail leaks.
MAX_WATCHLIST_PREVIEW = 30

# Cap policy_execution department previews to avoid unbounded growth.
MAX_DEPARTMENT_PREVIEW = 10

# Cap the fund_holdings top-concentration leaderboard so the public summary
# never grows unboundedly with the size of the catalog. 10 mirrors the
# provider's own ``top_concentration_tickers`` slice.
MAX_FUND_CONCENTRATION_TICKERS = 10

# Cap the northbound industry inflow / outflow leaderboards. 5 mirrors the
# provider's own ``PUBLIC_TOP_INDUSTRY_LIMIT`` constant so the two stay aligned.
MAX_NORTHBOUND_INDUSTRY_PREVIEW = 5

# Cap block-trade previews. 5 mirrors the provider's ``PUBLIC_TOP_LIMIT``.
MAX_BLOCK_TRADES_PREVIEW = 5

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _read_provider_snapshot(providers_dir: Path, provider: str) -> Optional[Dict[str, Any]]:
    path = providers_dir / f"{provider}.json"
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to read provider snapshot %s: %s", path, exc)
        return None


def _read_version(version_path: Path) -> str:
    try:
        return version_path.read_text(encoding="utf-8").strip() or "unknown"
    except OSError:
        return "unknown"


def _now_utc_iso() -> str:
    """Stable, microsecond-stripped UTC ISO timestamp."""
    return (
        datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat()
    )


def _last_refresh_at(snapshot: Dict[str, Any]) -> Optional[str]:
    """Return the snapshot's logical refresh time, sanitized to ISO 8601."""

    candidate = (
        snapshot.get("snapshot_timestamp")
        or (snapshot.get("refresh_status") or {}).get("last_success_at")
        or (snapshot.get("signal") or {}).get("timestamp")
    )
    return candidate if isinstance(candidate, str) else None


# ---------------------------------------------------------------------------
# Per-provider distillation
# ---------------------------------------------------------------------------


def _distill_policy_radar(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    signal = snapshot.get("signal") or {}
    source_health = signal.get("source_health") or {}

    by_source: Dict[str, int] = {}
    for src, payload in source_health.items():
        if not isinstance(payload, dict):
            continue
        by_source[str(src)] = int(payload.get("record_count", 0) or 0)
    # Always surface the canonical CN/west source set so downstream
    # consumers see explicit zeros when a region is dark.
    for canonical in ("fed", "ecb", "ndrc", "nea", "boe"):
        by_source.setdefault(canonical, 0)

    industry_signals_raw = signal.get("industry_signals") or {}
    industry_signals: Dict[str, Dict[str, Any]] = {}
    for industry, payload in industry_signals_raw.items():
        if not isinstance(payload, dict):
            continue
        industry_signals[str(industry)] = {
            "avg_impact": round(float(payload.get("avg_impact", 0.0) or 0.0), 4),
            "mentions": int(payload.get("mentions", 0) or 0),
            "signal": str(payload.get("signal", "neutral")),
        }
    # Bound the number of industries we publish (top-N by |avg_impact|, ties
    # broken by mentions). Deterministic ordering for stable git diffs.
    if len(industry_signals) > MAX_INDUSTRY_SIGNALS:
        trimmed = sorted(
            industry_signals.items(),
            key=lambda kv: (abs(kv[1]["avg_impact"]), kv[1]["mentions"], kv[0]),
            reverse=True,
        )[:MAX_INDUSTRY_SIGNALS]
        industry_signals = dict(trimmed)

    return {
        "last_refresh_at": _last_refresh_at(snapshot),
        "total_records": int(signal.get("record_count", 0) or 0),
        "policy_count": int(signal.get("policy_count", 0) or 0),
        "by_source": dict(sorted(by_source.items())),
        "industry_signals": dict(sorted(industry_signals.items())),
    }


def _distill_macro_hf(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    signal = snapshot.get("signal") or {}
    records = snapshot.get("records") or []

    # Group inventory records by metal, then by region (derived from
    # source_mode: 'live' = SHFE, 'proxy' = LME).
    metals: Dict[str, Dict[str, Any]] = {}
    for record in records:
        if not isinstance(record, dict):
            continue
        raw = record.get("raw_value") or {}
        if raw.get("data_type") != "inventory":
            continue
        metal = str(raw.get("metal") or "").strip()
        if not metal:
            continue
        source_mode = str(raw.get("source_mode") or "").strip()
        region = "SHFE" if source_mode == "live" else "LME" if source_mode == "proxy" else "unknown"
        bucket = metals.setdefault(
            metal,
            {
                "weekly_change_pct": 0.0,
                "trend": "stable",
                "region_breakdown": {},
            },
        )
        region_entry = {
            "source_mode": source_mode or "unknown",
            "trend": str(raw.get("trend") or "stable"),
            "price_change_pct": round(
                float(raw.get("price_change_pct", 0.0) or 0.0), 3
            ),
            "confidence": round(float(raw.get("confidence", 0.0) or 0.0), 3),
            "lag_days": int(raw.get("lag_days", 0) or 0),
            "coverage": round(float(raw.get("coverage", 0.0) or 0.0), 3),
        }
        bucket["region_breakdown"][region] = region_entry

    # Pick an aggregate weekly_change_pct per metal: prefer the SHFE
    # (live) reading; fall back to LME if no live row exists. Mirrors how
    # the runtime's macro_pressure is region-weighted.
    for metal_name, payload in metals.items():
        regions = payload["region_breakdown"]
        preferred = regions.get("SHFE") or regions.get("LME") or next(iter(regions.values()), {})
        payload["weekly_change_pct"] = float(preferred.get("price_change_pct", 0.0))
        payload["trend"] = str(preferred.get("trend", "stable"))

    dimensions_raw = signal.get("dimensions") or {}
    dimensions: Dict[str, Dict[str, Any]] = {}
    for dim, payload in dimensions_raw.items():
        if not isinstance(payload, dict):
            continue
        dimensions[str(dim)] = {
            "count": int(payload.get("count", 0) or 0),
            "score": round(float(payload.get("score", 0.0) or 0.0), 4),
        }

    source_mode_summary = signal.get("source_mode_summary") or {}
    dominant_mode = source_mode_summary.get("dominant") if isinstance(source_mode_summary, dict) else None

    return {
        "last_refresh_at": _last_refresh_at(snapshot),
        "metals": dict(sorted(metals.items())),
        "dimensions": dict(sorted(dimensions.items())),
        "macro_pressure": round(float(signal.get("macro_pressure", 0.0) or 0.0), 4),
        "dominant_source_mode": str(dominant_mode) if dominant_mode else None,
    }


def _distill_people_layer(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    signal = snapshot.get("signal") or {}
    watchlist = signal.get("watchlist") or []

    # Preview entries: only safe fields (symbol, risk_level, stance,
    # fragility/quality scores). No evidence detail / governance bullets.
    preview: List[Dict[str, Any]] = []
    for entry in watchlist[:MAX_WATCHLIST_PREVIEW]:
        if not isinstance(entry, dict):
            continue
        preview.append(
            {
                "symbol": str(entry.get("symbol") or ""),
                "risk_level": str(entry.get("risk_level") or "unknown"),
                "stance": str(entry.get("stance") or "unknown"),
                "people_fragility_score": round(
                    float(entry.get("people_fragility_score", 0.0) or 0.0), 3
                ),
                "people_quality_score": round(
                    float(entry.get("people_quality_score", 0.0) or 0.0), 3
                ),
            }
        )

    source_mode_summary = signal.get("source_mode_summary") or {}
    dominant_mode = source_mode_summary.get("dominant") if isinstance(source_mode_summary, dict) else None

    return {
        "last_refresh_at": _last_refresh_at(snapshot),
        "ticker_count": int(signal.get("company_count", 0) or 0),
        "fragile_company_count": int(signal.get("fragile_company_count", 0) or 0),
        "supportive_company_count": int(signal.get("supportive_company_count", 0) or 0),
        "avg_fragility_score": round(float(signal.get("avg_fragility_score", 0.0) or 0.0), 4),
        "avg_quality_score": round(float(signal.get("avg_quality_score", 0.0) or 0.0), 4),
        "dominant_mode": str(dominant_mode) if dominant_mode else "unknown",
        "watchlist_preview": preview,
    }


def _distill_policy_execution(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    signal = snapshot.get("signal") or {}
    departments_raw = signal.get("department_board") or signal.get("top_departments") or []

    departments: List[Dict[str, Any]] = []
    for entry in departments_raw[:MAX_DEPARTMENT_PREVIEW]:
        if not isinstance(entry, dict):
            continue
        departments.append(
            {
                "department": str(entry.get("department") or ""),
                "department_label": str(entry.get("department_label") or ""),
                "record_count": int(entry.get("record_count", 0) or 0),
                "chaos_score": round(float(entry.get("chaos_score", 0.0) or 0.0), 4),
                "label": str(entry.get("label") or ""),
                "policy_reversal_count": int(entry.get("policy_reversal_count", 0) or 0),
                "execution_status": str(entry.get("execution_status") or ""),
                "lag_days": int(entry.get("lag_days", 0) or 0),
            }
        )

    return {
        "last_refresh_at": _last_refresh_at(snapshot),
        "department_count": int(signal.get("department_count", 0) or 0),
        "chaotic_department_count": int(signal.get("chaotic_department_count", 0) or 0),
        "reversal_count": int(signal.get("reversal_count", 0) or 0),
        "departments": departments,
    }


def _distill_supply_chain(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    signal = snapshot.get("signal") or {}
    dimensions_raw = signal.get("dimensions") or {}
    dimensions: Dict[str, Dict[str, Any]] = {}
    for dim, payload in dimensions_raw.items():
        if not isinstance(payload, dict):
            continue
        dimensions[str(dim)] = {
            "count": int(payload.get("count", 0) or 0),
            "score": round(float(payload.get("score", 0.0) or 0.0), 4),
            "label": str(payload.get("label") or ""),
        }
    return {
        "last_refresh_at": _last_refresh_at(snapshot),
        "dimensions": dict(sorted(dimensions.items())),
        "alert_count": int(signal.get("alert_count", 0) or 0),
    }


def _distill_fund_holdings(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    """Distill the fund_holdings provider snapshot.

    Strict aggregate-only output — never surfaces per-fund evidence beyond
    the catalog fund codes already public on 天天基金 / akshare. Fields:

    - ``last_refresh_at``: ISO 8601 stamp of the most recent successful run.
    - ``total_funds_covered`` / ``total_funds_requested``: cardinality of
      the live snapshot's fund response set vs. the curated catalog
      (typically 50). Together they communicate "how confident is this
      aggregate" without exposing fund-level holdings.
    - ``catalog_version``: e.g. ``2026-Q1``; lets a downstream consumer
      detect a curated-list edit between runs.
    - ``top_concentration_tickers``: per-ticker
      ``{ticker, stock_name, holding_fund_count, total_aum_weight_pct}``
      rows capped at MAX_FUND_CONCENTRATION_TICKERS by
      ``holding_fund_count``. Per-fund attribution such as the top-holder
      fund code is intentionally omitted from the public file.
    - ``signal_strength`` / ``score`` echoed from the signal so a brief
      consumer can render the direction quickly.
    """

    signal = snapshot.get("signal") or {}
    top_raw = signal.get("top_concentration_tickers") or []

    top: List[Dict[str, Any]] = []
    for entry in top_raw[:MAX_FUND_CONCENTRATION_TICKERS]:
        if not isinstance(entry, dict):
            continue
        top.append(
            {
                "ticker": str(entry.get("ticker") or ""),
                "stock_name": str(entry.get("stock_name") or ""),
                "holding_fund_count": int(entry.get("holding_fund_count", 0) or 0),
                "total_aum_weight_pct": round(
                    float(entry.get("total_aum_weight_pct", 0.0) or 0.0), 4
                ),
            }
        )

    return {
        "last_refresh_at": _last_refresh_at(snapshot),
        "total_funds_covered": int(signal.get("total_funds_covered", 0) or 0),
        "total_funds_requested": int(signal.get("total_funds_requested", 0) or 0),
        "catalog_version": str(signal.get("catalog_version") or ""),
        "signal_strength": round(float(signal.get("strength", 0.0) or 0.0), 4),
        "score": round(float(signal.get("score", 0.0) or 0.0), 4),
        "confidence": round(float(signal.get("confidence", 0.0) or 0.0), 4),
        "top_concentration_tickers": top,
    }


def _distill_northbound(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    """Distill the northbound provider snapshot.

    Strict aggregate-only output — per-stock detail (ticker, stock_name,
    holding_value_cny) is intentionally omitted from the public summary
    even though it lives in runtime records. The public file only exposes
    the daily netflow, 30-day cumulative, and industry-level inflow /
    outflow leaderboards capped at MAX_NORTHBOUND_INDUSTRY_PREVIEW each.
    """

    signal = snapshot.get("signal") or {}
    raw_inflow = signal.get("top_inflow_industries") or []
    raw_outflow = signal.get("top_outflow_industries") or []

    def _industry_row(entry: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "industry": str(entry.get("industry") or ""),
            "netbuy_cny_billion": round(
                float(entry.get("netbuy_cny_billion", 0.0) or 0.0), 4
            ),
        }

    top_inflow: List[Dict[str, Any]] = []
    for entry in raw_inflow[:MAX_NORTHBOUND_INDUSTRY_PREVIEW]:
        if isinstance(entry, dict):
            top_inflow.append(_industry_row(entry))

    top_outflow: List[Dict[str, Any]] = []
    for entry in raw_outflow[:MAX_NORTHBOUND_INDUSTRY_PREVIEW]:
        if isinstance(entry, dict):
            top_outflow.append(_industry_row(entry))

    return {
        "last_refresh_at": _last_refresh_at(snapshot),
        "last_trade_date": str(signal.get("last_trade_date") or ""),
        "daily_netflow_cny_billion": round(
            float(signal.get("daily_netflow_cny_billion", 0.0) or 0.0), 4
        ),
        "cumulative_30d_cny_billion": round(
            float(signal.get("cumulative_30d_cny_billion", 0.0) or 0.0), 4
        ),
        "signal_strength": round(float(signal.get("strength", 0.0) or 0.0), 4),
        "score": round(float(signal.get("score", 0.0) or 0.0), 4),
        "confidence": round(float(signal.get("confidence", 0.0) or 0.0), 4),
        "top_inflow_industries": top_inflow,
        "top_outflow_industries": top_outflow,
    }


def _distill_block_trades(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    """Distill the block_trades provider snapshot.

    Strict aggregate-only output. Runtime records may include per-ticker
    aggregates, but brokerage-seat detail is never emitted by the provider
    and the public file keeps only bounded ticker and industry leaderboards.
    """

    signal = snapshot.get("signal") or {}
    last_refresh_at = _last_refresh_at(snapshot)
    raw_inflow = signal.get("top_inflow_industries") or []
    raw_outflow = signal.get("top_outflow_industries") or []
    raw_tickers = signal.get("top_n_concentrated_tickers") or []

    def _industry_row(entry: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "industry": str(entry.get("industry") or ""),
            "net_flow_billion": round(
                float(entry.get("net_flow_billion", 0.0) or 0.0), 4
            ),
            "n_tickers_traded": int(entry.get("n_tickers_traded", 0) or 0),
        }

    top_inflow: List[Dict[str, Any]] = []
    for entry in raw_inflow[:MAX_BLOCK_TRADES_PREVIEW]:
        if isinstance(entry, dict):
            top_inflow.append(_industry_row(entry))

    top_outflow: List[Dict[str, Any]] = []
    for entry in raw_outflow[:MAX_BLOCK_TRADES_PREVIEW]:
        if isinstance(entry, dict):
            top_outflow.append(_industry_row(entry))

    top_tickers: List[Dict[str, Any]] = []
    for entry in raw_tickers[:MAX_BLOCK_TRADES_PREVIEW]:
        if not isinstance(entry, dict):
            continue
        top_tickers.append(
            {
                "ticker": str(entry.get("ticker") or ""),
                "stock_name": str(entry.get("stock_name") or ""),
                "industry": str(entry.get("industry") or ""),
                "n_trades_in_window": int(entry.get("n_trades_in_window", 0) or 0),
                "net_flow_billion": round(
                    float(entry.get("net_flow_billion", 0.0) or 0.0), 4
                ),
                "dominant_side": str(entry.get("dominant_side") or "mixed"),
            }
        )

    return {
        "last_refresh_at": last_refresh_at,
        "last_trade_date": str(signal.get("last_trade_date") or ""),
        "total_daily_value_billion": round(
            float(signal.get("total_daily_value_billion", 0.0) or 0.0), 4
        ),
        "avg_premium_pct": round(float(signal.get("avg_premium_pct", 0.0) or 0.0), 4),
        "signal_strength": round(float(signal.get("strength", 0.0) or 0.0), 4),
        "score": round(float(signal.get("score", 0.0) or 0.0), 4),
        "confidence": round(float(signal.get("confidence", 0.0) or 0.0), 4),
        "top_inflow_industries": top_inflow,
        "top_outflow_industries": top_outflow,
        "top_concentrated_tickers": top_tickers,
        "evidence_link": {
            "component": "block_trades",
            "source_mode": "public_disclosure",
            "source": "SSE/SZSE aggregate block-trade disclosures",
            "audit_ref": "block-trades-provider",
            "last_refresh_at": last_refresh_at,
            "redaction": "aggregate_only_no_brokerage_seats",
        },
    }


# Provider -> distiller mapping. Order matters for the output (sorted keys
# below mean the final JSON is deterministic regardless of this order).
PROVIDER_DISTILLERS = {
    "policy_radar": _distill_policy_radar,
    "macro_hf": _distill_macro_hf,
    "people_layer": _distill_people_layer,
    "policy_execution": _distill_policy_execution,
    "supply_chain": _distill_supply_chain,
    "fund_holdings": _distill_fund_holdings,
    "northbound": _distill_northbound,
    "block_trades": _distill_block_trades,
}


# ---------------------------------------------------------------------------
# Components health (mirrors src.data.alternative.health_manifest counts)
# ---------------------------------------------------------------------------


def _build_components_health() -> Dict[str, int]:
    """Aggregate health-manifest counts without depending on runtime state.

    Uses the static manifest (no I/O against snapshot mtimes), so this
    summary stays deterministic across runs even when the cache is empty
    -- the verdict tier itself doesn't depend on freshness.
    """

    # Imported lazily so this script stays runnable even when alt-data
    # heavy dependencies (akshare, yfinance) are missing.
    from src.data.alternative.health_manifest import (
        ALT_DATA_HEALTH_MANIFEST,
        VERDICT_DEAD,
        VERDICT_PRODUCTION,
        VERDICT_SCAFFOLDING_ONLY,
        VERDICT_WORKING_PROTOTYPE,
    )

    counts: Dict[str, int] = {
        VERDICT_PRODUCTION: 0,
        VERDICT_WORKING_PROTOTYPE: 0,
        VERDICT_SCAFFOLDING_ONLY: 0,
        VERDICT_DEAD: 0,
    }
    for component in ALT_DATA_HEALTH_MANIFEST:
        counts[component.verdict] = counts.get(component.verdict, 0) + 1

    return {
        "total": len(ALT_DATA_HEALTH_MANIFEST),
        "production": counts[VERDICT_PRODUCTION],
        "working_prototype": counts[VERDICT_WORKING_PROTOTYPE],
        "scaffolding_only": counts[VERDICT_SCAFFOLDING_ONLY],
        "dead": counts[VERDICT_DEAD],
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def build_public_summary(
    providers_dir: Path = DEFAULT_PROVIDERS_DIR,
    *,
    version_path: Path = DEFAULT_VERSION_PATH,
    generated_at: Optional[str] = None,
    include_components_health: bool = True,
) -> Dict[str, Any]:
    """Build the public alt-data summary dict from on-disk provider snapshots.

    Parameters
    ----------
    providers_dir:
        Directory containing ``<provider>.json`` runtime snapshots.
        Missing files are silently skipped (provider key absent from output).
    version_path:
        Source-codebase version file (defaults to repo ``VERSION``).
    generated_at:
        Override for the ``generated_at`` field. Defaults to current UTC.
        Tests pass a fixed value for deterministic assertions.
    include_components_health:
        Whether to call into ``src.data.alternative.health_manifest`` for the
        per-verdict count block. Skipped in tests that can't import the
        heavy provider chain.
    """

    providers: Dict[str, Dict[str, Any]] = {}
    raw_snapshots: Dict[str, Dict[str, Any]] = {}
    for provider, distiller in PROVIDER_DISTILLERS.items():
        snapshot = _read_provider_snapshot(providers_dir, provider)
        if snapshot is None:
            continue
        providers[provider] = distiller(snapshot)
        raw_snapshots[provider] = snapshot

    payload: Dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at or _now_utc_iso(),
        "source_codebase_version": _read_version(version_path),
        "providers": dict(sorted(providers.items())),
    }

    if include_components_health:
        try:
            payload["components_health"] = _build_components_health()
        except ImportError as exc:
            logger.warning("Skipping components_health (import failed): %s", exc)

    # Composite signal layer — only attempt when at least one provider snapshot
    # is on disk. Failures degrade silently because the script must stay
    # runnable when alt-data heavy dependencies (akshare, yfinance) are absent.
    if raw_snapshots:
        try:
            payload["composite_signals"] = _build_composite_signals(raw_snapshots)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Skipping composite_signals: %s", exc)

    # Macro briefing — same stub-manager trick as composite signals so the
    # script stays runnable without booting the heavy provider chain. Only
    # the publish-safe distillation (summary_paragraph + top_3_themes) makes
    # the trip; full evidence_links carry runtime cache paths and stay
    # private.
    if raw_snapshots:
        try:
            payload["macro_briefing"] = _build_macro_briefing(raw_snapshots)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Skipping macro_briefing: %s", exc)

    return payload


def _build_composite_signals(
    raw_snapshots: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    """Detect composite signals over on-disk snapshots without booting the manager.

    Constructs a lightweight duck-typed manager carrying just the bits the
    composite signal detector needs (``latest_signals`` + per-provider
    history). Side-effect free.
    """

    from src.data.alternative.base_alt_provider import AltDataRecord
    from src.data.alternative.composite_signal import (
        composite_signals_to_public_summary,
        detect_composite_signals,
    )

    class _StubProvider:
        def __init__(self, records: List[Any]):
            self._history = records

    class _StubManager:
        def __init__(
            self,
            latest_signals: Dict[str, Any],
            providers: Dict[str, _StubProvider],
        ):
            self.latest_signals = latest_signals
            self.providers = providers

    latest_signals: Dict[str, Any] = {}
    stub_providers: Dict[str, _StubProvider] = {}
    for provider, snapshot in raw_snapshots.items():
        latest_signals[provider] = snapshot.get("signal") or {}
        records: List[Any] = []
        for record_payload in snapshot.get("records") or []:
            try:
                records.append(AltDataRecord.from_dict(record_payload))
            except (KeyError, ValueError, TypeError):
                continue
        stub_providers[provider] = _StubProvider(records)

    manager = _StubManager(latest_signals, stub_providers)
    composites = detect_composite_signals(manager, include_low=False)
    return composite_signals_to_public_summary(composites)


def _build_macro_briefing(
    raw_snapshots: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    """Compose a macro briefing over on-disk snapshots without booting the manager.

    Re-uses the same lightweight duck-typed manager pattern as
    :func:`_build_composite_signals` so the export script keeps its
    "no heavy deps required" contract. Returns only the publish-safe
    distillation (``summary_paragraph`` + ``top_3_themes`` per
    :func:`macro_briefing_to_public_summary`).
    """

    from src.data.alternative.base_alt_provider import AltDataRecord
    from src.data.alternative.macro_briefing import (
        compose_macro_briefing,
        macro_briefing_to_public_summary,
    )

    class _StubProvider:
        def __init__(self, records: List[Any]):
            self._history = records

    class _StubManager:
        def __init__(
            self,
            latest_signals: Dict[str, Any],
            providers: Dict[str, _StubProvider],
        ):
            self.latest_signals = latest_signals
            self.providers = providers

    latest_signals: Dict[str, Any] = {}
    stub_providers: Dict[str, _StubProvider] = {}
    for provider, snapshot in raw_snapshots.items():
        latest_signals[provider] = snapshot.get("signal") or {}
        records: List[Any] = []
        for record_payload in snapshot.get("records") or []:
            try:
                records.append(AltDataRecord.from_dict(record_payload))
            except (KeyError, ValueError, TypeError):
                continue
        stub_providers[provider] = _StubProvider(records)

    manager = _StubManager(latest_signals, stub_providers)
    briefing = compose_macro_briefing(manager)
    return macro_briefing_to_public_summary(briefing)


def write_public_summary_atomic(payload: Dict[str, Any], output_path: Path) -> None:
    """Atomic-write the payload to ``output_path`` using the governance.py pattern.

    Writes to a tempfile in the same directory, then ``rename`` swaps it in
    so a reader never sees a half-written file.
    """

    output_path.parent.mkdir(parents=True, exist_ok=True)
    file_descriptor, temp_name = tempfile.mkstemp(
        dir=output_path.parent,
        prefix=f"{output_path.stem}-",
        suffix=f"{output_path.suffix}.tmp",
    )
    temp_path = Path(temp_name)
    try:
        with os.fdopen(file_descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")  # POSIX-friendly trailing newline
        temp_path.replace(output_path)
    finally:
        temp_path.unlink(missing_ok=True)


def export_public_summary(
    providers_dir: Path = DEFAULT_PROVIDERS_DIR,
    output_path: Path = DEFAULT_OUTPUT_PATH,
    *,
    version_path: Path = DEFAULT_VERSION_PATH,
    generated_at: Optional[str] = None,
) -> Dict[str, Any]:
    """One-shot: build the summary and atomic-write it to disk."""

    payload = build_public_summary(
        providers_dir,
        version_path=version_path,
        generated_at=generated_at,
    )
    write_public_summary_atomic(payload, output_path)
    return payload


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Distill cache/alt_data/providers/*.json runtime caches into a "
            "small, sanitized, committable data/public/alt_data_summary.json."
        )
    )
    parser.add_argument(
        "--providers-dir",
        type=Path,
        default=DEFAULT_PROVIDERS_DIR,
        help=f"Source providers directory (default: {DEFAULT_PROVIDERS_DIR})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help=f"Destination JSON path (default: {DEFAULT_OUTPUT_PATH})",
    )
    parser.add_argument(
        "--print",
        action="store_true",
        help="Print the JSON to stdout instead of writing to disk.",
    )
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    args = _parse_args(argv)
    payload = build_public_summary(args.providers_dir)
    if args.print:
        json.dump(payload, sys.stdout, ensure_ascii=False, indent=2, sort_keys=True)
        sys.stdout.write("\n")
        return 0
    write_public_summary_atomic(payload, args.output)
    logger.info(
        "Wrote public summary to %s (providers=%s)",
        args.output,
        sorted(payload.get("providers", {}).keys()),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

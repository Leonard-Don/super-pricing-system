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

# ---------------------------------------------------------------------------
# Localization dictionaries (Phase F1.1)
# ---------------------------------------------------------------------------
#
# These map raw English enum tokens to Chinese glosses for downstream
# Chinese-facing consumers (e.g. ``cn-altdata-brief``). The pattern is
# strictly additive: the raw token is preserved in the JSON so programmatic
# consumers keep working, and a parallel ``*_zh`` field exposes the gloss.
# When a token has no entry here the helper falls back to the raw token --
# never silently drops -- and ``_UNGLOSSED_TOKENS`` tracks the leak so the
# operator can extend the dictionary later.

_PROVIDER_LABELS_ZH: Dict[str, str] = {
    "policy_radar": "政策雷达",
    "policy_execution": "政策执行",
    "supply_chain": "供应链",
    "macro_hf": "宏观高频",
    "fund_holdings": "基金持仓",
    "northbound": "北向资金",
    "block_trades": "大宗交易",
    "composite_signal": "综合信号",
    "people_layer": "人事层",
    "governance": "治理结构",
    "entity_resolution": "实体识别",
    "narrative": "叙事档案",
    "macro_briefing": "宏观简报",
}

_ARCHIVE_LABELS_ZH: Dict[str, str] = {
    "narrative": "叙事档案",
    "composite": "综合信号档案",
    "composite_signal": "综合信号档案",
    "macro_briefing": "宏观简报",
}

_SOURCE_MODE_LABELS_ZH: Dict[str, str] = {
    "public_disclosure": "公开披露",
    "regulated_data": "授权数据",
    "scraped": "抓取数据",
    "curated": "策展数据",
    "live": "实时数据",
    "proxy": "代理数据",
}

_EXECUTION_STATUS_LABELS_ZH: Dict[str, str] = {
    "reversal_cluster": "政策反转簇",
    "alignment_cluster": "政策共振簇",
    "neutral": "中性",
    "active": "正常推进",
}

_DEPARTMENT_LABELS_ZH: Dict[str, str] = {
    "ndrc_tz": "发改委体改司",
    "ndrc_jjs": "发改委经济运行司",
    "mof_kjzx": "财政部库款中心",
    "mof_ggczs": "财政部国库司",
    "pboc_mpd": "人民银行货币政策司",
    "pboc_fsd": "人民银行金融稳定局",
    "csrc_fxbgs": "证监会风险办",
    # Non-NDRC slugs that also show up in the policy_execution snapshot.
    # The runtime emits these alongside the NDRC sub-departments, so
    # include them here so downstream Chinese-facing tools don't see raw
    # English slugs. TODO: extend whenever a new central-bank /
    # ministry slug surfaces in production (currently fed/ecb/nea/boe/ndrc).
    "fed": "美联储",
    "ecb": "欧洲央行",
    "boe": "英国央行",
    "nea": "国家能源局",
    "ndrc": "发改委",
}

_COMPONENT_LABELS_ZH: Dict[str, str] = {
    # Component labels share the provider name-space (block_trades, etc.)
    # so we reuse the provider gloss when present and fall back below.
    **_PROVIDER_LABELS_ZH,
}

# Track tokens we encountered but had no gloss for. Read by tests / CI to
# detect "still TODO" coverage gaps without breaking the build. Reset on
# every ``build_public_summary`` call so a single export run reports a
# clean delta.
_UNGLOSSED_TOKENS: Dict[str, set[str]] = {
    "provider": set(),
    "archive": set(),
    "source_mode": set(),
    "execution_status": set(),
    "department": set(),
    "component": set(),
}


def _gloss(category: str, token: str, mapping: Dict[str, str]) -> str:
    """Return the Chinese gloss for ``token`` or fall back to the raw token.

    Side-effect: records a miss in ``_UNGLOSSED_TOKENS[category]`` so the
    operator can extend the dictionary later. Never raises; never returns
    an empty string for a non-empty input.
    """

    if not token:
        return ""
    if token in mapping:
        return mapping[token]
    _UNGLOSSED_TOKENS.setdefault(category, set()).add(token)
    return token


def _gloss_list(category: str, tokens: List[str], mapping: Dict[str, str]) -> List[str]:
    """Vectorised ``_gloss``. Preserves ordering and length."""

    return [_gloss(category, str(t), mapping) for t in tokens]


def _reset_unglossed_tracker() -> None:
    """Clear the unglossed-token tracker (called at the start of each build)."""

    for bucket in _UNGLOSSED_TOKENS.values():
        bucket.clear()


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
# Localization pass (Phase F1.1)
# ---------------------------------------------------------------------------


def _localize_payload(payload: Dict[str, Any]) -> None:
    """Add ``*_zh`` parallel fields to all F7/F8/F9 / provider sections.

    Mutates ``payload`` in place. The pattern is strictly additive: the raw
    English token is preserved (so programmatic consumers keep working) and
    a parallel ``*_zh`` field carries the Chinese gloss. Tokens missing from
    the dictionaries fall back to the raw token and are recorded in
    ``_UNGLOSSED_TOKENS`` for follow-up.
    """

    # ---- composite_cluster_aware: supporting_clusters ---------------------
    cluster_aware = payload.get("composite_cluster_aware") or {}
    for bucket_key in list(cluster_aware.keys()):
        if not bucket_key.startswith("top_"):
            continue
        rows = cluster_aware.get(bucket_key) or []
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            clusters = row.get("supporting_clusters") or []
            if isinstance(clusters, list):
                row["supporting_clusters_zh"] = _gloss_list(
                    "provider", [str(c) for c in clusters], _PROVIDER_LABELS_ZH
                )

    # ---- cross_archive_themes: supporting_archives ------------------------
    themes = payload.get("cross_archive_themes") or {}
    for bucket_key in list(themes.keys()):
        if not bucket_key.startswith("top_"):
            continue
        rows = themes.get(bucket_key) or []
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            archives = row.get("supporting_archives") or []
            if isinstance(archives, list):
                row["supporting_archives_zh"] = _gloss_list(
                    "archive", [str(a) for a in archives], _ARCHIVE_LABELS_ZH
                )

    # ---- provider_correlation: providers + redundancy_clusters -----------
    corr = payload.get("provider_correlation") or {}
    providers_list = corr.get("providers") or []
    if isinstance(providers_list, list):
        corr["providers_zh"] = _gloss_list(
            "provider",
            [str(p) for p in providers_list],
            _PROVIDER_LABELS_ZH,
        )
    clusters = corr.get("redundancy_clusters") or []
    if isinstance(clusters, list):
        corr["redundancy_clusters_zh"] = [
            _gloss_list("provider", [str(p) for p in cluster], _PROVIDER_LABELS_ZH)
            if isinstance(cluster, list)
            else []
            for cluster in clusters
        ]

    # ---- providers.<X>.evidence_link (component, source_mode) ------------
    providers_block = payload.get("providers") or {}
    for _provider_name, provider_payload in providers_block.items():
        if not isinstance(provider_payload, dict):
            continue
        ev = provider_payload.get("evidence_link")
        if isinstance(ev, dict):
            component = ev.get("component")
            if isinstance(component, str) and component:
                ev["component_zh"] = _gloss(
                    "component", component, _COMPONENT_LABELS_ZH
                )
            source_mode = ev.get("source_mode")
            if isinstance(source_mode, str) and source_mode:
                ev["source_mode_zh"] = _gloss(
                    "source_mode", source_mode, _SOURCE_MODE_LABELS_ZH
                )

    # ---- providers.policy_execution.departments[] -----------------------
    policy_exec = providers_block.get("policy_execution") or {}
    departments = policy_exec.get("departments") or []
    if isinstance(departments, list):
        for dept in departments:
            if not isinstance(dept, dict):
                continue
            dept_slug = dept.get("department")
            if isinstance(dept_slug, str) and dept_slug:
                dept["department_zh"] = _gloss(
                    "department", dept_slug, _DEPARTMENT_LABELS_ZH
                )
            status = dept.get("execution_status")
            if isinstance(status, str) and status:
                dept["execution_status_zh"] = _gloss(
                    "execution_status", status, _EXECUTION_STATUS_LABELS_ZH
                )

    # ---- theme_diversity.top_5_*[].dominant_cluster ---------------------
    diversity = payload.get("theme_diversity") or {}
    for bucket_key in list(diversity.keys()):
        if not bucket_key.startswith("top_"):
            continue
        rows = diversity.get(bucket_key) or []
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            dominant = row.get("dominant_cluster")
            if isinstance(dominant, str) and dominant:
                row["dominant_cluster_zh"] = _gloss(
                    "provider", dominant, _PROVIDER_LABELS_ZH
                )


def get_unglossed_tokens() -> Dict[str, List[str]]:
    """Return a snapshot of tokens encountered without a Chinese gloss.

    Read by tests / CI to detect "still TODO" coverage gaps. Values are
    sorted lists so they diff cleanly.
    """

    return {k: sorted(v) for k, v in _UNGLOSSED_TOKENS.items()}


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

    # Clear the unglossed-token tracker so a single export run reports a
    # clean delta of "tokens still missing a Chinese gloss".
    _reset_unglossed_tracker()

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

    # Cluster-aware composite signals — Phase F8. Re-counts agreements
    # per redundancy cluster rather than per provider so a HIGH-conviction
    # emission requires multiple genuinely independent sources. Failures
    # degrade silently for the same reason as the legacy composite block:
    # the export script must stay runnable when alt-data heavy deps are
    # absent.
    if raw_snapshots:
        try:
            payload["composite_cluster_aware"] = (
                _build_cluster_aware_composite_signals(raw_snapshots, providers_dir)
            )
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Skipping composite_cluster_aware: %s", exc)

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

    # Macro briefing day-over-day delta — Phase F5.1. The export script
    # has no historical snapshot store (the live endpoint relies on the
    # narrative + composite archives), so this surface degrades to a
    # ``has_baseline=False`` stub on the public side. Including it
    # ensures the public schema stays forward-compatible once a snapshot
    # archive lands.
    if raw_snapshots:
        try:
            payload["macro_briefing_delta"] = _build_macro_briefing_delta(
                raw_snapshots
            )
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Skipping macro_briefing_delta: %s", exc)

    # Cross-archive themes — Phase F6. Reads the three time-series
    # archives (E4 / F4.1 / F5.2) and surfaces industries that appear
    # across multiple archives over multiple days. The detector
    # gracefully degrades when an archive is empty, so this surface
    # remains safe to call even from an export run on a fresh deployment.
    try:
        payload["cross_archive_themes"] = _build_cross_archive_themes()
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Skipping cross_archive_themes: %s", exc)

    # Provider correlation — Phase F7. Runs the cross-provider
    # correlation analyzer against the on-disk snapshots and emits the
    # publication-safe distillation (cluster names + headline pair +
    # average correlation). The full 10x10 matrix stays private; the
    # public payload carries just the actionable summary so a downstream
    # consumer can answer "are the 10 providers truly independent?"
    # without inheriting the dense matrix.
    try:
        payload["provider_correlation"] = _build_provider_correlation(
            providers_dir
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Skipping provider_correlation: %s", exc)

    # Theme × cluster diversity — Phase F9. Cross-references the F6
    # cross-archive themes with the F7 redundancy clusters to surface
    # how many of each theme's contributing providers come from
    # distinct clusters. Makes echo-confirmations visible: a theme
    # touching 4 providers from 1 cluster is one signal repeated, not
    # four independent confirmations.
    try:
        payload["theme_diversity"] = _build_theme_diversity(providers_dir)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Skipping theme_diversity: %s", exc)

    # Localization pass — adds *_zh parallel fields wherever raw English
    # enum tokens flow to Chinese-facing downstream consumers. Strictly
    # additive: raw tokens are preserved for programmatic consumers.
    try:
        _localize_payload(payload)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Skipping localization pass: %s", exc)

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


def _build_cluster_aware_composite_signals(
    raw_snapshots: Dict[str, Dict[str, Any]],
    providers_dir: Path,
) -> Dict[str, Any]:
    """Detect cluster-aware composite signals over on-disk snapshots.

    Mirrors :func:`_build_composite_signals` but routes through the
    cluster-aware detector so the public summary surfaces the
    redundancy-collapsed conviction tier. Cluster membership is
    sourced from the cross-provider correlation analyzer running
    against the same ``providers_dir``.
    """

    from src.data.alternative.base_alt_provider import AltDataRecord
    from src.data.alternative.composite_signal import (
        cluster_aware_composite_signals_to_public_summary,
        detect_composite_signals_cluster_aware,
    )
    from src.data.alternative.provider_correlation import (
        compute_provider_correlation_matrix,
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
    # Build cluster membership once for the export run rather than letting
    # the detector re-compute on every call.
    try:
        matrix = compute_provider_correlation_matrix(
            providers_dir=providers_dir,
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "Cluster-aware export falling back to singleton clusters: %s",
            exc,
        )
        matrix = None
    composites = detect_composite_signals_cluster_aware(
        manager,
        correlation_matrix=matrix,
        include_low=False,
    )
    return cluster_aware_composite_signals_to_public_summary(composites)


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


def _build_macro_briefing_delta(
    raw_snapshots: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    """Distill a macro briefing day-over-day delta for the public summary.

    The export path has no historical snapshot archive (the live
    endpoint relies on the narrative + composite archives instead), so
    this helper always emits the ``has_baseline=False`` stub. The
    public surface remains stable -- consumers can render the
    ``macro_briefing_delta.summary_delta`` field today and pick up the
    populated payload automatically once a snapshot archive lands.
    """

    from src.data.alternative.base_alt_provider import AltDataRecord
    from src.data.alternative.macro_briefing import compose_macro_briefing
    from src.data.alternative.macro_briefing_delta import (
        compute_macro_briefing_delta,
        macro_briefing_delta_to_public_summary,
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
    today_briefing = compose_macro_briefing(manager)
    # Yesterday baseline cannot be reconstructed from a single-snapshot
    # export run; emit the cold-start stub so downstream consumers see
    # the canonical "no comparison available" shape.
    delta = compute_macro_briefing_delta(
        today_briefing=today_briefing,
        yesterday_briefing=None,
    )
    return macro_briefing_delta_to_public_summary(delta)


def _build_cross_archive_themes() -> Dict[str, Any]:
    """Detect cross-archive themes for the public summary (Phase F6).

    Reads the three time-series archives (E4 / F4.1 / F5.2) via their
    module-level singletons. The detector itself is read-only and
    deterministic, so this is safe to call from a CI export run --
    when an archive file is absent the underlying ``recent()`` call
    returns an empty list and the detector simply emits no themes.
    """

    from src.data.alternative.cross_archive_themes import (
        detect_themes,
        themes_to_public_summary,
    )

    themes = detect_themes()
    return themes_to_public_summary(themes)


def _build_provider_correlation(providers_dir: Path) -> Dict[str, Any]:
    """Compute the provider correlation public summary (Phase F7).

    Runs :func:`compute_provider_correlation_matrix` directly against
    the on-disk snapshot files in ``providers_dir``. Returns the
    publication-safe distillation (cluster names + headline pair +
    average correlation) -- the full 10x10 numeric matrix stays private.

    Defensive: when the analyzer fails the caller catches and logs
    rather than aborting the whole export. Sparse / NaN matrices are
    NOT a failure mode here -- they simply emit the structurally-valid
    summary with ``None`` headline values and the analyzer's data-
    quality note.
    """

    from src.data.alternative.provider_correlation import (
        compute_provider_correlation_matrix,
        correlation_matrix_to_public_summary,
    )

    matrix = compute_provider_correlation_matrix(
        providers_dir=providers_dir,
    )
    return correlation_matrix_to_public_summary(matrix)


def _build_theme_diversity(providers_dir: Path) -> Dict[str, Any]:
    """Compute the theme × cluster diversity public summary (Phase F9).

    Cross-references the F6 cross-archive themes with the F7
    redundancy clusters. For each theme, scans the on-disk provider
    snapshots to attribute the providers whose records mention that
    theme's industry, then maps those providers to their F7 clusters
    and computes the diversity tier (HIGH / MEDIUM / LOW based on
    clusters_count / providers_count).

    Honest framing: this makes echo-confirmations visible. The
    headline figure is the ``tier_counts`` field on the summary --
    what % of themes are HIGH (genuinely diverse confirmation) vs
    LOW (one signal echoing through redundant providers).

    Defensive: when the detector, the correlation analyzer, or the
    provider-attribution scanner fails, the caller catches and logs
    rather than aborting the export. Sparse archives → an empty
    themes list, not a crash.
    """

    from src.data.alternative.cross_archive_themes import detect_themes
    from src.data.alternative.provider_correlation import (
        compute_provider_correlation_matrix,
    )
    from src.data.alternative.theme_cluster_diversity import (
        build_industry_to_providers_map,
        enrich_themes_with_diversity,
        themes_diversity_to_public_summary,
    )

    themes = detect_themes()
    industry_to_providers = build_industry_to_providers_map(
        providers_dir=providers_dir,
    )
    try:
        matrix = compute_provider_correlation_matrix(
            providers_dir=providers_dir,
        )
        cluster_membership = [list(c) for c in matrix.redundancy_clusters]
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "Failed to compute correlation matrix for theme diversity: %s",
            exc,
        )
        cluster_membership = []

    def _resolver(theme: Any) -> List[str]:
        industry = getattr(theme, "industry", None) or ""
        if not industry:
            return []
        return industry_to_providers.get(industry, [])

    enriched = enrich_themes_with_diversity(
        themes, cluster_membership, theme_providers_resolver=_resolver
    )
    return themes_diversity_to_public_summary(enriched)


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

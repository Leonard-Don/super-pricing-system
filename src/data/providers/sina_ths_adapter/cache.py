"""Cache helpers for ``SinaIndustryAdapter``.

These functions own all on-disk JSON snapshot reads/writes and the
process-wide in-memory caches. The adapter class keeps the original
classmethods/instance methods as thin forwarders so external test
patches (``patch.object(SinaIndustryAdapter, "_x")``) keep working.
"""

from __future__ import annotations

import fcntl
import json
import logging
import time
from collections import Counter
from typing import TYPE_CHECKING, Any, Dict, List

import akshare as ak
import pandas as pd

from ..sina_provider import SinaFinanceProvider

if TYPE_CHECKING:  # pragma: no cover - typing only
    from ._adapter import SinaIndustryAdapter

logger = logging.getLogger(__name__)


def ensure_symbol_cache_loaded(cls: type["SinaIndustryAdapter"]) -> None:
    if cls._stock_name_cache_loaded:
        return

    cache_path = cls._symbol_cache_path
    try:
        if cache_path.exists():
            payload = json.loads(cache_path.read_text(encoding="utf-8"))
            cache = payload.get("cache", {})
            if isinstance(cache, dict):
                for name, code in cache.items():
                    clean_name = str(name or "").strip()
                    clean_code = str(code or "").strip()
                    if clean_name and clean_code.isdigit():
                        cls._stock_name_to_symbol_cache[clean_name] = clean_code
                cls._stock_name_cache_time = float(payload.get("updated_at") or 0)
                logger.info(
                    "Loaded persistent industry symbol cache with %s entries",
                    len(cls._stock_name_to_symbol_cache),
                )
    except Exception as e:
        logger.warning(f"Failed to load persistent symbol cache: {e}")
    finally:
        cls._stock_name_cache_loaded = True


def persist_symbol_cache(cls: type["SinaIndustryAdapter"]) -> None:
    if not cls._stock_name_to_symbol_cache:
        return

    try:
        cls._symbol_cache_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "updated_at": cls._stock_name_cache_time or time.time(),
            "cache": dict(sorted(cls._stock_name_to_symbol_cache.items())),
        }
        cls._symbol_cache_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception as e:
        logger.warning(f"Failed to persist symbol cache: {e}")


def update_symbol_cache_from_pairs(
    cls: type["SinaIndustryAdapter"], pairs: List[tuple[str, str]]
) -> None:
    """把已知的 股票名 -> 代码 对写回共享缓存。"""
    cls._ensure_symbol_cache_loaded()
    changed = False
    for name, code in pairs:
        clean_name = str(name or "").strip()
        clean_code = str(code or "").strip()
        if clean_name and clean_code.isdigit():
            for alias in cls._build_name_aliases(clean_name):
                if cls._stock_name_to_symbol_cache.get(alias) != clean_code:
                    cls._stock_name_to_symbol_cache[alias] = clean_code
                    changed = True
    if changed:
        cls._stock_name_cache_time = time.time()
        cls._persist_symbol_cache()


def ensure_history_cache_loaded(cls: type["SinaIndustryAdapter"]) -> None:
    if cls._history_cache_loaded:
        return
    try:
        if cls._history_cache_path.exists():
            with open(cls._history_cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                cls._history_cache = data.get("cache", {})
                logger.info("Loaded history cache with %s entries", len(cls._history_cache))
    except Exception as e:
        logger.warning(f"Failed to load history cache: {e}")
    finally:
        cls._history_cache_loaded = True


def persist_history_cache(cls: type["SinaIndustryAdapter"]) -> None:
    try:
        cls._history_cache_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "updated_at": time.time(),
            "cache": cls._history_cache,
        }
        with open(cls._history_cache_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning(f"Failed to persist history cache: {e}")


def load_persistent_market_cap_snapshot(
    cls: type["SinaIndustryAdapter"],
) -> Dict[str, Any]:
    try:
        if not cls._industry_market_cap_snapshot_path.exists():
            return {}
        payload = json.loads(cls._industry_market_cap_snapshot_path.read_text(encoding="utf-8"))
        data = payload.get("data", {})
        return data if isinstance(data, dict) else {}
    except Exception as e:
        logger.warning(f"Failed to load industry market cap snapshot: {e}")
        return {}


def write_market_cap_snapshot_payload(
    cls: type["SinaIndustryAdapter"], payload: Dict[str, Any]
) -> None:
    cls._industry_market_cap_snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = cls._industry_market_cap_snapshot_path.with_name(
        f"{cls._industry_market_cap_snapshot_path.name}.tmp"
    )
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_path.replace(cls._industry_market_cap_snapshot_path)


def locked_market_cap_snapshot_update(
    cls: type["SinaIndustryAdapter"], updater
) -> None:
    lock_path = cls._industry_market_cap_snapshot_path.with_name(
        f"{cls._industry_market_cap_snapshot_path.name}.lock"
    )
    cls._industry_market_cap_snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("w", encoding="utf-8") as lock_file:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        payload: Dict[str, Any] = {}
        if cls._industry_market_cap_snapshot_path.exists():
            try:
                payload = json.loads(cls._industry_market_cap_snapshot_path.read_text(encoding="utf-8"))
            except Exception as e:
                logger.warning(f"Failed to read industry market cap snapshot under lock: {e}")
        updated = updater(payload if isinstance(payload, dict) else {})
        cls._write_market_cap_snapshot_payload(updated)


def get_persistent_market_cap_snapshot_status(
    cls: type["SinaIndustryAdapter"],
) -> Dict[str, Any]:
    snapshot = cls._load_persistent_market_cap_snapshot()
    if not snapshot:
        return {
            "entries": 0,
            "fresh_entries": 0,
            "stale_entries": 0,
            "min_age_hours": None,
            "max_age_hours": None,
            "source_counts": {},
        }

    ages: List[float] = []
    stale_entries = 0
    source_counts: Counter[str] = Counter()
    now = time.time()
    stale_after_hours = cls._market_cap_snapshot_stale_after_hours

    for item in snapshot.values():
        source = str(item.get("market_cap_source", "unknown")).strip() or "unknown"
        source_counts[source] += 1
        updated_at = item.get("updated_at")
        if updated_at is None:
            continue
        age_hours = max(0.0, (now - float(updated_at)) / 3600)
        ages.append(age_hours)
        if age_hours >= stale_after_hours:
            stale_entries += 1

    entries = len(snapshot)
    return {
        "entries": entries,
        "fresh_entries": max(0, entries - stale_entries),
        "stale_entries": stale_entries,
        "min_age_hours": min(ages) if ages else None,
        "max_age_hours": max(ages) if ages else None,
        "source_counts": dict(source_counts),
    }


def persist_market_cap_snapshot(
    cls: type["SinaIndustryAdapter"], df: pd.DataFrame
) -> None:
    try:
        if df.empty or "industry_code" not in df.columns:
            return

        caps = cls._numeric_series_or_default(df, "total_market_cap", 0.0)
        sources = df.get("market_cap_source", pd.Series("unknown", index=df.index)).astype(str)
        valid_mask = (
            df["industry_code"].astype(str).str.strip().ne("")
            & caps.gt(1e8)
            & ~sources.str.startswith("estimated")
            & ~sources.str.startswith("snapshot_")
            & sources.ne("unknown")
        )
        if not valid_mask.any():
            return

        snapshot_rows = []
        for _, row in df.loc[valid_mask].iterrows():
            code = str(row.get("industry_code", "")).strip()
            if not code:
                continue
            snapshot_rows.append(
                {
                    "industry_code": code,
                    "industry_name": str(row.get("industry_name", "")).strip(),
                    "total_market_cap": float(row.get("total_market_cap", 0) or 0),
                    "market_cap_source": str(row.get("market_cap_source", "unknown")).strip() or "unknown",
                }
            )
        if not snapshot_rows:
            return

        def update_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
            existing = payload.get("data", {})
            if not isinstance(existing, dict):
                existing = {}
            now = time.time()
            for item in snapshot_rows:
                existing[item["industry_code"]] = {
                    "industry_name": item["industry_name"],
                    "total_market_cap": item["total_market_cap"],
                    "market_cap_source": item["market_cap_source"],
                    "updated_at": now,
                }
            return {
                "updated_at": now,
                "data": existing,
            }

        cls._locked_market_cap_snapshot_update(update_payload)
    except Exception as e:
        logger.warning(f"Failed to persist industry market cap snapshot: {e}")


def apply_persistent_market_cap_snapshot(
    adapter: "SinaIndustryAdapter", df: pd.DataFrame
) -> bool:
    if df.empty or "industry_code" not in df.columns:
        return False

    snapshot = adapter.__class__._load_persistent_market_cap_snapshot()
    if not snapshot:
        return False

    if "total_market_cap" not in df.columns:
        df["total_market_cap"] = 0.0
    if "market_cap_source" not in df.columns:
        df["market_cap_source"] = "unknown"
    if "market_cap_snapshot_age_hours" not in df.columns:
        df["market_cap_snapshot_age_hours"] = pd.NA
    if "market_cap_snapshot_is_stale" not in df.columns:
        df["market_cap_snapshot_is_stale"] = False

    caps = adapter._numeric_series_or_default(df, "total_market_cap", 0.0)
    sources = df["market_cap_source"].astype(str).fillna("unknown")
    fill_mask = (
        df["industry_code"].astype(str).map(lambda code: str(code).strip() in snapshot)
        & (
            caps.le(1)
            | sources.eq("unknown")
            | sources.str.startswith("estimated")
        )
    )
    if not fill_mask.any():
        return False

    def snapshot_cap(code: Any) -> float:
        item = snapshot.get(str(code).strip(), {})
        return float(item.get("total_market_cap", 0) or 0)

    def snapshot_source(code: Any) -> str:
        item = snapshot.get(str(code).strip(), {})
        source = str(item.get("market_cap_source", "unknown")).strip() or "unknown"
        return f"snapshot_{source}"

    def snapshot_age_hours(code: Any) -> float | None:
        item = snapshot.get(str(code).strip(), {})
        updated_at = item.get("updated_at")
        if updated_at is None:
            return None
        return max(0.0, (time.time() - float(updated_at)) / 3600)

    def snapshot_is_stale(code: Any) -> bool:
        age = snapshot_age_hours(code)
        if age is None:
            return False
        return age >= adapter.__class__._market_cap_snapshot_stale_after_hours

    df.loc[fill_mask, "total_market_cap"] = df.loc[fill_mask, "industry_code"].apply(snapshot_cap)
    df.loc[fill_mask, "market_cap_source"] = df.loc[fill_mask, "industry_code"].apply(snapshot_source)
    df.loc[fill_mask, "market_cap_snapshot_age_hours"] = df.loc[fill_mask, "industry_code"].apply(snapshot_age_hours)
    df.loc[fill_mask, "market_cap_snapshot_is_stale"] = df.loc[fill_mask, "industry_code"].apply(snapshot_is_stale)
    adapter._append_data_source(df, fill_mask, "snapshot")
    return True


def get_cached_sina_stock_nodes(cls: type["SinaIndustryAdapter"]) -> set[str]:
    now = time.time()
    if cls._sina_cached_stock_nodes is not None and now - cls._sina_cached_stock_nodes_time < 600:
        return set(cls._sina_cached_stock_nodes)

    payload = SinaFinanceProvider._load_json_cache(SinaFinanceProvider._industry_stocks_cache_path)
    data = payload.get("data", {})
    codes = {
        str(code).strip()
        for code, entry in data.items()
        if str(code).strip().startswith("new_")
        and isinstance(entry, dict)
        and entry.get("rows")
    }
    cls._sina_cached_stock_nodes = codes
    cls._sina_cached_stock_nodes_time = now
    return set(codes)


def get_cached_sina_industry_codes(
    adapter: "SinaIndustryAdapter", industry_name: str
) -> List[str]:
    from ._constants import SINA_NEW_NODE_NAME_MAP, SINA_PROXY_NODE_NAME_MAP
    from ._mappers import map_sina_to_ths, map_ths_to_sina

    raw_name = str(industry_name or "").strip()
    if not raw_name:
        return []

    possible_names = [raw_name]
    mapped_name = map_sina_to_ths(raw_name)
    if mapped_name != raw_name:
        possible_names.append(mapped_name)
    possible_names.extend(map_ths_to_sina(raw_name))
    if mapped_name:
        possible_names.extend(map_ths_to_sina(mapped_name))

    ordered_names: List[str] = []
    seen_names = set()
    for name in possible_names:
        normalized = str(name or "").strip()
        if normalized and normalized not in seen_names:
            ordered_names.append(normalized)
            seen_names.add(normalized)

    candidate_codes: List[str] = []
    cached_new_nodes = adapter._get_cached_sina_stock_nodes()
    for name in ordered_names:
        alias_code = SINA_NEW_NODE_NAME_MAP.get(name)
        if alias_code and alias_code in cached_new_nodes:
            candidate_codes.append(alias_code)

        proxy_code = SINA_PROXY_NODE_NAME_MAP.get(name)
        if proxy_code and proxy_code in cached_new_nodes:
            candidate_codes.append(proxy_code)

    persistent_industry_list = SinaFinanceProvider._load_persistent_industry_list()
    persistent_new_nodes: set[str] = set()
    if not persistent_industry_list.empty:
        persistent_new_nodes = {
            str(code or "").strip()
            for code in persistent_industry_list.get("industry_code", [])
            if str(code or "").strip().startswith("new_")
        }
        for name in ordered_names:
            match = persistent_industry_list[persistent_industry_list["industry_name"] == name]
            if match.empty:
                continue
            resolved_code = str(match.iloc[0].get("industry_code") or "").strip()
            if resolved_code:
                candidate_codes.append(resolved_code)

    for name in ordered_names:
        proxy_code = SINA_PROXY_NODE_NAME_MAP.get(name)
        if proxy_code and (
            proxy_code in cached_new_nodes or proxy_code in persistent_new_nodes
        ):
            candidate_codes.append(proxy_code)

    deduped_codes: List[str] = []
    seen_codes = set()
    for code in candidate_codes:
        normalized = str(code or "").strip()
        if normalized and normalized not in seen_codes:
            deduped_codes.append(normalized)
            seen_codes.add(normalized)
    return deduped_codes


def get_akshare_valuation_snapshot(cls: type["SinaIndustryAdapter"]) -> pd.DataFrame:
    now = time.time()
    if (
        cls._akshare_valuation_snapshot_cache is not None
        and now - cls._akshare_valuation_snapshot_cache_time < cls._akshare_valuation_snapshot_ttl_seconds
    ):
        return cls._akshare_valuation_snapshot_cache

    if (
        cls._akshare_valuation_snapshot_failure_at
        and now - cls._akshare_valuation_snapshot_failure_at < cls._akshare_valuation_snapshot_cooldown_seconds
    ):
        logger.info("Skipping AKShare industry valuation snapshot refresh during cooldown")
        return pd.DataFrame()

    try:
        valuation_df = ak.sw_index_first_info()
        if valuation_df is None or valuation_df.empty:
            cls._akshare_valuation_snapshot_failure_at = now
            return pd.DataFrame()
        cls._akshare_valuation_snapshot_cache = valuation_df.copy()
        cls._akshare_valuation_snapshot_cache_time = now
        cls._akshare_valuation_snapshot_failure_at = 0
        return cls._akshare_valuation_snapshot_cache
    except Exception as exc:
        cls._akshare_valuation_snapshot_failure_at = now
        logger.warning(f"Valuation snapshot refresh failed: {exc}")
        return pd.DataFrame()

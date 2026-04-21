"""Industry rotation domain service for Quant Lab."""

from __future__ import annotations

import json
import time
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional

import numpy as np
import pandas as pd

from backend.app.core.bounded_cache import BoundedTTLCache
from src.backtest.industry_backtest import IndustryBacktester


INDUSTRY_ROTATION_CACHE_TTL_SECONDS = 20 * 60
INDUSTRY_ROTATION_CACHE_HARD_TTL_SECONDS = 6 * INDUSTRY_ROTATION_CACHE_TTL_SECONDS
INDUSTRY_ROTATION_CACHE_MAX_ITEMS = 48


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        numeric = float(value)
        return default if pd.isna(numeric) else numeric
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
    if isinstance(value, (list, tuple)):
        return [_json_ready(item) for item in value]
    return value


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def _normalize_timestamp(value: Any) -> pd.Timestamp:
    timestamp = pd.Timestamp(value)
    if timestamp.tzinfo is not None:
        return timestamp.tz_convert("UTC").tz_localize(None)
    return timestamp


def _normalize_datetime_frame(frame: pd.DataFrame) -> pd.DataFrame:
    if not isinstance(frame, pd.DataFrame):
        return frame

    normalized = frame.copy()
    index = pd.to_datetime(normalized.index, errors="coerce")
    if getattr(index, "tz", None) is not None:
        index = index.tz_convert("UTC").tz_localize(None)

    valid_mask = ~index.isna()
    if not valid_mask.all():
        normalized = normalized.loc[valid_mask].copy()
        index = index[valid_mask]

    normalized.index = index
    return normalized.sort_index()


class QuantLabIndustryRotationService:
    """Owns Quant Lab industry-rotation execution, caching, and fast-path fallback."""

    def __init__(
        self,
        *,
        lock: Any,
        data_manager_getter: Callable[[], Any],
    ) -> None:
        self._lock = lock
        self._data_manager_getter = data_manager_getter
        self._cache: BoundedTTLCache[str, Dict[str, Any]] = BoundedTTLCache(
            maxsize=INDUSTRY_ROTATION_CACHE_MAX_ITEMS,
            max_age_seconds=INDUSTRY_ROTATION_CACHE_HARD_TTL_SECONDS,
            timestamp_getter=lambda entry: float((entry or {}).get("ts") or 0),
        )

    def run_industry_rotation_lab(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        start_date = str(payload.get("start_date") or "").strip()
        end_date = str(payload.get("end_date") or "").strip()
        if not start_date or not end_date:
            raise ValueError("start_date and end_date are required")
        prefer_fast_path = bool(payload.get("prefer_fast_path"))
        cache_key = self._build_industry_rotation_cache_key(payload)

        cached = self._get_cached_industry_rotation(cache_key)
        if prefer_fast_path and cached is not None:
            cached.setdefault("execution", {}).setdefault("mode", "cached")
            return cached

        stale_cached = self._get_cached_industry_rotation(cache_key, allow_stale=True)
        if prefer_fast_path and stale_cached is not None:
            stale_cached.setdefault("execution", {}).update(
                {
                    "mode": "cached",
                    "degraded": True,
                    "fallback_reason": "stale_cached_rotation",
                }
            )
            return stale_cached

        try:
            result = self._run_industry_rotation_backtest(payload, fast_path=prefer_fast_path)
        except Exception:
            if stale_cached is not None:
                stale_cached.setdefault("execution", {}).update(
                    {
                        "mode": "cached",
                        "degraded": True,
                        "fallback_reason": "primary_rotation_failed",
                    }
                )
                return stale_cached
            if not prefer_fast_path:
                result = self._run_industry_rotation_backtest(payload, fast_path=True)
                result.setdefault("execution", {}).update(
                    {
                        "degraded": True,
                        "fallback_reason": "primary_rotation_failed",
                    }
                )
            else:
                raise

        self._set_cached_industry_rotation(cache_key, result)
        return result

    def _build_industry_rotation_cache_key(self, payload: Dict[str, Any]) -> str:
        normalized = {
            "start_date": str(payload.get("start_date") or "").strip(),
            "end_date": str(payload.get("end_date") or "").strip(),
            "rebalance_freq": str(payload.get("rebalance_freq") or "monthly"),
            "top_industries": max(1, int(payload.get("top_industries") or 3)),
            "stocks_per_industry": max(1, int(payload.get("stocks_per_industry") or 3)),
            "weight_method": str(payload.get("weight_method") or "equal"),
            "initial_capital": round(_safe_float(payload.get("initial_capital"), 1_000_000), 4),
            "commission": round(_safe_float(payload.get("commission"), 0.001), 6),
            "slippage": round(_safe_float(payload.get("slippage"), 0.001), 6),
        }
        return json.dumps(normalized, sort_keys=True, ensure_ascii=False)

    def _get_cached_industry_rotation(self, cache_key: str, *, allow_stale: bool = False) -> Optional[Dict[str, Any]]:
        with self._lock:
            entry = self._cache.get(cache_key)
        if not entry:
            return None

        age_seconds = max(time.time() - float(entry.get("ts") or 0), 0.0)
        if not allow_stale and age_seconds > INDUSTRY_ROTATION_CACHE_TTL_SECONDS:
            return None

        payload = deepcopy(entry.get("data") or {})
        execution = payload.setdefault("execution", {})
        execution.update(
            {
                "cache_status": "stale" if age_seconds > INDUSTRY_ROTATION_CACHE_TTL_SECONDS else "fresh",
                "cache_age_seconds": round(age_seconds, 1),
            }
        )
        return payload

    def _set_cached_industry_rotation(self, cache_key: str, payload: Dict[str, Any]) -> None:
        with self._lock:
            self._cache[cache_key] = {
                "data": deepcopy(payload),
                "ts": time.time(),
            }

    def _format_industry_rotation_result(
        self,
        *,
        result: Any,
        backtester: IndustryBacktester,
        execution: Dict[str, Any],
    ) -> Dict[str, Any]:
        comparison = backtester.compare_with_benchmark(benchmark=backtester.benchmark_symbol, result=result)
        equity_series = result.equity_curve if isinstance(result.equity_curve, pd.Series) else pd.Series(dtype=float)
        equity_curve = [
            {"date": pd.Timestamp(index).strftime("%Y-%m-%d"), "value": round(float(value), 2)}
            for index, value in equity_series.items()
        ]
        return _json_ready(
            {
                "summary": {
                    "total_return": round(float(result.total_return), 4),
                    "annualized_return": round(float(result.annualized_return), 4),
                    "sharpe_ratio": round(float(result.sharpe_ratio), 4),
                    "max_drawdown": round(float(result.max_drawdown), 4),
                    "win_rate": round(float(result.win_rate), 4),
                    "trade_count": int(result.trade_count),
                    "benchmark_return": round(float(result.benchmark_return), 4),
                    "excess_return": round(float(result.excess_return), 4),
                    "sortino_ratio": round(float(result.sortino_ratio), 4),
                    "calmar_ratio": round(float(result.calmar_ratio), 4),
                    "volatility": round(float(result.volatility), 4),
                    "var_95": round(float(result.var_95), 4),
                },
                "equity_curve": equity_curve[-120:],
                "trades": backtester.get_trade_history()[-80:],
                "diagnostics": result.diagnostics or {},
                "benchmark_comparison": comparison,
                "execution": execution,
            }
        )

    def _run_industry_rotation_backtest(self, payload: Dict[str, Any], *, fast_path: bool = False) -> Dict[str, Any]:
        data_manager = self._data_manager_getter()
        backtester = IndustryBacktester(
            data_manager=data_manager,
            initial_capital=_safe_float(payload.get("initial_capital"), 1_000_000),
            commission_rate=_safe_float(payload.get("commission"), 0.001),
            slippage=_safe_float(payload.get("slippage"), 0.001),
            strict_data_validation=not fast_path,
        )
        if fast_path:
            class _PrefetchedDataManager:
                def __init__(self, fallback_manager: Any, frames: Dict[str, pd.DataFrame]):
                    self._fallback_manager = fallback_manager
                    self._frames = frames

                def get_historical_data(self, symbol, start_date=None, end_date=None, interval="1d", period=None):
                    normalized_symbol = str(symbol or "").strip().upper()
                    frame = self._frames.get(normalized_symbol)
                    if frame is None:
                        return _normalize_datetime_frame(self._fallback_manager.get_historical_data(
                            normalized_symbol,
                            start_date=start_date,
                            end_date=end_date,
                            interval=interval,
                            period=period,
                        ))
                    result = _normalize_datetime_frame(frame)
                    if result.empty:
                        return result
                    if start_date is not None:
                        result = result[result.index >= _normalize_timestamp(start_date)]
                    if end_date is not None:
                        result = result[result.index <= _normalize_timestamp(end_date)]
                    return result

            filtered_proxy_map: Dict[str, List[Dict[str, Any]]] = {}
            preload_symbols = {backtester.benchmark_symbol}
            for industry_name, proxies in backtester.industry_proxy_map.items():
                preferred = [
                    dict(proxy)
                    for proxy in proxies
                    if not str(proxy.get("symbol") or "").strip().isdigit()
                ]
                selected = preferred[:3] or [dict(proxy) for proxy in proxies[:1]]
                filtered_proxy_map[industry_name] = selected
                preload_symbols.update(str(proxy.get("symbol") or "").strip().upper() for proxy in selected if proxy.get("symbol"))

            start_dt = datetime.strptime(str(payload.get("start_date") or "").strip(), "%Y-%m-%d") - timedelta(days=400)
            end_dt = datetime.strptime(str(payload.get("end_date") or "").strip(), "%Y-%m-%d") + timedelta(days=5)
            preloaded_frames: Dict[str, pd.DataFrame] = {}
            for symbol in preload_symbols:
                try:
                    preloaded_frames[symbol] = _normalize_datetime_frame(data_manager.get_historical_data(
                        symbol,
                        start_date=start_dt,
                        end_date=end_dt,
                    ))
                except Exception:
                    preloaded_frames[symbol] = pd.DataFrame()

            backtester.analyzer = None
            backtester.scorer = None
            backtester.industry_proxy_map = filtered_proxy_map
            backtester.data_manager = _PrefetchedDataManager(data_manager, preloaded_frames)

        result = backtester.run_backtest(
            start_date=str(payload.get("start_date") or "").strip(),
            end_date=str(payload.get("end_date") or "").strip(),
            rebalance_freq=str(payload.get("rebalance_freq") or "monthly"),
            top_industries=max(1, int(payload.get("top_industries") or 3)),
            stocks_per_industry=max(1, int(payload.get("stocks_per_industry") or 3)),
            weight_method=str(payload.get("weight_method") or "equal"),
        )
        execution = {
            "mode": "proxy_fast_path" if fast_path else "full",
            "degraded": bool(fast_path),
            "generated_at": _utcnow_iso(),
        }
        if fast_path:
            execution["fallback_reason"] = "interactive_fast_path"
        return self._format_industry_rotation_result(
            result=result,
            backtester=backtester,
            execution=execution,
        )

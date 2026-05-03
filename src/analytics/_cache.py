"""Internal cache helpers for IndustryAnalyzer.

This module is private to industry analytics — its functions take the
analyzer instance as the first argument so the analyzer keeps owning the
cache state while the helper logic lives outside the main class.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

import pandas as pd


def clear_cache(analyzer: Any) -> None:
    """清除缓存"""
    analyzer._cached_data = {}


def get_cache_key(analyzer: Any, prefix: str, **kwargs: Any) -> str:
    """生成缓存键"""
    key_parts = [prefix]
    for k, v in sorted(kwargs.items()):
        key_parts.append(f"{k}:{v}")
    return "|".join(key_parts)


def update_cache(analyzer: Any, key: str, data: Any) -> None:
    """更新缓存（跳过空数据，防止数据源故障时缓存空结果）"""
    # 空列表 / 空 DataFrame / None 不缓存
    if data is None:
        return
    if isinstance(data, (list, tuple)) and len(data) == 0:
        return
    if isinstance(data, pd.DataFrame) and data.empty:
        return
    analyzer._cached_data[key] = {
        "data": data,
        "timestamp": datetime.now(),
    }


def get_from_cache(analyzer: Any, key: str) -> Optional[Any]:
    """从缓存获取数据，如果不命中或过期返回 None"""
    if key not in analyzer._cached_data:
        return None

    entry = analyzer._cached_data[key]
    if datetime.now() - entry["timestamp"] > analyzer._cache_ttl:
        # 过期但不删除，保留给 _get_stale_cache 使用
        return None

    return entry["data"]


def get_stale_cache(analyzer: Any, key: str) -> Optional[Any]:
    """获取过期缓存数据作为兜底（不检查 TTL）"""
    if key not in analyzer._cached_data:
        return None
    return analyzer._cached_data[key]["data"]


def is_cache_valid(analyzer: Any) -> bool:
    """[Deprecated] Compatibility legacy check"""
    return False

"""``backend.app.core.persistence`` 包入口。

把原 1287 行单文件 ``persistence.py`` 拆为：
- ``_helpers.py``  — 12 个 module-level 纯函数（cursor 编解码、记录排序、payload 过滤等）
- ``_manager.py``  — ``PersistenceManager`` 类（30+ 方法的 SQLite/PostgreSQL 双 driver 实现）

兼容性约束：``backend.app.core.persistence`` 至少有 11 个 importer
（auth、task_queue、infrastructure、quant_lab、scripts/migrate、6+ 测试）
通过 ``from backend.app.core.persistence import PersistenceManager`` 或
``from backend.app.core.persistence import persistence_manager`` 直接 import。
本 ``__init__`` re-export 这两者及其它 helper 以保持兼容。
"""

from ._helpers import (
    MAX_RECORD_LIST_LIMIT,
    _build_payload_filter_conditions,
    _build_record_cursor_condition,
    _build_record_sort_plan,
    _decode_record_cursor,
    _encode_record_cursor,
    _json_dumps,
    _normalize_payload_filters,
    _normalize_record_sort,
    _task_activity_score_from_payload,
    _task_activity_sort_sql,
    _utcnow_iso,
)
from ._manager import PersistenceManager

# 进程级单例。auth.py / task_queue.py / quant_lab.py 等通过 ``persistence_manager``
# 直接 import 使用。
persistence_manager = PersistenceManager()


__all__ = [
    "PersistenceManager",
    "persistence_manager",
    "MAX_RECORD_LIST_LIMIT",
    "_build_payload_filter_conditions",
    "_build_record_cursor_condition",
    "_build_record_sort_plan",
    "_decode_record_cursor",
    "_encode_record_cursor",
    "_json_dumps",
    "_normalize_payload_filters",
    "_normalize_record_sort",
    "_task_activity_score_from_payload",
    "_task_activity_sort_sql",
    "_utcnow_iso",
]

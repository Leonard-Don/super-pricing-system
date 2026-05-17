"""
另类数据管道（Alternative Data Pipeline）

为"宏观错误定价套利引擎"提供真实物理世界的数据探针。
包含的子系统：
- policy_radar: 政经语义雷达
- supply_chain: 产业链暗网爬虫
- macro_hf: 全球宏观高频接口
- people: 人物画像层
- fund_holdings: 公募基金持仓集中度
- northbound: 北向资金日频净流入 (HSGT 沪深港通公开披露)
- block_trades: 沪深大宗交易公开披露聚合
- entity_resolution / governance: 通用工具与基础设施
"""

from .base_alt_provider import (
    BaseAltDataProvider,
    AltDataRecord,
    AltDataCategory,
    AltDataError,
)
from .alt_data_manager import AltDataManager
from .block_trades import BlockTradesProvider
from .governance import (
    AltDataRefreshReport,
    AltDataScheduler,
    AltDataSnapshotEnvelope,
    AltDataSnapshotStore,
    ProviderRefreshStatus,
)
from .runtime import (
    get_alt_data_manager,
    get_alt_data_scheduler,
    start_alt_data_scheduler,
    stop_alt_data_scheduler,
)

__all__ = [
    "BaseAltDataProvider",
    "AltDataRecord",
    "AltDataCategory",
    "AltDataError",
    "AltDataManager",
    "BlockTradesProvider",
    "ProviderRefreshStatus",
    "AltDataRefreshReport",
    "AltDataSnapshotEnvelope",
    "AltDataSnapshotStore",
    "AltDataScheduler",
    "get_alt_data_manager",
    "get_alt_data_scheduler",
    "start_alt_data_scheduler",
    "stop_alt_data_scheduler",
]

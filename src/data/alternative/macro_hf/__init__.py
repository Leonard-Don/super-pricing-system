"""全球宏观高频接口子系统

Phase B 后接入两条真实库存线 (US + CN):
- LMEInventoryProvider: yfinance 期货价格代理 (source_mode=proxy)
- SHFEInventoryProvider: akshare 上海期货交易所真实仓单 (source_mode=live)

MacroHFSignalProvider 把两条线按区域并列归一化, 再按可配置的
US/CN 权重 (默认 0.5 / 0.5) 合成 macro_pressure 综合分。
"""

from .lme_inventory import LMEInventoryProvider
from .macro_signals import MacroHFSignalProvider
from .shfe_inventory import SHFEInventoryProvider

__all__ = [
    "LMEInventoryProvider",
    "SHFEInventoryProvider",
    "MacroHFSignalProvider",
]

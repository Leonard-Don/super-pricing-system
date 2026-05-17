"""Mutual fund holdings (公募基金持仓) alt-data sub-package.

Promotes the quarterly disclosed top-10 holdings (季报 / 年报) of the
top-50 公募基金 into a per-ticker concentration metric: "this CN-A
ticker is held by N funds with combined Y% AUM weight". The aggregate
view is a clean institutional-flow signal for the macro-mispricing
engine.

Public surface:

- :class:`FundHoldingsProvider` — the ``BaseAltDataProvider`` subclass
  registered with :class:`AltDataManager`.
- :data:`TOP_50_FUND_CATALOG` — curated list of fund codes.
- helper accessors from :mod:`.fund_catalog`.
"""

from .fund_catalog import (
    CATALOG_VERSION,
    TOP_50_FUND_CATALOG,
    FundCatalogEntry,
    get_focus_for_code,
    get_name_for_code,
    get_top_50_codes,
)
from .provider import FundHoldingsProvider

__all__ = [
    "CATALOG_VERSION",
    "TOP_50_FUND_CATALOG",
    "FundCatalogEntry",
    "FundHoldingsProvider",
    "get_focus_for_code",
    "get_name_for_code",
    "get_top_50_codes",
]

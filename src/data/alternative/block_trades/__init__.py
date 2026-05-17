"""大宗交易 (block trades) alt-data sub-package.

Promotes the SSE/SZSE per-day block-trade public disclosures into three
per-record-type aggregates: a market-wide daily summary, per-ticker
multi-day windowed flow (``net_flow``, ``dominant_side``,
``n_trades_in_window``), and a per-industry rollup.

For the "Macro Mispricing" thesis the new component complements
``fund_holdings`` (quarterly disclosure) and ``northbound`` (T+1 daily
foreign flow) by providing per-trade *institutional* positioning at
daily cadence -- the cleanest cross-market institutional-flow triangle.

Public surface:

- :class:`BlockTradesProvider` — the ``BaseAltDataProvider`` subclass
  registered with :class:`AltDataManager`.
"""

from .provider import BlockTradesProvider

__all__ = [
    "BlockTradesProvider",
]

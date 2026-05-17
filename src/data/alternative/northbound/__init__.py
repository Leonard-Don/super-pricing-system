"""北向资金 (northbound flows) alt-data sub-package.

Daily public-disclosure netflow of foreign capital into A-shares via the
HKEx-driven Stock Connect (沪深港通, HSGT). Complements the
``fund_holdings`` provider — fund_holdings is quarterly institutional flow,
``northbound`` is T+0 / T+1 *daily* foreign-capital flow. Together they
give the macro-mispricing engine a "domestic mutual fund pile-on vs.
foreign capital posture" signal: when 北向 outflow + 公募 inflow → potential
reversion opportunity (or vice versa).

Public surface:

- :class:`NorthboundProvider` — the ``BaseAltDataProvider`` subclass
  registered with :class:`AltDataManager`.
"""

from .provider import NorthboundProvider

__all__ = [
    "NorthboundProvider",
]

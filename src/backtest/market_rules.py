"""China A-share market rules for backtest execution constraints.

A-share execution differs from US / HK markets in two ways the backtest engine
must respect:

* **T+1 settlement** -- a stock bought today cannot be sold until the next
  trading day.
* **Daily price limits** (涨停 / 跌停) -- a stock that closes at its limit is
  locked: there is no counterparty, so a fill at that price is unrealizable.

These helpers classify a symbol so the execution engine can decide whether, and
how strictly, to apply those constraints. Hong Kong (``.HK``) and US tickers
have neither constraint and are treated as unconstrained.
"""

from __future__ import annotations

import re
from typing import Optional

_A_SHARE_SUFFIXES = (".sh", ".ss", ".sz", ".bj")
_A_SHARE_PREFIXES = ("sh", "sz", "bj")
_SIX_DIGITS = re.compile(r"^\d{6}$")

_STAR_CHINEXT_PREFIXES = ("688", "689", "300", "301")
_BSE_FIRST_DIGITS = ("4", "8")


def _a_share_code(symbol: str) -> Optional[str]:
    """Return the bare 6-digit A-share code for ``symbol``, or ``None``.

    Accepts ``600519.SH`` suffixes, ``sh600000`` prefixes, and bare 6-digit
    codes. ``.HK`` and alphabetic US tickers are not A-shares.
    """
    token = str(symbol or "").strip().lower()
    if not token or token.endswith(".hk"):
        return None
    if token.endswith(_A_SHARE_SUFFIXES):
        token = token.rsplit(".", 1)[0]
    elif token.startswith(_A_SHARE_PREFIXES) and token[2:].isdigit():
        token = token[2:]
    return token if _SIX_DIGITS.match(token) else None


def is_a_share(symbol: str) -> bool:
    """Whether ``symbol`` is a mainland China A-share (not HK, not US)."""
    return _a_share_code(symbol) is not None


def a_share_price_limit_pct(symbol: str) -> Optional[float]:
    """Daily price-limit fraction for an A-share by board, else ``None``.

    STAR Market (688/689) and ChiNext (300/301) trade at +/-20%, the Beijing
    Stock Exchange (4xx/8xx) at +/-30%, and the main boards at +/-10%. ST
    stocks (+/-5%) cannot be told apart by code alone and fall through to
    +/-10%.
    """
    code = _a_share_code(symbol)
    if code is None:
        return None
    if code.startswith(_STAR_CHINEXT_PREFIXES):
        return 0.20
    if code[0] in _BSE_FIRST_DIGITS:
        return 0.30
    return 0.10

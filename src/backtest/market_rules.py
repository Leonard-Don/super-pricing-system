"""China A-share market rules for backtest execution constraints.

A-share execution differs from US / HK markets in two ways the backtest engine
must respect:

* T+1 settlement -- a stock bought today cannot be sold until the next trading
  day.
* Daily price limits -- a stock that closes at its limit is locked: there is no
  counterparty, so a fill at that price is unrealizable.

These helpers classify a symbol so the execution engine can decide whether, and
how strictly, to apply those constraints. Hong Kong (``.HK``) and US tickers
have neither constraint and are treated as unconstrained.
"""

from __future__ import annotations

import re

_A_SHARE_SUFFIXES = (".sh", ".ss", ".sz", ".bj")
_A_SHARE_PREFIXES = ("sh", "sz", "bj")
_SIX_DIGITS = re.compile(r"^\d{6}$")

_STAR_CHINEXT_PREFIXES = ("688", "689", "300", "301", "302")
_BSE_FIRST_DIGITS = ("4", "8")


def _a_share_code(symbol: str | None) -> str | None:
    """Return the bare 6-digit A-share code for ``symbol``, or ``None``."""

    token = str(symbol or "").strip().lower()
    if not token or token.endswith(".hk"):
        return None
    if token.endswith(_A_SHARE_SUFFIXES):
        token = token.rsplit(".", 1)[0]
    elif token.startswith(_A_SHARE_PREFIXES) and token[2:].isdigit():
        token = token[2:]
    return token if _SIX_DIGITS.match(token) else None


def is_a_share(symbol: str | None) -> bool:
    """Whether ``symbol`` is a mainland China A-share (not HK, not US)."""

    code = _a_share_code(symbol)
    return code is not None and code.startswith(("6", "0", "3", "4", "8"))


def a_share_price_limit_pct(symbol: str | None) -> float | None:
    """Daily price-limit fraction for an A-share by board, else ``None``."""

    code = _a_share_code(symbol)
    if code is None or not is_a_share(code):
        return None
    if code.startswith(_STAR_CHINEXT_PREFIXES):
        return 0.20
    if code[0] in _BSE_FIRST_DIGITS:
        return 0.30
    return 0.10


__all__ = ["a_share_price_limit_pct", "is_a_share"]

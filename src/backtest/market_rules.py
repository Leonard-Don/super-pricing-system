"""Market-specific trading rules used by backtest components.

The helpers here intentionally keep the rules small and deterministic: they
classify common China A-share symbol formats and expose the standard daily
price-limit band used by backtest/execution logic.
"""

from __future__ import annotations

import re

_A_SHARE_CODE_RE = re.compile(r"^(?:SH|SZ|BJ)?(?P<code>\d{6})(?:\.(?:SH|SZ|BJ))?$")


def _normalize_code(symbol: str | None) -> str | None:
    """Return a 6-digit mainland China stock code, or ``None`` if invalid."""

    if not symbol:
        return None

    value = str(symbol).strip().upper()
    match = _A_SHARE_CODE_RE.match(value)
    if not match:
        return None
    return match.group("code")


def is_a_share(symbol: str | None) -> bool:
    """Return whether ``symbol`` is a China A-share style stock code."""

    code = _normalize_code(symbol)
    if code is None:
        return False

    # Shanghai main board/STAR, Shenzhen main board/SME/ChiNext, and Beijing
    # Stock Exchange codes cover the A-share formats this project handles.
    return code.startswith(("6", "0", "3", "4", "8"))


def a_share_price_limit_pct(symbol: str | None) -> float | None:
    """Return the standard daily price-limit percentage for an A-share code.

    Main-board Shanghai/Shenzhen names use ±10%, STAR Market and ChiNext use
    ±20%, and Beijing Stock Exchange names use ±30%. Non A-share symbols return
    ``None``.
    """

    code = _normalize_code(symbol)
    if code is None or not is_a_share(code):
        return None

    if code.startswith(("688", "689", "300", "301", "302")):
        return 0.20
    if code.startswith(("4", "8")):
        return 0.30
    return 0.10


__all__ = ["a_share_price_limit_pct", "is_a_share"]

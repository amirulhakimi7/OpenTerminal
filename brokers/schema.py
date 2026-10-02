"""
The one shape every broker adapter returns, so the dashboard renders moomoo,
Hata and Lucid with the same widget.  Pure: no I/O.
"""

from __future__ import annotations

import math
from typing import TypedDict


class Account(TypedDict):
    acc_id: str
    market: str
    currency: str
    total_assets: float | None
    cash: float | None
    market_value: float | None
    unrealized_pl: float | None


class Position(TypedDict):
    symbol: str
    name: str
    market: str
    currency: str
    qty: float
    cost_price: float | None
    price: float | None
    market_value: float | None
    pl: float | None
    pl_pct: float | None


class BrokerSummary(TypedDict):
    broker: str
    env: str
    accounts: list[Account]
    positions: list[Position]
    updated_at: str


# Brokers mark an absent field with a sentinel (moomoo uses the string "N/A").
_MISSING = {"N/A", "", None}


def num(value: object) -> float | None:
    """
    A broker field as a float, or None when the broker left it empty.

    Args:
        value: Whatever the SDK returned: a number, numeric string, sentinel or NaN.

    Returns:
        The float, or None for a sentinel, NaN, infinity or anything non-numeric.
        Never raises: one odd field must not take the whole account view down.
    """
    if value in _MISSING:
        return None
    try:
        out = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return out if math.isfinite(out) else None


def text(value: object, default: str = "") -> str:
    """A broker field as a string, with the sentinel mapped to *default*."""
    return default if value in _MISSING else str(value)

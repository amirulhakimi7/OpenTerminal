"""
The one shape every broker adapter returns, so the dashboard renders moomoo,
Hata and Lucid with the same widget.  Pure: no I/O.
"""

from __future__ import annotations

import math
from typing import TypedDict


class Account(TypedDict):
    acc_id: str
    kind: str  # e.g. "Margin", "Cash · IPO"
    market: str
    currency: str
    total_assets: float | None
    cash: float | None
    market_value: float | None
    unrealized_pl: float | None
    realized_today: float | None  # session's closed P&L, where the broker reports it


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


class Fill(TypedDict):
    """One execution: part or all of an order, as the broker reports it."""

    deal_id: str
    order_id: str
    acc_id: str
    symbol: str
    name: str
    market: str
    side: str  # "BUY" or "SELL" (moomoo's SELL_SHORT / BUY_BACK fold into these)
    short: bool  # a short sale or the buy that covers one (SELL_SHORT / BUY_BACK)
    qty: float
    price: float
    time: str  # exchange-local wall time, "YYYY-MM-DD HH:MM:SS"
    fee: float | None  # this fill's share of its order's fees; None when unknown


class FillsReport(TypedDict):
    broker: str
    fills: list[Fill]  # oldest first
    since: str  # how far back the history goes (exchange-local date)
    notes: list[str]  # accounts skipped and why
    updated_at: str


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

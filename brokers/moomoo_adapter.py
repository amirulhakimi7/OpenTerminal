"""
moomoo (Futu) account reader.  READ-ONLY BY CONSTRUCTION.

It calls exactly three SDK queries: ``get_acc_list``, ``accinfo_query`` and
``position_list_query``.  It never calls ``unlock_trade``, so even with OpenD
logged in it cannot place, modify or cancel an order; ``test_read_only``
fails the build if any order call ever appears in this file.

The row -> schema mapping is pure and tested directly.  ``fetch_summary`` is
the only function that talks to OpenD.
"""

from __future__ import annotations

import socket
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from typing import Any

from schema import Account, BrokerSummary, Position, num, text

# The currency moomoo should report an account's totals in, by its first market.
_CURRENCY_BY_MARKET = {"US": "USD", "MY": "MYR", "HK": "HKD", "SG": "SGD", "JP": "JPY", "AU": "AUD", "CA": "CAD"}


def account_currency(markets: Sequence[str]) -> str:
    """Reporting currency for an account trading *markets*; USD when unknown."""
    for m in markets:
        if m in _CURRENCY_BY_MARKET:
            return _CURRENCY_BY_MARKET[m]
    return "USD"


def to_account(acc: Mapping[str, Any], funds: Mapping[str, Any] | None, markets: Sequence[str]) -> Account:
    """
    One ``get_acc_list`` row plus its ``accinfo_query`` row as an Account.

    Args:
        acc:     Row from get_acc_list.
        funds:   Row from accinfo_query, or None if that query failed.
        markets: Market names the account is authorised for (e.g. ["US", "MY"]).

    Returns:
        An Account.  Money fields are None when the funds query failed or the
        broker left them empty — never zero, which would read as a real balance.
    """
    f = funds or {}
    return Account(
        acc_id=text(acc.get("acc_id"), "?"),
        market="/".join(markets) or "—",
        currency=text(f.get("currency"), account_currency(markets)),
        total_assets=num(f.get("total_assets")),
        cash=num(f.get("cash")),
        market_value=num(f.get("market_val")),
        unrealized_pl=num(f.get("unrealized_pl")),
    )


def to_position(row: Mapping[str, Any]) -> Position | None:
    """
    One ``position_list_query`` row as a Position.

    Returns:
        The Position, or None for a closed line (zero quantity) — moomoo keeps
        those for the day's realised P&L, but they are not open positions.
    """
    qty = num(row.get("qty")) or 0.0
    if qty == 0:
        return None
    code = text(row.get("code"))
    return Position(
        symbol=code.split(".", 1)[-1] if "." in code else code,
        name=text(row.get("stock_name")),
        market=text(row.get("position_market"), code.split(".", 1)[0] if "." in code else ""),
        currency=text(row.get("currency"), "USD"),
        qty=qty,
        cost_price=num(row.get("cost_price")),
        price=num(row.get("nominal_price")),
        market_value=num(row.get("market_val")),
        pl=num(row.get("pl_val")),
        pl_pct=num(row.get("pl_ratio")),
    )


def summarize(
    env: str,
    accounts: Sequence[Account],
    position_rows: Sequence[Mapping[str, Any]],
    now: datetime,
) -> BrokerSummary:
    """Assemble the summary; closed position lines are dropped, largest value first."""
    positions = [p for p in (to_position(r) for r in position_rows) if p is not None]
    positions.sort(key=lambda p: abs(p["market_value"] or 0.0), reverse=True)
    return BrokerSummary(
        broker="moomoo",
        env=env,
        accounts=list(accounts),
        positions=positions,
        updated_at=now.isoformat(),
    )


class MoomooError(RuntimeError):
    """OpenD unreachable, not logged in, or a query refused."""


def fetch_summary(host: str, port: int, env: str, security_firm: str) -> BrokerSummary:
    """
    Query OpenD for every active account of *env* and its open positions.

    Args:
        host / port:   Where OpenD listens (default 127.0.0.1:11111).
        env:           "REAL" or "SIMULATE".
        security_firm: e.g. "FUTUMY" for moomoo Malaysia.

    Raises:
        MoomooError: with a message the dashboard can show as-is.
    """
    # The SDK retries a dead port for a long time; check it first so the
    # dashboard says "OpenD isn't running" in two seconds, not after a timeout.
    try:
        socket.create_connection((host, port), timeout=2).close()
    except OSError:
        raise MoomooError(f"moomoo OpenD is not running at {host}:{port}") from None

    # Imported here so the pure functions above (and their tests) don't need the SDK.
    from moomoo import RET_OK, OpenSecTradeContext, TrdMarket

    try:
        ctx = OpenSecTradeContext(
            filter_trdmarket=TrdMarket.NONE, host=host, port=port, security_firm=security_firm
        )
    except Exception as exc:  # the SDK raises bare Exceptions on connect failure
        raise MoomooError(f"cannot reach moomoo OpenD at {host}:{port}: {exc}") from None

    try:
        ret, acc_df = ctx.get_acc_list()
        if ret != RET_OK:
            raise MoomooError(f"OpenD refused the account list: {acc_df}. Is OpenD logged in?")

        accounts: list[Account] = []
        position_rows: list[dict[str, Any]] = []
        for acc in acc_df.to_dict("records"):
            if acc.get("trd_env") != env or acc.get("acc_status") == "DISABLED":
                continue
            markets = [TrdMarket.to_string2(m) for m in acc.get("trdmarket_auth") or []]
            currency = account_currency(markets)

            ret, funds_df = ctx.accinfo_query(trd_env=env, acc_id=acc["acc_id"], currency=currency)
            funds = funds_df.to_dict("records")[0] if ret == RET_OK and len(funds_df) else None
            accounts.append(to_account(acc, funds, markets))

            ret, pos_df = ctx.position_list_query(trd_env=env, acc_id=acc["acc_id"])
            if ret == RET_OK:
                position_rows.extend(pos_df.to_dict("records"))

        if not accounts:
            raise MoomooError(f"no active {env} accounts on this moomoo login")
        return summarize(env, accounts, position_rows, datetime.now(UTC))
    finally:
        ctx.close()

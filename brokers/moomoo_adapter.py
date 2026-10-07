"""
moomoo (Futu) account reader.  READ-ONLY BY CONSTRUCTION.

It calls only SDK queries: ``get_acc_list``, ``accinfo_query``,
``position_list_query``, and for the trade history ``history_deal_list_query``,
``deal_list_query`` and ``order_fee_query``.  It never calls ``unlock_trade``,
so even with OpenD logged in it cannot place, modify or cancel an order;
``test_read_only`` fails the build if any order call ever appears in this file.

The row -> schema mapping is pure and tested directly.  ``fetch_summary`` is
the only function that talks to OpenD.
"""

from __future__ import annotations

import socket
from collections.abc import Callable, Mapping, Sequence
from datetime import UTC, datetime, timedelta
from typing import Any

from schema import Account, BrokerSummary, Fill, FillsReport, Position, num, text

# Reporting currency, most-preferred market first: a universal account that
# can trade HK/US/SG/MY reports in USD, not in whichever market moomoo lists first.
_CURRENCY_PRIORITY = [("US", "USD"), ("MY", "MYR"), ("HK", "HKD"), ("SG", "SGD"), ("JP", "JPY"), ("AU", "AUD"), ("CA", "CAD")]


def account_currency(markets: Sequence[str]) -> str:
    """Reporting currency for an account trading *markets*; USD when unknown."""
    for market, currency in _CURRENCY_PRIORITY:
        if market in markets:
            return currency
    return "USD"


def market_names(raw: Sequence[object], to_name: Callable[[int], str]) -> list[str]:
    """
    ``trdmarket_auth`` as names.  The SDK returns names in current versions and
    enum ints in older ones; fund sub-markets (MYFUND, USFUND) are dropped as noise.
    """
    names = [to_name(m) if isinstance(m, int) else str(m) for m in raw]
    return [n for n in names if n not in ("N/A", "") and not n.endswith("FUND")]


def account_kind(acc: Mapping[str, Any]) -> str:
    """"Margin", "Cash", or "Cash · IPO" — the role only when it isn't the normal one."""
    kind = text(acc.get("acc_type"), "Account").title()
    role = text(acc.get("acc_role"))
    return f"{kind} · {role}" if role and role != "NORMAL" else kind


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
        kind=account_kind(acc),
        market="/".join(markets) or "—",
        currency=text(f.get("currency"), account_currency(markets)),
        total_assets=num(f.get("total_assets")),
        cash=num(f.get("cash")),
        market_value=num(f.get("market_val")),
        unrealized_pl=num(f.get("unrealized_pl")),
        realized_today=None,
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
    """
    Assemble the summary; closed position lines are dropped, largest value first.

    An account whose funds query left ``unrealized_pl`` empty gets the sum of
    its open positions' P&L, matched on the ``_acc_id`` tag the fetch adds.
    """
    pl_by_acc: dict[str, float] = {}
    for row in position_rows:
        p = to_position(row)
        if p is not None and p["pl"] is not None:
            key = text(row.get("_acc_id"))
            pl_by_acc[key] = pl_by_acc.get(key, 0.0) + p["pl"]
    filled = [
        Account(**{**a, "unrealized_pl": round(pl_by_acc[a["acc_id"]], 2)})
        if a["unrealized_pl"] is None and a["acc_id"] in pl_by_acc
        else a
        for a in accounts
    ]

    positions = [p for p in (to_position(r) for r in position_rows) if p is not None]
    positions.sort(key=lambda p: abs(p["market_value"] or 0.0), reverse=True)
    return BrokerSummary(
        broker="moomoo",
        env=env,
        accounts=filled,
        positions=positions,
        updated_at=now.isoformat(),
    )


_SIDES = {"BUY": "BUY", "BUY_BACK": "BUY", "SELL": "SELL", "SELL_SHORT": "SELL"}


def to_fill(row: Mapping[str, Any], acc_id: str) -> Fill | None:
    """
    One ``history_deal_list_query`` / ``deal_list_query`` row as a Fill.

    Returns:
        The Fill, or None for a row that isn't a clean execution: a cancelled
        or failed deal, an unknown side, or no quantity or price.
    """
    raw_side = text(row.get("trd_side")).upper()
    side = _SIDES.get(raw_side)
    qty = num(row.get("qty"))
    price = num(row.get("price"))
    status = text(row.get("status"), "OK").upper()
    if side is None or not qty or qty <= 0 or price is None or price < 0 or status not in ("OK", ""):
        return None
    code = text(row.get("code"))
    market, _, symbol = code.partition(".") if "." in code else ("", "", code)
    return Fill(
        deal_id=text(row.get("deal_id")),
        order_id=text(row.get("order_id")),
        acc_id=acc_id,
        symbol=symbol,
        name=text(row.get("stock_name")),
        market=text(row.get("deal_market"), market),
        side=side,
        short=raw_side in ("SELL_SHORT", "BUY_BACK"),
        qty=qty,
        price=price,
        time=text(row.get("create_time"))[:19],  # drop the milliseconds
        fee=None,
    )


def merge_fills(fills: Sequence[Fill]) -> list[Fill]:
    """Today's list and the history overlap: one fill per deal id, oldest first."""
    by_id: dict[str, Fill] = {}
    for f in fills:
        by_id[f["deal_id"] or f"{f['order_id']}|{f['time']}|{f['qty']}"] = f
    return sorted(by_id.values(), key=lambda f: (f["time"], f["deal_id"]))


def share_fees(fills: Sequence[Fill], fee_by_order: Mapping[str, float]) -> list[Fill]:
    """
    Spread each order's fee over its fills by quantity.

    An order filled in three pieces pays its fee once; each piece carries its
    share, so P&L per trade adds up to what the account was actually charged.
    Orders with no fee figure leave their fills' fee as None, not zero.
    """
    qty_by_order: dict[str, float] = {}
    for f in fills:
        qty_by_order[f["order_id"]] = qty_by_order.get(f["order_id"], 0.0) + f["qty"]
    out: list[Fill] = []
    for f in fills:
        fee = fee_by_order.get(f["order_id"])
        total = qty_by_order[f["order_id"]]
        out.append(Fill(**{**f, "fee": None if fee is None or total <= 0 else round(fee * f["qty"] / total, 4)}))
    return out


def history_windows(now: datetime, days: int, span: int = 359) -> list[tuple[str, str]]:
    """
    (start, end) strings covering the last *days* days in chunks moomoo accepts
    (at most 360 days per query), newest first.
    """
    fmt = "%Y-%m-%d %H:%M:%S"
    out: list[tuple[str, str]] = []
    end = now
    oldest = now - timedelta(days=days)
    while end > oldest:
        start = max(oldest, end - timedelta(days=span))
        out.append((start.strftime(fmt), end.strftime(fmt)))
        end = start - timedelta(seconds=1)
    return out


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
            markets = market_names(acc.get("trdmarket_auth") or [], TrdMarket.to_string2)
            currency = account_currency(markets)

            ret, funds_df = ctx.accinfo_query(trd_env=env, acc_id=acc["acc_id"], currency=currency)
            funds = funds_df.to_dict("records")[0] if ret == RET_OK and len(funds_df) else None
            accounts.append(to_account(acc, funds, markets))

            ret, pos_df = ctx.position_list_query(trd_env=env, acc_id=acc["acc_id"])
            if ret == RET_OK:
                for row in pos_df.to_dict("records"):
                    row["_acc_id"] = str(acc["acc_id"])
                    position_rows.append(row)

        if not accounts:
            raise MoomooError(f"no active {env} accounts on this moomoo login")
        return summarize(env, accounts, position_rows, datetime.now(UTC))
    finally:
        ctx.close()


def fetch_fills(host: str, port: int, env: str, security_firm: str, days: int = 718) -> FillsReport:
    """
    Every execution on every active account of *env* over the last *days* days,
    with fees.  Accounts moomoo won't report on (IPO cash accounts) are skipped
    with a note rather than failing the whole report.

    Raises:
        MoomooError: OpenD unreachable or not logged in.
    """
    try:
        socket.create_connection((host, port), timeout=2).close()
    except OSError:
        raise MoomooError(f"moomoo OpenD is not running at {host}:{port}") from None

    from moomoo import RET_OK, OpenSecTradeContext, TrdMarket

    try:
        ctx = OpenSecTradeContext(
            filter_trdmarket=TrdMarket.NONE, host=host, port=port, security_firm=security_firm
        )
    except Exception as exc:
        raise MoomooError(f"cannot reach moomoo OpenD at {host}:{port}: {exc}") from None

    now = datetime.now()  # moomoo reads these as the exchange's own local time
    fills: list[Fill] = []
    notes: list[str] = []
    try:
        ret, acc_df = ctx.get_acc_list()
        if ret != RET_OK:
            raise MoomooError(f"OpenD refused the account list: {acc_df}. Is OpenD logged in?")
        for acc in acc_df.to_dict("records"):
            if acc.get("trd_env") != env or acc.get("acc_status") == "DISABLED":
                continue
            acc_id = str(acc["acc_id"])
            label = f"{account_kind(acc)} ··{acc_id[-4:]}"
            rows: list[Mapping[str, Any]] = []
            refused = None
            for start, end in history_windows(now, days):
                ret, df = ctx.history_deal_list_query(start=start, end=end, trd_env=env, acc_id=acc["acc_id"])
                if ret != RET_OK:
                    refused = str(df)
                    break
                rows.extend(df.to_dict("records"))
            if refused is None:
                ret, df = ctx.deal_list_query(trd_env=env, acc_id=acc["acc_id"])
                if ret == RET_OK:
                    rows.extend(df.to_dict("records"))
            if refused is not None:
                why = "moomoo doesn't report trades for IPO accounts" if "IPO" in refused else "moomoo refused the trade history"
                notes.append(f"{label}: {why}")
                continue
            acc_fills = merge_fills([f for f in (to_fill(r, acc_id) for r in rows) if f is not None])
            # Fees, a batch of orders at a time.
            order_ids = sorted({f["order_id"] for f in acc_fills if f["order_id"]})
            fee_by_order: dict[str, float] = {}
            for i in range(0, len(order_ids), 100):
                ret, fee_df = ctx.order_fee_query(order_id_list=order_ids[i : i + 100], trd_env=env, acc_id=acc["acc_id"])
                if ret != RET_OK:
                    notes.append(f"{label}: fees unavailable, P&L shown before fees")
                    break
                for r in fee_df.to_dict("records"):
                    fee = num(r.get("fee_amount"))
                    if fee is not None:
                        fee_by_order[text(r.get("order_id"))] = fee
            fills.extend(share_fees(acc_fills, fee_by_order))
        return FillsReport(
            broker="moomoo",
            fills=merge_fills(fills),
            since=(now - timedelta(days=days)).strftime("%Y-%m-%d"),
            notes=notes,
            updated_at=datetime.now(UTC).isoformat(),
        )
    finally:
        ctx.close()

"""
Hata (crypto, Malaysia) account reader.  READ-ONLY BY CONSTRUCTION.

It sends GET requests only, to two endpoints: ``/orderbook/sapi/balance`` and
``/orderbook/sapi/trades/history``.
There is no POST in this file, so it cannot create or cancel an order or ask
for a withdrawal; ``test_read_only`` fails the build if one ever appears.

Signing follows developers.hata.io: every request carries a ``timestamp``; the
parameters, sorted by key, are joined as a query string and signed with
HMAC-SHA256 using the secret; the key and signature travel in the
``X-API-KEY`` and ``Signature`` headers.  The key and secret come from the
environment (brokers/.env) and are never logged or returned.

The row -> schema mapping is pure and tested directly; ``HataClient`` is the
only part that talks to the network.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo

from schema import Account, BrokerSummary, Fill, FillsReport, Position, num, text

MYT = ZoneInfo("Asia/Kuala_Lumpur")


class HataError(RuntimeError):
    """Keys missing, Hata unreachable, or a request refused."""


def sign(params: Mapping[str, object], secret: str) -> tuple[str, str]:
    """
    The query string to send and its signature.

    Args:
        params: Every query parameter, ``timestamp`` included.
        secret: The API secret.

    Returns:
        (query, signature): keys sorted alphabetically, joined ``k=v&k=v``;
        the signature is the hex HMAC-SHA256 of exactly that string.
    """
    query = urllib.parse.urlencode(sorted((k, str(v)) for k, v in params.items()))
    signature = hmac.new(secret.encode(), query.encode(), hashlib.sha256).hexdigest()
    return query, signature


def epoch_seconds(value: object) -> float | None:
    """Hata timestamps as seconds, whether it sent seconds or milliseconds."""
    n = num(value)
    if n is None or n <= 0:
        return None
    return n / 1000 if n > 1e12 else n


def to_fill(row: Mapping[str, Any]) -> Fill | None:
    """
    One ``trades/history`` row as a Fill, its time in Malaysia time.

    Hata takes a buy's fee out of the coin bought (buy 1.34 SOL, fee 0.00469
    SOL: you receive 1.33531), and a sell's fee out of the proceeds. So for a
    buy the Fill's quantity is what actually arrived, and its fee is the coin
    fee valued at the trade price: what you paid (qty x price) and what you
    hold both come out right. A sell's fee is already in the quote currency.

    Returns:
        The Fill, or None for a row without a pair, quantity, price or time.
    """
    pair = text(row.get("pair_name"))
    qty = num(row.get("qty"))
    price = num(row.get("price"))
    ts = epoch_seconds(row.get("created_at"))
    if not pair or not qty or qty <= 0 or price is None or price < 0 or ts is None:
        return None
    is_buy = row.get("is_buy") in (True, "true", "True", 1)
    fee = num(row.get("fee"))
    if is_buy and fee is not None and 0 <= fee < qty:
        qty, fee = qty - fee, fee * price  # coin fee -> received quantity, fee in quote
    return Fill(
        deal_id=text(row.get("trade_id")),
        order_id=text(row.get("order_id")),
        acc_id="hata",
        symbol=pair,
        name=text(row.get("base_asset"), pair),
        market="Hata",
        side="BUY" if is_buy else "SELL",
        short=False,  # spot only
        qty=qty,
        price=price,
        time=datetime.fromtimestamp(ts, MYT).strftime("%Y-%m-%d %H:%M:%S"),
        fee=None if fee is None else round(fee, 6),
    )


def summarize(balances: Sequence[Mapping[str, Any]], quote: str, now: datetime) -> BrokerSummary:
    """
    The spot balances as one account and its holdings, valued in *quote*.

    Fiat balances are the account's cash; every other token with a balance is
    a position, its price implied by Hata's own valuation (``*_in_quote``).
    Hata reports no cost basis, so profit and loss stay None, not zero.
    """
    cash = 0.0
    held = 0.0
    any_value = False
    positions: list[Position] = []
    for b in balances:
        qty = (num(b.get("available")) or 0.0) + (num(b.get("frozen")) or 0.0)
        av, fr = num(b.get("available_in_quote")), num(b.get("frozen_in_quote"))
        value = None if av is None and fr is None else (av or 0.0) + (fr or 0.0)
        if value is not None:
            any_value = True
        if b.get("is_fiat") in (True, "true", 1):
            cash += value if value is not None else qty
            continue
        if qty <= 0:
            continue
        held += value or 0.0
        positions.append(
            Position(
                symbol=text(b.get("symbol"), "?"),
                name=text(b.get("name")),
                market="Hata",
                currency=quote,
                qty=qty,
                cost_price=None,
                price=round(value / qty, 8) if value is not None else None,
                market_value=round(value, 2) if value is not None else None,
                pl=None,
                pl_pct=None,
            )
        )
    positions.sort(key=lambda p: p["market_value"] or 0.0, reverse=True)
    account = Account(
        acc_id="hata",
        kind="Spot",
        market="MY",
        currency=quote,
        total_assets=round(cash + held, 2) if any_value else None,
        cash=round(cash, 2),
        market_value=round(held, 2) if any_value else None,
        unrealized_pl=None,
        realized_today=None,
    )
    return BrokerSummary(broker="hata", env="REAL", accounts=[account], positions=positions, updated_at=now.isoformat())


class HataClient:
    """Signed GET requests to the Hata API.  There is deliberately no POST."""

    def __init__(self, base_url: str, api_key: str, secret: str) -> None:
        if not api_key or not secret:
            raise HataError("Hata API key not set: add HATA_API_KEY and HATA_API_SECRET to brokers/.env")
        self._base = base_url.rstrip("/")
        self._key = api_key
        self._secret = secret

    def get(self, path: str, params: Mapping[str, object] | None = None, signed: bool = True) -> Any:
        query = urllib.parse.urlencode(sorted((k, str(v)) for k, v in (params or {}).items()))
        headers = {"Accept": "application/json", "User-Agent": "kimi-dashboard/1.0"}
        if signed:
            query, signature = sign({**(params or {}), "timestamp": int(time.time())}, self._secret)
            headers["X-API-KEY"] = self._key
            headers["Signature"] = signature
        req = urllib.request.Request(f"{self._base}{path}?{query}", headers=headers, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=10) as res:
                return json.loads(res.read().decode())
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")[:200]
            if exc.code == 401:
                raise HataError("Hata refused the API key (401): check HATA_API_KEY / HATA_API_SECRET and the key's IP whitelist") from None
            if exc.code == 429:
                raise HataError("Hata rate limit reached (429): try again in a minute") from None
            raise HataError(f"Hata HTTP {exc.code}: {detail}") from None
        except (urllib.error.URLError, TimeoutError) as exc:
            raise HataError(f"cannot reach Hata at {self._base}: {exc}") from None


def _rows(payload: Any, key: str) -> list[Mapping[str, Any]]:
    """Hata wraps some lists in an object, some in ``data``; take the list wherever it is."""
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for k in (key, "data"):
            inner = payload.get(k)
            if isinstance(inner, list):
                return inner
            if isinstance(inner, dict) and isinstance(inner.get(key), list):
                return inner[key]  # type: ignore[no-any-return]
    return []


def fetch_summary(client: HataClient, quote: str) -> BrokerSummary:
    payload = client.get("/orderbook/sapi/balance")
    return summarize(_rows(payload, "balances"), quote, datetime.now(UTC))


def fetch_fills(client: HataClient, max_pages: int = 50) -> FillsReport:
    """Every trade on the account, oldest first, paging 100 at a time."""
    fills: list[Fill] = []
    page = 1
    while page <= max_pages:
        payload = client.get("/orderbook/sapi/trades/history", {"page": page, "rows": 100})
        rows = _rows(payload, "trades")
        fills.extend(f for f in (to_fill(r) for r in rows) if f is not None)
        data = payload.get("data") if isinstance(payload, dict) else None
        pages = (data or {}).get("pages") if isinstance(data, dict) else payload.get("pages") if isinstance(payload, dict) else None
        if not rows or (isinstance(pages, int) and page >= pages):
            break
        page += 1
    fills.sort(key=lambda f: (f["time"], f["deal_id"]))
    oldest = fills[0]["time"][:10] if fills else datetime.now(MYT).strftime("%Y-%m-%d")
    return FillsReport(broker="hata", fills=fills, since=oldest, notes=[], updated_at=datetime.now(UTC).isoformat())

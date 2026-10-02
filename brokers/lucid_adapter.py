"""
Lucid (LucidFlex) account reader over Rithmic.  READ-ONLY BY CONSTRUCTION.

DISABLED UNLESS ``LUCID_ENABLED=1``.  Do not enable it until Lucid has
confirmed (a) API access is on for your Rithmic user ID, and (b) this
connection will not log your Tradesea session out.  Rithmic can drop an
existing session when the same user logs in again, and losing Tradesea while
a position is open is exactly the risk the LucidFlex rules punish.

What it connects to: the PnL plant ONLY.  It never opens the order plant, so
it has no channel that could place, modify or cancel an order;
``test_lucid_adapter.py::test_read_only`` fails if that ever changes.

It keeps ONE logged-in connection and refreshes snapshots on a timer, rather
than logging in per request: repeated logins are what would fight Tradesea.

async_rithmic (pinned to 1.6.6) normally learns fcm_id/ib_id and the account
list from the order plant.  ``_prime_without_order_plant`` supplies both from
the PnL plant's login-info reply and LUCID_ACCOUNT_ID instead.  That touches
the library's internals, which is why the version is pinned.

Settings (brokers/.env, gitignored — you type these, never in chat):

    LUCID_ENABLED=1
    LUCID_USER=...              Rithmic user ID from Lucid
    LUCID_PASSWORD=...
    LUCID_SYSTEM=...            Rithmic system name Lucid gave you
    LUCID_GATEWAY=...           host:port, issued after Rithmic conformance
    LUCID_APP_NAME=...          the app name Rithmic approved in conformance
    LUCID_ACCOUNT_ID=...        your LucidFlex account id (comma-separate several)
"""

from __future__ import annotations

import asyncio
import os
import threading
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from schema import Account, BrokerSummary, Position, num, text

REFRESH_SECONDS = 15.0


# ---- pure mapping -----------------------------------------------------------


def to_account(row: Mapping[str, Any]) -> Account:
    """
    One AccountPnLPositionUpdate snapshot as an Account.

    ``account_balance`` is the realised balance; equity adds the open P&L.
    ``realized_today`` is ``day_closed_pnl`` — the figure the LucidFlex daily
    loss limit is measured on.
    """
    balance = num(row.get("account_balance"))
    open_pl = num(row.get("open_position_pnl"))
    return Account(
        acc_id=text(row.get("account_id"), "?"),
        kind="LucidFlex",
        market="CME",
        currency="USD",
        total_assets=None if balance is None else round(balance + (open_pl or 0.0), 2),
        cash=balance,
        market_value=None,
        unrealized_pl=open_pl,
        realized_today=num(row.get("day_closed_pnl")),
    )


def to_position(row: Mapping[str, Any]) -> Position | None:
    """One InstrumentPnLPositionUpdate snapshot; None when flat in that contract."""
    qty = num(row.get("net_quantity")) or 0.0
    if qty == 0:
        return None
    return Position(
        symbol=text(row.get("symbol")),
        name=text(row.get("product_code")),
        market=text(row.get("exchange"), "CME"),
        currency="USD",
        qty=qty,
        cost_price=num(row.get("avg_open_fill_price")),
        price=None,
        market_value=None,
        pl=num(row.get("open_position_pnl")),
        pl_pct=None,
    )


def summarize(
    account_rows: Sequence[Mapping[str, Any]],
    position_rows: Sequence[Mapping[str, Any]],
    now: datetime,
) -> BrokerSummary:
    positions = [p for p in (to_position(r) for r in position_rows) if p is not None]
    return BrokerSummary(
        broker="lucid",
        env="REAL",
        accounts=[to_account(r) for r in account_rows],
        positions=positions,
        updated_at=now.isoformat(),
    )


def proto_to_dict(msg: Any) -> dict[str, Any]:
    """A protobuf message as a plain dict of its set fields."""
    return {f.name: v for f, v in msg.ListFields()}


# ---- I/O ----------------------------------------------------------------------


class LucidError(RuntimeError):
    """Disabled, not configured, or the Rithmic connection failed."""


@dataclass(frozen=True)
class LucidConfig:
    user: str
    password: str
    system: str
    gateway: str
    app_name: str
    account_ids: tuple[str, ...]

    @staticmethod
    def from_env() -> LucidConfig:
        if os.environ.get("LUCID_ENABLED") != "1":
            raise LucidError(
                "Lucid is disabled. Enable it only after Lucid confirms API access and that "
                "this connection won't log Tradesea out (see brokers/README.md)"
            )
        keys = ["LUCID_USER", "LUCID_PASSWORD", "LUCID_SYSTEM", "LUCID_GATEWAY", "LUCID_APP_NAME", "LUCID_ACCOUNT_ID"]
        missing = [k for k in keys if not os.environ.get(k)]
        if missing:
            raise LucidError(f"missing in brokers/.env: {', '.join(missing)}")
        return LucidConfig(
            user=os.environ["LUCID_USER"],
            password=os.environ["LUCID_PASSWORD"],
            system=os.environ["LUCID_SYSTEM"],
            gateway=os.environ["LUCID_GATEWAY"],
            app_name=os.environ["LUCID_APP_NAME"],
            account_ids=tuple(a.strip() for a in os.environ["LUCID_ACCOUNT_ID"].split(",") if a.strip()),
        )


async def _prime_without_order_plant(client: Any, account_ids: Sequence[str]) -> None:
    """Give the library the fcm/ib ids and accounts it would otherwise get from the order plant."""
    pnl = client.plants["pnl"]
    replies = await pnl._send_and_collect(template_id=300, account_id=None, expected_response=dict(template_id=301))
    info = pnl._first(replies)
    order = client.plants["order"]
    order.login_info = dict(fcm_id=info.fcm_id, ib_id=info.ib_id, user_type=info.user_type)
    order.accounts = [type("Acct", (), {"account_id": a})() for a in account_ids]


class LucidFeed:
    """One background connection; ``latest()`` returns the last snapshot or the last error."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._summary: BrokerSummary | None = None
        self._error: str | None = "starting…"
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        try:
            cfg = LucidConfig.from_env()
        except LucidError as exc:
            self._set(None, str(exc))
            return
        self._thread = threading.Thread(target=lambda: asyncio.run(self._run(cfg)), daemon=True, name="lucid")
        self._thread.start()

    def latest(self) -> BrokerSummary:
        with self._lock:
            if self._summary is not None:
                return self._summary
            raise LucidError(self._error or "no data yet")

    def _set(self, summary: BrokerSummary | None, error: str | None) -> None:
        with self._lock:
            if summary is not None:
                self._summary = summary
            self._error = error

    async def _run(self, cfg: LucidConfig) -> None:
        from async_rithmic import RithmicClient, SysInfraType

        client = RithmicClient(
            user=cfg.user,
            password=cfg.password,
            system_name=cfg.system,
            app_name=cfg.app_name,
            app_version="1.0",
            url=cfg.gateway,
        )
        try:
            await client.connect(plants=[SysInfraType.PNL_PLANT])
            await _prime_without_order_plant(client, cfg.account_ids)
        except Exception as exc:
            self._set(None, f"Rithmic login failed: {exc}")
            return

        pnl = client.plants["pnl"]
        try:
            while True:
                try:
                    accounts: list[dict[str, Any]] = []
                    positions: list[dict[str, Any]] = []
                    for acc in cfg.account_ids:
                        accounts += [proto_to_dict(m) for m in await pnl.list_account_summary(account_id=acc)]
                        positions += [proto_to_dict(m) for m in await pnl.list_positions(account_id=acc)]
                    self._set(summarize(accounts, positions, datetime.now(UTC)), None)
                except Exception as exc:  # keep the session; report and retry next tick
                    self._set(None, f"Rithmic PnL request failed: {exc}")
                await asyncio.sleep(REFRESH_SECONDS)
        finally:
            await client.disconnect()

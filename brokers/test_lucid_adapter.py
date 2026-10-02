"""Tests for the Lucid/Rithmic mapping, the PnL-plant-only guarantee and the off switch."""

from __future__ import annotations

import ast
from datetime import UTC, datetime
from pathlib import Path

import pytest

from lucid_adapter import LucidConfig, LucidError, LucidFeed, summarize, to_account, to_position

NOW = datetime(2026, 10, 2, 14, 0, tzinfo=UTC)
SOURCE = Path(__file__).with_name("lucid_adapter.py").read_text()

# Anything that would open an order channel or send an order.
FORBIDDEN = {
    "ORDER_PLANT",
    "submit_order",
    "modify_order",
    "cancel_order",
    "cancel_all_orders",
    "exit_position",
    "list_trade_routes",
}


def test_read_only() -> None:
    names = {n.attr for n in ast.walk(ast.parse(SOURCE)) if isinstance(n, ast.Attribute)}
    assert not names & FORBIDDEN, f"order capability in a read-only adapter: {names & FORBIDDEN}"


def test_connects_to_pnl_plant_only() -> None:
    calls = [
        n for n in ast.walk(ast.parse(SOURCE))
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == "connect"
    ]
    assert calls, "connect() not found"
    for call in calls:
        plants = next((k.value for k in call.keywords if k.arg == "plants"), None)
        assert isinstance(plants, ast.List), "connect() must name its plants; the default includes the order plant"
        assert [ast.unparse(e) for e in plants.elts] == ["SysInfraType.PNL_PLANT"]


def test_disabled_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LUCID_ENABLED", raising=False)
    with pytest.raises(LucidError, match="disabled"):
        LucidConfig.from_env()


def test_feed_reports_why_it_is_idle(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LUCID_ENABLED", raising=False)
    feed = LucidFeed()
    feed.start()
    with pytest.raises(LucidError, match="disabled"):
        feed.latest()


def test_enabled_but_incomplete_names_every_missing_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LUCID_ENABLED", "1")
    for k in ["LUCID_USER", "LUCID_PASSWORD", "LUCID_SYSTEM", "LUCID_GATEWAY", "LUCID_APP_NAME", "LUCID_ACCOUNT_ID"]:
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("LUCID_USER", "u")
    with pytest.raises(LucidError) as exc:
        LucidConfig.from_env()
    assert "LUCID_PASSWORD" in str(exc.value) and "LUCID_ACCOUNT_ID" in str(exc.value)
    assert "LUCID_USER," not in str(exc.value)


def test_account_equity_adds_open_pnl() -> None:
    acc = to_account({"account_id": "LFE0501", "account_balance": "50250.00", "open_position_pnl": "-75.5",
                      "day_closed_pnl": "250.0"})
    assert acc["total_assets"] == 50174.5
    assert acc["cash"] == 50250.0
    assert acc["unrealized_pl"] == -75.5
    assert acc["realized_today"] == 250.0


def test_account_with_missing_balance_is_unknown_not_zero() -> None:
    acc = to_account({"account_id": "LFE0501"})
    assert acc["total_assets"] is None
    assert acc["realized_today"] is None


def test_short_position_keeps_its_sign() -> None:
    p = to_position({"symbol": "MCLX6", "product_code": "MCL", "exchange": "NYMEX", "net_quantity": -3,
                     "avg_open_fill_price": 89.25, "open_position_pnl": "45.0"})
    assert p is not None
    assert (p["symbol"], p["qty"], p["cost_price"], p["pl"]) == ("MCLX6", -3.0, 89.25, 45.0)


def test_flat_contract_is_dropped() -> None:
    assert to_position({"symbol": "MCLX6", "net_quantity": 0, "day_closed_pnl": "100"}) is None


def test_summary_empty() -> None:
    s = summarize([], [], NOW)
    assert (s["broker"], s["accounts"], s["positions"]) == ("lucid", [], [])

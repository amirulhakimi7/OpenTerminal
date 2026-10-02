"""Tests for the moomoo row mapping, and the read-only guarantee."""

from __future__ import annotations

import ast
from datetime import UTC, datetime
from pathlib import Path

from moomoo_adapter import account_currency, summarize, to_account, to_position
from schema import num

NOW = datetime(2026, 10, 2, 14, 0, tzinfo=UTC)

# Every SDK method that can create, change or cancel an order, or unlock trading.
ORDER_CALLS = {"place_order", "modify_order", "cancel_order", "cancel_all_order", "unlock_trade"}


def test_read_only() -> None:
    tree = ast.parse(Path(__file__).with_name("moomoo_adapter.py").read_text())
    called = {
        node.func.attr
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
    }
    assert not called & ORDER_CALLS, f"order call in a read-only adapter: {called & ORDER_CALLS}"


def test_account_happy_path() -> None:
    acc = to_account(
        {"acc_id": 281756460288, "trd_env": "REAL"},
        {"total_assets": 10500.5, "cash": 2500.0, "market_val": 8000.5, "unrealized_pl": -120.25, "currency": "USD"},
        ["US"],
    )
    assert acc == {
        "acc_id": "281756460288",
        "market": "US",
        "currency": "USD",
        "total_assets": 10500.5,
        "cash": 2500.0,
        "market_value": 8000.5,
        "unrealized_pl": -120.25,
    }


def test_account_without_funds_reports_unknown_not_zero() -> None:
    acc = to_account({"acc_id": 1}, None, ["MY"])
    assert acc["currency"] == "MYR"
    assert acc["total_assets"] is None
    assert acc["cash"] is None


def test_sentinels_and_nan_become_none() -> None:
    assert num("N/A") is None
    assert num(float("nan")) is None
    assert num("") is None
    assert num("12.5") == 12.5


def test_position_mapping() -> None:
    p = to_position(
        {"code": "US.AAPL", "stock_name": "Apple", "position_market": "US", "qty": 10, "cost_price": 300,
         "nominal_price": 330.84, "market_val": 3308.4, "pl_val": 308.4, "pl_ratio": 10.28, "currency": "USD"}
    )
    assert p is not None
    assert (p["symbol"], p["market"], p["qty"], p["pl"]) == ("AAPL", "US", 10.0, 308.4)


def test_closed_position_line_is_dropped() -> None:
    assert to_position({"code": "MY.1155", "qty": 0, "pl_val": 50}) is None


def test_missing_position_market_falls_back_to_code_prefix() -> None:
    p = to_position({"code": "MY.1155", "stock_name": "MAYBANK", "position_market": "N/A", "qty": 100})
    assert p is not None
    assert p["market"] == "MY"
    assert p["cost_price"] is None


def test_summary_empty_positions() -> None:
    s = summarize("REAL", [to_account({"acc_id": 1}, None, ["US"])], [], NOW)
    assert s["positions"] == []
    assert s["updated_at"] == NOW.isoformat()


def test_summary_sorts_largest_first() -> None:
    rows = [
        {"code": "US.A", "qty": 1, "market_val": 100},
        {"code": "US.B", "qty": 1, "market_val": 900},
        {"code": "US.C", "qty": 0, "market_val": 5000},  # closed today: dropped
    ]
    s = summarize("REAL", [], rows, NOW)
    assert [p["symbol"] for p in s["positions"]] == ["B", "A"]


def test_account_currency_fallback() -> None:
    assert account_currency(["MY", "US"]) == "MYR"
    assert account_currency([]) == "USD"

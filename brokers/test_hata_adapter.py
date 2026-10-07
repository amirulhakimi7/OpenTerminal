"""Tests for the Hata signing, row mapping, and the read-only guarantee."""

from __future__ import annotations

import hashlib
import hmac
from datetime import UTC, datetime
from pathlib import Path

import pytest

from hata_adapter import HataClient, HataError, epoch_seconds, sign, summarize, to_fill

SOURCE = Path(__file__).with_name("hata_adapter.py").read_text()
NOW = datetime(2026, 10, 7, 6, 0, tzinfo=UTC)


def test_read_only() -> None:
    # No way to send a write: no POST, and none of the endpoints that move money or orders.
    for forbidden in ('"POST"', "'POST'", "orders/create", "orders/cancel", "withdrawal/create", "internal-transfer/create", "fiat/"):
        assert forbidden not in SOURCE, f"write path in a read-only adapter: {forbidden}"
    assert 'method="GET"' in SOURCE


def test_sign_sorts_keys_and_signs_the_exact_query() -> None:
    query, sig = sign({"timestamp": 1704789520, "rows": 100, "page": 1}, "s3cret")
    assert query == "page=1&rows=100&timestamp=1704789520"
    assert sig == hmac.new(b"s3cret", query.encode(), hashlib.sha256).hexdigest()


def test_missing_keys_say_where_to_put_them() -> None:
    with pytest.raises(HataError, match="brokers/.env"):
        HataClient("https://my-api.hata.io", "", "")


def test_epoch_accepts_seconds_or_milliseconds() -> None:
    assert epoch_seconds(1759816800) == 1759816800
    assert epoch_seconds(1759816800123) == 1759816800.123
    assert epoch_seconds(0) is None
    assert epoch_seconds("N/A") is None


TRADE = {
    "created_at": 1759816800, "pair_name": "BTCMYR", "is_buy": True, "price": "512000.5", "qty": "0.0012",
    "fee": "1.23", "is_maker": False, "quote_asset": "MYR", "base_asset": "BTC", "trade_id": 991, "order_id": 77,
}


def test_fill_happy_path_in_malaysia_time() -> None:
    assert to_fill({**TRADE, "fee": "0"}) == {
        "deal_id": "991", "order_id": "77", "acc_id": "hata", "symbol": "BTCMYR", "name": "BTC", "market": "Hata",
        "side": "BUY", "short": False, "qty": 0.0012, "price": 512000.5, "time": "2025-10-07 14:00:00", "fee": 0.0,
    }


def test_buy_fee_is_taken_in_the_coin() -> None:
    # Real shape: buy 1.34 SOL at RM753.20, fee 0.00469 SOL (0.35%).
    f = to_fill({**TRADE, "pair_name": "SOLMYR", "base_asset": "SOL", "qty": "1.34", "price": "753.2", "fee": "0.00469"})
    assert f is not None
    assert f["qty"] == pytest.approx(1.33531)  # what arrived in the wallet
    assert f["fee"] == pytest.approx(0.00469 * 753.2, abs=1e-6)  # the fee in ringgit
    assert f["qty"] * f["price"] + f["fee"] == pytest.approx(1.34 * 753.2)  # what was paid


def test_sell_fee_is_already_in_the_quote() -> None:
    f = to_fill({**TRADE, "is_buy": False, "qty": "2", "price": "100", "fee": "0.7"})
    assert f is not None and f["qty"] == 2 and f["fee"] == 0.7


def test_fill_sell_and_bad_rows() -> None:
    assert to_fill({**TRADE, "is_buy": False})["side"] == "SELL"  # type: ignore[index]
    assert to_fill({**TRADE, "qty": "0"}) is None
    assert to_fill({**TRADE, "pair_name": ""}) is None
    assert to_fill({**TRADE, "created_at": None}) is None
    assert to_fill({}) is None


def test_summary_values_holdings_and_cash() -> None:
    s = summarize(
        [
            {"symbol": "MYR", "name": "Ringgit", "available": "1000", "frozen": "0", "available_in_quote": "1000", "frozen_in_quote": "0", "is_fiat": True},
            {"symbol": "BTC", "name": "Bitcoin", "available": "0.01", "frozen": "0.002", "available_in_quote": "5000", "frozen_in_quote": "1000", "is_fiat": False},
            {"symbol": "ETH", "name": "Ether", "available": "0", "frozen": "0", "available_in_quote": "0", "frozen_in_quote": "0", "is_fiat": False},
        ],
        "MYR",
        NOW,
    )
    acc = s["accounts"][0]
    assert acc["cash"] == 1000 and acc["market_value"] == 6000 and acc["total_assets"] == 7000 and acc["currency"] == "MYR"
    assert [p["symbol"] for p in s["positions"]] == ["BTC"]  # the empty ETH line is dropped
    btc = s["positions"][0]
    assert btc["qty"] == pytest.approx(0.012) and btc["market_value"] == 6000 and btc["price"] == pytest.approx(500000)
    assert btc["pl"] is None and btc["cost_price"] is None  # no cost basis from Hata: unknown, not zero


def test_summary_of_nothing() -> None:
    s = summarize([], "MYR", NOW)
    assert s["positions"] == [] and s["accounts"][0]["total_assets"] is None

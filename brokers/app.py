"""
Local broker service for the dashboard.  GET-only and read-only.

    cd brokers && .venv/bin/uvicorn app:app --host 127.0.0.1 --port 8200

Settings come from the environment (or brokers/.env, which is gitignored):

    MOOMOO_HOST           OpenD host                 default 127.0.0.1
    MOOMOO_PORT           OpenD port                 default 11111
    MOOMOO_ENV            REAL or SIMULATE           default REAL
    MOOMOO_SECURITY_FIRM  FUTUMY for moomoo Malaysia default FUTUMY
    HATA_API_KEY          Hata API key (app.hata.io → Security → API Keys)
    HATA_API_SECRET       its secret
    HATA_BASE_URL         default https://my-api.hata.io (Malaysia platform)
    HATA_QUOTE            currency Hata values holdings in; default MYR
    LUCID_*               see lucid_adapter.py; Lucid is off unless LUCID_ENABLED=1

No credentials live in the code: you log in to OpenD itself, and Hata's key
and secret are read from brokers/.env (gitignored), never logged or returned.  Bound to 127.0.0.1 so nothing off this machine can ask.
"""

from __future__ import annotations

import os
import threading
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException

from hata_adapter import HataClient, HataError
from hata_adapter import fetch_fills as hata_fills
from hata_adapter import fetch_summary as hata_summary
from lucid_adapter import LucidError, LucidFeed
from moomoo_adapter import MoomooError, fetch_fills, fetch_summary


def _load_dotenv(path: Path) -> None:
    """Minimal KEY=VALUE reader; real environment variables win."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


_load_dotenv(Path(__file__).with_name(".env"))

MOOMOO_HOST = os.environ.get("MOOMOO_HOST", "127.0.0.1")
MOOMOO_PORT = int(os.environ.get("MOOMOO_PORT", "11111"))
MOOMOO_ENV = os.environ.get("MOOMOO_ENV", "REAL").upper()
MOOMOO_FIRM = os.environ.get("MOOMOO_SECURITY_FIRM", "FUTUMY")
HATA_BASE_URL = os.environ.get("HATA_BASE_URL", "https://my-api.hata.io")
HATA_QUOTE = os.environ.get("HATA_QUOTE", "MYR").upper()

# moomoo allows 10 account queries per 30 s; the widget polls every 15 s,
# and several open tabs must not multiply that.
_CACHE_SECONDS = 10.0
_cache: dict[str, tuple[float, Any]] = {}  # summary and fills, keyed by view
_lock = threading.Lock()

app = FastAPI(title="broker service", docs_url=None, redoc_url=None)

# Lucid holds one Rithmic connection open for the life of the service; it
# stays idle (and says why) unless LUCID_ENABLED=1.
_lucid = LucidFeed()
_lucid.start()


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "brokers": ["moomoo", "hata", "lucid"],
        "moomoo": f"{MOOMOO_HOST}:{MOOMOO_PORT} {MOOMOO_ENV}",
        "hata": f"{HATA_BASE_URL} key {'set' if os.environ.get('HATA_API_KEY') else 'missing'}",
    }


def _hata() -> HataClient:
    # Read each time, so adding the key to .env and restarting is all it takes.
    return HataClient(HATA_BASE_URL, os.environ.get("HATA_API_KEY", ""), os.environ.get("HATA_API_SECRET", ""))


@app.get("/hata/summary")
def hata_summary_view() -> dict[str, object]:
    with _lock:
        hit = _cache.get("hata")
        if hit and time.monotonic() - hit[0] < _CACHE_SECONDS:
            return dict(hit[1])
        try:
            summary = hata_summary(_hata(), HATA_QUOTE)
        except HataError as exc:
            raise HTTPException(503, str(exc)) from None
        _cache["hata"] = (time.monotonic(), summary)
        return dict(summary)


@app.get("/hata/fills")
def hata_fills_view() -> dict[str, object]:
    with _lock:
        hit = _cache.get("hata-fills")
        if hit and time.monotonic() - hit[0] < _FILLS_SECONDS:
            return dict(hit[1])
        try:
            report = hata_fills(_hata())
        except HataError as exc:
            raise HTTPException(503, str(exc)) from None
        _cache["hata-fills"] = (time.monotonic(), report)
        return dict(report)


@app.get("/lucid/summary")
def lucid_summary() -> dict[str, object]:
    try:
        return dict(_lucid.latest())
    except LucidError as exc:
        raise HTTPException(503, str(exc)) from None


# Trade history changes only when you trade; moomoo allows 10 history queries
# per 30 s, and a two-year look-back costs two per account.
_FILLS_SECONDS = 60.0


@app.get("/moomoo/fills")
def moomoo_fills() -> dict[str, object]:
    with _lock:
        hit = _cache.get("moomoo-fills")
        if hit and time.monotonic() - hit[0] < _FILLS_SECONDS:
            return dict(hit[1])
        try:
            report = fetch_fills(MOOMOO_HOST, MOOMOO_PORT, MOOMOO_ENV, MOOMOO_FIRM)
        except MoomooError as exc:
            raise HTTPException(503, f"{exc}. Open moomoo OpenD and log in, then retry.") from None
        _cache["moomoo-fills"] = (time.monotonic(), report)
        return dict(report)


@app.get("/moomoo/summary")
def moomoo_summary() -> dict[str, object]:
    with _lock:
        hit = _cache.get("moomoo")
        if hit and time.monotonic() - hit[0] < _CACHE_SECONDS:
            return dict(hit[1])
        try:
            summary = fetch_summary(MOOMOO_HOST, MOOMOO_PORT, MOOMOO_ENV, MOOMOO_FIRM)
        except MoomooError as exc:
            raise HTTPException(503, f"{exc}. Open moomoo OpenD and log in, then retry.") from None
        _cache["moomoo"] = (time.monotonic(), summary)
        return dict(summary)

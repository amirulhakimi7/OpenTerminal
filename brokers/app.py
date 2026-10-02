"""
Local broker service for the dashboard.  GET-only and read-only.

    cd brokers && .venv/bin/uvicorn app:app --host 127.0.0.1 --port 8200

Settings come from the environment (or brokers/.env, which is gitignored):

    MOOMOO_HOST           OpenD host                 default 127.0.0.1
    MOOMOO_PORT           OpenD port                 default 11111
    MOOMOO_ENV            REAL or SIMULATE           default REAL
    MOOMOO_SECURITY_FIRM  FUTUMY for moomoo Malaysia default FUTUMY
    LUCID_*               see lucid_adapter.py; Lucid is off unless LUCID_ENABLED=1

No credentials live here: you log in to OpenD itself, and this service only
asks OpenD questions.  Bound to 127.0.0.1 so nothing off this machine can ask.
"""

from __future__ import annotations

import os
import threading
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException

from lucid_adapter import LucidError, LucidFeed
from moomoo_adapter import MoomooError, fetch_summary
from schema import BrokerSummary


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

# moomoo allows 10 account queries per 30 s; the widget polls every 15 s,
# and several open tabs must not multiply that.
_CACHE_SECONDS = 10.0
_cache: dict[str, tuple[float, BrokerSummary]] = {}
_lock = threading.Lock()

app = FastAPI(title="broker service", docs_url=None, redoc_url=None)

# Lucid holds one Rithmic connection open for the life of the service; it
# stays idle (and says why) unless LUCID_ENABLED=1.
_lucid = LucidFeed()
_lucid.start()


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "brokers": ["moomoo", "lucid"], "moomoo": f"{MOOMOO_HOST}:{MOOMOO_PORT} {MOOMOO_ENV}"}


@app.get("/lucid/summary")
def lucid_summary() -> dict[str, object]:
    try:
        return dict(_lucid.latest())
    except LucidError as exc:
        raise HTTPException(503, str(exc)) from None


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

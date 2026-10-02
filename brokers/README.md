# Broker service (read-only)

Feeds the dashboard's **Broker Accounts** widget with balances and open
positions. GET routes only; it cannot place, change or cancel an order.
`test_moomoo_adapter.py::test_read_only` fails if an order call is ever added.

## moomoo (stocks)

1. Download **moomoo OpenD** from <https://www.moomoo.com/download/OpenAPI> and
   log in with your moomoo account **inside OpenD**. Credentials stay in OpenD;
   this service never sees them.
2. Leave OpenD on its default port `11111`.
3. Optional settings in `brokers/.env` (gitignored):

   ```
   MOOMOO_ENV=REAL            # or SIMULATE for paper trading
   MOOMOO_SECURITY_FIRM=FUTUMY
   MOOMOO_PORT=11111
   ```

4. Start the service:

   ```
   python3.11 -m venv .venv && .venv/bin/pip install -r requirements.txt
   .venv/bin/uvicorn app:app --host 127.0.0.1 --port 8200
   ```

The service never calls `unlock_trade`, and moomoo's docs list no unlock
step for the account and position queries it uses, so it shouldn't need your
trade password. If OpenD ever asks for one on this service's behalf, stop and
check why before entering it.

## Hata (crypto), Lucid (futures)

Not connected yet. Each will be a new `<broker>_adapter.py` returning the same
`BrokerSummary` shape from `schema.py`.

## Tests

```
.venv/bin/python -m pytest -q
.venv/bin/mypy --strict --ignore-missing-imports schema.py moomoo_adapter.py app.py
```

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

## Lucid (futures, via Rithmic)

Built, **off by default**. Lucid has no API of its own and Tradesea has no
public API, so this reads the account straight from Rithmic, the feed behind
Tradesea for Lucid accounts. It opens the **PnL plant only**, never the order
plant, and holds one connection open instead of logging in per request.

Before setting `LUCID_ENABLED=1`, all three must be true:

1. **Lucid** confirms API access is enabled on your Rithmic user ID, and what
   it costs.
2. **Lucid or Rithmic** confirms a PnL-plant connection will **not** log your
   Tradesea session out. Rithmic can drop an existing session when the same
   user logs in again; losing Tradesea with a position open is the failure to
   avoid.
3. **Rithmic** has passed this app through conformance (rapi@rithmic.com) and
   given you the production gateway and approved app name.

Then fill `brokers/.env` yourself (never paste credentials into a chat):

```
LUCID_ENABLED=1
LUCID_USER=
LUCID_PASSWORD=
LUCID_SYSTEM=
LUCID_GATEWAY=
LUCID_APP_NAME=
LUCID_ACCOUNT_ID=
```

The first time, enable it while **flat** and with Tradesea open, and watch
Tradesea for a disconnect.

## Hata (crypto)

Not connected yet: Hata's API docs are only available from support@hata.io.

## Tests

```
.venv/bin/python -m pytest -q
.venv/bin/mypy --strict --ignore-missing-imports schema.py moomoo_adapter.py app.py
```

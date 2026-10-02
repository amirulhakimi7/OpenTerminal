import { Router } from "express";

// Read-only relay to the Python CL/MCL signal service (repo: Trading, src/api/app.py).
// The browser never talks to that service directly; it stays bound to localhost.
// Nothing here can place an order: the dashboard displays signals and risk, it never trades.
const SIGNALS_URL = process.env.SIGNALS_URL ?? "http://127.0.0.1:8100";

// The first request after a CSV change rebuilds every setup, which takes a while.
const TIMEOUT_MS = 60_000;

export const signalsRouter = Router();

signalsRouter.get("/", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 200);
  try {
    const upstream = await fetch(`${SIGNALS_URL}/signals?limit=${limit}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: body.detail ?? `signal service HTTP ${upstream.status}` });
    }
    res.json(body);
  } catch {
    res.status(503).json({ error: `signal service unreachable at ${SIGNALS_URL}` });
  }
});

// CME session phase from the signal service's calendar, which is authoritative:
// it knows the maintenance break, the Friday close and exchange holidays.
signalsRouter.get("/session", async (_req, res) => {
  try {
    const upstream = await fetch(`${SIGNALS_URL}/session`, { signal: AbortSignal.timeout(5_000) });
    if (!upstream.ok) return res.status(upstream.status).json({ error: `signal service HTTP ${upstream.status}` });
    res.json(await upstream.json());
  } catch {
    res.status(503).json({ error: `signal service unreachable at ${SIGNALS_URL}` });
  }
});

// LucidFlex risk snapshot. A POST only because the account figures belong in a
// body, not a URL; it computes, it changes nothing.
signalsRouter.post("/risk", async (req, res) => {
  const { balance, peak_closing_balance, session_realized_pnl } = req.body ?? {};
  try {
    const upstream = await fetch(`${SIGNALS_URL}/risk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ balance, peak_closing_balance, session_realized_pnl }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const detail = Array.isArray(body.detail) ? "invalid account figures" : body.detail;
      return res.status(upstream.status).json({ error: detail ?? `signal service HTTP ${upstream.status}` });
    }
    res.json(body);
  } catch {
    res.status(503).json({ error: `signal service unreachable at ${SIGNALS_URL}` });
  }
});

import { Router } from "express";

// Read-only relay to the local broker service (brokers/app.py). It exposes
// GET routes only: balances and positions in, never orders out.
const BROKERS_URL = process.env.BROKERS_URL ?? "http://127.0.0.1:8200";

export const brokersRouter = Router();

brokersRouter.get("/:broker/:view", async (req, res) => {
  const { broker, view } = req.params;
  if (!/^[a-z]+$/.test(broker) || !/^[a-z]+$/.test(view)) {
    return res.status(400).json({ error: "bad path" });
  }
  try {
    const upstream = await fetch(`${BROKERS_URL}/${broker}/${view}`, { signal: AbortSignal.timeout(15_000) });
    const body = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: body.detail ?? `broker service HTTP ${upstream.status}` });
    }
    res.json(body);
  } catch {
    res.status(503).json({ error: `broker service unreachable at ${BROKERS_URL}` });
  }
});

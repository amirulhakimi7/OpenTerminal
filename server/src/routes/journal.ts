import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { multiplierFor, summarize, tradePnl, type Side } from "../journal.js";

// A record of trades the trader placed themselves. Nothing here sends an order.
export const journalRouter = Router();

type Row = {
  id: number;
  session_date: string;
  symbol: string;
  side: Side;
  quantity: number;
  entry: number;
  exit: number;
  multiplier: number;
  fees: number;
  notes: string;
  created_at: string;
};

const withPnl = (r: Row) => ({ ...r, pnl: tradePnl(r) });

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

const tradeSchema = z.object({
  session_date: dateSchema,
  symbol: z.string().min(1).max(16).transform((s) => s.toUpperCase()),
  side: z.enum(["LONG", "SHORT"]),
  quantity: z.number().positive(),
  entry: z.number().nonnegative(),
  exit: z.number().nonnegative(),
  multiplier: z.number().positive().optional(),
  fees: z.number().nonnegative().default(0),
  notes: z.string().max(500).default(""),
});

journalRouter.get("/", (req, res) => {
  const day = dateSchema.safeParse(req.query.session_date);
  const rows = (
    day.success
      ? db.prepare("SELECT * FROM journal_trades WHERE session_date = ? ORDER BY id DESC").all(day.data)
      : db.prepare("SELECT * FROM journal_trades ORDER BY session_date DESC, id DESC LIMIT 200").all()
  ) as Row[];
  res.json(rows.map(withPnl));
});

journalRouter.get("/summary", (req, res) => {
  const day = dateSchema.safeParse(req.query.session_date);
  if (!day.success) return res.status(400).json({ error: "session_date=YYYY-MM-DD required" });
  const rows = db.prepare("SELECT * FROM journal_trades WHERE session_date = ?").all(day.data) as Row[];
  res.json({ session_date: day.data, ...summarize(rows.map(tradePnl)) });
});

journalRouter.post("/", (req, res) => {
  const parsed = tradeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid trade" });
  const t = parsed.data;
  const multiplier = multiplierFor(t.symbol, t.multiplier);
  const info = db
    .prepare(
      `INSERT INTO journal_trades (session_date, symbol, side, quantity, entry, exit, multiplier, fees, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(t.session_date, t.symbol, t.side, t.quantity, t.entry, t.exit, multiplier, t.fees, t.notes);
  const row = db.prepare("SELECT * FROM journal_trades WHERE id = ?").get(info.lastInsertRowid) as Row;
  res.status(201).json(withPnl(row));
});

journalRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM journal_trades WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

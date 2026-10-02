// Trade-journal arithmetic. Pure: no db, no clock, so it is tested directly.

export type Side = "LONG" | "SHORT";

/** USD per 1.00 price move per contract, for the futures this journal knows. */
export const FUTURES_MULTIPLIERS: Record<string, number> = {
  CL: 1000,
  MCL: 100,
  ES: 50,
  MES: 5,
  NQ: 20,
  MNQ: 2,
  YM: 5,
  MYM: 0.5,
  RTY: 50,
  M2K: 5,
  GC: 100,
  MGC: 10,
};

/**
 * Multiplier for a symbol: the futures table for a known root, else 1
 * (stocks and crypto, where quantity is shares or coins). An explicit value
 * from the caller always wins.
 */
export function multiplierFor(symbol: string, explicit?: number): number {
  if (explicit !== undefined && explicit > 0) return explicit;
  return FUTURES_MULTIPLIERS[symbol.toUpperCase()] ?? 1;
}

/** Net P&L of one closed trade, fees included. */
export function tradePnl(t: {
  side: Side;
  quantity: number;
  entry: number;
  exit: number;
  multiplier: number;
  fees: number;
}): number {
  const sign = t.side === "LONG" ? 1 : -1;
  const gross = (t.exit - t.entry) * sign * t.quantity * t.multiplier;
  // Rounded to cents so float noise never shows up as a phantom loss.
  return Math.round((gross - t.fees) * 100) / 100;
}

export type Summary = { trades: number; wins: number; losses: number; pnl: number };

export function summarize(pnls: number[]): Summary {
  return {
    trades: pnls.length,
    wins: pnls.filter((p) => p > 0).length,
    losses: pnls.filter((p) => p < 0).length,
    pnl: Math.round(pnls.reduce((a, b) => a + b, 0) * 100) / 100,
  };
}

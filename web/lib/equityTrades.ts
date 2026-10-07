// moomoo executions -> round-trip trades, first in first out. Pure.
//
// Each account and symbol keeps a queue of open lots. A fill on the opposite
// side closes lots oldest first; one closing fill makes one closed trade, its
// entry the weighted average of the lots it closed. Fees come per fill (the
// broker service spreads each order's fee over its fills) and are carried
// per share, so a partly closed lot takes the right share of its buy fee.

export type Fill = {
  deal_id: string;
  order_id: string;
  acc_id: string;
  symbol: string;
  name: string;
  market: string;
  side: "BUY" | "SELL";
  short: boolean; // a short sale, or the buy that covers one
  qty: number;
  price: number;
  time: string; // exchange-local "YYYY-MM-DD HH:MM:SS"
  fee: number | null;
};

export type OptionInfo = { underlying: string; expiry: string; right: "C" | "P"; strike: number };

export type ClosedTrade = {
  key: string;
  accId: string;
  symbol: string;
  name: string;
  side: "LONG" | "SHORT";
  qty: number;
  entry: number; // average price per share / contract
  exit: number;
  entryTime: string; // the oldest lot's
  exitTime: string;
  multiplier: number; // 100 for US options
  gross: number;
  fees: number;
  feesKnown: boolean;
  net: number;
  pct: number; // gross return on the cost of the position
  holdDays: number;
  option: OptionInfo | null;
  expired: boolean; // an option with no closing fill, past its expiry: closed at 0
};

export type OpenLot = { accId: string; symbol: string; name: string; side: "LONG" | "SHORT"; qty: number; avgCost: number; since: string; multiplier: number; option: OptionInfo | null };

/** A sell of shares bought before the history starts: no cost to match it to. */
export type Unmatched = { accId: string; symbol: string; qty: number; price: number; time: string };

type Lot = { side: "LONG" | "SHORT"; qty: number; price: number; time: string; feePerUnit: number; feeKnown: boolean };

/**
 * An OCC-style option symbol (moomoo writes "SERV250606C6000"): underlying,
 * expiry YYMMDD, C or P, strike in thousandths. Null for a share.
 */
export function optionInfo(symbol: string): OptionInfo | null {
  const m = /^([A-Z.]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{1,8})$/.exec(symbol);
  if (!m) return null;
  return { underlying: m[1], expiry: `20${m[2]}-${m[3]}-${m[4]}`, right: m[5] as "C" | "P", strike: Number(m[6]) / 1000 };
}

/** "SERV 06/06/2025 C 6.00", or the ticker itself for a share. */
export function displaySymbol(symbol: string): string {
  const o = optionInfo(symbol);
  if (!o) return symbol;
  const [y, m, d] = o.expiry.split("-");
  return `${o.underlying} ${d}/${m}/${y} ${o.right} ${o.strike.toFixed(2)}`;
}

const days = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000));
const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;

/**
 * @param today  YYYY-MM-DD (exchange date). Option lots still open after their
 *               expiry have no closing fill (expiry isn't an execution), so
 *               they're closed at 0 as expired. Assumes worthless: one
 *               exercised in the money shows up as shares, not as a fill here.
 */
export function matchFifo(fills: Fill[], today = "9999-12-31"): { closed: ClosedTrade[]; open: OpenLot[]; unmatched: Unmatched[] } {
  const ordered = [...fills].sort((a, b) => (a.time === b.time ? a.deal_id.localeCompare(b.deal_id) : a.time.localeCompare(b.time)));
  const books = new Map<string, { name: string; lots: Lot[] }>();
  const closed: ClosedTrade[] = [];
  const unmatched: Unmatched[] = [];

  for (const f of ordered) {
    const id = `${f.acc_id}|${f.symbol}`;
    const book = books.get(id) ?? { name: f.name, lots: [] };
    books.set(id, book);
    const option = optionInfo(f.symbol);
    const multiplier = option ? 100 : 1;
    const feePerUnit = f.fee == null ? 0 : f.fee / f.qty;
    const opens: "LONG" | "SHORT" = f.side === "BUY" ? "LONG" : "SHORT";
    const closes = f.side === "BUY" ? "SHORT" : "LONG";

    let left = f.qty;
    let cost = 0;
    let lotFees = 0;
    let feeKnown = f.fee != null;
    let entryTime = "";
    let matched = 0;
    while (left > 1e-9 && book.lots.length && book.lots[0].side === closes) {
      const lot = book.lots[0];
      const q = Math.min(lot.qty, left);
      cost += q * lot.price;
      lotFees += q * lot.feePerUnit;
      feeKnown &&= lot.feeKnown;
      entryTime ||= lot.time;
      matched += q;
      lot.qty -= q;
      left -= q;
      if (lot.qty <= 1e-9) book.lots.shift();
    }

    if (matched > 0) {
      const entry = cost / matched;
      const gross = (closes === "LONG" ? f.price - entry : entry - f.price) * matched * multiplier;
      const fees = lotFees + feePerUnit * matched;
      closed.push({
        key: `${f.deal_id}|${f.acc_id}`,
        accId: f.acc_id,
        symbol: f.symbol,
        name: book.name,
        side: closes,
        qty: round(matched, 8),
        entry: round(entry),
        exit: f.price,
        entryTime,
        exitTime: f.time,
        multiplier,
        gross: round(gross, 2),
        fees: round(fees, 2),
        feesKnown: feeKnown,
        net: round(gross - fees, 2),
        pct: round((gross / (entry * matched * multiplier)) * 100, 2),
        holdDays: days(entryTime, f.time),
        option,
        expired: false,
      });
    }

    if (left > 1e-9) {
      // Nothing left to close. A buy opens (or adds to) a long; a sell opens a
      // short only when moomoo says it was one — otherwise it's selling shares
      // bought before the history starts, and there's no cost to match.
      if (f.side === "SELL" && !f.short) unmatched.push({ accId: f.acc_id, symbol: f.symbol, qty: round(left, 8), price: f.price, time: f.time });
      else book.lots.push({ side: opens, qty: left, price: f.price, time: f.time, feePerUnit, feeKnown: f.fee != null });
    }
  }

  const open: OpenLot[] = [];
  for (const [id, book] of books) {
    if (!book.lots.length) continue;
    const [accId, symbol] = id.split("|");
    const expiring = optionInfo(symbol);
    if (expiring && expiring.expiry < today) {
      for (const lot of book.lots) {
        const gross = (lot.side === "LONG" ? -lot.price : lot.price) * lot.qty * 100;
        const fees = lot.feePerUnit * lot.qty;
        const exitTime = `${expiring.expiry} 16:00:00`;
        closed.push({
          key: `expired|${accId}|${symbol}|${lot.time}`,
          accId,
          symbol,
          name: book.name,
          side: lot.side,
          qty: round(lot.qty, 8),
          entry: lot.price,
          exit: 0,
          entryTime: lot.time,
          exitTime,
          multiplier: 100,
          gross: round(gross, 2),
          fees: round(fees, 2),
          feesKnown: lot.feeKnown,
          net: round(gross - fees, 2),
          pct: lot.side === "LONG" ? -100 : 100,
          holdDays: days(lot.time, exitTime),
          option: expiring,
          expired: true,
        });
      }
      continue;
    }
    const qty = book.lots.reduce((n, l) => n + l.qty, 0);
    const option = optionInfo(symbol);
    open.push({
      accId,
      symbol,
      name: book.name,
      side: book.lots[0].side,
      qty: round(qty, 8),
      avgCost: round(book.lots.reduce((n, l) => n + l.qty * l.price, 0) / qty),
      since: book.lots[0].time,
      multiplier: option ? 100 : 1,
      option,
    });
  }
  closed.sort((a, b) => b.exitTime.localeCompare(a.exitTime)); // newest first
  return { closed, open, unmatched };
}

export type TradeStats = {
  count: number;
  wins: number;
  losses: number;
  winRate: number | null;
  net: number;
  gross: number;
  fees: number;
  avgWin: number | null;
  avgLoss: number | null;
  profitFactor: number | null; // gross wins over gross losses, net of fees
  best: ClosedTrade | null;
  worst: ClosedTrade | null;
};

export function tradeStats(trades: ClosedTrade[]): TradeStats {
  const wins = trades.filter((t) => t.net > 0);
  const losses = trades.filter((t) => t.net < 0);
  const sum = (xs: ClosedTrade[], k: "net" | "gross" | "fees") => round(xs.reduce((n, t) => n + t[k], 0), 2);
  const winSum = sum(wins, "net");
  const lossSum = -sum(losses, "net");
  const byNet = [...trades].sort((a, b) => b.net - a.net);
  return {
    count: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? round((wins.length / trades.length) * 100, 1) : null,
    net: sum(trades, "net"),
    gross: sum(trades, "gross"),
    fees: sum(trades, "fees"),
    avgWin: wins.length ? round(winSum / wins.length, 2) : null,
    avgLoss: losses.length ? round(-lossSum / losses.length, 2) : null,
    profitFactor: lossSum > 0 ? round(winSum / lossSum, 2) : null,
    best: byNet[0] ?? null,
    worst: byNet.length ? byNet[byNet.length - 1] : null,
  };
}

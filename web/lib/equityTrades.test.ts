import { describe, expect, it } from "vitest";
import { displaySymbol, matchFifo, optionInfo, tradeStats, type Fill } from "./equityTrades";

let n = 0;
const fill = (side: "BUY" | "SELL", qty: number, price: number, time: string, over: Partial<Fill> = {}): Fill => ({
  deal_id: String(++n).padStart(4, "0"),
  order_id: `O${n}`,
  acc_id: "3106",
  symbol: "NVDA",
  name: "NVIDIA",
  market: "US",
  side,
  short: false,
  qty,
  price,
  time,
  fee: 1,
  ...over,
});

describe("matchFifo", () => {
  it("closes a simple long with fees on both legs", () => {
    const { closed, open, unmatched } = matchFifo([fill("BUY", 2, 100, "2026-01-05 10:00:00"), fill("SELL", 2, 110, "2026-01-07 15:00:00")]);
    expect(open).toEqual([]);
    expect(unmatched).toEqual([]);
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({ side: "LONG", qty: 2, entry: 100, exit: 110, gross: 20, fees: 2, net: 18, pct: 10, holdDays: 2, feesKnown: true });
  });

  it("closes oldest lots first and averages the entry", () => {
    const { closed, open } = matchFifo([
      fill("BUY", 1, 100, "2026-01-05 10:00:00", { fee: 1 }),
      fill("BUY", 1, 120, "2026-01-06 10:00:00", { fee: 1 }),
      fill("SELL", 1, 130, "2026-01-07 10:00:00", { fee: 1 }), // closes the 100 lot
    ]);
    expect(closed[0]).toMatchObject({ qty: 1, entry: 100, gross: 30, fees: 2, net: 28, entryTime: "2026-01-05 10:00:00" });
    expect(open).toEqual([expect.objectContaining({ side: "LONG", qty: 1, avgCost: 120, since: "2026-01-06 10:00:00" })]);
  });

  it("splits a lot's fee when it is only partly sold", () => {
    const { closed, open } = matchFifo([fill("BUY", 4, 50, "2026-02-02 10:00:00", { fee: 4 }), fill("SELL", 1, 60, "2026-02-03 10:00:00", { fee: 1 })]);
    expect(closed[0]).toMatchObject({ qty: 1, gross: 10, fees: 2, net: 8 }); // 1 of the 4 buy fee + the sell fee
    expect(open[0].qty).toBe(3);
  });

  it("handles a real short and its cover", () => {
    const { closed } = matchFifo([
      fill("SELL", 3, 40, "2026-03-02 10:00:00", { short: true, fee: 0 }),
      fill("BUY", 3, 35, "2026-03-04 10:00:00", { short: true, fee: 0 }),
    ]);
    expect(closed[0]).toMatchObject({ side: "SHORT", gross: 15, net: 15 });
  });

  it("does not invent a short from selling shares bought before the history", () => {
    const { closed, open, unmatched } = matchFifo([fill("SELL", 2, 90, "2026-04-01 10:00:00")]);
    expect(closed).toEqual([]);
    expect(open).toEqual([]);
    expect(unmatched).toEqual([expect.objectContaining({ symbol: "NVDA", qty: 2, price: 90 })]);
  });

  it("multiplies options by 100", () => {
    const sym = "SERV250606C6000";
    const { closed } = matchFifo([fill("BUY", 2, 0.93, "2025-05-06 09:30:05", { symbol: sym, fee: 0 }), fill("SELL", 2, 1.43, "2025-05-08 10:00:00", { symbol: sym, fee: 0 })]);
    expect(closed[0]).toMatchObject({ multiplier: 100, gross: 100 });
    expect(closed[0].option).toEqual({ underlying: "SERV", expiry: "2025-06-06", right: "C", strike: 6 });
  });

  it("closes an option left open past expiry at zero", () => {
    const sym = "DJT250606C25500";
    const fills = [fill("BUY", 1, 1.2, "2025-05-20 10:00:00", { symbol: sym, fee: 0.5 })];
    const before = matchFifo(fills, "2025-06-01");
    expect(before.open).toHaveLength(1);
    expect(before.closed).toEqual([]);
    const after = matchFifo(fills, "2025-06-09");
    expect(after.open).toEqual([]);
    expect(after.closed[0]).toMatchObject({ expired: true, exit: 0, gross: -120, fees: 0.5, net: -120.5, pct: -100, exitTime: "2025-06-06 16:00:00" });
  });

  it("keeps accounts and symbols apart, and marks unknown fees", () => {
    const { closed, open } = matchFifo([
      fill("BUY", 1, 10, "2026-05-01 10:00:00", { acc_id: "A", fee: null }),
      fill("BUY", 1, 20, "2026-05-01 10:00:00", { acc_id: "B" }),
      fill("SELL", 1, 15, "2026-05-02 10:00:00", { acc_id: "A" }),
    ]);
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({ accId: "A", feesKnown: false });
    expect(open).toEqual([expect.objectContaining({ accId: "B" })]);
  });

  it("is empty for no fills", () => {
    expect(matchFifo([])).toEqual({ closed: [], open: [], unmatched: [] });
  });
});

describe("tradeStats", () => {
  it("sums wins, losses and the profit factor", () => {
    const { closed } = matchFifo([
      fill("BUY", 1, 100, "2026-01-01 10:00:00", { fee: 0 }),
      fill("SELL", 1, 130, "2026-01-02 10:00:00", { fee: 0 }),
      fill("BUY", 1, 100, "2026-01-03 10:00:00", { fee: 0 }),
      fill("SELL", 1, 90, "2026-01-04 10:00:00", { fee: 0 }),
    ]);
    const s = tradeStats(closed);
    expect(s).toMatchObject({ count: 2, wins: 1, losses: 1, winRate: 50, net: 20, avgWin: 30, avgLoss: -10, profitFactor: 3 });
    expect(s.best?.net).toBe(30);
    expect(s.worst?.net).toBe(-10);
  });

  it("has no rates without trades", () => {
    expect(tradeStats([])).toMatchObject({ count: 0, winRate: null, profitFactor: null, best: null });
  });
});

describe("option symbols", () => {
  it("reads moomoo's option codes and leaves shares alone", () => {
    expect(optionInfo("SMCI250606C33000")).toEqual({ underlying: "SMCI", expiry: "2025-06-06", right: "C", strike: 33 });
    expect(optionInfo("NVDA")).toBeNull();
    expect(displaySymbol("SERV250606P6500")).toBe("SERV 06/06/2025 P 6.50");
    expect(displaySymbol("AMD")).toBe("AMD");
  });
});

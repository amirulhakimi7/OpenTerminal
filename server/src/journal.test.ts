import { describe, expect, it } from "vitest";
import { multiplierFor, summarize, tradePnl } from "./journal.js";

describe("multiplierFor", () => {
  it("knows the micro crude contract", () => {
    expect(multiplierFor("mcl")).toBe(100);
  });
  it("falls back to 1 for stocks and crypto", () => {
    expect(multiplierFor("AAPL")).toBe(1);
    expect(multiplierFor("BTC")).toBe(1);
  });
  it("lets an explicit multiplier win", () => {
    expect(multiplierFor("MCL", 1000)).toBe(1000);
  });
});

describe("tradePnl", () => {
  it("prices a 10-lot MCL long at $10 per tick", () => {
    // +0.50 x 10 lots x $100/point = $500, less $10 fees
    expect(tradePnl({ side: "LONG", quantity: 10, entry: 89.0, exit: 89.5, multiplier: 100, fees: 10 })).toBe(490);
  });
  it("profits a short when price falls", () => {
    expect(tradePnl({ side: "SHORT", quantity: 1, entry: 5000, exit: 4990, multiplier: 5, fees: 0 })).toBe(50);
  });
  it("loses on a short when price rises, fees on top", () => {
    expect(tradePnl({ side: "SHORT", quantity: 2, entry: 100, exit: 101, multiplier: 1, fees: 1.5 })).toBe(-3.5);
  });
  it("rounds float noise to cents", () => {
    expect(tradePnl({ side: "LONG", quantity: 3, entry: 0.1, exit: 0.3, multiplier: 1, fees: 0 })).toBe(0.6);
  });
});

describe("summarize", () => {
  it("handles an empty day", () => {
    expect(summarize([])).toEqual({ trades: 0, wins: 0, losses: 0, pnl: 0 });
  });
  it("counts a scratch trade as neither win nor loss", () => {
    expect(summarize([100, -40, 0])).toEqual({ trades: 3, wins: 1, losses: 1, pnl: 60 });
  });
});

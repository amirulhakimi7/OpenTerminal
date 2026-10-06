import { describe, expect, it } from "vitest";
import { byMarketCap, etDate, parseEarningRow, signedMoney, tradingWeek } from "./earningsWeek.js";

describe("tradingWeek", () => {
  it("gives Monday to Friday of the current week", () => {
    // Wed 7 Oct 2026, 02:18 in Kuala Lumpur = Tue 6 Oct afternoon in New York.
    expect(tradingWeek(new Date("2026-10-06T18:18:00Z"))).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
  });
  it("uses the New York date, not UTC", () => {
    // 01:00 UTC Monday is still Sunday evening in New York: that week starts tomorrow.
    expect(etDate(new Date("2026-10-05T01:00:00Z"))).toBe("2026-10-04");
    expect(tradingWeek(new Date("2026-10-05T01:00:00Z"))[0]).toBe("2026-10-05");
  });
  it("looks ahead to next week at the weekend", () => {
    expect(tradingWeek(new Date("2026-10-10T16:00:00Z"))[0]).toBe("2026-10-12"); // Saturday
    expect(tradingWeek(new Date("2026-10-11T16:00:00Z"))[0]).toBe("2026-10-12"); // Sunday
  });
  it("stays in the week on Monday and Friday", () => {
    expect(tradingWeek(new Date("2026-10-05T16:00:00Z"))[0]).toBe("2026-10-05");
    expect(tradingWeek(new Date("2026-10-09T16:00:00Z"))[4]).toBe("2026-10-09");
  });
});

describe("signedMoney", () => {
  it("reads dollars, commas and bracketed negatives", () => {
    expect(signedMoney("$7,800,921,100")).toBe(7_800_921_100);
    expect(signedMoney("$0.36")).toBe(0.36);
    expect(signedMoney("($0.11)")).toBe(-0.11);
  });
  it("gives null for blanks and junk", () => {
    expect(signedMoney("")).toBeNull();
    expect(signedMoney("N/A")).toBeNull();
    expect(signedMoney("$")).toBeNull();
    expect(signedMoney(undefined)).toBeNull();
  });
});

describe("parseEarningRow", () => {
  it("parses a Nasdaq row", () => {
    expect(
      parseEarningRow({
        symbol: "levi", name: "Levi Strauss & Co.", time: "time-after-hours", marketCap: "$7,800,921,100",
        fiscalQuarterEnding: "Aug/2026", epsForecast: "$0.36", lastYearEPS: "($0.11)", noOfEsts: "6",
      })
    ).toEqual({
      symbol: "LEVI", name: "Levi Strauss & Co.", time: "after", epsForecast: 0.36, lastYearEps: -0.11,
      marketCap: 7_800_921_100, fiscalQuarter: "Aug/2026", estimates: 6,
    });
  });
  it("marks a missing time as unknown and a missing count as null", () => {
    const r = parseEarningRow({ symbol: "X", time: "time-not-supplied", noOfEsts: "" })!;
    expect(r.time).toBe("unknown");
    expect(r.estimates).toBeNull();
    expect(r.epsForecast).toBeNull();
  });
  it("skips rows with no symbol", () => {
    expect(parseEarningRow({ name: "nothing" })).toBeNull();
  });
});

describe("byMarketCap", () => {
  it("puts the biggest first and unknowns last", () => {
    const row = (symbol: string, marketCap: number | null) => ({ ...parseEarningRow({ symbol })!, marketCap });
    expect(byMarketCap([row("A", 1), row("B", null), row("C", 50)]).map((r) => r.symbol)).toEqual(["C", "A", "B"]);
  });
});

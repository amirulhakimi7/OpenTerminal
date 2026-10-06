// This week's US earnings: which days to ask for, and how to read Nasdaq's
// calendar rows. Pure: no fetching, the clock comes in as `now`.

export type ReportTime = "pre" | "after" | "unknown";

export type WeekEarning = {
  symbol: string;
  name: string;
  time: ReportTime; // before the open, after the close, or not given
  epsForecast: number | null;
  lastYearEps: number | null;
  marketCap: number | null;
  fiscalQuarter: string | null; // e.g. "Aug/2026"
  estimates: number | null; // analysts in the consensus
};

export type EarningsDay = { date: string; rows: WeekEarning[] }; // date: YYYY-MM-DD (ET)

const ET = "America/New_York";

/** YYYY-MM-DD for `d` as a calendar date in New York. */
export function etDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Monday to Friday of the trading week `now` falls in, as ET dates. On a
 * Saturday or Sunday that is the coming week: last week's reports are done.
 */
export function tradingWeek(now: Date): string[] {
  const [y, m, d] = etDate(now).split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  const dow = day.getUTCDay(); // 0 Sun … 6 Sat
  const toMonday = dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow;
  return Array.from({ length: 5 }, (_, i) => {
    const t = new Date(day);
    t.setUTCDate(day.getUTCDate() + toMonday + i);
    return t.toISOString().slice(0, 10);
  });
}

/** "$1,234.5" → 1234.5, "($0.11)" → -0.11, "" / "N/A" → null. */
export function signedMoney(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  const neg = /^\(.*\)$/.test(t) || t.startsWith("-");
  const n = Number(t.replace(/[()$,\s-]/g, ""));
  if (!isFinite(n) || t.replace(/[()$,\s-]/g, "") === "") return null;
  return neg ? -n : n;
}

const TIMES: Record<string, ReportTime> = { "time-pre-market": "pre", "time-after-hours": "after" };

/** One row of Nasdaq's earnings calendar; null when it has no symbol. */
export function parseEarningRow(r: Record<string, unknown>): WeekEarning | null {
  const symbol = String(r.symbol ?? "").trim().toUpperCase();
  if (!symbol) return null;
  const est = Number(r.noOfEsts);
  return {
    symbol,
    name: String(r.name ?? "").trim(),
    time: TIMES[String(r.time ?? "")] ?? "unknown",
    epsForecast: signedMoney(r.epsForecast),
    lastYearEps: signedMoney(r.lastYearEPS),
    marketCap: signedMoney(r.marketCap),
    fiscalQuarter: r.fiscalQuarterEnding ? String(r.fiscalQuarterEnding) : null,
    estimates: isFinite(est) && String(r.noOfEsts ?? "").trim() !== "" ? est : null,
  };
}

/** Biggest companies first; unknown market caps last. */
export function byMarketCap(rows: WeekEarning[]): WeekEarning[] {
  return [...rows].sort((a, b) => (b.marketCap ?? -1) - (a.marketCap ?? -1));
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { apiGet, fmt, pctClass } from "../../lib/api";
import { useTerminal } from "../../store/terminal";

type EconEvent = {
  title: string;
  country: string;
  date: string;
  impact: "Low" | "Medium" | "High" | "Holiday";
  forecast: string | null;
  previous: string | null;
  actual: string | null;
};

type EarningsEntry = {
  symbol: string;
  nextEarningsDate: number | null;
  lastEarningsDate: number | null;
  epsForecast: number | null;
};

const IMPACT_CLASS: Record<EconEvent["impact"], string> = {
  High: "down",
  Medium: "amber",
  Low: "dim",
  Holiday: "dim",
};

const TIMEZONES: Array<{ label: string; zone: string | undefined }> = [
  { label: "Local", zone: undefined },
  { label: "UTC", zone: "UTC" },
  { label: "New York", zone: "America/New_York" },
  { label: "Chicago", zone: "America/Chicago" },
  { label: "London", zone: "Europe/London" },
  { label: "Frankfurt", zone: "Europe/Berlin" },
  { label: "Tokyo", zone: "Asia/Tokyo" },
  { label: "Sydney", zone: "Australia/Sydney" },
];

function EconomicTab() {
  const [minImpact, setMinImpact] = useState<"all" | "medium">("medium");
  const [tz, setTz] = useState<string>("Local");

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["econ-calendar"],
    queryFn: () => apiGet<EconEvent[]>("/api/econ-calendar"),
    refetchInterval: 300_000,
  });

  const events = useMemo(
    () => (minImpact === "all" ? data : data.filter((e) => e.impact === "High" || e.impact === "Medium")),
    [data, minImpact]
  );

  if (error) return <div className="p-2 down">Error: {(error as Error).message}</div>;
  if (isLoading) return <div className="p-2 dim">Loading calendar…</div>;

  const zone = TIMEZONES.find((t) => t.label === tz)?.zone;

  return (
    <div>
      <div className="flex gap-1 p-1 items-center flex-wrap">
        <button className={`term-btn ${minImpact === "medium" ? "active" : ""}`} onClick={() => setMinImpact("medium")}>
          HIGH+MED
        </button>
        <button className={`term-btn ${minImpact === "all" ? "active" : ""}`} onClick={() => setMinImpact("all")}>
          ALL
        </button>
        <span className="w-2" />
        <select
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          className="term-btn !py-0.5 bg-[var(--panel)] cursor-pointer"
        >
          {TIMEZONES.map((t) => (
            <option key={t.label} value={t.label}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Ccy</th>
            <th>Event</th>
            <th>Forecast</th>
            <th>Previous</th>
            <th>Actual</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e, i) => (
            <tr key={`${e.title}-${e.date}-${i}`}>
              <td className="!text-left dim whitespace-nowrap">
                {new Date(e.date).toLocaleString("en-GB", {
                  timeZone: zone,
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZoneName: "short",
                })}
              </td>
              <td>{e.country}</td>
              <td className={`!text-left ${IMPACT_CLASS[e.impact]}`}>{e.title}</td>
              <td>{e.forecast ?? "—"}</td>
              <td className="dim">{e.previous ?? "—"}</td>
              <td className={e.actual ? "text-[var(--text)]" : "dim"}>{e.actual ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {events.length === 0 && <div className="p-3 dim">No events in this window.</div>}
    </div>
  );
}

/**
 * dd/mm/yyyy. History rows are plain dates stored as UTC midnight, so they're
 * read in UTC; upcoming reports carry their real time (e.g. 16:00 ET after the
 * close), so they're read in New York: the US trading day they land on.
 */
const fmtDate = (ts: number | null, zone: "UTC" | "America/New_York" = "UTC") =>
  ts ? new Date(ts * 1000).toLocaleDateString("en-GB", { timeZone: zone, day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

type EarningsHistoryRow = {
  fiscalQtrEnd: string;
  dateReported: number;
  eps: number | null;
  consensusForecast: number | null;
  surprisePercent: number | null;
  dayAfterChangePercent: number | null;
};

/** Actual vs forecast: beat = green, miss = red, in-line = white. */
function surpriseClass(row: EarningsHistoryRow): string {
  if (row.eps === null || row.consensusForecast === null) return "dim";
  if (row.eps > row.consensusForecast) return "up";
  if (row.eps < row.consensusForecast) return "down";
  return "text-[var(--text)]";
}

function EarningsHistoryRows({ symbol }: { symbol: string }) {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["earnings-history", symbol],
    queryFn: () => apiGet<EarningsHistoryRow[]>(`/api/earnings-history/${symbol}`),
    staleTime: 3_600_000,
  });

  if (error) return <div className="p-2 down">Error: {(error as Error).message}</div>;
  if (isLoading) return <div className="p-2 dim">Loading history for {symbol}…</div>;
  if (data.length === 0) return <div className="p-2 dim">No earnings history for {symbol}.</div>;

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Quarter</th>
          <th>Reported</th>
          <th>Forecast</th>
          <th>Actual</th>
          <th>Surprise</th>
          <th>Day After</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row) => (
          <tr key={row.dateReported}>
            <td className="!text-left dim">{row.fiscalQtrEnd}</td>
            <td className="!text-left dim">{fmtDate(row.dateReported)}</td>
            <td className="dim">{row.consensusForecast != null ? `$${row.consensusForecast.toFixed(2)}` : "—"}</td>
            <td className={surpriseClass(row)}>{row.eps != null ? `$${row.eps.toFixed(2)}` : "—"}</td>
            <td className={surpriseClass(row)}>{row.surprisePercent != null ? `${fmt(row.surprisePercent, 1)}%` : "—"}</td>
            <td className={pctClass(row.dayAfterChangePercent)}>
              {row.dayAfterChangePercent != null ? `${fmt(row.dayAfterChangePercent, 1)}%` : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EarningsTab() {
  const watchlist = useTerminal((s) => s.watchlist);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["calendar", watchlist],
    queryFn: () => apiGet<EarningsEntry[]>(`/api/calendar?symbols=${watchlist.join(",")}`),
    enabled: watchlist.length > 0,
    staleTime: 3_600_000,
  });

  const sorted = useMemo(
    () =>
      [...data].sort((a, b) => {
        if (a.nextEarningsDate === null && b.nextEarningsDate === null) return 0;
        if (a.nextEarningsDate === null) return 1;
        if (b.nextEarningsDate === null) return -1;
        return a.nextEarningsDate - b.nextEarningsDate;
      }),
    [data]
  );

  if (error) return <div className="p-2 down">Error: {(error as Error).message}</div>;
  if (isLoading) return <div className="p-2 dim">Loading earnings…</div>;

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Sym</th>
          <th>Last Earnings</th>
          <th>Next Earnings</th>
          <th>EPS Est.</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((e) => (
          <Fragment key={e.symbol}>
            <tr
              onClick={() => setExpanded(expanded === e.symbol ? null : e.symbol)}
              className="cursor-pointer"
              title="Click for earnings history"
            >
              <td className="!text-left text-[var(--text)] font-bold underline decoration-1">{e.symbol}</td>
              <td className="dim">{fmtDate(e.lastEarningsDate, "America/New_York")}</td>
              <td className="amber">{fmtDate(e.nextEarningsDate, "America/New_York")}</td>
              <td>{e.epsForecast != null ? `$${e.epsForecast.toFixed(2)}` : "—"}</td>
            </tr>
            {expanded === e.symbol && (
              <tr>
                <td colSpan={4} className="!text-left p-0">
                  <EarningsHistoryRows symbol={e.symbol} />
                </td>
              </tr>
            )}
          </Fragment>
        ))}
        {sorted.length === 0 && (
          <tr>
            <td colSpan={4} className="dim p-3">
              No upcoming earnings data for your watchlist.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

type ReportTime = "pre" | "after" | "unknown";
type WeekEarning = {
  symbol: string;
  name: string;
  time: ReportTime;
  epsForecast: number | null;
  lastYearEps: number | null;
  marketCap: number | null;
  fiscalQuarter: string | null;
  estimates: number | null;
};
type EarningsDay = { date: string; rows: WeekEarning[] };

const TIME_LABEL: Record<ReportTime, { text: string; title: string }> = {
  pre: { text: "☀ Pre", title: "Before the US open" },
  after: { text: "☾ After", title: "After the US close" },
  unknown: { text: "—", title: "Time not given" },
};

const CAP_FILTERS = [
  { label: "≥ $10B", min: 10e9 },
  { label: "≥ $1B", min: 1e9 },
  { label: "ANY SIZE", min: 0 },
] as const;

const WEEK = "week"; // the day selector's "ALL": Monday to Friday together

const usd = (n: number | null) => (n == null ? "—" : `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`);
const cap = (n: number | null) =>
  n == null ? "—" : n >= 1e12 ? `$${(n / 1e12).toFixed(2)}T` : n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : `$${(n / 1e6).toFixed(0)}M`;

/** "2026-10-07" → "Wed 07/10/2026" (a calendar date: no time zone shift). */
function dayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short" });
  return { weekday, dmy: `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}` };
}

/** Today's date in New York, where the reports are scheduled. */
const todayET = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

function ThisWeekTab() {
  const watchlist = useTerminal((s) => s.watchlist);
  const [minCap, setMinCap] = useState<number>(1e9);
  const [day, setDay] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["earnings-week"],
    queryFn: () => apiGet<EarningsDay[]>("/api/earnings-week"),
    staleTime: 1_800_000,
  });

  const today = todayET();
  // Default to today, or the first day of the week shown (the weekend shows next week).
  const shown = day ?? (data.some((d) => d.date === today) ? today : data[0]?.date ?? null);
  const watched = new Set(watchlist);
  // Your watchlist names always show, whatever their size.
  const keep = (r: WeekEarning) => watched.has(r.symbol) || (r.marketCap ?? 0) >= minCap;
  // One group per day shown: a single day, or the whole week for ALL.
  const groups = useMemo(
    () => (shown === WEEK ? data : data.filter((d) => d.date === shown)).map((d) => ({ date: d.date, rows: d.rows.filter(keep) })),
    [data, shown, minCap, watchlist] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  if (error) return <div className="p-2 down">Error: {(error as Error).message}</div>;
  if (isLoading) return <div className="p-2 dim">Loading this week's earnings…</div>;

  return (
    <div>
      <div className="flex gap-1 p-1 items-center flex-wrap">
        <button
          className={`term-btn ${shown === WEEK ? "active" : ""}`}
          onClick={() => {
            setDay(WEEK);
            setExpanded(null);
          }}
          title="Every report from Monday to Friday"
        >
          ALL <span className="dim ml-1">{data.reduce((n, d) => n + d.rows.filter(keep).length, 0)}</span>
        </button>
        {data.map((d) => {
          const { weekday, dmy } = dayLabel(d.date);
          const n = d.rows.filter(keep).length;
          return (
            <button
              key={d.date}
              className={`term-btn ${shown === d.date ? "active" : ""}`}
              onClick={() => {
                setDay(d.date);
                setExpanded(null);
              }}
              title={`${n} report${n === 1 ? "" : "s"} at this size`}
            >
              {weekday} {dmy.slice(0, 5)}
              {d.date === today && <span className="up ml-1">●</span>}
              <span className="dim ml-1">{n}</span>
            </button>
          );
        })}
        <span className="w-2" />
        {CAP_FILTERS.map((f) => (
          <button key={f.label} className={`term-btn ${minCap === f.min ? "active" : ""}`} onClick={() => setMinCap(f.min)}>
            {f.label}
          </button>
        ))}
      </div>
      {shown && data.length > 0 && (
        <div className="px-2 pb-1 dim text-[11px]">
          {shown === WEEK
            ? `${dayLabel(data[0].date).dmy} – ${dayLabel(data[data.length - 1].date).dmy} · ${total} reports`
            : `${dayLabel(shown).weekday} ${dayLabel(shown).dmy}${shown === today ? " · today" : ""}`}{" "}
          · US reports, biggest first · ★ = on your watchlist
        </div>
      )}
      <table className="data-table">
        <thead>
          <tr>
            <th>Sym</th>
            <th>Company</th>
            <th>Time</th>
            <th>Qtr</th>
            <th>EPS Est.</th>
            <th>Last Yr</th>
            <th>Mkt Cap</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.date}>
              {shown === WEEK && (
                <tr>
                  <td colSpan={7} className="!text-left !py-1.5 font-semibold bg-white/[0.03]">
                    {dayLabel(g.date).weekday} {dayLabel(g.date).dmy}
                    {g.date === today && <span className="up ml-2">● today</span>}
                    <span className="dim ml-2 font-normal">{g.rows.length}</span>
                  </td>
                </tr>
              )}
              {g.rows.map((r) => (
            <Fragment key={`${g.date}-${r.symbol}`}>
              <tr
                onClick={() => setExpanded(expanded === `${g.date}-${r.symbol}` ? null : `${g.date}-${r.symbol}`)}
                className="cursor-pointer"
                title="Click for earnings history"
              >
                <td className="!text-left text-[var(--text)] font-bold underline decoration-1 whitespace-nowrap">
                  {watched.has(r.symbol) && <span className="amber mr-1">★</span>}
                  {r.symbol}
                </td>
                <td className="!text-left dim truncate max-w-[220px]">{r.name}</td>
                <td className={r.time === "unknown" ? "dim" : "amber"} title={TIME_LABEL[r.time].title}>
                  {TIME_LABEL[r.time].text}
                </td>
                <td className="dim">{r.fiscalQuarter ?? "—"}</td>
                <td title={r.estimates != null ? `${r.estimates} analyst estimate${r.estimates === 1 ? "" : "s"}` : undefined}>{usd(r.epsForecast)}</td>
                <td className="dim">{usd(r.lastYearEps)}</td>
                <td>{cap(r.marketCap)}</td>
              </tr>
              {expanded === `${g.date}-${r.symbol}` && (
                <tr>
                  <td colSpan={7} className="!text-left p-0">
                    <EarningsHistoryRows symbol={r.symbol} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
            </Fragment>
          ))}
          {total === 0 && (
            <tr>
              <td colSpan={7} className="dim p-3">
                No reports at this size. Try ANY SIZE.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function CalendarWidget() {
  const [tab, setTab] = useState<"econ" | "week" | "earnings">("econ");

  return (
    <div>
      <div className="flex gap-1 p-1">
        <button className={`term-btn ${tab === "econ" ? "active" : ""}`} onClick={() => setTab("econ")}>
          ECONOMIC
        </button>
        <button className={`term-btn ${tab === "week" ? "active" : ""}`} onClick={() => setTab("week")}>
          THIS WEEK
        </button>
        <button className={`term-btn ${tab === "earnings" ? "active" : ""}`} onClick={() => setTab("earnings")} title="Next report for each watchlist symbol">
          WATCHLIST
        </button>
      </div>
      {tab === "econ" ? <EconomicTab /> : tab === "week" ? <ThisWeekTab /> : <EarningsTab />}
    </div>
  );
}

"use client";

// Trade journal straight from a broker: every execution on the account, paired
// first in first out into round-trip trades with fees. moomoo for shares,
// Hata for crypto. Read-only: the broker service only asks what already happened.

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiGet, fmt, fmtUsd } from "../../lib/api";
import { displaySymbol, matchFifo, optionInfo, tradeStats, type Fill } from "../../lib/equityTrades";

type FillsReport = { broker: string; fills: Fill[]; since: string; notes: string[]; updated_at: string };
type Summary = { positions: Array<{ symbol: string; market: string; qty: number }> };

type Book = {
  broker: "moomoo" | "hata";
  label: string;
  what: string; // what the book holds, for the header
  tz: string; // the time zone fills are reported in
  tzLabel: string;
  keep: (f: Fill) => boolean; // which fills belong in this book
  quoteOf: (symbol: string) => string; // currency a trade is priced in
  heldKey: (symbol: string, name: string) => string; // how the broker's positions name the holding
  heldMarket: string | null; // only the broker's positions in this market
};

const BOOKS: Record<Book["broker"], Book> = {
  moomoo: {
    broker: "moomoo",
    label: "moomoo",
    what: "shares",
    tz: "America/New_York",
    tzLabel: "US times ET",
    keep: (f) => !optionInfo(f.symbol), // shares only
    quoteOf: () => "USD",
    heldKey: (symbol) => symbol,
    heldMarket: "US",
  },
  hata: {
    broker: "hata",
    label: "Hata",
    what: "crypto",
    tz: "Asia/Kuala_Lumpur",
    tzLabel: "Malaysia time",
    keep: () => true,
    quoteOf: (symbol) => (/(USDT|USDC|MYR|USD)$/.exec(symbol)?.[1] ?? "MYR"),
    heldKey: (_symbol, name) => name, // positions are the base token (BTC), trades the pair (BTCMYR)
    heldMarket: null,
  },
};

/** Money in a trade's own currency: $ for USD, RM for ringgit, the code otherwise. */
function money(n: number, ccy: string): string {
  if (ccy === "USD") return fmtUsd(n);
  const sign = n < 0 ? "−" : "";
  const v = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return ccy === "MYR" ? `${sign}RM${v}` : `${sign}${v} ${ccy}`;
}

/** "2026-10-06 12:26:29" → "06/10/2026 12:26" (exchange time, as the broker reports it). */
const dmy = (t: string, withTime = true) => {
  const [d, time] = t.split(" ");
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}${withTime && time ? ` ${time.slice(0, 5)}` : ""}`;
};

export default function BrokerJournal({ broker }: { broker: Book["broker"] }) {
  const book = BOOKS[broker];
  const [view, setView] = useState<"closed" | "open" | "fills">("closed");
  const [quotePick, setQuotePick] = useState<string | null>(null);

  const { data, error, isLoading } = useQuery({
    queryKey: ["broker", broker, "fills"],
    queryFn: () => apiGet<FillsReport>(`/api/brokers/${broker}/fills`),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 0,
  });

  // The account's actual holdings (shared with Broker Accounts), to check the
  // lots rebuilt from trades: splits, dividend reinvestment and transfers aren't fills.
  const { data: summary } = useQuery({
    queryKey: ["broker", broker],
    queryFn: () => apiGet<Summary>(`/api/brokers/${broker}/summary`),
    refetchInterval: 15_000,
    retry: 0,
  });
  const held = new Map<string, number>();
  for (const p of summary?.positions ?? [])
    if (book.heldMarket === null || p.market === book.heldMarket) held.set(p.symbol, (held.get(p.symbol) ?? 0) + p.qty);

  // This year only. Earlier buys still feed the matching (something bought last
  // year and sold this year needs its cost); only what closed or filled this
  // year is shown. Trades in different quote currencies (MYR, USDT) are kept
  // apart: their profits don't add up.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: book.tz }).format(new Date());
  const year = today.slice(0, 4);
  const from = `${year}-01-01`;
  const kept = useMemo(() => (data?.fills ?? []).filter(book.keep), [data, book]);
  const quotes = useMemo(() => {
    const n = new Map<string, number>();
    for (const f of kept) n.set(book.quoteOf(f.symbol), (n.get(book.quoteOf(f.symbol)) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([q]) => q);
  }, [kept, book]);
  const quote = quotePick && quotes.includes(quotePick) ? quotePick : (quotes[0] ?? book.quoteOf(""));
  const shares = useMemo(() => kept.filter((f) => book.quoteOf(f.symbol) === quote), [kept, book, quote]);
  const all = useMemo(() => matchFifo(shares, today), [shares, today]);
  const m = (n: number) => money(n, quote);
  const closed = all.closed.filter((t) => t.exitTime >= from);
  const fills = shares.filter((f) => f.time >= from).reverse();
  const stats = tradeStats(closed);
  const unmatched = all.unmatched.filter((u) => u.time >= from);

  if (isLoading) return <div className="p-2 dim">Reading trades from {book.label}…</div>;
  if (error) return <div className="p-2 down">{(error as Error).message}</div>;
  if (!data) return null;

  return (
    <div>
      <div className="flex gap-1 px-2 py-1.5 items-center flex-wrap">
        {(["closed", "open", "fills"] as const).map((v) => (
          <button key={v} className={`term-btn ${view === v ? "active" : ""}`} onClick={() => setView(v)}>
            {v === "closed" ? `CLOSED ${closed.length}` : v === "open" ? `OPEN ${all.open.length}` : `FILLS ${fills.length}`}
          </button>
        ))}
        {quotes.length > 1 &&
          quotes.map((q) => (
            <button key={q} className={`term-btn ${quote === q ? "active" : ""}`} onClick={() => setQuotePick(q)} title={`Trades priced in ${q}`}>
              {q}
            </button>
          ))}
        <span className="ml-auto dim text-[11px]">
          {year} · {book.what} · read-only · {book.label} · {book.tzLabel}
        </span>
      </div>

      {view !== "open" && (
        <div className="flex gap-x-4 gap-y-1 px-2.5 py-1.5 flex-wrap border-y border-[var(--border)] bg-[var(--panel-2)]/40 text-[12px]">
          <span>
            <span className="dim">Net </span>
            <span className={`font-bold ${stats.net >= 0 ? "up" : "down"}`}>{m(stats.net)}</span>
          </span>
          <span><span className="dim">Trades </span>{stats.count}</span>
          <span>
            <span className="dim">Win rate </span>
            {stats.winRate == null ? "—" : `${stats.winRate}%`} <span className="dim">({stats.wins}W {stats.losses}L)</span>
          </span>
          <span><span className="dim">Avg win </span><span className="up">{stats.avgWin == null ? "—" : m(stats.avgWin)}</span></span>
          <span><span className="dim">Avg loss </span><span className="down">{stats.avgLoss == null ? "—" : m(stats.avgLoss)}</span></span>
          <span title="Winning trades' net over losing trades' net"><span className="dim">Profit factor </span>{stats.profitFactor ?? "—"}</span>
          <span><span className="dim">Fees </span>{m(stats.fees)}</span>
        </div>
      )}

      {view === "closed" &&
        (closed.length === 0 ? (
          <div className="p-2 dim">No closed trades yet this year.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th className="!text-left">Closed</th>
                <th className="!text-left">Sym</th>
                <th>Side</th>
                <th>Qty</th>
                <th>Entry</th>
                <th>Exit</th>
                <th title="Days held">Held</th>
                <th>Gross</th>
                <th>Fees</th>
                <th>Net</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {closed.map((t) => (
                <tr key={t.key}>
                  <td className="!text-left dim whitespace-nowrap">{dmy(t.exitTime, false)}</td>
                  <td className="!text-left font-bold whitespace-nowrap" title={`${t.name}${t.multiplier > 1 ? " · option, ×100" : ""} · opened ${dmy(t.entryTime)}`}>
                    {displaySymbol(t.symbol)}
                  </td>
                  <td>
                    <span className={`pill ${t.side === "LONG" ? "up" : "down"}`}>{t.side}</span>
                  </td>
                  <td>{t.qty}</td>
                  <td>{fmt(t.entry)}</td>
                  <td>{fmt(t.exit)}</td>
                  <td className="dim">{t.holdDays}d</td>
                  <td className={t.gross >= 0 ? "up" : "down"}>{m(t.gross)}</td>
                  <td className="dim" title={t.feesKnown ? undefined : "Fees not reported for every fill"}>
                    {m(t.fees)}{t.feesKnown ? "" : "~"}
                  </td>
                  <td className={`font-bold ${t.net >= 0 ? "up" : "down"}`}>{m(t.net)}</td>
                  <td className={t.pct >= 0 ? "up" : "down"}>{fmt(t.pct, 1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}

      {view === "open" &&
        (all.open.length === 0 ? (
          <div className="p-2 dim">No open lots from these trades.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th className="!text-left">Sym</th>
                <th>Side</th>
                <th>Qty</th>
                <th title="What moomoo says you hold now">Broker</th>
                <th>Avg cost</th>
                <th className="!text-left">Since</th>
              </tr>
            </thead>
            <tbody>
              {all.open.map((o) => {
                const b = held.get(book.heldKey(o.symbol, o.name));
                const off = b != null && Math.abs(b - o.qty) > Math.max(1e-6, Math.abs(b) * 1e-7); // crypto has 8+ decimals
                return (
                  <tr key={`${o.accId}|${o.symbol}`}>
                    <td className="!text-left font-bold" title={o.name}>{displaySymbol(o.symbol)}</td>
                    <td><span className={`pill ${o.side === "LONG" ? "up" : "down"}`}>{o.side}</span></td>
                    <td>{o.qty}</td>
                    <td
                      className={off || b == null ? "amber" : "dim"}
                      title={b == null ? "Not in the broker's positions" : off ? "Differs from the trades: a split, dividend reinvestment or transfer" : "Matches"}
                    >
                      {b == null ? (summary ? "0" : "—") : b}
                      {(off || (b == null && summary)) && " ⚠"}
                    </td>
                    <td>{fmt(o.avgCost)}</td>
                    <td className="!text-left dim">{dmy(o.since)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}

      {view === "fills" &&
        (fills.length === 0 ? (
          <div className="p-2 dim">No executions yet this year.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th className="!text-left">Time</th>
                <th className="!text-left">Sym</th>
                <th>Side</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Amount</th>
                <th>Fee</th>
              </tr>
            </thead>
            <tbody>
              {fills.map((f) => {
                const mult = displaySymbol(f.symbol) === f.symbol ? 1 : 100;
                return (
                  <tr key={`${f.acc_id}|${f.deal_id}`}>
                    <td className="!text-left dim whitespace-nowrap">{dmy(f.time)}</td>
                    <td className="!text-left font-bold whitespace-nowrap" title={f.name}>{displaySymbol(f.symbol)}</td>
                    <td><span className={`pill ${f.side === "BUY" ? "up" : "down"}`}>{f.short ? (f.side === "SELL" ? "SHORT" : "COVER") : f.side}</span></td>
                    <td>{f.qty}</td>
                    <td>{fmt(f.price)}</td>
                    <td>{m(f.qty * f.price * mult)}</td>
                    <td className="dim">{f.fee == null ? "—" : m(f.fee)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}

      <div className="px-2.5 py-1.5 dim text-[11px] space-y-0.5">
        <div>
          {book.what === "shares" ? "Shares only, closed" : `${quote} pairs, closed`} in {year}; paired first-in-first-out, net after {book.label}&apos;s fees.
        </div>
        {unmatched.length > 0 && (
          <div>
            {unmatched.length} sell{unmatched.length === 1 ? "" : "s"} ({unmatched.map((u) => displaySymbol(u.symbol)).join(", ")}) had no buy in the history — bought before it starts, so not counted.
          </div>
        )}
        {view === "open" && (
          <div>⚠ = the broker holds a different amount than the trades add up to: a split, dividend reinvestment or transfer isn't a fill.</div>
        )}
        {data.notes.map((n) => (
          <div key={n}>{n}</div>
        ))}
      </div>
    </div>
  );
}

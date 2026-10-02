"use client";

import { useEffect, useState } from "react";
import { fmt, fmtUsd } from "../../lib/api";
import { useJournal, useJournalMutations, useJournalSummary } from "../../lib/journal";
import { journalDate, useCmeSession } from "../../lib/session";

// Log of trades placed by hand (NinjaTrader, Tradesea, an exchange). It records;
// it never sends an order anywhere.

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const EMPTY = { symbol: "MCL", side: "LONG" as "LONG" | "SHORT", quantity: "1", entry: "", exit: "", fees: "", notes: "" };

export default function JournalWidget() {
  const { session } = useCmeSession();
  const today = journalDate(session);
  const [day, setDay] = useState<string | null>(null);
  const shown = day ?? today;

  const { data: trades = [], error } = useJournal(shown);
  const { data: summary } = useJournalSummary(shown);
  const { add, remove } = useJournalMutations();

  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  useEffect(() => setFormError(null), [form]);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: k === "symbol" ? e.target.value.toUpperCase() : e.target.value });

  const submit = () => {
    const quantity = Number(form.quantity);
    const entry = Number(form.entry);
    const exit = Number(form.exit);
    const fees = form.fees === "" ? 0 : Number(form.fees);
    if (!form.symbol || !(quantity > 0) || !(entry > 0) || !(exit > 0) || !(fees >= 0)) {
      setFormError("Symbol, quantity, entry and exit are required; fees can't be negative.");
      return;
    }
    add.mutate(
      { session_date: shown, symbol: form.symbol, side: form.side, quantity, entry, exit, fees, notes: form.notes },
      {
        onSuccess: () => setForm({ ...EMPTY, symbol: form.symbol, side: form.side, quantity: form.quantity }),
        onError: (e) => setFormError((e as Error).message),
      }
    );
  };

  return (
    <div>
      <div className="flex gap-1.5 px-2.5 py-2 items-center">
        <button className="term-btn" onClick={() => setDay(shiftDate(shown, -1))}>◀</button>
        <span className="px-1 whitespace-nowrap num">{shown}</span>
        <button className="term-btn" onClick={() => setDay(shiftDate(shown, 1))}>▶</button>
        {shown !== today && (
          <button className="term-btn" onClick={() => setDay(null)}>TODAY</button>
        )}
        {summary && (
          <span className="ml-auto whitespace-nowrap">
            <span className="dim">{summary.trades} trades · {summary.wins}W {summary.losses}L · </span>
            <span className={`font-bold ${summary.pnl >= 0 ? "up" : "down"}`}>{fmtUsd(summary.pnl)}</span>
          </span>
        )}
      </div>

      <div className="flex gap-1.5 px-2.5 py-2 flex-wrap items-center border-y border-[var(--border)] bg-[var(--panel-2)]/40">
        <input className="w-16" placeholder="Symbol" value={form.symbol} onChange={set("symbol")} />
        <button
          className={`term-btn ${form.side === "LONG" ? "up" : "down"}`}
          onClick={() => setForm({ ...form, side: form.side === "LONG" ? "SHORT" : "LONG" })}
          title="Click to switch side"
        >
          {form.side}
        </button>
        <input className="w-12" placeholder="Qty" inputMode="decimal" value={form.quantity} onChange={set("quantity")} />
        <input className="w-20" placeholder="Entry" inputMode="decimal" value={form.entry} onChange={set("entry")} />
        <input className="w-20" placeholder="Exit" inputMode="decimal" value={form.exit} onChange={set("exit")} />
        <input className="w-14" placeholder="Fees" inputMode="decimal" value={form.fees} onChange={set("fees")} />
        <input
          className="flex-1 min-w-24"
          placeholder="Notes (setup, mistake…)"
          value={form.notes}
          onChange={set("notes")}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button className="term-btn active" onClick={submit} disabled={add.isPending}>
          + LOG
        </button>
      </div>
      {formError && <div className="px-2 py-1 down">{formError}</div>}
      {error && <div className="px-2 py-1 down">{(error as Error).message}</div>}

      {trades.length === 0 ? (
        <div className="p-2 dim">No trades logged for {shown}.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th className="!text-left">Sym</th>
              <th>Side</th>
              <th>Qty</th>
              <th>Entry</th>
              <th>Exit</th>
              <th title="USD per 1.00 move per contract">×</th>
              <th>P&L</th>
              <th className="!text-left">Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.id}>
                <td className="!text-left font-bold">{t.symbol}</td>
                <td><span className={`pill ${t.side === "LONG" ? "up" : "down"}`}>{t.side}</span></td>
                <td>{t.quantity}</td>
                <td>{fmt(t.entry)}</td>
                <td>{fmt(t.exit)}</td>
                <td className="dim">{t.multiplier}</td>
                <td className={t.pnl >= 0 ? "up" : "down"}>{fmtUsd(t.pnl)}</td>
                <td className="!text-left dim max-w-40 truncate" title={t.notes}>{t.notes}</td>
                <td>
                  <button className="dim hover:text-[var(--down)]" title="Delete this entry" onClick={() => confirm(`Delete ${t.side} ${t.quantity} ${t.symbol} from the journal?`) && remove.mutate(t.id)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

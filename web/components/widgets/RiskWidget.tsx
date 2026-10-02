"use client";

import { useEffect, useState } from "react";
import { fmt, fmtUsd } from "../../lib/api";
import { useRisk, useSessionPnl } from "../../lib/risk";
import { useTerminal, type AccountInput } from "../../store/terminal";

// Figures are typed in from the LucidFlex dashboard; nothing here talks to a broker.

function Field({ label, field }: { label: string; field: keyof AccountInput }) {
  const value = useTerminal((s) => s.account[field]);
  const setAccount = useTerminal((s) => s.setAccount);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n)) setAccount({ [field]: n });
    else setDraft(String(value));
  };

  return (
    <label className="flex flex-col dim text-[10px] uppercase">
      {label}
      <input
        value={draft}
        inputMode="decimal"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        className="w-24 text-[var(--text)]"
      />
    </label>
  );
}

function TodayPnl() {
  const { fromJournal, pnl, date } = useSessionPnl();
  const setAccount = useTerminal((s) => s.setAccount);
  return (
    <div className="flex flex-col">
      {fromJournal ? (
        <label className="flex flex-col dim text-[10px] uppercase">
          Today P&L
          <span className={`w-24 py-0.5 text-[12px] ${pnl !== null && pnl < 0 ? "down" : "text-[var(--text)]"}`} title={`Sum of journal trades for session ${date}`}>
            {pnl === null ? "…" : fmtUsd(pnl)}
          </span>
        </label>
      ) : (
        <Field label="Today P&L" field="sessionPnl" />
      )}
      <label className="dim text-[10px] flex items-center gap-1 cursor-pointer">
        <input type="checkbox" checked={fromJournal} onChange={(e) => setAccount({ pnlFromJournal: e.target.checked })} />
        from journal
      </label>
    </div>
  );
}

function Meter({ label, used, total, detail }: { label: string; used: number; total: number; detail: string }) {
  const pct = total > 0 ? Math.min(Math.max(used / total, 0), 1) : 1;
  const color = pct >= 0.75 ? "var(--down)" : pct >= 0.5 ? "var(--amber)" : "var(--up)";
  return (
    <div className="px-2.5 py-1.5">
      <div className="flex flex-wrap justify-between gap-x-3">
        <span className="dim whitespace-nowrap">{label}</span>
        <span className="ml-auto text-right num whitespace-nowrap">{detail}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--panel-3)] mt-1.5 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct * 100}%`, background: color }} />
      </div>
    </div>
  );
}

function countdown(minutes: number | null): string {
  if (minutes === null) return "market closed";
  if (minutes <= 0) return "PAST DEADLINE";
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export default function RiskWidget() {
  const { data: r, error, isLoading } = useRisk();
  const ticks = r ? [...new Set(r.lots.map((l) => l.stop_ticks))] : [];
  const symbols = r ? [...new Set(r.lots.map((l) => l.symbol))] : [];

  return (
    <div>
      <div className="flex gap-3 px-2.5 py-2 flex-wrap">
        <Field label="Equity" field="balance" />
        <Field label="Peak close" field="peakClose" />
        <TodayPnl />
      </div>

      {isLoading && <div className="p-2 dim">Loading…</div>}
      {error && <div className="p-2 down">{(error as Error).message}</div>}

      {r && (
        <>
          <div className={`mx-2.5 my-2 px-3 py-2 rounded-lg border ${r.can_trade ? "border-[var(--up)]/40 bg-[var(--up-soft)] up" : "border-[var(--down)]/40 bg-[var(--down-soft)] down"}`}>
            <div className="font-semibold tracking-wide">{r.can_trade ? "● ROOM FOR NEW RISK" : "● NO NEW RISK"}</div>
            {r.reasons.map((x) => (
              <div key={x} className="text-[10px]">• {x}</div>
            ))}
          </div>

          <Meter
            label={`Trailing DD (${r.trailing_mode === "end_of_day" ? "EOD" : "intraday"})`}
            used={r.max_trailing_drawdown - r.drawdown_room}
            total={r.max_trailing_drawdown}
            detail={`$${fmt(r.drawdown_room, 0)} room · stop $${fmt(r.trail_stop, 0)}`}
          />
          <Meter
            label="Daily loss"
            used={r.session_loss}
            total={r.daily_stop_at}
            detail={`$${fmt(r.session_loss, 0)} / stop at $${fmt(r.daily_stop_at, 0)}`}
          />
          <Meter
            label="Profit target"
            used={r.profit}
            total={r.profit_target}
            detail={`${fmtUsd(r.profit, 0)} / ${fmtUsd(r.profit_target, 0)}`}
          />

          <div className="flex justify-between items-center px-2.5 py-2 border-t border-[var(--border)] mt-1.5">
            <span className="dim whitespace-nowrap">Risk budget / trade</span>
            <span className="amber font-semibold text-[14px] num">${fmt(r.risk_budget, 0)}</span>
          </div>
          <div className="flex justify-between items-center px-2.5 py-1.5">
            <span className="dim whitespace-nowrap">Flat by 16:45 ET</span>
            <span className={r.minutes_to_flat !== null && r.minutes_to_flat < 30 ? "down font-bold" : ""}>
              {countdown(r.minutes_to_flat)}
            </span>
          </div>

          <table className="data-table mt-1">
            <thead>
              <tr>
                <th className="!text-left">Max lots · stop</th>
                {ticks.map((t) => (
                  <th key={t}>{t}t</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {symbols.map((sym) => (
                <tr key={sym}>
                  <td className="!text-left font-bold">{sym}</td>
                  {ticks.map((t) => {
                    const row = r.lots.find((l) => l.symbol === sym && l.stop_ticks === t);
                    return (
                      <td key={t} className={row?.max_lots ? "" : "down"}>
                        {row?.max_lots ?? "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

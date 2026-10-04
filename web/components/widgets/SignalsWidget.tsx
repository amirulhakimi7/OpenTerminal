"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { fmt } from "../../lib/api";
import { notifyOnce } from "../../lib/notify";
import { useRisk } from "../../lib/risk";
import { useSignals } from "../../lib/signals";

// Display only. Execution stays manual, in NinjaTrader.
export default function SignalsWidget() {
  const [lots, setLots] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [hideLate, setHideLate] = useState(true);
  const { data: risk } = useRisk();

  const { data, isLoading, error } = useSignals();

  // Desktop alert for each setup newer than the first batch seen. The first
  // load only sets the baseline, so opening the page never floods alerts.
  const newest = useRef<string | null>(null);
  useEffect(() => {
    if (!data?.signals.length) return;
    const latest = data.signals[0].ts_utc;
    if (newest.current !== null) {
      for (const s of data.signals) {
        if (s.ts_utc <= newest.current) break;
        if (s.late) continue;
        notifyOnce(
          `signal-${s.ts_utc}-${s.entry}`,
          `${s.symbol} ${s.direction.toUpperCase()} setup`,
          `Entry ${fmt(s.entry)} · stop ${fmt(s.stop)} · target ${fmt(s.target)} · RR ${fmt(s.risk_reward)}`
        );
      }
    }
    if (newest.current === null || latest > newest.current) newest.current = latest;
  }, [data]);

  const rows = data ? (hideLate ? data.signals.filter((s) => !s.late) : data.signals) : [];
  const lateCount = data ? data.signals.filter((s) => s.late).length : 0;

  return (
    <div>
      <div className="flex gap-2 px-2.5 py-2 items-center flex-wrap">
        {data && (
          <span className={`pill ${data.live ? "up" : "amber"}`} title={data.source}>
            ● {data.live ? "LIVE" : `REPLAY · ${data.split.toUpperCase()}`}
          </span>
        )}
        <label className="dim flex items-center gap-1">
          Lots
          <input
            type="number"
            min={1}
            max={50}
            value={lots}
            onChange={(e) => setLots(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            className="w-12"
          />
        </label>
        <button
          className={`term-btn ${hideLate ? "active" : ""}`}
          onClick={() => setHideLate(!hideLate)}
          title="Setups whose estimated time to target runs past 16:45 ET"
        >
          {hideLate ? `LATE HIDDEN (${lateCount})` : "SHOWING LATE"}
        </button>
        <span className="dim ml-auto">
          {isLoading ? "Building setups…" : data ? `${data.total} setups · last bar ${data.last_bar?.slice(0, 16).replace("T", " ") ?? "—"} UTC` : ""}
        </span>
      </div>

      {error && (
        <div className="p-2 down">
          {(error as Error).message}
          <div className="dim">Start the service: Trading repo → cl-signals (uvicorn api.app:app --port 8100)</div>
        </div>
      )}

      {data && rows.length === 0 && <div className="p-2 dim">No setups to show{hideLate && lateCount ? " — all are too late to reach target before 16:45 ET" : ""}.</div>}

      {rows.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th className="!text-left">Time ET</th>
              <th>Side</th>
              <th>Entry</th>
              <th>Stop</th>
              <th>Target</th>
              <th>RR</th>
              <th>Risk</th>
              <th title="Contracts that fit the LucidFlex risk budget">Max</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => {
              const key = `${i}-${s.ts_utc}-${s.entry}`;
              const side = s.direction === "long" ? "up" : "down";
              const maxLots =
                risk && s.risk_usd_per_lot > 0 ? Math.floor(risk.risk_budget / s.risk_usd_per_lot + 1e-9) : null;
              return (
                <Fragment key={key}>
                  <tr onClick={() => setOpen(open === key ? null : key)} className={`cursor-pointer ${s.late ? "opacity-50" : ""}`}>
                    <td className="!text-left dim">{s.ts_et}</td>
                    <td>
                      <span className={`pill ${side}`}>{s.direction === "long" ? "LONG" : "SHORT"}</span>
                      {s.late && <span className="pill amber ml-1" title={`Needs ~${s.minutes_needed} min, ${s.minutes_left ?? 0} min left before 16:45 ET`}>LATE</span>}
                    </td>
                    <td>{fmt(s.entry)}</td>
                    <td className="down">{fmt(s.stop)}</td>
                    <td className="up">{fmt(s.target)}</td>
                    <td className="amber">{fmt(s.risk_reward)}</td>
                    <td title={`${s.risk_ticks} ticks`}>${fmt(s.risk_usd_per_lot * lots, 0)}</td>
                    <td className={maxLots !== null && lots > maxLots ? "down font-bold" : ""}>{maxLots ?? "—"}</td>
                    <td className="dim">{s.evidence.map((e) => e.kind).join(" · ")}</td>
                  </tr>
                  {open === key && (
                    <tr>
                      <td colSpan={9} className="!text-left dim">
                        Zone {fmt(s.entry_low)}–{fmt(s.entry_high)} · stop {s.risk_ticks}t · target {s.reward_ticks}t ·
                        reward ${fmt(s.reward_usd_per_lot * lots, 0)} at {lots} lot
                        {lots > 1 ? "s" : ""} · 4H bias {s.bias} · needs ~{s.minutes_needed} min,{" "}
                        {s.minutes_left === null ? "market closed" : `${s.minutes_left} min left`}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

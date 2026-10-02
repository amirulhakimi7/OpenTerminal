"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiGet, fmt, fmtUsd } from "../../lib/api";
import type { BrokerId, WidgetInstance } from "../../store/terminal";

// Mirrors BrokerSummary in brokers/schema.py. Every broker returns this shape.
type Account = {
  acc_id: string;
  market: string;
  currency: string;
  total_assets: number | null;
  cash: number | null;
  market_value: number | null;
  unrealized_pl: number | null;
};
type Position = {
  symbol: string;
  name: string;
  market: string;
  currency: string;
  qty: number;
  cost_price: number | null;
  price: number | null;
  market_value: number | null;
  pl: number | null;
  pl_pct: number | null;
};
type BrokerSummary = { broker: string; env: string; accounts: Account[]; positions: Position[]; updated_at: string };

// Read-only view. Orders are placed in each broker's own app, never here.
const BROKERS: Array<{ id: BrokerId; label: string; asset: string; ready: boolean; hint?: string }> = [
  { id: "moomoo", label: "moomoo", asset: "Stocks", ready: true },
  { id: "hata", label: "Hata", asset: "Crypto", ready: false, hint: "Waiting for Hata API documentation (support@hata.io)." },
  { id: "lucid", label: "Lucid", asset: "Futures", ready: false, hint: "Connects through your futures platform (Rithmic / Tradovate); not set up yet." },
];

function money(n: number | null, ccy: string): string {
  if (n === null) return "—";
  return ccy === "USD" ? fmtUsd(n) : `${n < 0 ? "−" : ""}${ccy} ${fmt(Math.abs(n))}`;
}

function BrokerView({ broker }: { broker: string }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ["broker", broker],
    queryFn: () => apiGet<BrokerSummary>(`/api/brokers/${broker}/summary`),
    refetchInterval: 15_000,
    retry: 0,
  });

  if (isLoading) return <div className="p-3 dim">Connecting…</div>;
  if (error)
    return (
      <div className="m-2.5 p-3 rounded-lg border border-[var(--border)] bg-[var(--panel-2)]">
        <div className="down font-medium">Not connected</div>
        <div className="dim mt-1">{(error as Error).message}</div>
      </div>
    );
  if (!data) return null;

  return (
    <div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2 p-2.5">
        {data.accounts.map((a) => (
          <div key={`${a.acc_id}-${a.market}`} className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2.5">
            <div className="flex justify-between dim text-[10px] uppercase tracking-wider">
              <span>{a.market}</span>
              <span className="num">··{a.acc_id.slice(-4)}</span>
            </div>
            <div className="text-[16px] font-semibold num mt-1">{money(a.total_assets, a.currency)}</div>
            <div className="flex justify-between text-[11px] mt-1">
              <span className="dim">Cash {money(a.cash, a.currency)}</span>
              {a.unrealized_pl !== null && (
                <span className={a.unrealized_pl >= 0 ? "up" : "down"}>{money(a.unrealized_pl, a.currency)}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {data.positions.length === 0 ? (
        <div className="px-3 pb-3 dim">No open positions.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th className="!text-left">Symbol</th>
              <th>Qty</th>
              <th>Cost</th>
              <th>Last</th>
              <th>Value</th>
              <th>P&L</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {data.positions.map((p) => {
              const cls = p.pl === null ? "" : p.pl >= 0 ? "up" : "down";
              return (
                <tr key={`${p.market}-${p.symbol}`}>
                  <td className="!text-left">
                    <span className="font-semibold">{p.symbol}</span>
                    <span className="dim ml-1.5 text-[10px]">{p.name}</span>
                  </td>
                  <td>{fmt(p.qty, 0)}</td>
                  <td>{fmt(p.cost_price)}</td>
                  <td>{fmt(p.price)}</td>
                  <td>{money(p.market_value, p.currency)}</td>
                  <td className={cls}>{money(p.pl, p.currency)}</td>
                  <td className={cls}>{p.pl_pct === null ? "—" : `${fmt(p.pl_pct)}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="px-3 py-2 dim text-[10px]">
        {data.env === "REAL" ? "Live account" : "Paper account"} · read-only · updated{" "}
        {new Date(data.updated_at).toLocaleTimeString()}
      </div>
    </div>
  );
}

// A widget pinned to one broker (each workspace preset pins its own) shows
// only that account; one added from the sidebar gets tabs for all of them.
export default function AccountsWidget({ widget }: { widget: WidgetInstance }) {
  const [active, setActive] = useState<BrokerId>(widget.broker ?? "moomoo");
  const current = BROKERS.find((b) => b.id === (widget.broker ?? active)) ?? BROKERS[0];

  return (
    <div>
      {!widget.broker && <div className="flex gap-1.5 px-2.5 pt-2.5">
        {BROKERS.map((b) => (
          <button key={b.id} className={`term-btn ${active === b.id ? "active" : ""}`} onClick={() => setActive(b.id)}>
            {b.label} <span className="dim text-[10px] ml-1">{b.asset}</span>
          </button>
        ))}
      </div>}
      {current.ready ? (
        <BrokerView broker={current.id} />
      ) : (
        <div className="m-2.5 p-3 rounded-lg border border-dashed border-[var(--border-strong)] dim">{current.hint}</div>
      )}
    </div>
  );
}

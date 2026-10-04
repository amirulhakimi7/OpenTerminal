"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import { enableNotifications, notificationsEnabled, notificationsSupported } from "../lib/notify";
import { fmtCountdown, useCmeSession, type CmePhase } from "../lib/session";
import { marketStateNY } from "../lib/markets";
import { useTerminal } from "../store/terminal";

type Status = {
  ok: boolean;
  providers: Array<{ name: string; ok: number; failed: number; lastLatencyMs: number | null }>;
  ai: boolean;
};

function Clock({ tz, label }: { tz: string; label: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  return (
    <span className="flex flex-col leading-tight">
      <span className="dim text-[9px] tracking-wider">{label}</span>
      <span className="text-[var(--text)] num text-[11px]">
        {now.toLocaleTimeString("en-GB", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" })}
      </span>
    </span>
  );
}

const PHASE_LABEL: Record<CmePhase, { text: string; cls: string }> = {
  open: { text: "CME OPEN", cls: "up" },
  force_flat: { text: "FORCE FLAT", cls: "down" },
  past_deadline: { text: "PAST 16:45", cls: "down" },
  maintenance: { text: "CME BREAK", cls: "amber" },
  closed: { text: "CME CLOSED", cls: "" },
};

function CmeStatus() {
  const { session, minutesLeft, error } = useCmeSession();
  if (error) return <span className="pill dim" title="Start the cl-signals service">● CME offline</span>;
  if (!session) return null;
  const label = PHASE_LABEL[session.phase];
  const counting = session.phase === "open" || session.phase === "force_flat";
  return (
    <span className={`pill ${label.cls} ${label.cls ? "" : "dim"}`} title="From the CME calendar in the Trading repo">
      ● {label.text}
      {counting && <span className="text-[var(--text)] font-normal num">· flat in {fmtCountdown(minutesLeft)}</span>}
    </span>
  );
}

function AlertsToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(notificationsEnabled()), []);
  if (!notificationsSupported()) return null;
  return (
    <button
      className={`w-7 h-7 rounded-md grid place-items-center hover:bg-[var(--panel-3)] ${on ? "" : "opacity-60"}`}
      title={on ? "Desktop alerts on (signals, FORCE FLAT)" : "Enable desktop alerts for new signals and FORCE FLAT"}
      onClick={async () => setOn(await enableNotifications())}
    >
      {on ? "🔔" : "🔕"}
    </button>
  );
}

export default function TopBar() {
  const setCommandOpen = useTerminal((s) => s.setCommandOpen);
  const activeSymbol = useTerminal((s) => s.activeSymbol);
  const { data: status } = useQuery({
    queryKey: ["status"],
    queryFn: () => apiGet<Status>("/api/status"),
    refetchInterval: 30_000,
  });

  const market = marketStateNY();
  const healthy = status?.providers.filter((p) => p.ok > 0) ?? [];

  return (
    <header className="flex items-center gap-3 px-4 h-12 bg-[var(--panel)]/80 backdrop-blur border-b border-[var(--border)] text-[11px] shrink-0">
      <span className="flex items-center gap-2 mr-1 shrink-0">
        <span className="w-6 h-6 rounded-md grid place-items-center text-[10px] font-bold text-black bg-gradient-to-br from-[#f5a524] to-[#f97316]">
          OT
        </span>
        <span className="hidden md:inline font-semibold tracking-wide text-[13px]">OpenTerminal</span>
      </span>
      <span className={`pill hidden lg:inline-flex ${market.open ? "up" : "dim"}`}>● {market.open ? "NYSE OPEN" : "NYSE CLOSED"}</span>
      <CmeStatus />
      <button
        className="flex-1 min-w-[140px] max-w-md mx-auto flex items-center gap-2 h-8 px-3 rounded-lg bg-[var(--panel-2)] border border-[var(--border)] hover:border-[var(--border-strong)] dim text-left transition-colors"
        onClick={() => setCommandOpen(true)}
      >
        <span>⌕</span>
        <span className="text-[var(--text)] font-medium">{activeSymbol}</span>
        <span className="truncate">Search symbol…</span>
        <kbd className="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-strong)]">⌘K</kbd>
      </button>
      <span className="hidden xl:flex items-center gap-4 px-3">
        <Clock tz="America/New_York" label="NEW YORK" />
        <Clock tz="Asia/Kuala_Lumpur" label="KL" />
        <Clock tz="Europe/London" label="LONDON" />
        <Clock tz="Asia/Tokyo" label="TOKYO" />
      </span>
      <span
        className={`pill hidden lg:inline-flex ${healthy.length > 0 ? "up" : "dim"}`}
        title={healthy.map((p) => `${p.name} ${p.lastLatencyMs ?? "—"}ms`).join("\n") || "connecting…"}
      >
        ● {healthy.length > 0 ? `${healthy.length} feeds` : "connecting"}
      </span>
      <span className={`pill ${status?.ai ? "up" : "dim"}`} title={status?.ai ? "AI assistant available" : "Set ANTHROPIC_API_KEY to enable"}>
        AI
      </span>
      <AlertsToggle />
    </header>
  );
}

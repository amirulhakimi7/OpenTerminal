import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiGet } from "./api";

// Mirrors SessionView in Trading/src/api/session_view.py.
export type CmePhase = "open" | "force_flat" | "past_deadline" | "maintenance" | "closed";
export type CmeSession = {
  phase: CmePhase;
  session_date: string | null;
  minutes_to_flat: number | null;
  alert_lead_minutes: number;
  now_utc: string;
};

/** The CME phase alone, polled every 30 s. Shared cache; no per-second re-render. */
export function useCmeSessionQuery() {
  return useQuery({
    queryKey: ["cme-session"],
    queryFn: () => apiGet<CmeSession>("/api/signals/session"),
    refetchInterval: 30_000,
    retry: 1,
  });
}

/** CME phase with a local per-second countdown between polls. */
export function useCmeSession() {
  const query = useCmeSessionQuery();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const s = query.data;
  let minutesLeft: number | null = null;
  if (s?.minutes_to_flat != null) {
    const elapsed = (Date.now() - query.dataUpdatedAt) / 60_000;
    minutesLeft = s.minutes_to_flat - elapsed;
  }
  return { session: s, minutesLeft, error: query.error };
}

/** Session date to file a journal trade under: the CME session, else today in New York. */
export function journalDate(s: CmeSession | undefined): string {
  if (s?.session_date) return s.session_date;
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export function fmtCountdown(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes <= 0) return "0:00";
  const total = Math.floor(minutes * 60);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(sec).padStart(2, "0")}`;
}

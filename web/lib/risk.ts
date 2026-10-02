import { useQuery } from "@tanstack/react-query";
import { apiPost } from "./api";
import { useTerminal } from "../store/terminal";
import { useJournalSummary } from "./journal";
import { journalDate, useCmeSessionQuery } from "./session";

// Mirrors RiskView in Trading/src/api/risk_view.py.
export type LotRow = { symbol: string; stop_ticks: number; usd_per_tick: number; max_lots: number };
export type RiskView = {
  balance: number;
  starting_balance: number;
  trailing_mode: string;
  trail_anchor: number;
  trail_stop: number;
  drawdown_room: number;
  max_trailing_drawdown: number;
  daily_loss_limit: number;
  daily_stop_at: number;
  session_loss: number;
  daily_loss_room: number;
  risk_budget: number;
  profit: number;
  profit_target: number;
  minutes_to_flat: number | null;
  can_trade: boolean;
  reasons: string[];
  lots: LotRow[];
};

/** Whether today's P&L comes from the journal, and the figure the risk check will use. */
export function useSessionPnl(): { fromJournal: boolean; pnl: number | null; date: string } {
  const account = useTerminal((s) => s.account);
  const fromJournal = account.pnlFromJournal !== false;
  const { data: session } = useCmeSessionQuery();
  const date = journalDate(session);
  const { data: summary } = useJournalSummary(fromJournal ? date : null);
  if (!fromJournal) return { fromJournal, pnl: account.sessionPnl, date };
  return { fromJournal, pnl: summary ? summary.pnl : null, date };
}

/** Shared by the risk panel and the signals table, so both read one snapshot. */
export function useRisk() {
  const account = useTerminal((s) => s.account);
  const { pnl } = useSessionPnl();
  return useQuery({
    queryKey: ["risk", account.balance, account.peakClose, pnl],
    queryFn: () =>
      apiPost<RiskView>("/api/signals/risk", {
        balance: account.balance,
        peak_closing_balance: account.peakClose,
        session_realized_pnl: pnl,
      }),
    // Never size against a P&L that hasn't loaded: a missing loss reads as room.
    enabled: pnl !== null,
    refetchInterval: 30_000, // keeps the flat-deadline countdown current
    retry: 1,
  });
}

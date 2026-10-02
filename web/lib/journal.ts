import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "./api";

// Mirrors server/src/routes/journal.ts.
export type JournalTrade = {
  id: number;
  session_date: string;
  symbol: string;
  side: "LONG" | "SHORT";
  quantity: number;
  entry: number;
  exit: number;
  multiplier: number;
  fees: number;
  notes: string;
  pnl: number;
};
export type JournalSummary = { session_date: string; trades: number; wins: number; losses: number; pnl: number };
export type NewTrade = Omit<JournalTrade, "id" | "pnl" | "multiplier"> & { multiplier?: number };

export function useJournal(sessionDate: string) {
  return useQuery({
    queryKey: ["journal", sessionDate],
    queryFn: () => apiGet<JournalTrade[]>(`/api/journal?session_date=${sessionDate}`),
  });
}

export function useJournalSummary(sessionDate: string | null) {
  return useQuery({
    queryKey: ["journal-summary", sessionDate],
    queryFn: () => apiGet<JournalSummary>(`/api/journal/summary?session_date=${sessionDate}`),
    enabled: sessionDate !== null,
  });
}

/** Add/delete, refreshing the trade list, the day summary and the risk panel that reads it. */
export function useJournalMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["journal"] });
    qc.invalidateQueries({ queryKey: ["journal-summary"] });
    qc.invalidateQueries({ queryKey: ["risk"] });
  };
  const add = useMutation({ mutationFn: (t: NewTrade) => apiPost<JournalTrade>("/api/journal", t), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: number) => apiDelete(`/api/journal/${id}`), onSuccess: refresh });
  return { add, remove };
}

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";

// Mirrors SignalView in Trading/src/api/signals.py.
export type Evidence = { kind: string; direction: string; ts_utc: string };
export type Signal = {
  symbol: string;
  direction: "long" | "short";
  ts_utc: string;
  ts_et: string;
  entry: number;
  entry_low: number;
  entry_high: number;
  stop: number;
  target: number;
  risk_reward: number;
  risk_ticks: number;
  reward_ticks: number;
  risk_usd_per_lot: number;
  reward_usd_per_lot: number;
  bias: string;
  minutes_needed: number;
  minutes_left: number | null;
  late: boolean;
  evidence: Evidence[];
};
export type SignalsResponse = {
  symbol: string;
  live: boolean;
  source: string;
  split: string;
  last_bar: string | null;
  total: number;
  signals: Signal[];
};

/** Latest CL/MCL setups. Shared by the Signals widget and the Futures floor (one fetch). */
export function useSignals(enabled = true) {
  return useQuery({
    queryKey: ["signals"],
    queryFn: () => apiGet<SignalsResponse>("/api/signals?limit=30"),
    refetchInterval: 60_000,
    retry: 1,
    enabled,
  });
}

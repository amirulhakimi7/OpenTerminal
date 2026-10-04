"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WidgetType =
  | "quote"
  | "chart"
  | "watchlist"
  | "news"
  | "heatmap"
  | "screener"
  | "crypto"
  | "macro"
  | "options"
  | "portfolio"
  | "ai"
  | "calendar"
  | "insider"
  | "tv"
  | "recap"
  | "signals"
  | "risk"
  | "journal"
  | "accounts"
  | "floor";

export type WidgetInstance = {
  id: string;
  type: WidgetType;
  symbol?: string;
  linked: boolean; // follows the globally active symbol
  broker?: BrokerId; // accounts widget: pin to one broker; absent shows all
  floor?: FloorId; // trading floor widget: pin to one floor; absent shows tabs
};

export type FloorId = "equity" | "crypto" | "futures";

export type BrokerId = "moomoo" | "hata" | "lucid";

// What the trader reads off the LucidFlex dashboard; there is no broker link yet.
// pnlFromJournal: take today's P&L from the trade journal instead of sessionPnl.
// Optional because workspaces saved before it existed lack it; absent means on.
export type AccountInput = { balance: number; peakClose: number; sessionPnl: number; pnlFromJournal?: boolean };

export type LayoutItem = { i: string; x: number; y: number; w: number; h: number };

type TerminalState = {
  activeSymbol: string;
  widgets: WidgetInstance[];
  layout: LayoutItem[];
  watchlist: string[];
  commandOpen: boolean;
  account: AccountInput;
  lastFloor: FloorId;
  setLastFloor: (f: FloorId) => void;
  floorView: "building" | "floor";
  setFloorView: (v: "building" | "floor") => void;
  sound: boolean;
  setSound: (on: boolean) => void;
  setAccount: (a: Partial<AccountInput>) => void;
  setActiveSymbol: (s: string) => void;
  setCommandOpen: (open: boolean) => void;
  addWidget: (type: WidgetType, symbol?: string) => void;
  removeWidget: (id: string) => void;
  setWidgetSymbol: (id: string, symbol: string) => void;
  toggleLinked: (id: string) => void;
  setLayout: (layout: LayoutItem[]) => void;
  addToWatchlist: (s: string) => void;
  removeFromWatchlist: (s: string) => void;
  resetWorkspace: () => void;
  applyPreset: (name: PresetName) => void;
};

const DEFAULT_WIDGETS: WidgetInstance[] = [
  { id: "w-chart", type: "chart", linked: true },
  { id: "w-quote", type: "quote", linked: true },
  { id: "w-watchlist", type: "watchlist", linked: false },
  { id: "w-news", type: "news", linked: true },
  { id: "w-macro", type: "macro", linked: false },
];

const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: "w-chart", x: 0, y: 0, w: 7, h: 12 },
  { i: "w-quote", x: 7, y: 0, w: 5, h: 6 },
  { i: "w-watchlist", x: 7, y: 6, w: 5, h: 6 },
  { i: "w-news", x: 0, y: 12, w: 7, h: 7 },
  { i: "w-macro", x: 7, y: 12, w: 5, h: 7 },
];

const SIZE_BY_TYPE: Record<WidgetType, { w: number; h: number }> = {
  quote: { w: 5, h: 6 },
  chart: { w: 7, h: 12 },
  watchlist: { w: 4, h: 7 },
  news: { w: 5, h: 8 },
  heatmap: { w: 7, h: 10 },
  screener: { w: 12, h: 9 },
  crypto: { w: 6, h: 9 },
  macro: { w: 5, h: 7 },
  options: { w: 12, h: 9 },
  portfolio: { w: 7, h: 8 },
  ai: { w: 5, h: 10 },
  calendar: { w: 12, h: 11 },
  insider: { w: 7, h: 9 },
  tv: { w: 6, h: 11 },
  recap: { w: 5, h: 12 },
  signals: { w: 7, h: 10 },
  risk: { w: 5, h: 12 },
  journal: { w: 7, h: 9 },
  accounts: { w: 7, h: 10 },
  floor: { w: 12, h: 18 },
};

export type PresetName = "futures" | "crypto" | "stocks" | "floor";

type Preset = { widgets: WidgetInstance[]; layout: LayoutItem[]; activeSymbol?: string };

// One-click workspaces, one per market the trader works. Widget ids are fixed
// so applying a preset twice gives the same layout rather than duplicates.
export const PRESETS: Record<PresetName, Preset> = {
  floor: {
    widgets: [{ id: "p-floor", type: "floor", linked: false }],
    layout: [{ i: "p-floor", x: 0, y: 0, w: 12, h: 22 }],
  },
  futures: {
    widgets: [
      { id: "p-signals", type: "signals", linked: false },
      { id: "p-risk", type: "risk", linked: false },
      { id: "p-journal", type: "journal", linked: false },
      { id: "p-accounts", type: "accounts", linked: false, broker: "lucid" },
      // Pinned to crude: futures quotes aren't on the free feeds, but its news is.
      { id: "p-news", type: "news", symbol: "CL=F", linked: false },
      { id: "p-calendar", type: "calendar", linked: false },
    ],
    layout: [
      { i: "p-signals", x: 0, y: 0, w: 7, h: 11 },
      { i: "p-risk", x: 7, y: 0, w: 5, h: 14 },
      { i: "p-journal", x: 0, y: 11, w: 7, h: 10 },
      { i: "p-accounts", x: 7, y: 14, w: 5, h: 7 },
      { i: "p-calendar", x: 0, y: 21, w: 7, h: 11 },
      { i: "p-news", x: 7, y: 21, w: 5, h: 11 },
    ],
  },
  crypto: {
    activeSymbol: "BTC",
    widgets: [
      { id: "p-chart", type: "chart", linked: true },
      { id: "p-crypto", type: "crypto", linked: false },
      { id: "p-accounts", type: "accounts", linked: false, broker: "hata" },
      { id: "p-news", type: "news", linked: false },
      { id: "p-journal", type: "journal", linked: false },
    ],
    layout: [
      { i: "p-chart", x: 0, y: 0, w: 7, h: 12 },
      { i: "p-crypto", x: 7, y: 0, w: 5, h: 12 },
      { i: "p-accounts", x: 0, y: 12, w: 7, h: 9 },
      { i: "p-news", x: 7, y: 12, w: 5, h: 9 },
      { i: "p-journal", x: 0, y: 21, w: 12, h: 9 },
    ],
  },
  stocks: {
    activeSymbol: "SPY",
    widgets: [
      { id: "p-chart", type: "chart", linked: true },
      { id: "p-quote", type: "quote", linked: true },
      { id: "p-watchlist", type: "watchlist", linked: false },
      { id: "p-accounts", type: "accounts", linked: false, broker: "moomoo" },
      { id: "p-news", type: "news", linked: true },
      { id: "p-journal", type: "journal", linked: false },
      { id: "p-heatmap", type: "heatmap", linked: false },
    ],
    layout: [
      { i: "p-chart", x: 0, y: 0, w: 7, h: 12 },
      { i: "p-quote", x: 7, y: 0, w: 5, h: 6 },
      { i: "p-watchlist", x: 7, y: 6, w: 5, h: 6 },
      { i: "p-accounts", x: 0, y: 12, w: 7, h: 10 },
      { i: "p-news", x: 7, y: 12, w: 5, h: 10 },
      { i: "p-journal", x: 0, y: 22, w: 7, h: 9 },
      { i: "p-heatmap", x: 7, y: 22, w: 5, h: 9 },
    ],
  },
};

export const useTerminal = create<TerminalState>()(
  persist(
    (set) => ({
      activeSymbol: "AAPL",
      widgets: DEFAULT_WIDGETS,
      layout: DEFAULT_LAYOUT,
      watchlist: ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "META", "SPY"],
      commandOpen: false,
      account: { balance: 50000, peakClose: 50000, sessionPnl: 0 },
      lastFloor: "futures",
      setLastFloor: (f) => set({ lastFloor: f }),
      floorView: "building",
      setFloorView: (v) => set({ floorView: v }),
      sound: false, // off until the user turns it on
      setSound: (on) => set({ sound: on }),
      setAccount: (a) => set((st) => ({ account: { ...st.account, ...a } })),
      setActiveSymbol: (s) => set({ activeSymbol: s.toUpperCase() }),
      setCommandOpen: (open) => set({ commandOpen: open }),
      addWidget: (type, symbol) =>
        set((st) => {
          const id = `w-${type}-${Date.now()}`;
          const size = SIZE_BY_TYPE[type];
          const maxY = st.layout.reduce((m, l) => Math.max(m, l.y + l.h), 0);
          return {
            widgets: [...st.widgets, { id, type, symbol, linked: !symbol }],
            layout: [...st.layout, { i: id, x: 0, y: maxY, ...size }],
          };
        }),
      removeWidget: (id) =>
        set((st) => ({
          widgets: st.widgets.filter((w) => w.id !== id),
          layout: st.layout.filter((l) => l.i !== id),
        })),
      setWidgetSymbol: (id, symbol) =>
        set((st) => ({
          widgets: st.widgets.map((w) => (w.id === id ? { ...w, symbol: symbol.toUpperCase(), linked: false } : w)),
        })),
      toggleLinked: (id) =>
        set((st) => ({
          widgets: st.widgets.map((w) => (w.id === id ? { ...w, linked: !w.linked } : w)),
        })),
      setLayout: (layout) => set({ layout }),
      addToWatchlist: (s) =>
        set((st) => ({
          watchlist: st.watchlist.includes(s.toUpperCase()) ? st.watchlist : [...st.watchlist, s.toUpperCase()],
        })),
      removeFromWatchlist: (s) => set((st) => ({ watchlist: st.watchlist.filter((x) => x !== s) })),
      resetWorkspace: () => set({ widgets: DEFAULT_WIDGETS, layout: DEFAULT_LAYOUT }),
      applyPreset: (name) =>
        set((st) => {
          const p = PRESETS[name];
          return { widgets: p.widgets, layout: p.layout, activeSymbol: p.activeSymbol ?? st.activeSymbol };
        }),
    }),
    { name: "openterminal-workspace" }
  )
);

/** Symbol a widget should display: its own, or the active one when linked. */
export function useWidgetSymbol(widget: WidgetInstance): string {
  const active = useTerminal((s) => s.activeSymbol);
  return widget.linked ? active : widget.symbol ?? active;
}

"use client";

import { useTerminal, type PresetName, type WidgetType } from "../store/terminal";

type Item = { type: WidgetType; label: string; icon: string; key?: string };

// Grouped by what a trader is doing, not alphabetically.
const GROUPS: Array<{ title: string; items: Item[] }> = [
  {
    title: "Trading",
    items: [
      { type: "signals", label: "CL Signals", icon: "◎" },
      { type: "risk", label: "LucidFlex Risk", icon: "⛨" },
      { type: "journal", label: "Trade Journal", icon: "✎" },
      { type: "accounts", label: "Broker Accounts", icon: "⚿" },
      { type: "portfolio", label: "Portfolio", icon: "◫", key: "⌥8" },
    ],
  },
  {
    title: "Markets",
    items: [
      { type: "chart", label: "Chart", icon: "⌇", key: "⌥1" },
      { type: "quote", label: "Quote", icon: "$", key: "⌥2" },
      { type: "watchlist", label: "Watchlist", icon: "☰" },
      { type: "screener", label: "Screener", icon: "⧩", key: "⌥4" },
      { type: "heatmap", label: "Heatmap", icon: "▦", key: "⌥5" },
      { type: "options", label: "Options", icon: "⊞", key: "⌥7" },
      { type: "crypto", label: "Crypto", icon: "₿", key: "⌥6" },
    ],
  },
  {
    title: "Research",
    items: [
      { type: "news", label: "News", icon: "▤", key: "⌥3" },
      { type: "calendar", label: "Calendar", icon: "◷" },
      { type: "macro", label: "Macro", icon: "∿" },
      { type: "recap", label: "Market Recap", icon: "≡" },
      { type: "insider", label: "Insider", icon: "◉" },
      { type: "tv", label: "Live TV", icon: "▶" },
      { type: "ai", label: "AI Assist", icon: "✦", key: "⌥9" },
    ],
  },
];

const PRESETS: Array<{ name: PresetName; label: string; icon: string }> = [
  { name: "futures", label: "Futures", icon: "🛢" },
  { name: "crypto", label: "Crypto", icon: "₿" },
  { name: "stocks", label: "Stocks", icon: "📈" },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="dim px-3 pt-4 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]">{children}</div>;
}

export default function Sidebar() {
  const addWidget = useTerminal((s) => s.addWidget);
  const resetWorkspace = useTerminal((s) => s.resetWorkspace);
  const applyPreset = useTerminal((s) => s.applyPreset);

  return (
    <nav className="w-48 bg-[var(--panel)] border-r border-[var(--border)] flex flex-col shrink-0 overflow-y-auto">
      <SectionTitle>Workspace</SectionTitle>
      <div className="grid grid-cols-3 gap-1 px-2">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            onClick={() => applyPreset(p.name)}
            title={`Switch to the ${p.label.toLowerCase()} layout`}
            className="flex flex-col items-center gap-0.5 py-2 rounded-lg bg-[var(--panel-2)] border border-[var(--border)] hover:border-[var(--amber)] hover:bg-[var(--accent-soft)] transition-colors"
          >
            <span className="text-[14px] leading-none">{p.icon}</span>
            <span className="text-[10px] font-medium">{p.label}</span>
          </button>
        ))}
      </div>

      {GROUPS.map((g) => (
        <div key={g.title}>
          <SectionTitle>{g.title}</SectionTitle>
          <div className="px-2 flex flex-col">
            {g.items.map((item) => (
              <button
                key={item.type}
                onClick={() => addWidget(item.type)}
                title={`Add ${item.label}`}
                className="group flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[12px] text-left hover:bg-[var(--panel-3)] transition-colors"
              >
                <span className="w-4 text-center dim group-hover:text-[var(--amber)]">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.key && <span className="dim text-[10px] opacity-0 group-hover:opacity-100">{item.key}</span>}
                <span className="dim opacity-0 group-hover:opacity-100">+</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="mt-auto p-2 pt-4">
        <button
          onClick={resetWorkspace}
          className="w-full px-2 py-1.5 rounded-md text-[11px] dim hover:text-[var(--down)] hover:bg-[var(--down-soft)] transition-colors"
        >
          Reset layout
        </button>
      </div>
    </nav>
  );
}

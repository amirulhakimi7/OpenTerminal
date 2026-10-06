"use client";

import { useEffect, useRef, useState } from "react";
import GridLayout, { WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useTerminal, type WidgetInstance } from "../store/terminal";
import { BROKER_TITLES, TITLES, WidgetBody } from "./WidgetBody";
import FloorWidget from "./floor/FloorWidget";

const Grid = WidthProvider(GridLayout);

function SymbolTag({ widget, activeSymbol }: { widget: WidgetInstance; activeSymbol: string }) {
  const setWidgetSymbol = useTerminal((s) => s.setWidgetSymbol);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = widget.linked ? activeSymbol : widget.symbol ?? activeSymbol;

  useEffect(() => {
    if (!editing) return;
    setDraft(shown);
    requestAnimationFrame(() => inputRef.current?.select());
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value.toUpperCase())}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const v = draft.trim();
            if (v) setWidgetSymbol(widget.id, v);
            setEditing(false);
          }
          if (e.key === "Escape") setEditing(false);
        }}
        onBlur={() => setEditing(false)}
        className="ml-2 w-16 !border-0 !border-b !border-[var(--amber-dim)] bg-transparent text-[var(--text)] px-0 py-0 text-[13px] leading-none"
      />
    );
  }

  return (
    <span
      className="ml-2 text-[var(--text)] cursor-pointer hover:text-[var(--amber)]"
      title="Click to set this widget's ticker"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => setEditing(true)}
    >
      {shown}
    </span>
  );
}

export default function Workspace() {
  const widgets = useTerminal((s) => s.widgets);
  const layout = useTerminal((s) => s.layout);
  const setLayout = useTerminal((s) => s.setLayout);
  const removeWidget = useTerminal((s) => s.removeWidget);
  const toggleLinked = useTerminal((s) => s.toggleLinked);
  const activeSymbol = useTerminal((s) => s.activeSymbol);

  const symbolAware = new Set(["quote", "chart", "news", "options", "insider"]);

  // Below this width a 12-column grid squeezes every widget unreadably narrow,
  // so stack them in one column, top-to-bottom in desktop order. The stacked
  // arrangement is never saved: the desktop layout survives a narrow window.
  const NARROW_PX = 900;
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const update = () => setNarrow(window.innerWidth < NARROW_PX);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const shownLayout = narrow
    ? [...layout]
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .reduce<{ items: typeof layout; y: number }>(
          (acc, l) => ({ items: [...acc.items, { ...l, x: 0, y: acc.y, w: 1 }], y: acc.y + l.h }),
          { items: [], y: 0 }
        ).items
    : layout;

  const panel = (w: (typeof widgets)[number], extra?: React.ReactNode) => (
    <div className="terminal-panel">
      <div className="panel-title">
        <span>
          {TITLES[w.type]}
          {w.type === "accounts" && w.broker && <span className="dim ml-1.5">· {BROKER_TITLES[w.broker]}</span>}
          {symbolAware.has(w.type) && <SymbolTag widget={w} activeSymbol={activeSymbol} />}
        </span>
        <span className="flex gap-2 items-center">
          {extra}
          {symbolAware.has(w.type) && (
            <button
              title={w.linked ? "Linked to active symbol (click to unlink)" : "Unlinked (click to link)"}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => toggleLinked(w.id)}
              className={w.linked ? "text-[var(--amber)]" : "dim"}
            >
              ⛓
            </button>
          )}
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => removeWidget(w.id)}
            className="dim hover:text-[var(--down)]"
          >
            ✕
          </button>
        </span>
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        {w.type === "floor" ? <FloorWidget widget={w} /> : <WidgetBody widget={w} />}
      </div>
    </div>
  );

  // The trading floor on its own (the Floor preset) fills exactly the visible
  // workspace, so the whole building — street and cars included — fits on screen.
  const solo = widgets.length === 1 && widgets[0].type === "floor" ? widgets[0] : null;
  const soloRef = useRef<HTMLDivElement>(null);
  if (solo) {
    return (
      <div ref={soloRef} className="h-full p-3 bg-[var(--bg)]">
        {panel(
          solo,
          <button
            title="Full screen (Esc to leave)"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void soloRef.current?.requestFullscreen();
            }}
            className="dim hover:text-[var(--amber)]"
          >
            ⛶
          </button>
        )}
      </div>
    );
  }

  return (
    <Grid
      key={narrow ? "narrow" : "wide"}
      className="layout"
      layout={shownLayout}
      cols={narrow ? 1 : 12}
      isDraggable={!narrow}
      isResizable={!narrow}
      rowHeight={30}
      margin={[10, 10]}
      containerPadding={[12, 12]}
      draggableHandle=".panel-title"
      onLayoutChange={(l) => {
        if (!narrow) setLayout(l.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })));
      }}
    >
      {widgets.map((w) => (
        <div key={w.id}>
          {panel(w)}
        </div>
      ))}
    </Grid>
  );
}

// What each desk's monitors show, drawn live every frame. The middle monitor
// shows the job (code for a quant, a gauge for risk, a newsroom for broadcast);
// the side ones carry a chart line. Events take every screen over for a while.
// Pictures only: no numbers are drawn here, the real ones live in bubbles.

import { px } from "./furniture";
import type { Station } from "./roster";
import type { ScreenMode } from "./sim";

type Ctx = CanvasRenderingContext2D;
type R = { x: number; y: number; w: number; h: number };

export const OFF = "#0b0f16";
const BG = "#07101d";
const UP = "#22c55e";
const DOWN = "#ef4444";

const hash = (a: number, b: number) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** A screen with a live chart line moving across it; `OFF` when nobody's there. */
export function chartLine(ctx: Ctx, r: R, color: string, t: number, seed: number) {
  const { x, y, w, h } = r;
  if (color === OFF) {
    px(ctx, x, y, w, h, OFF);
    px(ctx, x, y, w, 1, "#161c27");
    return;
  }
  px(ctx, x, y, w, h, BG);
  px(ctx, x, y + Math.floor(h / 2), w, 1, "rgba(148,163,184,0.12)");
  ctx.fillStyle = color;
  for (let i = 0; i < w; i++) {
    const v = Math.sin(t * 1.6 + i * 0.8 + seed) * 0.35 + Math.sin(i * 0.31 + seed * 1.7 + t * 0.4) * 0.15 + 0.5;
    const yy = y + Math.round((1 - v) * (h - 1));
    ctx.fillRect(x + i, yy, 1, 1);
    ctx.globalAlpha = 0.25;
    ctx.fillRect(x + i, yy + 1, 1, y + h - yy - 1);
    ctx.globalAlpha = 1;
  }
}

function candles(ctx: Ctx, r: R, t: number, seed: number, ma: boolean) {
  px(ctx, r.x, r.y, r.w, r.h, BG);
  const n = Math.floor(r.w / 3);
  const tick = Math.floor(t / 1.5);
  let prev = 0.5;
  for (let i = 0; i < n; i++) {
    const v = Math.min(0.95, Math.max(0.05, 0.5 + Math.sin((i + tick) * 0.9 + seed) * 0.3));
    const up = v >= prev;
    const top = r.y + Math.round((1 - Math.max(v, prev)) * (r.h - 1));
    const bot = r.y + Math.round((1 - Math.min(v, prev)) * (r.h - 1));
    px(ctx, r.x + i * 3 + 1, top - 1, 1, bot - top + 3, "#475569"); // wick
    px(ctx, r.x + i * 3, top, 2, Math.max(1, bot - top + 1), up ? UP : DOWN);
    prev = v;
  }
  if (ma) for (let i = 0; i < r.w; i++) px(ctx, r.x + i, r.y + Math.round(r.h / 2 + Math.sin(i * 0.4 + tick * 0.3) * 1.2), 1, 1, "#facc15");
}

function code(ctx: Ctx, r: R, t: number, seed: number) {
  px(ctx, r.x, r.y, r.w, r.h, "#0b1020");
  const scroll = Math.floor(t * 2);
  const palette = ["#a78bfa", "#4ade80", "#38bdf8", "#f472b6", "#e2e8f0"];
  for (let row = 0; row < Math.floor(r.h / 2); row++) {
    const line = scroll + row;
    let x = r.x + 1 + (hash(line, seed) < 0.4 ? 2 : 0); // indentation
    while (x < r.x + r.w - 1) {
      const len = 1 + Math.floor(hash(line, x + seed) * 4);
      const end = Math.min(x + len, r.x + r.w - 1);
      px(ctx, x, r.y + 1 + row * 2, end - x, 1, palette[Math.floor(hash(x, line) * palette.length)]);
      x = end + 1;
      if (hash(line * 3, x) < 0.25) break;
    }
  }
}

function heatmap(ctx: Ctx, r: R, t: number, seed: number, hot: boolean) {
  const cols = 4;
  const rows = 2;
  const cw = Math.floor(r.w / cols);
  const ch = Math.floor(r.h / rows);
  const tick = Math.floor(t / 2);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const v = hash(i + j * cols + tick, seed);
      const flash = hot && i === tick % cols && j === 0 && Math.floor(t * 4) % 2 === 0;
      px(ctx, r.x + i * cw, r.y + j * ch, cw - 1, ch - 1, flash ? "#22d3ee" : v > 0.5 ? (v > 0.8 ? "#16a34a" : "#14532d") : v < 0.2 ? "#b91c1c" : "#7f1d1d");
    }
}

function quoteGrid(ctx: Ctx, r: R, t: number, seed: number) {
  px(ctx, r.x, r.y, r.w, r.h, BG);
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 2; i++) {
      const v = hash(Math.floor(t * 1.5) + i, j + seed);
      px(ctx, r.x + 1 + i * 6, r.y + 1 + j * 2, 4, 1, v > 0.55 ? UP : v < 0.3 ? DOWN : "#64748b");
    }
}

function newsroom(ctx: Ctx, r: R, t: number, header: string) {
  px(ctx, r.x, r.y, r.w, r.h, "#e2e8f0");
  px(ctx, r.x, r.y, r.w, 2, header);
  const shift = Math.floor(t / 2) % 3;
  for (let i = 0; i < 2; i++) {
    px(ctx, r.x + 1, r.y + 3 + i * 2, 3, 1, "#334155");
    px(ctx, r.x + 5, r.y + 3 + i * 2, r.w - 6 - ((i + shift) % 3), 1, "#94a3b8");
  }
}

function bars(ctx: Ctx, r: R, t: number, seed: number) {
  px(ctx, r.x, r.y, r.w, r.h, BG);
  for (let i = 0; i < 4; i++) {
    const h = 1 + Math.floor((Math.sin(i * 1.3 + seed + t * 0.3) * 0.5 + 0.5) * (r.h - 2));
    px(ctx, r.x + 1 + i * 3, r.y + r.h - h, 2, h, i === 3 ? "#fbbf24" : "#60a5fa");
  }
}

function tv(ctx: Ctx, r: R, t: number, live: boolean) {
  px(ctx, r.x, r.y, r.w, r.h, "#1e3a8a");
  px(ctx, r.x, r.y + r.h - 2, r.w, 2, live && Math.floor(t * 3) % 2 ? "#dc2626" : "#b91c1c"); // lower third
  px(ctx, r.x + 5, r.y + 1, 2, 2, "#e0ac69"); // anchor
  px(ctx, r.x + 4, r.y + 3, 4, 2, "#111827");
  px(ctx, r.x + 9, r.y + 1, 2, 2, "#60a5fa"); // studio graphic
}

function portfolio(ctx: Ctx, r: R, up: boolean) {
  px(ctx, r.x, r.y, r.w, r.h, BG);
  // Allocation pie, 5x5.
  const pie = ["..aa.", ".aabb", "ccabb", "cccbb", ".ccb."];
  const cols: Record<string, string> = { a: "#38bdf8", b: "#a78bfa", c: "#f59e0b" };
  pie.forEach((row, j) => [...row].forEach((ch, i) => ch !== "." && px(ctx, r.x + 1 + i, r.y + 1 + j, 1, 1, cols[ch])));
  for (let i = 0; i < 5; i++) px(ctx, r.x + 7 + i, r.y + (up ? 5 - i : 1 + i), 1, 1, up ? UP : DOWN); // P&L line
}

function gauge(ctx: Ctx, r: R, t: number, alarm: boolean) {
  px(ctx, r.x, r.y, r.w, r.h, alarm && Math.floor(t * 3) % 2 ? "#3f0b0b" : BG);
  const fill = alarm ? r.w - 2 : Math.round((r.w - 2) * 0.35);
  px(ctx, r.x + 1, r.y + 2, r.w - 2, 3, "#1f2937");
  px(ctx, r.x + 1, r.y + 2, fill, 3, alarm ? DOWN : UP);
  px(ctx, r.x + 1 + Math.round((r.w - 3) * 0.75), r.y + 1, 1, 5, "#f8fafc"); // the limit
}

function brokers(ctx: Ctx, r: R, t: number, linked: boolean) {
  px(ctx, r.x, r.y, r.w, r.h, BG);
  for (let i = 0; i < 3; i++) {
    const on = i === 0 ? linked : false;
    px(ctx, r.x + 1, r.y + 1 + i * 2, 1, 1, on ? (Math.floor(t * 2) % 4 ? UP : "#14532d") : "#475569");
    px(ctx, r.x + 3, r.y + 1 + i * 2, r.w - 5 - i, 1, "#334155");
  }
}

function ticket(ctx: Ctx, r: R, t: number, seed: number) {
  chartLine(ctx, { ...r, w: r.w - 4 }, "#38bdf8", t, seed);
  px(ctx, r.x + r.w - 4, r.y, 4, r.h, "#e2e8f0"); // blank ticket: a person fills it in
  px(ctx, r.x + r.w - 3, r.y + 2, 2, 1, "#94a3b8");
  px(ctx, r.x + r.w - 3, r.y + 4, 2, 1, "#94a3b8");
}

export type ScreenCtx = { t: number; alarm: boolean; riskAlarm: boolean; pnlUp: boolean; brokerLinked: boolean; moverHot: boolean };

/** The middle monitor: a picture of the job. */
export function stationScreen(ctx: Ctx, r: R, station: Station, seed: number, s: ScreenCtx) {
  const { t } = s;
  switch (station) {
    case "quant": return code(ctx, r, t, seed);
    case "strategy": return candles(ctx, r, t, seed, false);
    case "chart": return candles(ctx, r, t, seed, true);
    case "data": return quoteGrid(ctx, r, t, seed);
    case "monitor": return heatmap(ctx, r, t, seed, s.moverHot);
    case "news": return newsroom(ctx, r, t, "#dc2626");
    case "research": return newsroom(ctx, r, t, "#1d4ed8");
    case "macro": return bars(ctx, r, t, seed);
    case "broadcast": return tv(ctx, r, t, false);
    case "portfolio": return portfolio(ctx, r, s.pnlUp);
    case "risk": return gauge(ctx, r, t, s.riskAlarm);
    case "broker": return brokers(ctx, r, t, s.brokerLinked);
    case "trade": return ticket(ctx, r, t, seed);
  }
}

/** Every screen on the desk taken over by an event. */
export function overrideScreen(ctx: Ctx, r: R, mode: ScreenMode, t: number, k: number, label: string | null) {
  const blink = Math.floor(t * 4 + k) % 2 === 0;
  switch (mode) {
    case "setup": {
      const down = label === "SHORT";
      px(ctx, r.x, r.y, r.w, r.h, down ? "#3f0b0b" : "#052e16");
      const c = down ? DOWN : UP;
      const cx = r.x + Math.floor(r.w / 2);
      // A big arrow the way the setup points.
      for (let i = 0; i < 3; i++) px(ctx, cx - i, down ? r.y + 4 - i : r.y + 2 + i, i * 2 + 1, 1, c);
      px(ctx, cx, down ? r.y + 1 : r.y + 4, 1, 2, c);
      break;
    }
    case "risk":
      px(ctx, r.x, r.y, r.w, r.h, blink ? "#7f1d1d" : "#450a0a");
      px(ctx, r.x + 2, r.y + 3, r.w - 4, 1, "#fecaca");
      break;
    case "breaking":
      px(ctx, r.x, r.y, r.w, r.h, "#111827");
      px(ctx, r.x, r.y + 1, r.w, 2, blink ? "#dc2626" : "#facc15");
      px(ctx, r.x + 1, r.y + 4, r.w - 3, 1, "#e5e7eb");
      break;
    case "alert":
      px(ctx, r.x, r.y, r.w, r.h, BG);
      if (blink) {
        px(ctx, r.x, r.y, r.w, 1, "#22d3ee");
        px(ctx, r.x, r.y + r.h - 1, r.w, 1, "#22d3ee");
        px(ctx, r.x, r.y, 1, r.h, "#22d3ee");
        px(ctx, r.x + r.w - 1, r.y, 1, r.h, "#22d3ee");
      }
      px(ctx, r.x + 5, r.y + 1, 2, 3, "#22d3ee");
      px(ctx, r.x + 5, r.y + 5, 2, 1, "#22d3ee");
      break;
  }
}

// Kimi Tower, from the street: sky by local time of day, a city skyline,
// the tower with its three trading floors lit by real activity, an elevator,
// a neon sign and traffic. Pixel world is 320x200; text goes in the overlay.

import { FLOORS, FLOOR_ORDER, type FloorId } from "./floors";
import { mulberry32 } from "./sim";

export const B_W = 320;
export const B_H = 200;

// Right of centre, leaving the left side for the floor labels.
const TOWER = { x: 184, w: 104 };
const GROUND = 178;
/** Each trading floor's band on the facade (world px). 1F at the bottom. */
export const FLOOR_BAND: Record<FloorId, { y0: number; y1: number; level: number }> = {
  futures: { y0: 66, y1: 94, level: 3 },
  crypto: { y0: 96, y1: 124, level: 2 },
  equity: { y0: 126, y1: 154, level: 1 },
};
const SHAFT = { x: TOWER.x + TOWER.w - 12, w: 9 };

export type FloorStatus = { id: FloorId; open: boolean | null; onDuty: number };
export type BuildingState = { t: number; hover: FloorId | null; carY: number };

/** Elevator car's resting y for a floor. */
export const carYFor = (f: FloorId) => FLOOR_BAND[f].y1 - 11;

type Sky = { top: string; bottom: string; night: boolean; sun: { x: number; y: number; c: string } | null };

/** Sky for an hour of the local day (0-24, fractional). */
export function skyFor(hour: number): Sky {
  if (hour < 5 || hour >= 20) return { top: "#050816", bottom: "#151b3d", night: true, sun: { x: 64, y: 26, c: "#e2e8f0" } };
  if (hour < 7) return { top: "#2b2350", bottom: "#f59e5b", night: false, sun: { x: 40 + (hour - 5) * 30, y: 120 - (hour - 5) * 25, c: "#fde68a" } };
  if (hour < 17) return { top: "#1d4ed8", bottom: "#93c5fd", night: false, sun: { x: 60 + ((hour - 7) / 10) * 200, y: 40 - Math.sin(((hour - 7) / 10) * Math.PI) * 18, c: "#fef3c7" } };
  return { top: "#312e81", bottom: "#f97316", night: false, sun: { x: 250 + (hour - 17) * 15, y: 70 + (hour - 17) * 25, c: "#fb923c" } };
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

// The skyline is fixed per session; generate it once.
const rng = mulberry32(2024);
const SKYLINE = Array.from({ length: 2 }, (_, layer) =>
  Array.from({ length: 18 }, (_, i) => ({
    x: i * 19 + Math.floor(rng() * 8) - 6 + layer * 9,
    w: 14 + Math.floor(rng() * 14),
    h: (layer ? 50 : 80) + Math.floor(rng() * (layer ? 50 : 60)),
    seed: Math.floor(rng() * 1000),
  }))
);
const STARS = Array.from({ length: 60 }, () => ({ x: Math.floor(rng() * B_W), y: Math.floor(rng() * 90), p: rng() * 6 }));

export function drawBuilding(ctx: CanvasRenderingContext2D, st: BuildingState, floors: FloorStatus[], hour: number) {
  const sky = skyFor(hour);
  const t = st.t;
  ctx.imageSmoothingEnabled = false;

  // Sky, in pixel bands rather than a smooth gradient.
  const bands = 12;
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = mix(sky.top, sky.bottom, i / (bands - 1));
    ctx.fillRect(0, Math.floor((i * GROUND) / bands), B_W, Math.ceil(GROUND / bands) + 1);
  }
  if (sky.night) for (const s of STARS) if (Math.sin(t * 2 + s.p) > -0.6) px(ctx, s.x, s.y, 1, 1, "#e2e8f0");
  if (sky.sun) {
    for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) if (x * x + y * y <= 36) px(ctx, sky.sun.x + x, sky.sun.y + y, 1, 1, sky.sun.c);
    if (sky.night) for (let y = -6; y <= 6; y++) for (let x = -3; x <= 6; x++) if ((x - 3) * (x - 3) + y * y <= 26) px(ctx, sky.sun.x + x, sky.sun.y + y, 1, 1, sky.top); // crescent
  }

  // City skyline, two layers, windows lit after dark.
  SKYLINE.forEach((layer, li) => {
    const body = li === 0 ? (sky.night ? "#0b1024" : "#4b5a7a") : sky.night ? "#121a33" : "#344263";
    for (const b of layer) {
      if (b.x + b.w > TOWER.x - 4 && b.x < TOWER.x + TOWER.w + 4 && li === 1) continue; // keep the tower clear
      px(ctx, b.x, GROUND - b.h, b.w, b.h, body);
      const r = mulberry32(b.seed);
      for (let y = GROUND - b.h + 4; y < GROUND - 4; y += 5) {
        for (let x = b.x + 2; x < b.x + b.w - 2; x += 4) {
          const lit = sky.night ? r() < 0.45 : r() < 0.08;
          if (lit) px(ctx, x, y, 2, 2, sky.night ? (r() < 0.8 ? "#fcd34d" : "#93c5fd") : "#cbd5e1");
        }
      }
    }
  });

  // The tower.
  const top = 42;
  px(ctx, TOWER.x, top, TOWER.w, GROUND - top, "#1b2234");
  px(ctx, TOWER.x, top, 3, GROUND - top, "#2b3550"); // light edge
  px(ctx, TOWER.x + TOWER.w - 3, top, 3, GROUND - top, "#11172a"); // shadow edge
  // Upper office floors: mostly dark glass with a few lights.
  const office = mulberry32(7);
  for (let y = top + 4; y < FLOOR_BAND.futures.y0 - 2; y += 6) {
    for (let x = TOWER.x + 6; x < SHAFT.x - 3; x += 6) {
      px(ctx, x, y, 4, 4, office() < (sky.night ? 0.18 : 0.05) ? "#fcd34d" : sky.night ? "#0b1220" : "#2f4a6e");
    }
  }
  // Rooftop: antenna with a blinking aircraft light.
  px(ctx, TOWER.x + TOWER.w / 2 - 1, top - 16, 2, 16, "#475569");
  if (Math.floor(t * 1.2) % 2 === 0) px(ctx, TOWER.x + TOWER.w / 2 - 2, top - 19, 4, 3, "#ef4444");
  px(ctx, TOWER.x + 10, top - 12, TOWER.w - 20, 10, "#0a0e1a"); // neon sign backing; text in overlay

  // The three trading floors.
  for (const f of floors) {
    const band = FLOOR_BAND[f.id];
    const theme = FLOORS[f.id];
    const h = band.y1 - band.y0;
    const lit = f.open !== false;
    px(ctx, TOWER.x + 3, band.y0 - 1, TOWER.w - 6, 1, theme.accent); // accent slab
    px(ctx, TOWER.x + 4, band.y0, SHAFT.x - TOWER.x - 6, h, lit ? "#2a2414" : "#0b1120");
    // warm interior light
    if (lit) {
      ctx.fillStyle = sky.night ? "rgba(253,224,138,0.32)" : "rgba(253,224,138,0.18)";
      ctx.fillRect(TOWER.x + 4, band.y0, SHAFT.x - TOWER.x - 6, h);
    }
    // monitors along the desks
    for (let x = TOWER.x + 8; x < SHAFT.x - 6; x += 7) {
      const on = lit || x < TOWER.x + 16; // after hours only the night watch's screens stay on
      px(ctx, x, band.y1 - 9, 4, 3, on ? (Math.floor(t * 2 + x) % 3 ? "#38bdf8" : "#22c55e") : "#111827");
      px(ctx, x - 1, band.y1 - 6, 6, 2, "#3e3128");
    }
    // people: silhouettes pacing, as many as are on that floor
    const people = Math.min(18, f.onDuty);
    const r = mulberry32(band.level * 99);
    for (let i = 0; i < people; i++) {
      const span = SHAFT.x - TOWER.x - 18;
      const base = r() * span;
      const speed = 6 + r() * 14;
      const x = TOWER.x + 8 + ((base + Math.sin(t * (speed / 40) + i) * 10 + span) % span);
      px(ctx, x, band.y1 - 15, 2, 2, "#e8c39e"); // head
      px(ctx, x - 1, band.y1 - 13, 4, 5, i % 3 === 0 ? theme.accent : "#1f2937"); // body
    }
    // window mullions and glass glare
    for (let x = TOWER.x + 4; x < SHAFT.x - 2; x += 13) px(ctx, x, band.y0, 1, h, "#0f172a");
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(TOWER.x + 6, band.y0 + 2, 18, 3);
    if (st.hover === f.id) {
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(TOWER.x + 3.5, band.y0 - 0.5, TOWER.w - 7, h + 1);
    }
  }

  // Elevator shaft and car.
  px(ctx, SHAFT.x, top + 2, SHAFT.w, GROUND - top - 2, "#0d1322");
  px(ctx, SHAFT.x + 4, top + 2, 1, GROUND - top - 2, "#334155"); // cable
  px(ctx, SHAFT.x + 1, st.carY, SHAFT.w - 2, 10, "#cbd5e1");
  px(ctx, SHAFT.x + 2, st.carY + 2, SHAFT.w - 4, 6, "#fde68a");

  // Lobby.
  px(ctx, TOWER.x, GROUND - 22, TOWER.w, 22, "#0f1626");
  px(ctx, TOWER.x + 30, GROUND - 16, 44, 16, sky.night ? "#fde68a" : "#94a3b8");
  px(ctx, TOWER.x + 51, GROUND - 16, 2, 16, "#1f2937");
  px(ctx, TOWER.x + 20, GROUND - 22, TOWER.w - 40, 3, "#d4a73a"); // canopy

  // Street, lamps and traffic.
  px(ctx, 0, GROUND, B_W, B_H - GROUND, "#1a1d24");
  px(ctx, 0, GROUND, B_W, 2, "#3f4652");
  for (let x = 0; x < B_W; x += 16) px(ctx, x + ((t * 8) % 16), GROUND + 12, 7, 1, "#e2e8f0");
  for (let x = 20; x < B_W; x += 60) {
    px(ctx, x, GROUND - 18, 1, 18, "#475569");
    px(ctx, x - 2, GROUND - 19, 5, 2, sky.night ? "#fde68a" : "#94a3b8");
    if (sky.night) {
      ctx.fillStyle = "rgba(253,224,138,0.12)";
      ctx.fillRect(x - 8, GROUND - 17, 17, 17);
    }
  }
  // 2026-spec F1 cars racing down the street, both directions.
  for (const c of F1_GRID) {
    const span = B_W + 70;
    const x = (((c.off + t * c.speed) % span) + span) % span - 35;
    drawF1(ctx, x, c.lane, c.speed > 0 ? 1 : -1, c.livery, t, sky.night);
  }
}

type Livery = { body: string; accent: string; helmet: string };

// Generic colour schemes, not any real team's livery; the amber one is Kimi's.
const LIVERY: Record<string, Livery> = {
  kimi: { body: "#f5a524", accent: "#111827", helmet: "#f8fafc" },
  papaya: { body: "#ff7a1a", accent: "#1e3a8a", helmet: "#facc15" },
  rosso: { body: "#d90429", accent: "#fde047", helmet: "#fde047" },
  silver: { body: "#c7ced6", accent: "#0f766e", helmet: "#0f172a" },
  navy: { body: "#1e2a78", accent: "#ef4444", helmet: "#f8fafc" },
  racing: { body: "#0b5d3b", accent: "#a3e635", helmet: "#f8fafc" },
};

const F1_GRID = [
  { lane: GROUND + 3, speed: 70, livery: LIVERY.kimi, off: 0 },
  { lane: GROUND + 3, speed: 70, livery: LIVERY.papaya, off: 95 },
  { lane: GROUND + 3, speed: 70, livery: LIVERY.rosso, off: 210 },
  { lane: GROUND + 13, speed: -60, livery: LIVERY.silver, off: 40 },
  { lane: GROUND + 13, speed: -60, livery: LIVERY.navy, off: 170 },
  { lane: GROUND + 13, speed: -60, livery: LIVERY.racing, off: 290 },
];

/**
 * A 2026-regulation F1 car in side view, 30x8 px, nose toward `dir`: long and
 * low, halo over the cockpit, slim pointed nose, and an active-aero rear wing
 * that opens flat on the straight and closes for the corner.
 */
function drawF1(ctx: CanvasRenderingContext2D, x: number, y: number, dir: 1 | -1, l: Livery, t: number, night: boolean) {
  const L = 30;
  const p = (i: number, j: number, w: number, h: number, c: string) =>
    px(ctx, dir === 1 ? x + i : x + L - 1 - i - (w - 1), y + j, w, h, c);
  const open = Math.floor(t * 0.7 + x * 0.01) % 2 === 0; // active aero: straight-line mode

  // Speed streaks behind the car.
  ctx.fillStyle = "rgba(226,232,240,0.22)";
  for (const [dx, dy, len] of [[-3, 2, 8], [-6, 4, 12], [-2, 6, 6]]) {
    ctx.fillRect(Math.round(dir === 1 ? x + dx - len : x + L - 1 - dx), y + dy, len, 1);
  }
  // Rear wing: endplate, main plane, flap (lifts flat when open).
  p(0, 0, 1, 5, l.accent);
  p(0, 0, 5, 1, l.body);
  p(1, open ? 1 : 2, 4, 1, l.accent);
  // Engine cover, airbox, sidepod, floor.
  p(5, 3, 11, 2, l.body);
  p(12, 1, 3, 2, l.body);
  p(6, 5, 16, 1, l.body);
  p(7, 4, 8, 1, l.accent); // livery stripe
  p(6, 6, 16, 1, "#0b0d12"); // floor / plank
  // Cockpit: helmet under the halo.
  p(16, 2, 2, 2, l.helmet);
  p(15, 1, 4, 1, "#0f172a");
  p(18, 2, 1, 2, "#0f172a");
  // Slim nose and front wing.
  p(19, 4, 8, 1, l.body);
  p(26, 5, 3, 1, l.body);
  p(23, 6, 7, 1, l.accent);
  p(29, 5, 1, 2, l.accent); // front endplate
  // Wheels, spinning.
  const spoke = Math.floor(t * 30) % 2;
  for (const wx of [2, 21]) {
    p(wx, 3, 5, 5, "#0b0d12");
    p(wx + 1, 4, 3, 3, "#1f2937");
    p(wx + 2, spoke ? 4 : 5, 1, spoke ? 3 : 1, "#9ca3af");
    if (!spoke) p(wx + 1, 5, 3, 1, "#9ca3af");
  }
  // Rain light, blinking at the back after dark.
  if (night && Math.floor(t * 4) % 2 === 0) p(0, 3, 1, 1, "#ef4444");
}

/** Which trading floor is under a world point, if any. */
export function floorAtPoint(x: number, y: number): FloorId | null {
  if (x < TOWER.x || x > TOWER.x + TOWER.w) return null;
  return FLOOR_ORDER.find((f) => y >= FLOOR_BAND[f].y0 && y <= FLOOR_BAND[f].y1) ?? null;
}

export type BView = { scale: number; ox: number; oy: number; pixel: string; vt: string };

export function drawBuildingOverlay(ctx: CanvasRenderingContext2D, v: BView, st: BuildingState, floors: FloorStatus[]) {
  const s = v.scale;
  const fs = (n: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, n * s)));
  ctx.textBaseline = "middle";

  // Neon sign.
  const flicker = Math.sin(st.t * 37) > 0.97 ? 0.4 : 1;
  ctx.save();
  ctx.globalAlpha = flicker;
  ctx.font = `${fs(6.5, 12, 30)}px ${v.pixel}`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#fde68a";
  ctx.shadowColor = "#f5a524";
  ctx.shadowBlur = 16;
  ctx.fillText("KIMI TOWER", v.ox + (TOWER.x + TOWER.w / 2) * s, v.oy + 35 * s);
  ctx.restore();

  // Floor labels to the left of the tower, with live status.
  for (const f of floors) {
    const band = FLOOR_BAND[f.id];
    const theme = FLOORS[f.id];
    const y = v.oy + ((band.y0 + band.y1) / 2) * s;
    const right = v.ox + (TOWER.x - 6) * s;
    const status = f.open === null ? "…" : f.open ? (f.id === "crypto" ? "OPEN 24/7" : "OPEN") : "CLOSED";
    const line1 = `${band.level}F ${theme.label.toUpperCase()} · ${status}`;
    const line2 = `${theme.company} · ${f.onDuty} on floor`;
    // Dark plate behind the label so the skyline doesn't eat the text.
    ctx.font = `${fs(6, 13, 22)}px ${v.vt}`;
    const w2 = ctx.measureText(line2).width;
    ctx.font = `${fs(5.5, 11, 20)}px ${v.pixel}`;
    const w1 = ctx.measureText(line1).width;
    const pw = Math.max(w1, w2) + 16;
    const ph = fs(4, 7, 13) * 2 + fs(6, 13, 22) + 8;
    ctx.fillStyle = st.hover === f.id ? "rgba(3,6,12,0.92)" : "rgba(3,6,12,0.78)";
    ctx.fillRect(right - pw + 8, y - ph / 2, pw, ph);
    ctx.fillStyle = theme.accent;
    ctx.fillRect(right + 6, y - ph / 2, 2, ph);
    ctx.textAlign = "right";
    ctx.font = `${fs(5.5, 11, 20)}px ${v.pixel}`;
    ctx.fillStyle = st.hover === f.id ? "#ffffff" : theme.accent;
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = st.hover === f.id ? 12 : 4;
    ctx.fillText(line1, right, y - fs(4, 7, 13));
    ctx.shadowBlur = 0;
    ctx.font = `${fs(6, 13, 22)}px ${v.vt}`;
    ctx.fillStyle = f.open ? "#4ade80" : "#94a3b8";
    ctx.fillText(line2, right, y + fs(4, 7, 13));
  }

  // Hint.
  ctx.textAlign = "center";
  ctx.font = `${fs(5.5, 13, 20)}px ${v.vt}`;
  ctx.fillStyle = "rgba(226,232,240,0.85)";
  ctx.fillText("Click a floor to take the elevator up", v.ox + (B_W / 2) * s, v.oy + 8 * s);
}

function mix(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - k) + ((pb >> sh) & 255) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

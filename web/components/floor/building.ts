// Kimi Tower, in the Kuala Lumpur skyline: a hillside view at the local time
// of day (city.ts), the tower among Merdeka 118, TRX, KL Tower and KLCC with
// its three trading floors lit by real activity, an elevator, a neon sign,
// F1 cars racing along the elevated highway and traffic on the street below.
// Pixel world is 320x200; text goes in the overlay.

import { C_H, C_W, DECK_Y, STREET_Y, cityLayers, skyFor, type Keepout } from "./city";
import { FLOORS, FLOOR_ORDER, type FloorId } from "./floors";
import { drawLandmarkLights, LANDMARKS } from "./landmarks";
import { mulberry32 } from "./sim";

export { skyFor };
export const B_W = C_W;
export const B_H = C_H;

// Between KL Tower and the twin towers, one building among many.
const TOWER = { x: 188, w: 58 };
const TOP = 50;
/** Each trading floor's band on the facade (world px). 1F at the bottom. */
export const FLOOR_BAND: Record<FloorId, { y0: number; y1: number; level: number }> = {
  futures: { y0: 64, y1: 80, level: 3 },
  crypto: { y0: 82, y1: 98, level: 2 },
  equity: { y0: 100, y1: 116, level: 1 },
};
const SHAFT = { x: TOWER.x + TOWER.w - 9, w: 6 };
/** The near blocks stay low in front of the tower so all three floors show. */
const KEEP: Keepout = { x0: TOWER.x - 2, x1: TOWER.x + TOWER.w + 2, minTop: FLOOR_BAND.equity.y1 + 4 };
/** How far left of the tower the floor labels reach; clicking a label rides up too. */
const LABEL_REACH = 46;

export type FloorStatus = { id: FloorId; open: boolean | null; onDuty: number };
export type BuildingState = { t: number; hover: FloorId | null; carY: number };

/** Elevator car's resting y for a floor. */
export const carYFor = (f: FloorId) => FLOOR_BAND[f].y1 - 11;

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

export function drawBuilding(ctx: CanvasRenderingContext2D, st: BuildingState, floors: FloorStatus[], hour: number) {
  const sky = skyFor(hour);
  const t = st.t;
  const city = cityLayers(sky, KEEP);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(city.back, 0, 0);
  drawLandmarkLights(ctx, sky.night, t);
  drawTower(ctx, st, floors, sky.night);
  ctx.drawImage(city.front, 0, 0);
  drawTraffic(ctx, t, sky.night);
  for (const c of F1_GRID) {
    const span = B_W + 70;
    const x = (((c.off + t * c.speed) % span) + span) % span - 35;
    drawF1(ctx, x, c.lane, c.speed > 0 ? 1 : -1, c.livery, t, sky.night);
  }
  ctx.drawImage(city.frame, 0, 0);
}

function drawTower(ctx: CanvasRenderingContext2D, st: BuildingState, floors: FloorStatus[], night: boolean) {
  const t = st.t;
  const bottom = DECK_Y + 10;
  px(ctx, TOWER.x, TOP, TOWER.w, bottom - TOP, "#1b2234");
  px(ctx, TOWER.x, TOP, 2, bottom - TOP, "#2b3550"); // light edge
  px(ctx, TOWER.x + TOWER.w - 2, TOP, 2, bottom - TOP, "#11172a"); // shadow edge
  // Upper office floors: dark glass with a few lights.
  const office = mulberry32(7);
  for (let y = TOP + 3; y < FLOOR_BAND.futures.y0 - 2; y += 4) {
    for (let x = TOWER.x + 4; x < SHAFT.x - 2; x += 4) {
      px(ctx, x, y, 2, 2, office() < (night ? 0.2 : 0.05) ? "#fcd34d" : night ? "#0b1220" : "#2f4a6e");
    }
  }
  // Rooftop: neon sign backing (text in the overlay) and an antenna with a blinking light.
  px(ctx, TOWER.x + 4, TOP - 10, TOWER.w - 8, 8, "#0a0e1a");
  px(ctx, TOWER.x + 4, TOP - 3, TOWER.w - 8, 1, "#f5a524");
  px(ctx, TOWER.x + TOWER.w / 2, TOP - 22, 1, 12, "#475569");
  if (Math.floor(t * 1.2) % 2 === 0) px(ctx, TOWER.x + TOWER.w / 2 - 1, TOP - 24, 3, 2, "#ef4444");

  for (const f of floors) {
    const band = FLOOR_BAND[f.id];
    const theme = FLOORS[f.id];
    const h = band.y1 - band.y0;
    const lit = f.open !== false;
    const inner = SHAFT.x - TOWER.x - 5;
    px(ctx, TOWER.x + 2, band.y0 - 1, TOWER.w - 4, 1, theme.accent); // accent slab
    px(ctx, TOWER.x + 3, band.y0, inner, h, lit ? "#2a2414" : "#0b1120");
    if (lit) {
      ctx.fillStyle = night ? "rgba(253,224,138,0.32)" : "rgba(253,224,138,0.18)";
      ctx.fillRect(TOWER.x + 3, band.y0, inner, h);
    }
    // Monitors along the desks; after hours only the night watch's stay on.
    for (let x = TOWER.x + 5; x < SHAFT.x - 4; x += 5) {
      const on = lit || x < TOWER.x + 10;
      px(ctx, x, band.y1 - 6, 3, 2, on ? (Math.floor(t * 2 + x) % 3 ? "#38bdf8" : "#22c55e") : "#111827");
      px(ctx, x - 1, band.y1 - 4, 5, 1, "#3e3128");
    }
    // People: silhouettes pacing, as many as are on that floor.
    const people = Math.min(14, f.onDuty);
    const r = mulberry32(band.level * 99);
    const span = inner - 6;
    for (let i = 0; i < people; i++) {
      const base = r() * span;
      const speed = 6 + r() * 14;
      const x = TOWER.x + 5 + ((base + Math.sin(t * (speed / 40) + i) * 8 + span) % span);
      px(ctx, x, band.y1 - 11, 2, 2, "#e8c39e"); // head
      px(ctx, x - 1, band.y1 - 9, 3, 4, i % 3 === 0 ? theme.accent : "#1f2937"); // body
    }
    for (let x = TOWER.x + 3; x < SHAFT.x - 1; x += 10) px(ctx, x, band.y0, 1, h, "#0f172a"); // mullions
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(TOWER.x + 4, band.y0 + 1, 12, 2);
    if (st.hover === f.id) {
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(TOWER.x + 2.5, band.y0 - 0.5, TOWER.w - 5, h + 1);
    }
  }

  // Elevator shaft and car.
  px(ctx, SHAFT.x, TOP + 2, SHAFT.w, bottom - TOP - 2, "#0d1322");
  px(ctx, SHAFT.x + 3, TOP + 2, 1, bottom - TOP - 2, "#334155"); // cable
  px(ctx, SHAFT.x + 1, st.carY, SHAFT.w - 2, 10, "#cbd5e1");
  px(ctx, SHAFT.x + 2, st.carY + 2, SHAFT.w - 4, 6, "#fde68a");
}

/** Head- and tail-lights streaming along the street, and the light trails on the highway. */
function drawTraffic(ctx: CanvasRenderingContext2D, t: number, night: boolean) {
  for (let i = 0; i < 14; i++) {
    const right = i % 2 === 0;
    const speed = 22 + (i % 5) * 4;
    const x = ((((i * 47 + t * speed * (right ? 1 : -1)) % (C_W + 20)) + C_W + 20) % (C_W + 20)) - 10;
    const y = right ? STREET_Y + 6 : STREET_Y + 12;
    px(ctx, x, y, 3, 2, night ? "#1f2028" : "#52525b");
    px(ctx, right ? x + 3 : x - 1, y, 1, 1, right ? "#fef9c3" : "#ef4444");
    px(ctx, right ? x - 1 : x + 3, y + 1, 1, 1, right ? "#ef4444" : "#fef9c3");
  }
  if (night) {
    // Long-exposure trails along the deck, like the photo.
    for (let i = 0; i < 5; i++) {
      const x = (((t * 50 + i * 71) % (C_W + 40)) + C_W + 40) % (C_W + 40) - 20;
      ctx.fillStyle = i % 2 ? "rgba(239,68,68,0.55)" : "rgba(254,243,199,0.5)";
      ctx.fillRect(Math.round(x), DECK_Y - 1, 14, 1);
    }
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

// On the elevated highway: one lane each way, the far lane drawn first.
const F1_GRID = [
  { lane: DECK_Y - 11, speed: -60, livery: LIVERY.silver, off: 40 },
  { lane: DECK_Y - 11, speed: -60, livery: LIVERY.navy, off: 170 },
  { lane: DECK_Y - 11, speed: -60, livery: LIVERY.racing, off: 290 },
  { lane: DECK_Y - 8, speed: 70, livery: LIVERY.kimi, off: 0 },
  { lane: DECK_Y - 8, speed: 70, livery: LIVERY.papaya, off: 95 },
  { lane: DECK_Y - 8, speed: 70, livery: LIVERY.rosso, off: 210 },
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

/** Which trading floor is under a world point: its band on the tower, or its label to the left. */
export function floorAtPoint(x: number, y: number): FloorId | null {
  if (x < TOWER.x - LABEL_REACH || x > TOWER.x + TOWER.w) return null;
  return FLOOR_ORDER.find((f) => y >= FLOOR_BAND[f].y0 - 1 && y <= FLOOR_BAND[f].y1 + 1) ?? null;
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
  ctx.font = `${fs(4.4, 10, 22)}px ${v.pixel}`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#fde68a";
  ctx.shadowColor = "#f5a524";
  ctx.shadowBlur = 16;
  ctx.fillText("KIMI TOWER", v.ox + (TOWER.x + TOWER.w / 2) * s, v.oy + (TOP - 6) * s);
  ctx.restore();

  // Floor labels beside the tower: one small line each, a dot for open / closed.
  const lf = fs(3.4, 9, 13);
  ctx.font = `${lf}px ${v.pixel}`;
  ctx.textAlign = "right";
  for (const f of floors) {
    const band = FLOOR_BAND[f.id];
    const theme = FLOORS[f.id];
    const y = v.oy + ((band.y0 + band.y1) / 2) * s;
    const right = v.ox + (TOWER.x - 3) * s;
    const text = `${band.level}F ${theme.label.toUpperCase()}`;
    const dot = lf * 0.6;
    const tw = ctx.measureText(text).width + dot + lf * 0.9;
    const hover = st.hover === f.id;
    ctx.fillStyle = hover ? "rgba(3,6,12,0.9)" : "rgba(3,6,12,0.6)";
    ctx.fillRect(right - tw, y - lf * 0.75, tw + lf * 0.3, lf * 1.5);
    ctx.fillStyle = f.open === null ? "#94a3b8" : f.open ? "#4ade80" : "#64748b";
    ctx.fillRect(right - dot, y - dot / 2, dot, dot);
    ctx.fillStyle = hover ? "#ffffff" : theme.accent;
    ctx.fillText(text, right - dot - lf * 0.4, y + 1);
  }

  // Landmark names, small, over their tops, like a captioned skyline photo.
  ctx.textAlign = "center";
  ctx.font = `${fs(3.6, 9, 14)}px ${v.pixel}`;
  for (const l of LANDMARKS) {
    ctx.fillStyle = "rgba(226,232,240,0.7)";
    ctx.fillText(l.name, Math.min(v.ox + l.x * s, v.ox + B_W * s - ctx.measureText(l.name).width / 2 - 4), v.oy + Math.max(4, l.top - 6) * s);
  }

  // Hint.
  ctx.textAlign = "center";
  ctx.font = `${fs(5.5, 13, 20)}px ${v.vt}`;
  ctx.fillStyle = "rgba(226,232,240,0.85)";
  ctx.fillText("Click a floor to take the elevator up", v.ox + (B_W / 2) * s, v.oy + 8 * s);
}

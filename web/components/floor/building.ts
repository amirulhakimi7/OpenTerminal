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
  const cars = [
    { lane: GROUND + 6, speed: 34, color: "#ef4444", off: 0 },
    { lane: GROUND + 6, speed: 34, color: "#f5f5f4", off: 160 },
    { lane: GROUND + 16, speed: -26, color: "#38bdf8", off: 60 },
    { lane: GROUND + 16, speed: -26, color: "#facc15", off: 230 },
  ];
  for (const c of cars) {
    const span = B_W + 40;
    const x = (((c.off + t * c.speed) % span) + span) % span - 20;
    px(ctx, x, c.lane, 14, 5, c.color);
    px(ctx, x + 3, c.lane - 2, 8, 2, c.color);
    px(ctx, x + 4, c.lane - 1, 6, 1, "#93c5fd");
    if (sky.night) px(ctx, c.speed > 0 ? x + 14 : x - 4, c.lane + 1, 4, 2, "#fde68a");
  }
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
  ctx.fillText("Click a floor to take the elevator up", v.ox + (B_W / 2) * s, v.oy + (B_H - 6) * s);
}

function mix(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - k) + ((pb >> sh) & 255) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

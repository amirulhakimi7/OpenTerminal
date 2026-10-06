// Kuala Lumpur from a hillside, in pixel art, behind and around Kimi Tower:
// a layered sky with lit clouds, a dense skyline with neon, the four landmarks,
// low-rise houses, an elevated highway on pillars and trees framing the view.
// Everything that doesn't move is painted once per sky into cached canvases.

import { drawLandmarks } from "./landmarks";
import { mulberry32 } from "./sim";

export const C_W = 320;
export const C_H = 200;
/** Top of the elevated highway's deck, where the F1 cars race. */
export const DECK_Y = 150;
/** Where the street at the bottom of the view starts. */
export const STREET_Y = 182;

export type Sky = {
  key: string;
  stops: string[]; // top to horizon
  night: boolean;
  sun: { x: number; y: number; c: string } | null; // or the moon, after dark
  cloud: [string, string]; // body, lit underside
};

/** Sky for an hour of the local day (0-24, fractional). */
export function skyFor(hour: number): Sky {
  if (hour < 5 || hour >= 20)
    return { key: "night", stops: ["#090a24", "#1d1748", "#3a2160", "#6b2d5e", "#9a4a4a"], night: true, sun: { x: 92, y: 22, c: "#e2e8f0" }, cloud: ["#2c2253", "#b0566a"] };
  if (hour < 7)
    return { key: "dawn", stops: ["#2b2350", "#6d3b6b", "#d9775a", "#f5a25b"], night: false, sun: { x: 40 + (hour - 5) * 30, y: 120 - (hour - 5) * 25, c: "#fde68a" }, cloud: ["#7a4a72", "#ffc38a"] };
  if (hour < 17)
    return { key: "day", stops: ["#1d4ed8", "#3b82f6", "#7fb2f5", "#c7defa"], night: false, sun: { x: 60 + ((hour - 7) / 10) * 200, y: 40 - Math.sin(((hour - 7) / 10) * Math.PI) * 18, c: "#fef3c7" }, cloud: ["#e8eef6", "#ffffff"] };
  return { key: "dusk", stops: ["#1e1b4b", "#5b2a6e", "#c2410c", "#f97316"], night: false, sun: { x: 250 + (hour - 17) * 15, y: 70 + (hour - 17) * 25, c: "#fb923c" }, cloud: ["#4c2a5e", "#fb923c"] };
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

export function mix(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - k) + ((pb >> sh) & 255) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** Kimi Tower's footprint, so the near blocks don't stand in front of its floors. */
export type Keepout = { x0: number; x1: number; minTop: number };

// ---- the sky -------------------------------------------------------------------

function sky(ctx: CanvasRenderingContext2D, s: Sky) {
  const H = DECK_Y;
  const bands = 24;
  for (let i = 0; i < bands; i++) {
    const f = (i / (bands - 1)) * (s.stops.length - 1);
    const j = Math.min(s.stops.length - 2, Math.floor(f));
    ctx.fillStyle = mix(s.stops[j], s.stops[j + 1], f - j);
    ctx.fillRect(0, Math.floor((i * H) / bands), C_W, Math.ceil(H / bands) + 1);
  }
  if (s.night) {
    const r = mulberry32(11);
    for (let i = 0; i < 70; i++) px(ctx, r() * C_W, r() * 100, 1, 1, r() < 0.2 ? "#fde68a" : "#e2e8f0");
  }
  if (s.sun) {
    const { x: sx, y: sy, c } = s.sun;
    for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) if (x * x + y * y <= 36) px(ctx, sx + x, sy + y, 1, 1, c);
    // A crescent: bite the moon with the sky colour behind it.
    if (s.night) for (let y = -6; y <= 6; y++) for (let x = -3; x <= 6; x++) if ((x - 3) * (x - 3) + y * y <= 26) px(ctx, sx + x, sy + y, 1, 1, s.stops[0]);
  }
  // Clouds: long ragged strips with a lit underside, thickest near the horizon.
  const r = mulberry32(31);
  const strips = [
    { x: 0, y: 48, w: 120 }, { x: 140, y: 30, w: 90 }, { x: 230, y: 60, w: 90 },
    { x: 40, y: 82, w: 150 }, { x: 200, y: 96, w: 120 }, { x: 10, y: 112, w: 110 },
  ];
  for (const st of strips) {
    let x = st.x;
    while (x < st.x + st.w) {
      const w = 6 + Math.floor(r() * 14);
      const h = 2 + Math.floor(r() * 4);
      const y = st.y + Math.floor(r() * 6) - 3;
      px(ctx, x, y, w, h, s.cloud[0]);
      px(ctx, x + 1, y + h, w - 2, 1, s.cloud[1]); // lit by the city (or the sun) from below
      x += w - 2;
    }
  }
}

// ---- buildings ---------------------------------------------------------------

const NEON = ["#c084fc", "#f43f5e", "#38bdf8", "#f59e0b", "#e879f9"];

function block(ctx: CanvasRenderingContext2D, x: number, top: number, w: number, bottom: number, body: string, night: boolean, seed: number, litRate: number) {
  px(ctx, x, top, w, bottom - top, body);
  px(ctx, x, top, w, 1, mix(body, "#ffffff", 0.12)); // roof edge catching the light
  const r = mulberry32(seed);
  const warm = r() < 0.6;
  for (let y = top + 3; y < bottom - 2; y += 3) {
    for (let x2 = x + 2; x2 < x + w - 2; x2 += 3) {
      if (night ? r() < litRate : r() < 0.06) px(ctx, x2, y, 1, 1, night ? (warm ? (r() < 0.85 ? "#fbbf24" : "#fde68a") : "#93c5fd") : "#dbe4f0");
    }
  }
  // Some towers get a neon strip down one side or a lit crown, like the real skyline.
  if (night && r() < 0.35) px(ctx, r() < 0.5 ? x + 1 : x + w - 2, top + 2, 1, Math.min(30, bottom - top - 4), NEON[Math.floor(r() * NEON.length)]);
  if (night && r() < 0.25) px(ctx, x + 1, top + 1, w - 2, 1, NEON[Math.floor(r() * NEON.length)]);
}

function skyline(ctx: CanvasRenderingContext2D, s: Sky, layer: "far" | "near", keep: Keepout) {
  const r = mulberry32(layer === "far" ? 101 : 202);
  const far = layer === "far";
  const body = s.night ? (far ? "#14163a" : "#0d1029") : far ? "#6476a0" : "#43557c";
  let x = -4;
  while (x < C_W) {
    const w = 8 + Math.floor(r() * (far ? 14 : 16));
    let top = far ? 98 + Math.floor(r() * 34) : 116 + Math.floor(r() * 26);
    if (!far && x + w > keep.x0 && x < keep.x1) top = Math.max(top, keep.minTop); // keep Kimi Tower's floors in view
    block(ctx, x, top, w, far ? DECK_Y : DECK_Y + 10, body, s.night, Math.floor(r() * 1e6), far ? 0.3 : 0.5);
    x += w + (r() < 0.3 ? 1 : 0);
  }
}

function houses(ctx: CanvasRenderingContext2D, s: Sky) {
  const r = mulberry32(303);
  // Apartment blocks on the right, in front of the KLCC skyline.
  for (const [x, top, w] of [[232, 132, 26], [262, 128, 30], [296, 136, 24]] as const) {
    block(ctx, x, top, w, STREET_Y, s.night ? "#151a33" : "#7a86a3", s.night, x * 13, 0.55);
  }
  // Low-rise houses below the highway: little roofs and warm windows.
  let x = 40;
  while (x < 236) {
    const w = 8 + Math.floor(r() * 10);
    const top = 160 + Math.floor(r() * 10);
    px(ctx, x, top, w, STREET_Y - top, s.night ? "#1a1d33" : "#a79c8f");
    px(ctx, x - 1, top - 2, w + 2, 2, s.night ? "#3a1f24" : "#9a3412"); // roof
    for (let y = top + 3; y < STREET_Y - 2; y += 4) for (let x2 = x + 2; x2 < x + w - 2; x2 += 4) if (s.night ? r() < 0.5 : r() < 0.1) px(ctx, x2, y, 2, 2, s.night ? "#fbbf24" : "#e5e7eb");
    x += w + 2;
  }
  // A lit shop sign or two, like the green one in the valley.
  if (s.night) {
    px(ctx, 120, 168, 12, 3, "#22c55e");
    px(ctx, 168, 171, 8, 2, "#f43f5e");
  }
}

function viaduct(ctx: CanvasRenderingContext2D, s: Sky) {
  const deck = s.night ? "#3a3340" : "#a8a29e";
  const under = s.night ? "#1c1a24" : "#78716c";
  for (let x = 24; x < C_W; x += 46) {
    px(ctx, x, DECK_Y + 5, 5, STREET_Y - DECK_Y - 5, under); // pillars
    px(ctx, x, DECK_Y + 5, 1, STREET_Y - DECK_Y - 5, deck);
    px(ctx, x - 3, DECK_Y + 5, 11, 2, deck); // pier cap
  }
  px(ctx, 0, DECK_Y, C_W, 5, deck);
  px(ctx, 0, DECK_Y + 4, C_W, 1, under);
  px(ctx, 0, DECK_Y - 1, C_W, 1, s.night ? "#f59e0b" : "#d6d3d1"); // lit parapet
  // Lamp posts along the deck.
  for (let x = 12; x < C_W; x += 34) {
    px(ctx, x, DECK_Y - 12, 1, 11, s.night ? "#57534e" : "#78716c");
    px(ctx, x - 1, DECK_Y - 13, 3, 1, s.night ? "#fde68a" : "#a8a29e");
  }
}

function trees(ctx: CanvasRenderingContext2D, s: Sky) {
  const shades = s.night ? ["#06120c", "#0b1f14", "#123021"] : ["#14532d", "#166534", "#15803d"];
  const r = mulberry32(404);
  const clump = (cx: number, cy: number, rad: number) => {
    for (let y = -rad; y <= rad; y += 2) {
      for (let x = -rad; x <= rad; x += 2) {
        if (x * x + y * y > rad * rad * (0.75 + r() * 0.35)) continue;
        px(ctx, cx + x, cy + y, 2, 2, shades[Math.floor(r() * shades.length)]);
      }
    }
  };
  // A big stand on the left, rising up the frame, and a smaller one on the right.
  for (const [cx, cy, rad] of [[8, 132, 16], [20, 150, 20], [6, 176, 22], [34, 172, 16], [48, 188, 14], [16, 116, 10]] as const) clump(cx, cy, rad);
  for (const [cx, cy, rad] of [[312, 178, 18], [296, 192, 14], [318, 158, 10]] as const) clump(cx, cy, rad);
}

function street(ctx: CanvasRenderingContext2D, s: Sky) {
  px(ctx, 0, STREET_Y, C_W, C_H - STREET_Y, s.night ? "#15161c" : "#3f3f46");
  px(ctx, 0, STREET_Y, C_W, 1, s.night ? "#3f3a46" : "#71717a");
}

// ---- cached layers ---------------------------------------------------------------

type Layers = { back: HTMLCanvasElement; front: HTMLCanvasElement; frame: HTMLCanvasElement };
const cache = new Map<string, Layers>();

function layer(paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = C_W;
  c.height = C_H;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  paint(ctx);
  return c;
}

/**
 * The city in three cached layers, drawn around the live parts:
 *   back  — sky, clouds, far skyline, landmarks      (then Kimi Tower)
 *   front — near skyline, houses, highway, street    (then cars and traffic)
 *   frame — trees in the corners                      (on top of everything)
 */
export function cityLayers(s: Sky, keep: Keepout): Layers {
  const key = `${s.key}|${keep.x0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const out = {
    back: layer((ctx) => {
      sky(ctx, s);
      skyline(ctx, s, "far", keep);
      drawLandmarks(ctx, s.night, DECK_Y);
    }),
    front: layer((ctx) => {
      skyline(ctx, s, "near", keep);
      houses(ctx, s);
      street(ctx, s);
      viaduct(ctx, s);
    }),
    frame: layer((ctx) => trees(ctx, s)),
  };
  cache.set(key, out);
  return out;
}

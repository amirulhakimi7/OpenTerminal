// The Kuala Lumpur skyline behind Kimi Tower, in pixel art: Merdeka 118, TRX,
// KL Tower and the twin towers at KLCC. Drawn from scratch as silhouettes,
// after the hillside night view: lit outlines and crowns after dark, sunlit
// glass by day. World px of the 320x200 street view.

type Ctx = CanvasRenderingContext2D;

function px(ctx: Ctx, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

/** A 1px line, Bresenham style, so diagonals stay crisp pixels. */
function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, c: string) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  ctx.fillStyle = c;
  for (;;) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Where each landmark stands, for the name labels in the overlay. */
export const LANDMARKS = [
  { name: "MERDEKA 118", x: 22, top: 6 },
  { name: "TRX", x: 65, top: 38 },
  { name: "KL TOWER", x: 118, top: 30 },
  { name: "KLCC", x: 275, top: 32 },
] as const;

type Look = { night: boolean; ground: number };

/**
 * Merdeka 118: a dark crystal shaft whose facet edges are traced in light, big
 * zig-zag folds up the facade, a crown pinching into a very long spire.
 */
function merdeka118(ctx: Ctx, { night, ground }: Look) {
  const cx = 22;
  const body = night ? "#100d26" : "#5a6a8c";
  const edge = night ? "#fb7185" : "#dbe4f0";
  const fold = night ? "#f9a8d4" : "#eef2f7";
  const half = (y: number) => (y < 56 ? 1 + ((y - 36) / 20) * 5 : 6 + ((y - 56) / (ground - 56)) * 5); // width profile
  for (let y = 36; y < ground; y++) {
    const h = Math.round(half(y));
    px(ctx, cx - h, y, h * 2, 1, body);
  }
  // Outline, both sides, top to bottom.
  for (let y = 36; y < ground; y++) {
    const h = Math.round(half(y));
    px(ctx, cx - h, y, 1, 1, edge);
    px(ctx, cx + h - 1, y, 1, 1, edge);
  }
  // The folds: diagonals bouncing between the edges, like the lit facets in the photo.
  const ys = [58, 76, 96, 118, ground - 2];
  for (let i = 0; i < ys.length - 1; i++) {
    const a = ys[i], b = ys[i + 1];
    const fromLeft = i % 2 === 0;
    line(ctx, cx + (fromLeft ? -Math.round(half(a)) : Math.round(half(a)) - 1), a, cx + (fromLeft ? Math.round(half(b)) - 1 : -Math.round(half(b))), b, fold);
  }
  line(ctx, cx - 1, 40, cx - 4, 56, fold); // crown facet
  // The spire: thick at the root, a hairline to the tip.
  px(ctx, cx - 1, 18, 2, 18, night ? "#fde2ea" : "#e2e8f0");
  px(ctx, cx, 5, 1, 13, night ? "#fde2ea" : "#e2e8f0");
}

/** TRX (The Exchange 106): a dark glass slab, a blue window grid, a crown of gold lattice. */
function trx(ctx: Ctx, { night, ground }: Look) {
  const x0 = 56;
  const w = 18;
  // Crown: steps in at the top, then a diamond lattice of gold light.
  px(ctx, x0 + 3, 38, w - 6, 2, night ? "#2a2214" : "#6b7a99");
  px(ctx, x0 + 1, 40, w - 2, 2, night ? "#2a2214" : "#6b7a99");
  px(ctx, x0, 42, w, 14, night ? "#2a2214" : "#6b7a99");
  for (let y = 38; y < 56; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (y < 40 && (x < x0 + 3 || x >= x0 + w - 3)) continue;
      if (y < 42 && (x < x0 + 1 || x >= x0 + w - 1)) continue;
      if ((x + y) % 3 === 0 || (x - y + 99) % 3 === 0) px(ctx, x, y, 1, 1, night ? ((x * y) % 5 === 0 ? "#fff1c2" : "#f59e0b") : "#e2e8f0");
    }
  }
  // Body: dark glass with rows of cool window light.
  px(ctx, x0, 56, w, ground - 56, night ? "#0d1730" : "#3f5274");
  px(ctx, x0, 56, 1, ground - 56, night ? "#2b4170" : "#8ea2c4");
  for (let y = 58; y < ground; y += 3) {
    for (let x = x0 + 2; x < x0 + w - 1; x += 2) {
      const lit = night ? (x * 7 + y * 13) % 5 < 3 : (x + y) % 9 === 0;
      if (lit) px(ctx, x, y, 1, 1, night ? ((x + y) % 4 === 0 ? "#a5f3fc" : "#3b82f6") : "#dbe4f0");
    }
  }
}

/** KL Tower: a tapering white shaft, the observation bulb with its red band, the mast. */
function klTower(ctx: Ctx, { night, ground }: Look) {
  const cx = 118;
  const shaft = night ? "#f1f5f9" : "#d1d5db";
  for (let y = 74; y < ground; y++) {
    const w = y < 110 ? 2 : y < 135 ? 3 : 4;
    px(ctx, cx - Math.floor(w / 2), y, w, 1, shaft);
  }
  px(ctx, cx - 3, ground - 6, 7, 6, night ? "#cbd5e1" : "#9ca3af"); // podium
  // The bulb, top to bottom: dome, red band, window ring, white belly.
  const rows: Array<[number, string]> = [
    [3, night ? "#e5e7eb" : "#e2e8f0"], [7, night ? "#e5e7eb" : "#e2e8f0"], [9, "#ef4444"], [11, night ? "#f8fafc" : "#e5e7eb"],
    [13, night ? "#fbbf24" : "#64748b"], [13, night ? "#f8fafc" : "#e5e7eb"], [11, "#ef4444"], [11, night ? "#e2e8f0" : "#d1d5db"],
    [9, night ? "#e2e8f0" : "#d1d5db"], [7, night ? "#cbd5e1" : "#9ca3af"], [5, night ? "#cbd5e1" : "#9ca3af"], [3, night ? "#cbd5e1" : "#9ca3af"],
  ];
  rows.forEach(([w, c], i) => px(ctx, cx - Math.floor(w / 2), 61 + i, w, 1, c));
  // Mast, thicker at the base.
  px(ctx, cx - 1, 50, 3, 11, night ? "#e2e8f0" : "#9ca3af");
  px(ctx, cx, 30, 1, 20, night ? "#f1f5f9" : "#9ca3af");
}

/**
 * The twin towers at KLCC: glowing warm silver, stepped tiers each ringed in
 * light, needle pinnacles, the skybridge. Plus the slim lit tower beside them.
 */
function klcc(ctx: Ctx, { night, ground }: Look) {
  const body = night ? "#d9c9a3" : "#b6bfcc";
  const shade = night ? "#8f7f5c" : "#8a95a6";
  const ring = night ? "#fff4d6" : "#eef2f7";
  const rib = night ? "rgba(255,244,214,0.55)" : "rgba(255,255,255,0.22)";
  // Tiers from the ground up: [top y, width]; each tapers a pixel at its top.
  const tiers: Array<[number, number]> = [[86, 7], [72, 6], [62, 5], [55, 3], [50, 2]];
  for (const cx of [266, 284]) {
    let bottom = ground;
    for (const [top, w] of tiers) {
      const left = cx - Math.floor(w / 2);
      px(ctx, left, top, w, bottom - top, body);
      px(ctx, left + w - 1, top, 1, bottom - top, shade);
      px(ctx, left - (w > 3 ? 1 : 0), top, w + (w > 3 ? 2 : 0), 1, ring); // the lit ring at each setback
      for (let x = left + 1; x < left + w - 1; x += 2) px(ctx, x, top + 2, 1, bottom - top - 3, rib);
      bottom = top;
    }
    px(ctx, cx, 32, 1, 18, ring); // pinnacle
    px(ctx, cx - 1, 42, 3, 1, ring);
    px(ctx, cx - 1, 46, 3, 1, ring);
  }
  // Skybridge with its two-legged support.
  px(ctx, 270, 108, 11, 2, ring);
  px(ctx, 270, 110, 11, 1, shade);
  line(ctx, 272, 111, 275, 120, shade);
  line(ctx, 279, 111, 276, 120, shade);
  // The slim lit tower beside them, and a dark one beyond.
  px(ctx, 296, 70, 4, ground - 70, night ? "#1a1830" : "#7a86a3");
  px(ctx, 296, 70, 1, ground - 70, night ? "#fbbf24" : "#e5e7eb");
  px(ctx, 299, 70, 1, ground - 70, night ? "#fbbf24" : "#e5e7eb");
  px(ctx, 306, 62, 9, ground - 62, night ? "#0f1428" : "#5d6e90");
  px(ctx, 306, 62, 9, 1, night ? "#334155" : "#94a3b8");
}

/** All four, back to front. Static: cache it; the blinking goes in `drawLandmarkLights`. */
export function drawLandmarks(ctx: Ctx, night: boolean, ground: number) {
  const look = { night, ground };
  merdeka118(ctx, look);
  trx(ctx, look);
  klTower(ctx, look);
  klcc(ctx, look);
}

/** What moves on the landmarks: aircraft warning lights and TRX's crown sparkle. */
export function drawLandmarkLights(ctx: Ctx, night: boolean, t: number) {
  if (Math.floor(t * 1.1) % 2 === 0) px(ctx, 21, 3, 3, 2, "#ef4444"); // Merdeka 118
  if (Math.floor(t * 1.3 + 1) % 2 === 0) px(ctx, 117, 28, 3, 2, "#ef4444"); // KL Tower
  if (Math.floor(t * 0.9 + 0.5) % 2 === 0) {
    px(ctx, 265, 30, 3, 2, "#ef4444"); // KLCC pinnacles
    px(ctx, 283, 30, 3, 2, "#ef4444");
  }
  if (!night) return;
  for (let i = 0; i < 4; i++) {
    const k = Math.floor(t * 2 + i * 7);
    px(ctx, 57 + ((k * 5) % 16), 43 + ((k * 3) % 12), 1, 1, "#ffffff");
  }
}

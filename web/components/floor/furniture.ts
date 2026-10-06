// Props for the 3/4 office view: floors, walls, desks, chairs, plants,
// shelves, servers and the rest. Each function paints one thing at world
// pixel coordinates; nothing here keeps state. Tall props reach up into the
// tile above, which is what gives the floor its depth.

import type { FloorTheme } from "./floors";
import type { Station } from "./roster";
import type { Decor, Ground } from "./tilemap";

type Ctx = CanvasRenderingContext2D;
const S = 16;

export function px(ctx: Ctx, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

const hash = (a: number, b: number) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ---- floors -----------------------------------------------------------------

/** One tile of floor finish at tile (tx, ty). */
export function ground(ctx: Ctx, kind: Ground, tx: number, ty: number, theme: FloorTheme) {
  const X = tx * S;
  const Y = ty * S;
  switch (kind) {
    case "wood": {
      const [a, b, seam] = theme.wood;
      for (let k = 0; k < 4; k++) {
        const band = ty * 4 + k;
        const off = (band * 11) % 24;
        for (let x = X - ((X + off) % 24); x < X + S; x += 24) {
          const x0 = Math.max(x, X);
          const x1 = Math.min(x + 24, X + S);
          px(ctx, x0, Y + k * 4, x1 - x0, 4, hash(band, Math.floor((x + off) / 24)) > 0.5 ? a : b);
          if (x >= X) px(ctx, x, Y + k * 4, 1, 4, seam);
        }
        px(ctx, X, Y + k * 4 + 3, S, 1, "rgba(0,0,0,0.16)");
      }
      break;
    }
    case "carpet":
    case "risk": {
      const [a, b] = kind === "carpet" ? ["#2d3850", "#2a344a"] : ["#4d2a35", "#472731"];
      px(ctx, X, Y, S, S, (tx + ty) % 2 ? a : b);
      for (let i = 2; i < S; i += 5) px(ctx, X + i, Y + ((i * 3) % S), 1, 1, "rgba(255,255,255,0.05)");
      break;
    }
    case "tile":
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) px(ctx, X + i * 8, Y + j * 8, 8, 8, (i + j) % 2 ? "#8d96a1" : "#7d8691");
      px(ctx, X, Y, S, 1, "rgba(255,255,255,0.08)");
      break;
    case "stone":
      px(ctx, X, Y, S, S, (tx + ty) % 2 ? "#4a505b" : "#454b55");
      px(ctx, X, Y, S, 1, "#3a3f48");
      px(ctx, X, Y, 1, S, "#3a3f48");
      px(ctx, X + 1, Y + 1, S - 2, 1, "rgba(255,255,255,0.05)");
      break;
    case "server":
      px(ctx, X, Y, S, S, "#262b34");
      px(ctx, X, Y, S, 1, "#1d2129");
      px(ctx, X, Y + 8, S, 1, "#1d2129");
      px(ctx, X, Y, 1, S, "#1d2129");
      px(ctx, X + 8, Y, 1, S, "#1d2129");
      if ((tx + ty) % 3 === 0) for (let i = 2; i < 7; i += 2) px(ctx, X + i, Y + 3, 1, 3, "#151920");
      break;
    case "marble":
      px(ctx, X, Y, S, S, (tx + ty) % 2 ? "#8f897f" : "#878177");
      px(ctx, X + 2, Y + 4 + (tx % 3), 7, 1, "rgba(255,255,255,0.12)");
      px(ctx, X + 8, Y + 10, 5, 1, "rgba(0,0,0,0.12)");
      break;
  }
}

// ---- walls --------------------------------------------------------------------

const CAP = "#2f3644";
const CAP_HI = "#4a5468";
const CAP_LO = "#1b2029";

/** A wall seen from above (partitions and the outer shell). */
export function wallCap(ctx: Ctx, X: number, Y: number) {
  px(ctx, X, Y, S, S, CAP);
  px(ctx, X, Y, 1, S, CAP_HI);
  px(ctx, X + S - 1, Y, 1, S, CAP_LO);
}

/** A horizontal wall: thin cap on top, its south face below. */
export function wallSouth(ctx: Ctx, X: number, Y: number, theme: FloorTheme) {
  px(ctx, X, Y, S, 5, CAP);
  px(ctx, X, Y, S, 1, CAP_HI);
  px(ctx, X, Y + 5, S, 9, theme.wall);
  px(ctx, X, Y + 5, S, 1, "rgba(255,255,255,0.08)");
  px(ctx, X, Y + 14, S, 2, CAP_LO);
}

/**
 * A room's back wall, face-on. `part` is which slice of it this tile is:
 * the upper or lower half of a two-tile wall, or a whole one-tile wall.
 */
export function wallFace(ctx: Ctx, X: number, Y: number, part: "upper" | "lower" | "single", theme: FloorTheme) {
  const paper = theme.wallTop;
  const panel = theme.wall;
  const stripes = (y0: number, h: number) => {
    px(ctx, X, y0, S, h, paper);
    for (let i = 0; i < S; i += 4) px(ctx, X + i, y0, 1, h, "rgba(255,255,255,0.035)");
  };
  const wainscot = (y0: number, h: number) => {
    px(ctx, X, y0, S, 1, "rgba(255,255,255,0.18)"); // chair rail
    px(ctx, X, y0 + 1, S, h - 1, panel);
    px(ctx, X + 2, y0 + 3, S - 4, h - 6, "rgba(255,255,255,0.04)");
    px(ctx, X + 2, y0 + h - 3, S - 4, 1, "rgba(0,0,0,0.25)");
  };
  if (part === "upper") {
    stripes(Y, S);
    px(ctx, X, Y, S, 2, "rgba(255,255,255,0.1)"); // crown moulding
  } else if (part === "lower") {
    stripes(Y, 4);
    wainscot(Y + 4, 10);
    px(ctx, X, Y + 14, S, 2, "#0b0e14"); // skirting
  } else {
    px(ctx, X, Y, S, 3, CAP);
    px(ctx, X, Y, S, 1, CAP_HI);
    stripes(Y + 3, 4);
    wainscot(Y + 7, 7);
    px(ctx, X, Y + 14, S, 2, "#0b0e14");
  }
}

/** An open doorway: the floor runs through, with a frame either side. */
export function doorway(ctx: Ctx, X: number, Y: number, left: boolean, right: boolean, inFace: boolean) {
  const frame = "#6b4a33";
  if (inFace) px(ctx, X, Y, S, 3, frame);
  if (left) { px(ctx, X, Y, 2, S, frame); px(ctx, X + 2, Y, 1, S, "rgba(0,0,0,0.3)"); }
  if (right) { px(ctx, X + S - 2, Y, 2, S, frame); px(ctx, X + S - 3, Y, 1, S, "rgba(0,0,0,0.3)"); }
  px(ctx, X, Y + S - 1, S, 1, "rgba(0,0,0,0.25)"); // threshold
}

/** The street door at the bottom of the floor. */
export function exitDoor(ctx: Ctx, X: number, Y: number, accent: string) {
  px(ctx, X, Y, S, S, "#0b0f16");
  px(ctx, X + 1, Y + 2, S - 2, 3, accent + "88");
  px(ctx, X + 1, Y + 6, S - 2, 8, "rgba(125,211,252,0.18)");
}

// ---- desks and chairs ---------------------------------------------------------

/**
 * Where a desk's monitors show their picture, for the live pass: three on
 * every desk, and a fourth stacked on top at the market-monitoring desk.
 */
export function deskScreens(X: number, Y: number, station?: Station) {
  const out = [-8, 8, 24].map((cx) => ({ x: X + cx - 6, y: Y - 5, w: 12, h: 7 }));
  if (station === "monitor") out.push({ x: X + 2, y: Y - 14, w: 12, h: 7 });
  return out;
}

/** A three-tile desk centred on tile (X, Y): white top, three monitors, keyboard. */
export function desk(ctx: Ctx, X: number, Y: number) {
  const x0 = X - 15;
  const w = 46;
  px(ctx, x0 + 2, Y + 14, w - 4, 2, "rgba(0,0,0,0.28)"); // shadow on the floor
  px(ctx, x0 + 1, Y + 10, 2, 5, "#30343c"); // legs
  px(ctx, x0 + w - 3, Y + 10, 2, 5, "#30343c");
  px(ctx, x0, Y + 3, w, 7, "#d7dbe1"); // top
  px(ctx, x0, Y + 3, w, 1, "#f1f3f6");
  px(ctx, x0, Y + 10, w, 3, "#9aa1ac"); // front edge
  px(ctx, x0, Y + 12, w, 1, "#7b828d");
  for (const cx of [-8, 8, 24]) {
    const mx = X + cx;
    px(ctx, mx - 1, Y + 2, 2, 3, "#2a2d33"); // stand
    px(ctx, mx - 3, Y + 4, 6, 1, "#2a2d33");
    px(ctx, mx - 7, Y - 6, 14, 9, "#121419"); // bezel
    px(ctx, mx - 7, Y - 6, 14, 1, "#2b2f37");
  }
  px(ctx, X + 1, Y + 6, 13, 2, "#454a53"); // keyboard
  px(ctx, X + 1, Y + 6, 13, 1, "#5b616c");
  px(ctx, X + 17, Y + 6, 2, 2, "#454a53"); // mouse
}

/** Where the risk desk's warning light sits, lit in the live pass. */
export const riskLight = (X: number, Y: number) => ({ x: X + 24, y: Y + 5 });

/**
 * What sits on a desk, by job: you can tell who works there without reading
 * a label. Left end is X-14..X-3, right end X+20..X+30 (desk top is Y+3..Y+9).
 */
export function deskProps(ctx: Ctx, X: number, Y: number, station: Station) {
  const mug = (x: number) => {
    px(ctx, x, Y + 5, 3, 3, "#f8fafc");
    px(ctx, x, Y + 5, 3, 1, "#7c4a2d");
  };
  const papers = (x: number) => {
    px(ctx, x, Y + 4, 8, 5, "#e5e7eb");
    px(ctx, x + 1, Y + 5, 6, 1, "#94a3b8");
    px(ctx, x + 1, Y + 7, 4, 1, "#94a3b8");
  };
  const deskPhone = (x: number) => {
    px(ctx, x, Y + 5, 7, 4, "#1f2937");
    px(ctx, x, Y + 3, 7, 2, "#111827"); // handset
    px(ctx, x + 1, Y + 6, 5, 1, "#4ade80");
  };
  switch (station) {
    case "broker":
      deskPhone(X + 22);
      px(ctx, X - 13, Y + 3, 6, 1, "#111827"); // headset band
      px(ctx, X - 14, Y + 4, 2, 3, "#111827");
      px(ctx, X - 9, Y + 4, 2, 3, "#111827");
      px(ctx, X - 5, Y + 5, 2, 2, "#38bdf8"); // mic light
      break;
    case "trade":
      deskPhone(X + 22);
      papers(X - 13);
      break;
    case "quant":
      px(ctx, X - 14, Y + 1, 10, 6, "#2b2f37"); // laptop lid
      px(ctx, X - 13, Y + 2, 8, 4, "#0f172a");
      px(ctx, X - 12, Y + 3, 3, 1, "#a78bfa");
      px(ctx, X - 12, Y + 4, 5, 1, "#4ade80");
      px(ctx, X - 15, Y + 7, 12, 2, "#9ca3af"); // laptop base
      px(ctx, X + 23, Y + 3, 5, 6, "#374151"); // calculator
      px(ctx, X + 24, Y + 4, 3, 1, "#a7f3d0");
      for (let i = 0; i < 2; i++) px(ctx, X + 24, Y + 6 + i * 2, 3, 1, "#9ca3af");
      break;
    case "strategy":
      px(ctx, X + 21, Y + 4, 8, 5, "#fef08a"); // notepad
      px(ctx, X + 22, Y + 5, 5, 1, "#a16207");
      px(ctx, X + 22, Y + 7, 3, 1, "#a16207");
      px(ctx, X + 28, Y + 3, 1, 5, "#1d4ed8"); // pen
      mug(X - 12);
      break;
    case "chart":
      px(ctx, X - 14, Y + 4, 9, 5, "#f8fafc"); // printed chart
      for (let i = 0; i < 7; i++) px(ctx, X - 13 + i, Y + 7 - Math.round(Math.sin(i) + i * 0.3), 1, 1, "#16a34a");
      px(ctx, X + 22, Y + 6, 7, 1, "#9ca3af"); // ruler
      break;
    case "data":
      mug(X - 12);
      px(ctx, X + 21, Y + 5, 9, 3, "#454a53"); // second keypad
      for (let i = 0; i < 4; i++) px(ctx, X + 22 + i * 2, Y + 6, 1, 1, "#9ca3af");
      break;
    case "monitor": {
      // The fourth screen, on a pole above the middle one.
      px(ctx, X + 7, Y - 7, 2, 2, "#2a2d33");
      px(ctx, X + 1, Y - 15, 14, 9, "#121419");
      px(ctx, X + 1, Y - 15, 14, 1, "#2b2f37");
      mug(X - 12);
      break;
    }
    case "news":
      px(ctx, X + 20, Y + 3, 10, 6, "#f1f5f9"); // newspaper
      px(ctx, X + 21, Y + 4, 8, 1, "#0f172a");
      px(ctx, X + 21, Y + 6, 3, 2, "#94a3b8");
      px(ctx, X + 25, Y + 6, 4, 1, "#94a3b8");
      px(ctx, X + 25, Y + 7, 4, 1, "#94a3b8");
      mug(X - 12);
      break;
    case "research": {
      const books = ["#1d4ed8", "#b91c1c", "#15803d"];
      books.forEach((c, i) => px(ctx, X + 21 + (i % 2), Y + 6 - i * 2, 8, 2, c)); // book stack
      papers(X - 14);
      break;
    }
    case "macro":
      px(ctx, X + 24, Y + 7, 4, 2, "#78350f"); // globe stand
      px(ctx, X + 23, Y + 1, 6, 6, "#2563eb"); // globe
      px(ctx, X + 24, Y + 2, 2, 2, "#22c55e");
      px(ctx, X + 26, Y + 4, 2, 2, "#22c55e");
      px(ctx, X - 13, Y + 3, 7, 6, "#f8fafc"); // desk calendar
      px(ctx, X - 13, Y + 3, 7, 2, "#ef4444");
      break;
    case "broadcast":
      px(ctx, X + 25, Y + 3, 1, 6, "#4b5563"); // mic stand
      px(ctx, X + 23, Y + 8, 5, 1, "#4b5563");
      px(ctx, X + 24, Y, 3, 4, "#1f2937"); // mic
      px(ctx, X + 24, Y, 3, 1, "#9ca3af");
      px(ctx, X - 14, Y + 4, 7, 4, "#1f2937"); // headphones
      px(ctx, X - 13, Y + 5, 5, 2, "#ef4444");
      break;
    case "portfolio":
      px(ctx, X + 25, Y + 4, 1, 4, "#b8892f"); // banker's lamp
      px(ctx, X + 22, Y + 8, 7, 1, "#b8892f");
      px(ctx, X + 21, Y + 1, 9, 3, "#15803d");
      px(ctx, X + 21, Y + 1, 9, 1, "#4ade80");
      px(ctx, X - 14, Y + 4, 9, 5, "#7c5a2b"); // folder
      px(ctx, X - 14, Y + 4, 4, 1, "#a47a3d");
      break;
    case "risk":
      px(ctx, X + 23, Y + 4, 5, 5, "#374151"); // warning light base (lit live)
      px(ctx, X - 14, Y + 3, 9, 6, "#f59e0b"); // binders
      px(ctx, X - 11, Y + 3, 1, 6, "#b45309");
      px(ctx, X - 8, Y + 3, 1, 6, "#b45309");
      break;
  }
}

/** An office chair seen from behind, drawn over whoever sits in it. */
export function chair(ctx: Ctx, cx: number, cy: number) {
  px(ctx, cx - 1, cy + 3, 2, 3, "#22262e"); // gas lift
  px(ctx, cx - 5, cy + 6, 10, 1, "#22262e"); // base
  px(ctx, cx - 6, cy + 6, 2, 2, "#0c0e12"); // wheels
  px(ctx, cx + 4, cy + 6, 2, 2, "#0c0e12");
  px(ctx, cx - 5, cy - 4, 10, 8, "#1d2129"); // back
  px(ctx, cx - 4, cy - 4, 8, 1, "#3a404c");
  px(ctx, cx - 5, cy - 3, 1, 6, "#2c313b");
}

// ---- furniture ------------------------------------------------------------------

export function plant(ctx: Ctx, X: number, Y: number, seed: number) {
  px(ctx, X + 3, Y + 14, 10, 2, "rgba(0,0,0,0.3)");
  px(ctx, X + 4, Y + 8, 8, 7, "#9a5a36"); // pot
  px(ctx, X + 3, Y + 7, 10, 2, "#b86f45");
  px(ctx, X + 4, Y + 13, 8, 1, "#743f22");
  const leaves: Array<[number, number, number, string]> = [
    [1, 1, 6, "#1f7a41"], [9, 0, 6, "#1f7a41"], [4, -5, 7, "#258f4c"], [0, -3, 5, "#1b6b39"],
    [10, -4, 5, "#1b6b39"], [6, -9, 5, "#2fa35a"], [3, 3, 4, "#2a9a52"], [9, 3, 4, "#2a9a52"],
  ];
  for (const [lx, ly, s, c] of leaves) px(ctx, X + lx, Y + ly, s, s - 1, c);
  px(ctx, X + 7 + (seed % 3), Y - 7, 2, 2, "#7ee2a0");
  px(ctx, X + 3, Y - 1, 2, 1, "#7ee2a0");
}

/** A bookcase, or a filing cabinet in the risk room. */
export function shelf(ctx: Ctx, X: number, Y: number, cabinet: boolean, seed: number) {
  if (cabinet) {
    px(ctx, X + 1, Y - 8, 14, 23, "#5d6573");
    px(ctx, X + 1, Y - 8, 14, 1, "#8a93a2");
    for (let d = 0; d < 4; d++) {
      px(ctx, X + 2, Y - 6 + d * 5, 12, 4, "#6c7584");
      px(ctx, X + 6, Y - 5 + d * 5, 4, 1, "#c7ccd4");
    }
    return;
  }
  px(ctx, X, Y - 12, S, 27, "#5a3d28");
  px(ctx, X, Y - 12, S, 1, "#7d583c");
  const books = ["#b91c1c", "#1d4ed8", "#ca8a04", "#15803d", "#7c3aed", "#e5e7eb", "#0f766e"];
  for (let r = 0; r < 4; r++) {
    const sy = Y - 10 + r * 6;
    px(ctx, X + 1, sy, 14, 5, "#2b1d13");
    for (let b = 0; b < 6; b++) {
      if (hash(seed + r, b) < 0.18) continue;
      const h = 3 + Math.floor(hash(b, seed + r) * 2);
      px(ctx, X + 2 + b * 2, sy + 5 - h, 2, h, books[Math.floor(hash(r * 7 + b, seed) * books.length)]);
    }
    px(ctx, X, sy + 5, S, 1, "#7d583c");
  }
}

/** A server rack; its LEDs blink in the live pass (see `serverLeds`). */
export function server(ctx: Ctx, X: number, Y: number) {
  px(ctx, X + 1, Y - 14, 14, 29, "#0f1216");
  px(ctx, X + 1, Y - 14, 14, 1, "#3a414d");
  for (let u = 0; u < 7; u++) {
    px(ctx, X + 2, Y - 12 + u * 4, 12, 3, "#1b1f26");
    px(ctx, X + 3, Y - 11 + u * 4, 6, 1, "#2b313b");
  }
  px(ctx, X + 1, Y + 14, 14, 2, "rgba(0,0,0,0.35)");
}

/** LED positions on a rack at tile (X, Y), for blinking. */
export function serverLeds(X: number, Y: number) {
  const out: Array<{ x: number; y: number }> = [];
  for (let u = 0; u < 7; u++) out.push({ x: X + 11, y: Y - 11 + u * 4 }, { x: X + 13, y: Y - 11 + u * 4 });
  return out;
}

export function floorLamp(ctx: Ctx, X: number, Y: number) {
  px(ctx, X + 4, Y + 13, 8, 2, "#2a2d33");
  px(ctx, X + 7, Y - 8, 2, 21, "#3a3f47");
  px(ctx, X + 3, Y - 14, 10, 6, "#f6d58c");
  px(ctx, X + 3, Y - 14, 10, 1, "#fff1c2");
  px(ctx, X + 3, Y - 9, 10, 1, "#c9a45c");
}

export function sofa(ctx: Ctx, X: number, Y: number, leftEnd: boolean, rightEnd: boolean) {
  px(ctx, X, Y + 1, S, 7, "#3f5b8c"); // back
  px(ctx, X, Y + 1, S, 1, "#5876aa");
  px(ctx, X, Y + 8, S, 6, "#4b6aa0"); // seat
  px(ctx, X, Y + 13, S, 2, "#2d4268");
  if (leftEnd) px(ctx, X, Y + 4, 3, 11, "#35507e");
  if (rightEnd) px(ctx, X + S - 3, Y + 4, 3, 11, "#35507e");
  px(ctx, X + 6, Y + 3, 4, 4, "#e2b04a"); // cushion
}

/** Kitchen counter along the pantry wall: coffee machine, sink, fridge. */
export function counter(ctx: Ctx, X: number, Y: number, item: "coffee" | "sink" | "fridge" | "plain") {
  if (item === "fridge") {
    px(ctx, X + 1, Y - 12, 14, 27, "#dfe5ec");
    px(ctx, X + 1, Y - 12, 14, 1, "#ffffff");
    px(ctx, X + 1, Y - 2, 14, 1, "#9aa4b2");
    px(ctx, X + 12, Y - 9, 1, 5, "#64748b");
    px(ctx, X + 12, Y + 1, 1, 7, "#64748b");
    return;
  }
  px(ctx, X, Y + 4, S, 11, "#b5bcc6"); // cabinets
  px(ctx, X, Y + 1, S, 4, "#e5e7eb"); // worktop
  px(ctx, X, Y + 1, S, 1, "#ffffff");
  px(ctx, X + 7, Y + 6, 1, 8, "#8a929d");
  px(ctx, X + 5, Y + 9, 1, 2, "#4b5563");
  px(ctx, X + 9, Y + 9, 1, 2, "#4b5563");
  if (item === "coffee") {
    px(ctx, X + 3, Y - 9, 10, 11, "#1f2328");
    px(ctx, X + 3, Y - 9, 10, 1, "#3b4048");
    px(ctx, X + 5, Y - 7, 6, 2, "#ef4444");
    px(ctx, X + 6, Y - 2, 4, 3, "#f8fafc");
  } else if (item === "sink") {
    px(ctx, X + 3, Y + 2, 10, 2, "#94a3b8");
    px(ctx, X + 7, Y - 3, 2, 5, "#cbd5e1");
  }
}

/** One tile of the conference table; `edge` marks its front row. */
export function table(ctx: Ctx, X: number, Y: number, front: boolean, laptop: boolean) {
  px(ctx, X, Y, S, S, "#6e4a31");
  px(ctx, X, Y, S, 1, "#8c6446");
  if (front) {
    px(ctx, X, Y + 12, S, 4, "#4e3322");
    px(ctx, X, Y + 12, S, 1, "#3a2518");
  }
  if (laptop) {
    px(ctx, X + 3, Y + 4, 10, 6, "#cbd5e1");
    px(ctx, X + 4, Y + 5, 8, 4, "#38bdf8");
  }
}

/** The trading hub: a raised console in the middle of the floor. */
export function hub(ctx: Ctx, x: number, y: number, w: number, h: number, accent: string) {
  px(ctx, x + 2, y + h - 2, w - 4, 3, "rgba(0,0,0,0.35)");
  px(ctx, x, y + 6, w, h - 14, "#1b2230"); // top surface
  px(ctx, x, y + 6, w, 1, accent);
  px(ctx, x, y + h - 8, w, 6, "#111722"); // front face
  px(ctx, x, y + h - 8, w, 1, "#2a3446");
  px(ctx, x + 2, y + h - 5, w - 4, 1, accent + "88");
}

/** Where the hub's monitors sit, for the live pass. */
export function hubScreens(x: number, y: number, w: number) {
  const n = Math.floor((w - 4) / 15);
  return Array.from({ length: n }, (_, i) => ({ x: x + 3 + i * 15, y: y - 3, w: 12, h: 7 }));
}

// ---- wall decorations ----------------------------------------------------------

export function decor(ctx: Ctx, d: Decor) {
  const { x, y } = d;
  switch (d.kind) {
    case "clock":
      px(ctx, x - 4, y - 4, 8, 8, "#e5e7eb");
      px(ctx, x - 3, y - 5, 6, 10, "#e5e7eb");
      px(ctx, x - 5, y - 3, 10, 6, "#e5e7eb");
      px(ctx, x, y - 3, 1, 3, "#111827");
      px(ctx, x, y, 3, 1, "#111827");
      break;
    case "frame":
      px(ctx, x, y, 16, 11, "#8a6a3a");
      px(ctx, x + 1, y + 1, 14, 9, "#0f172a");
      for (let i = 0; i < 12; i++) px(ctx, x + 2 + i, y + 7 - Math.round(Math.sin(i * 0.7) * 2 + i * 0.25), 1, 1, "#4ade80");
      break;
    case "window":
      px(ctx, x, y, 22, 14, "#3a4356");
      px(ctx, x + 1, y + 1, 20, 12, "#7cb6e8");
      px(ctx, x + 1, y + 8, 20, 5, "#5f8fbd");
      for (const [bx, bh] of [[2, 4], [6, 6], [11, 3], [15, 5]]) px(ctx, x + 1 + bx, y + 13 - bh, 3, bh, "#3b4d68");
      px(ctx, x + 10, y + 1, 2, 12, "#3a4356");
      px(ctx, x + 1, y + 6, 20, 1, "#3a4356");
      break;
    case "whiteboard":
      px(ctx, x, y, 30, 11, "#9aa4b2");
      px(ctx, x + 1, y + 1, 28, 9, "#f8fafc");
      px(ctx, x + 3, y + 3, 10, 1, "#2563eb");
      px(ctx, x + 3, y + 5, 14, 1, "#94a3b8");
      px(ctx, x + 3, y + 7, 8, 1, "#ef4444");
      for (let i = 0; i < 8; i++) px(ctx, x + 19 + i, y + 7 - Math.floor(i / 2), 1, 1, "#16a34a");
      break;
  }
}

/** Bezel for a wall-mounted screen; the picture is drawn live. */
export function wallScreenFrame(ctx: Ctx, x: number, y: number, w: number, h: number) {
  px(ctx, x - 1, y - 1, w + 2, h + 2, "#0b0d11");
  px(ctx, x - 1, y - 1, w + 2, 1, "#2b2f37");
  px(ctx, x + w / 2 - 1, y + h + 1, 2, 1, "rgba(0,0,0,0.4)");
}

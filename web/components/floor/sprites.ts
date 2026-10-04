// Pixel sprites drawn from character grids, cached as tiny canvases.
// No image assets: every pixel is in this file.
//
// Everyone wears a suit: jacket colour by department, tie in the role's
// colour, two hairstyles so the floor isn't a row of clones.

import { ROLES, ROLE_BY_ID, type RoleId } from "./roster";
import type { Dir } from "./sim";

export const SPRITE_W = 10;
export const SPRITE_H = 14;

// o outline · h hair · s skin · e eyes · j jacket · w collar · t tie · p trousers · k shoes
const DOWN = [
  "...oooo...",
  "..ohhhho..",
  ".ohhhhhho.",
  ".ohssssho.",
  ".osesseso.",
  "..osssso..",
  ".ojjwwjjo.",
  "ojjjttjjjo",
  "osjjttjjso",
  ".ojjjjjjo.",
  "..oppppo..",
  "..op..po..",
  "..ok..ko..",
  "..........",
];
const UP = [
  "...oooo...",
  "..ohhhho..",
  ".ohhhhhho.",
  ".ohhhhhho.",
  ".ohhhhhho.",
  "..ohhhho..",
  ".ojjjjjjo.",
  "ojjjjjjjjo",
  "osjjjjjjso",
  ".ojjjjjjo.",
  "..oppppo..",
  "..op..po..",
  "..ok..ko..",
  "..........",
];
const SIDE = [
  "...oooo...",
  "..ohhhhho.",
  ".ohhhhhhho",
  ".ohhhsssso",
  ".ohhssseso",
  "..ohsssso.",
  "..ojjwwo..",
  "..ojjjtjo.",
  "..ojjsjjo.",
  "..ojjjjo..",
  "..oppppo..",
  "..opp.po..",
  "..okk.ko..",
  "..........",
];

// Long hair falls past the jaw and over the shoulders.
const LONG: Record<"down" | "up" | "side", Record<number, string>> = {
  down: { 4: ".ohesseho.", 5: ".ohssssho.", 6: ".hjjwwjjh." },
  up: { 5: ".ohhhhhho.", 6: ".hjjjjjjh." },
  side: { 5: ".ohhssso..", 6: ".hhjjwwo.." },
};

// Walk frames swap the two leg rows; frame 0 is standing.
const LEGS_DOWN = [["..op..po..", "..ok..ko.."], ["..op..po..", "..ok..o..."], ["..op..po..", "..ok..ko.."], ["..op..po..", "...o..ko.."]];
const LEGS_SIDE = [["..opp.po..", "..okk.ko.."], ["..op.ppo..", "..ok.kko.."], ["..opp.po..", "..okk.ko.."], ["..oppp.o..", "..okkk.o.."]];

const HAIR = ["#2b1d14", "#4a3222", "#1c1c1c", "#6b4a2b", "#9c6b3a", "#3a2a1a", "#8a8a8a", "#b9773b"];
const SKIN = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffdbac"];
const JACKET: Record<string, string> = { ops: "#1e3a5f", research: "#2b303b", risk: "#4a1f2f" };

function look(role: RoleId) {
  const i = ROLES.findIndex((r) => r.id === role);
  const r = ROLE_BY_ID[role];
  return {
    colors: {
      o: "#0d0f14",
      h: HAIR[(i * 5 + 2) % HAIR.length],
      s: SKIN[(i * 3 + 1) % SKIN.length],
      e: "#111111",
      j: JACKET[r.dept],
      w: "#eef2f7",
      t: r.shirt,
      p: "#1b1f29",
      k: "#08090c",
    } as Record<string, string>,
    longHair: i % 3 === 1,
  };
}

const cache = new Map<string, HTMLCanvasElement>();

function paint(rows: string[], colors: Record<string, string>, mirror: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = SPRITE_W;
  c.height = SPRITE_H;
  const ctx = c.getContext("2d")!;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === ".") continue;
      ctx.fillStyle = colors[ch] ?? "#ff00ff";
      ctx.fillRect(mirror ? SPRITE_W - 1 - x : x, y, 1, 1);
    }
  });
  return c;
}

/** The sprite for a role facing `dir` at walk frame `frame` (0-3). */
export function personSprite(role: RoleId, dir: Dir, frame: number): HTMLCanvasElement {
  return sprite(role, look(role), dir, frame);
}

// Kimi, the Head Trader: a gold suit and a dark tie, so you always spot yourself.
const KIMI = {
  colors: { o: "#0d0f14", h: "#141414", s: "#e0ac69", e: "#111111", j: "#b7791f", w: "#fef3c7", t: "#111827", p: "#1b1f29", k: "#08090c" } as Record<string, string>,
  longHair: false,
};

export function playerSprite(dir: Dir, frame: number): HTMLCanvasElement {
  return sprite("kimi", KIMI, dir, frame);
}

function sprite(id: string, lk: { colors: Record<string, string>; longHair: boolean }, dir: Dir, frame: number): HTMLCanvasElement {
  frame = Number.isFinite(frame) ? ((Math.floor(frame) % 4) + 4) % 4 : 0; // never index the walk cycle out of range
  const key = `${id}|${dir}|${frame}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const side = dir === 1 || dir === 2;
  const view = dir === 0 ? "down" : dir === 3 ? "up" : "side";
  const base = (view === "down" ? DOWN : view === "up" ? UP : SIDE).slice();
  const { colors, longHair } = lk;
  if (longHair) for (const [row, line] of Object.entries(LONG[view])) base[Number(row)] = line;
  const legs = (side ? LEGS_SIDE : LEGS_DOWN)[frame];
  base[11] = legs[0];
  base[12] = legs[1];
  const out = paint(base, colors, dir === 1);
  cache.set(key, out);
  return out;
}

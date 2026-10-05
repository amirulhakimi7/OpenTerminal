// Pixel sprites drawn from character grids, cached as tiny canvases.
// No image assets: every pixel is in this file.
//
// Everyone wears a suit: jacket colour by department, tie in the role's
// colour, three hairstyles so the floor isn't a row of clones.

import { ROLES, ROLE_BY_ID, type RoleId } from "./roster";
import type { Dir } from "./sim";

export const SPRITE_W = 12;
export const SPRITE_H = 20;
/** Rows still visible above the chair back when someone is seated. */
export const SEATED_ROWS = 15;

// o outline · h hair · H hair shine · s skin · S skin shade · e eyes · b blush
// m mouth · j jacket · J jacket shade · w shirt · t tie · p trousers · k shoes
const DOWN = [
  "...oooooo...",
  "..ohhhhhho..",
  ".ohHHhhhhho.",
  ".ohhhhhhhho.",
  ".ohssssssho.",
  ".osesssseso.",
  ".osbssssbso.",
  "..ossmmsso..",
  "...oSSSSo...",
  "..ojwwwwjo..",
  ".ojjwttwjjo.",
  "ojjjwttwjjjo",
  "oJjjjttjjjJo",
  "osJjjttjjJso",
  ".oJJJJJJJJo.",
  "..oppppppo..",
  "..oppooppo..",
  "..opp..ppo..",
  "..okk..kko..",
  "............",
];
const UP = [
  "...oooooo...",
  "..ohhhhhho..",
  ".ohhhHHhhho.",
  ".ohhhhhhhho.",
  ".ohhhhhhhho.",
  ".ohhhhhhhho.",
  ".ohhhhhhhho.",
  "..ohhhhhho..",
  "...oSSSSo...",
  "..ojjjjjjo..",
  ".ojjjjjjjjo.",
  "ojjjjjjjjjjo",
  "oJjjjjjjjjJo",
  "osJjjjjjjJso",
  ".oJJJJJJJJo.",
  "..oppppppo..",
  "..oppooppo..",
  "..opp..ppo..",
  "..okk..kko..",
  "............",
];
const SIDE = [
  "...ooooo....",
  "..ohhhhhoo..",
  ".ohhhHHhhho.",
  ".ohhhhhhhho.",
  ".ohhhhsssso.",
  ".ohhhsssseo.",
  ".ohhssssbso.",
  "..ohssssmo..",
  "...oSSSo....",
  "...ojwwo....",
  "..ojjjwto...",
  "..ojjjjtjo..",
  "..oJjjjjjo..",
  "..oJjsjjjo..",
  "..oJJJJJJo..",
  "...oppppo...",
  "...oppppo...",
  "...opppo....",
  "...okkko....",
  "............",
];

type View = "down" | "up" | "side";
// Long hair falls past the face on both sides.
const edge = (row: string) => "h" + row.slice(1, 11) + "h";
type Hair = "short" | "crop" | "long";

// Row overrides per hairstyle; "short" is the base grid.
const STYLE: Record<Exclude<Hair, "short">, Record<View, Record<number, string>>> = {
  crop: {
    down: { 3: ".ohssssssho." },
    up: { 6: "..ohhhhhho..", 7: "...oSSSSo..." },
    side: { 4: ".ohhhssssso." },
  },
  long: {
    down: { 4: edge(DOWN[4]), 5: edge(DOWN[5]), 6: edge(DOWN[6]),
      7: ".hossmmssoh.", 8: ".hhoSSSSohh.", 9: ".hojwwwwjoh." },
    up: { 7: ".ohhhhhhhho.", 8: ".ohhhhhhhho.", 9: "..ohhhhhho.." },
    side: { 7: ".hohssssmo..", 8: ".hh.oSSSo...", 9: ".hh.ojwwo..." },
  },
};

// Walk frames swap the three leg rows; frame 0 (and 2) is standing.
const LEGS_DOWN = [
  ["..oppooppo..", "..opp..ppo..", "..okk..kko.."],
  ["..oppooppo..", "..opp..ppo..", "..okk...oo.."],
  ["..oppooppo..", "..opp..ppo..", "..okk..kko.."],
  ["..oppooppo..", "..opp..ppo..", "..oo...kko.."],
];
const LEGS_SIDE = [
  ["...oppppo...", "...opppo....", "...okkko...."],
  ["...opp.po...", "..opp...po..", "..okk...ko.."],
  ["...oppppo...", "...opppo....", "...okkko...."],
  ["...op.ppo...", "...op.ppo...", "...ok.kko..."],
];

const HAIR = ["#2b1d14", "#4a3222", "#1c1c1c", "#6b4a2b", "#9c6b3a", "#3a2a1a", "#8a8a8a", "#b9773b"];
const SKIN = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffdbac"];
const JACKET: Record<string, string> = { ops: "#24406b", research: "#363b4c", risk: "#5b2338" };
const HAIRSTYLES: Hair[] = ["short", "long", "crop"];

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

type Look = { colors: Record<string, string>; hair: Hair };

function palette(hair: string, skin: string, jacket: string, tie: string): Record<string, string> {
  return {
    o: "#16120f",
    h: hair,
    H: shade(hair, 0.35),
    s: skin,
    S: shade(skin, -0.18),
    e: "#1b1b22",
    b: shade(skin, -0.08),
    m: shade(skin, -0.32),
    j: jacket,
    J: shade(jacket, -0.3),
    w: "#f1f5f9",
    t: tie,
    p: "#23262f",
    k: "#0c0c10",
  };
}

function look(role: RoleId): Look {
  const i = ROLES.findIndex((r) => r.id === role);
  const r = ROLE_BY_ID[role];
  return {
    colors: palette(HAIR[(i * 5 + 2) % HAIR.length], SKIN[(i * 3 + 1) % SKIN.length], JACKET[r.dept], r.shirt),
    hair: HAIRSTYLES[i % 3],
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

/** The grid for a pose, before colouring. Pure; exported for tests. */
export function spriteRows(view: View, hair: Hair, frame: number): string[] {
  const rows = (view === "down" ? DOWN : view === "up" ? UP : SIDE).slice();
  if (hair !== "short") for (const [row, line] of Object.entries(STYLE[hair][view])) rows[Number(row)] = line;
  const legs = (view === "side" ? LEGS_SIDE : LEGS_DOWN)[frame];
  rows[16] = legs[0];
  rows[17] = legs[1];
  rows[18] = legs[2];
  return rows;
}

/** The sprite for a role facing `dir` at walk frame `frame` (0-3). */
export function personSprite(role: RoleId, dir: Dir, frame: number): HTMLCanvasElement {
  return sprite(role, look(role), dir, frame);
}

// Kimi, the Head Trader: a gold suit and a dark tie, so you always spot yourself.
const KIMI: Look = { colors: palette("#141414", "#e0ac69", "#b7791f", "#111827"), hair: "short" };
KIMI.colors.w = "#fef3c7";

export function playerSprite(dir: Dir, frame: number): HTMLCanvasElement {
  return sprite("kimi", KIMI, dir, frame);
}

function sprite(id: string, lk: Look, dir: Dir, frame: number): HTMLCanvasElement {
  frame = Number.isFinite(frame) ? ((Math.floor(frame) % 4) + 4) % 4 : 0; // never index the walk cycle out of range
  const key = `${id}|${dir}|${frame}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const view: View = dir === 0 ? "down" : dir === 3 ? "up" : "side";
  const out = paint(spriteRows(view, lk.hair, frame), lk.colors, dir === 1);
  cache.set(key, out);
  return out;
}

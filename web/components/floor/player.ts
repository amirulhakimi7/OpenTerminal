// Kimi, the Head Trader: the avatar you walk around the floor. Pure: input
// and dt come in, nothing touches the DOM.

import { findPath } from "./pathfind";
import type { RoleId } from "./roster";
import type { Dir, World } from "./sim";
import { TILE, walkable, type FloorMap, type Point } from "./tilemap";

export type Player = {
  px: number;
  py: number; // feet, world px
  dir: Dir;
  walkT: number;
  moving: boolean;
  path: Point[]; // click-to-move route, tiles
  energy: number; // 0-100: walking tires you, coffee fixes it
};

export type Input = { dx: number; dy: number; run: boolean };

export const WALK_SPEED = 48;
export const RUN_SPEED = 84;
const REACH = 22; // px: how close you must be to interact

export function createPlayer(map: FloorMap): Player {
  return { px: map.entrance.x * TILE + 8, py: (map.entrance.y - 1) * TILE + 8, dir: 3, walkT: 0, moving: false, path: [], energy: 80 };
}

const tileOf = (x: number, y: number): Point => ({ x: Math.floor(x / TILE), y: Math.floor(y / TILE) });

/** Can the player's feet stand at (x, y)? A small box, so corners don't clip walls. */
function free(map: FloorMap, x: number, y: number): boolean {
  for (const [ox, oy] of [[-3, -1], [3, -1], [-3, 2], [3, 2]]) {
    const t = tileOf(x + ox, y + oy);
    if (!walkable(map, t.x, t.y)) return false;
  }
  return true;
}

/**
 * Advance the player. Keyboard input wins; with no keys held, follow the
 * click-to-move path. Each axis moves separately so you slide along walls.
 */
export function stepPlayer(p: Player, map: FloorMap, input: Input, dt: number) {
  dt = Math.min(Math.max(dt, 0), 0.1);
  let { dx, dy } = input;
  if (dx || dy) p.path = [];
  else if (p.path.length) {
    const next = p.path[0];
    const tx = next.x * TILE + 8;
    const ty = next.y * TILE + 8;
    if (Math.hypot(tx - p.px, ty - p.py) < 2) {
      p.px = tx;
      p.py = ty;
      p.path.shift();
    }
    if (p.path.length) {
      dx = Math.sign(Math.round(p.path[0].x * TILE + 8 - p.px));
      dy = Math.sign(Math.round(p.path[0].y * TILE + 8 - p.py));
    }
  }
  const len = Math.hypot(dx, dy);
  p.moving = len > 0;
  if (!p.moving) {
    p.energy = Math.min(100, p.energy + dt * 0.5); // standing still, you catch your breath
    return;
  }
  const tired = p.energy < 10;
  const speed = (input.run && !tired ? RUN_SPEED : WALK_SPEED) * (tired ? 0.6 : 1);
  const step = (speed * dt) / len;
  const nx = p.px + dx * step;
  const ny = p.py + dy * step;
  if (free(map, nx, p.py)) p.px = nx;
  if (free(map, p.px, ny)) p.py = ny;
  if (Math.abs(dx) > Math.abs(dy)) p.dir = dx < 0 ? 1 : 2;
  else if (dy) p.dir = dy < 0 ? 3 : 0;
  p.walkT += dt;
  p.energy = Math.max(0, p.energy - dt * (input.run ? 3 : 0.8));
}

/** Route the player to a tile (click-to-move). False when it can't be reached. */
export function walkTo(p: Player, map: FloorMap, goal: Point): boolean {
  const path = findPath(tileOf(p.px, p.py), goal, (x, y) => walkable(map, x, y), map.w, map.h);
  if (!path) return false;
  p.path = path;
  return true;
}

export type Interactable =
  | { kind: "person"; role: RoleId; x: number; y: number }
  | { kind: "desk"; role: RoleId; x: number; y: number }
  | { kind: "bell"; x: number; y: number }
  | { kind: "coffee"; x: number; y: number }
  | { kind: "wall"; x: number; y: number };

/** World px of the things on the floor you can use, besides people and desks. */
export function fixtures(map: FloorMap) {
  return {
    bell: { x: map.pitCenter.x, y: 3 * TILE + 8 },
    coffee: { x: 31 * TILE + 8, y: 21 * TILE + 8 },
    wall: { x: map.pitCenter.x, y: 2.5 * TILE },
  };
}

/**
 * What the player could interact with right now, nearest first by priority:
 * a person, the bell, the coffee machine, the video wall, then a desk.
 */
export function nearestInteractable(p: Player, w: World): Interactable | null {
  const d = (x: number, y: number) => Math.hypot(x - p.px, y - p.py);
  const people = w.agents
    .filter((a) => !a.hidden && d(a.px, a.py) <= REACH)
    .sort((a, b) => d(a.px, a.py) - d(b.px, b.py));
  if (people[0]) return { kind: "person", role: people[0].role, x: people[0].px, y: people[0].py };

  const f = fixtures(w.map);
  if (d(f.bell.x, f.bell.y) <= REACH) return { kind: "bell", ...f.bell };
  if (d(f.coffee.x, f.coffee.y) <= REACH) return { kind: "coffee", ...f.coffee };
  const board = w.map.zones.find((z) => z.id === "board")!.rect;
  if (p.py <= 4 * TILE && p.px >= board.x * TILE && p.px <= (board.x + board.w) * TILE) return { kind: "wall", ...f.wall };

  const desks = (Object.entries(w.map.desks) as Array<[RoleId, (typeof w.map.desks)[RoleId]]>)
    .map(([role, s]) => ({ role, x: s.desk.x * TILE + 8, y: s.desk.y * TILE + 8 }))
    .filter((k) => d(k.x, k.y) <= REACH)
    .sort((a, b) => d(a.x, a.y) - d(b.x, b.y));
  if (desks[0]) return { kind: "desk", ...desks[0] };
  return null;
}

/** Drink a coffee: energy back up. */
export function drinkCoffee(p: Player) {
  p.energy = Math.min(100, p.energy + 45);
}

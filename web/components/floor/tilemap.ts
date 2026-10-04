// Floor plan, top-down, on a 40x24 grid of 16px tiles. Pure.
//
//   ═════════════════ LED ticker tape ═════════════════
//   ┌──────────┐ ┌─────── VIDEO WALL ───────┐ ┌──────────┐
//   │ TRADING  │                            │ PORTFOLIO│
//   │   OPS    │      ╭──── the pit ────╮   │  & RISK  │
//   ╞══ glass ═╡      │  ▣ centre post  │   ╞══ glass ═╡
//   │CONFERENCE│      ╰─ 12 research ───╯   │  PANTRY  │
//   └──────────┘           door             └──────────┘

import { DEPARTMENTS, ROLES, type DeptId, type RoleId } from "./roster";

export const TILE = 16;
export const MAP_W = 40;
export const MAP_H = 24;

export const T = {
  Floor: 0,
  Wall: 1,
  CarpetOps: 2,
  CarpetResearch: 3,
  CarpetRisk: 4,
  Desk: 5,
  Board: 6,
  Plant: 7,
  Table: 8,
  Conference: 9,
  Pantry: 10,
  Counter: 11,
  Door: 12,
  Glass: 13,
  Post: 14,
  Sofa: 15,
} as const;

const BLOCKED = new Set<number>([T.Wall, T.Desk, T.Board, T.Plant, T.Table, T.Counter, T.Glass, T.Post, T.Sofa]);

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
/** Direction a seated person faces: 0 down, 1 left, 2 right, 3 up. */
export type Facing = 0 | 1 | 2 | 3;
export type ZoneId = DeptId | "conference" | "pantry" | "board";
export type Zone = { id: ZoneId; name: string; rect: Rect };
export type DeskSpot = { desk: Point; seat: Point; facing: Facing };

export type FloorMap = {
  w: number;
  h: number;
  tiles: Uint8Array;
  desks: Record<RoleId, DeskSpot>;
  zones: Zone[];
  entrance: Point;
  exit: Point; // the door tile, where off-duty people disappear
  pantrySpots: Point[];
  conferenceSpots: Point[];
  gatherSpots: Point[]; // in front of the video wall
  post: Rect; // the pit's centre post
  pitCenter: { x: number; y: number }; // world px
  lamps: Array<{ x: number; y: number; r: number }>; // world px
};

export function tileAt(map: FloorMap, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return T.Wall;
  return map.tiles[y * map.w + x];
}

export function walkable(map: FloorMap, x: number, y: number): boolean {
  return !BLOCKED.has(tileAt(map, x, y));
}

export function buildFloor(): FloorMap {
  const tiles = new Uint8Array(MAP_W * MAP_H).fill(T.Floor);
  const set = (x: number, y: number, t: number) => {
    if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) tiles[y * MAP_W + x] = t;
  };
  const fill = (r: Rect, t: number) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set(x, y, t);
  };
  const hline = (x0: number, x1: number, y: number, t: number) => { for (let x = x0; x <= x1; x++) set(x, y, t); };
  const vline = (x: number, y0: number, y1: number, t: number) => { for (let y = y0; y <= y1; y++) set(x, y, t); };

  // Outer walls (the top one carries the ticker tape), entrance at the bottom.
  hline(0, MAP_W - 1, 0, T.Wall);
  hline(0, MAP_W - 1, MAP_H - 1, T.Wall);
  vline(0, 0, MAP_H - 1, T.Wall);
  vline(MAP_W - 1, 0, MAP_H - 1, T.Wall);
  set(19, MAP_H - 1, T.Door);
  set(20, MAP_H - 1, T.Door);

  const ops: Rect = { x: 1, y: 1, w: 10, h: 9 };
  const risk: Rect = { x: 29, y: 1, w: 10, h: 9 };
  const conf: Rect = { x: 1, y: 15, w: 10, h: 8 };
  const pantry: Rect = { x: 29, y: 15, w: 10, h: 8 };
  const research: Rect = { x: 13, y: 4, w: 14, h: 17 };

  fill(ops, T.CarpetOps);
  fill(risk, T.CarpetRisk);
  fill(conf, T.Conference);
  fill(pantry, T.Pantry);
  fill(research, T.CarpetResearch);

  // Glass partitions around the four rooms, with doorway gaps.
  vline(11, 1, 10, T.Glass);
  hline(1, 11, 10, T.Glass);
  vline(28, 1, 10, T.Glass);
  hline(28, 38, 10, T.Glass);
  hline(1, 11, 14, T.Glass);
  vline(11, 14, 22, T.Glass);
  hline(28, 38, 14, T.Glass);
  vline(28, 14, 22, T.Glass);
  for (const [x, y] of [[11, 6], [11, 7], [5, 10], [6, 10], [28, 6], [28, 7], [33, 10], [34, 10],
                        [11, 18], [11, 19], [5, 14], [6, 14], [28, 18], [28, 19], [33, 14], [34, 14]]) {
    set(x, y, T.Door);
  }

  // Video wall along the top, between the two upper rooms.
  fill({ x: 12, y: 1, w: 16, h: 2 }, T.Board);

  // The pit's centre post: a block of screens facing every way.
  const post: Rect = { x: 18, y: 10, w: 4, h: 3 };
  fill(post, T.Post);

  // Desks. Each has a seat on one side; the person faces the desk.
  const spot = (dx: number, dy: number, facing: Facing): DeskSpot => {
    const off = [[0, -1], [1, 0], [-1, 0], [0, 1]][facing]; // seat sits opposite the way they face
    return { desk: { x: dx, y: dy }, seat: { x: dx + off[0], y: dy + off[1] }, facing };
  };
  const ordered = [...ROLES].sort((a, b) => deptOrder(a.dept) - deptOrder(b.dept));
  const spots: DeskSpot[] = [
    // trading ops: two rows of two, facing up at their screens
    spot(3, 3, 3), spot(7, 3, 3), spot(3, 6, 3), spot(7, 6, 3),
    // the pit: twelve desks in a ring, everyone facing the centre post
    spot(16, 8, 0), spot(18, 7, 0), spot(21, 7, 0), spot(23, 8, 0),
    spot(14, 10, 2), spot(25, 10, 1), spot(14, 12, 2), spot(25, 12, 1),
    spot(16, 14, 3), spot(18, 15, 3), spot(21, 15, 3), spot(23, 14, 3),
    // portfolio & risk
    spot(32, 4, 3), spot(35, 4, 3),
  ];
  const desks = {} as Record<RoleId, DeskSpot>;
  ordered.forEach((role, i) => {
    const s = spots[i];
    set(s.desk.x, s.desk.y, T.Desk);
    desks[role.id] = s;
  });

  // Furniture.
  for (const [x, y] of [[1, 1], [10, 1], [29, 1], [38, 1], [13, 20], [26, 20], [1, 22], [38, 22], [12, 4], [27, 4]]) {
    set(x, y, T.Plant);
  }
  fill({ x: 4, y: 17, w: 4, h: 3 }, T.Table);
  hline(30, 37, 22, T.Counter);
  hline(35, 37, 16, T.Sofa);

  const conferenceSpots: Point[] = [];
  for (let x = 4; x <= 7; x++) conferenceSpots.push({ x, y: 16 }, { x, y: 20 });
  conferenceSpots.push({ x: 3, y: 18 }, { x: 8, y: 18 });

  const pantrySpots: Point[] = [];
  for (let x = 30; x <= 36; x += 2) pantrySpots.push({ x, y: 21 }, { x: x + 1, y: 19 });

  const gatherSpots: Point[] = [];
  for (let x = 13; x <= 26; x++) gatherSpots.push({ x, y: 3 });
  for (let x = 14; x <= 25; x += 3) gatherSpots.push({ x, y: 5 });

  const zones: Zone[] = [
    { id: "ops", name: DEPARTMENTS[0].name, rect: ops },
    { id: "research", name: DEPARTMENTS[1].name, rect: research },
    { id: "risk", name: DEPARTMENTS[2].name, rect: risk },
    { id: "conference", name: "Conference", rect: conf },
    { id: "pantry", name: "Pantry", rect: pantry },
    { id: "board", name: "Board", rect: { x: 12, y: 1, w: 16, h: 2 } },
  ];

  const c = (x: number, y: number) => ({ x: x * TILE, y: y * TILE });
  return {
    w: MAP_W,
    h: MAP_H,
    tiles,
    desks,
    zones,
    entrance: { x: 19, y: MAP_H - 2 },
    exit: { x: 19, y: MAP_H - 1 },
    pantrySpots,
    conferenceSpots,
    gatherSpots,
    post,
    pitCenter: c(20, 11.5),
    lamps: [
      { ...c(6, 5.5), r: 70 },
      { ...c(34, 5.5), r: 70 },
      { ...c(6, 18.5), r: 64 },
      { ...c(34, 18.5), r: 64 },
      { ...c(20, 11.5), r: 120 },
      { ...c(20, 4.5), r: 56 },
      { ...c(20, 19), r: 56 },
    ],
  };
}

function deptOrder(d: DeptId): number {
  return d === "ops" ? 0 : d === "research" ? 1 : 2;
}

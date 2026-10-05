// Floor plan on a 40x24 grid of 16px tiles, drawn in a 3/4 view: every room
// has a back wall you can see, labelled like an office directory. Pure.
//
//   ═══════════════════════ LED ticker tape ═══════════════════════
//   ┌─ RESEARCH ─────────┐┌─ TRADING FLOOR ── video wall ─┐┌─ RISK ──┐
//   │ 12 analyst desks   ││ 4 desks around the hub, bell  ││ RM desk │
//   └──────── door ──────┘└──────────── door ─────────────┘└─ door ──┘
//   ═══════════════════════════ corridor ═══════════════════════════
//   ┌ PORTFOLIO ┐┌ CONFERENCE ┐┌lobby┐┌ PANTRY ┐┌ IT & SYSTEMS ┐
//   └───────────┘└────────────┘└door─┘└────────┘└──────────────┘

import { ROLES, type DeptId, type RoleId } from "./roster";

export const TILE = 16;
export const MAP_W = 40;
export const MAP_H = 24;
/** Every desk is three tiles wide; `DeskSpot.desk` is its middle tile, right above the seat. */
export const DESK_W = 3;

export const T = {
  Floor: 0,
  Wall: 1, // seen from above: partitions and the outer shell
  WallFace: 2, // the back wall of a room, seen face-on
  Desk: 5,
  Board: 6, // the video wall, on the trading floor's back wall
  Plant: 7,
  Table: 8,
  Counter: 11,
  Door: 12,
  Post: 14, // the trading hub in the middle of the floor
  Sofa: 15,
  Shelf: 16, // bookcases and filing cabinets
  Server: 17,
  Lamp: 18,
} as const;

const BLOCKED = new Set<number>([T.Wall, T.WallFace, T.Desk, T.Board, T.Plant, T.Table, T.Counter, T.Post, T.Sofa, T.Shelf, T.Server, T.Lamp]);

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
/** Direction a seated person faces: 0 down, 1 left, 2 right, 3 up. */
export type Facing = 0 | 1 | 2 | 3;
export type ZoneId = DeptId | "portfolio" | "conference" | "pantry" | "it" | "board";
export type Zone = { id: ZoneId; name: string; rect: Rect };
export type DeskSpot = { desk: Point; seat: Point; facing: Facing };
/** Floor finish under a room, picked by the renderer. */
export type Ground = "wood" | "carpet" | "risk" | "tile" | "stone" | "server" | "marble";
/** Screens hung on a back wall, in world px; `kind` picks what they show. */
export type WallScreen = Rect & { kind: "charts" | "risk" };
export type Decor = { kind: "frame" | "clock" | "window" | "whiteboard"; x: number; y: number }; // world px

export type FloorMap = {
  w: number;
  h: number;
  tiles: Uint8Array;
  desks: Record<RoleId, DeskSpot>;
  zones: Zone[];
  grounds: Array<{ rect: Rect; ground: Ground }>;
  wallScreens: WallScreen[];
  decor: Decor[];
  entrance: Point;
  exit: Point; // the door tile, where off-duty people disappear
  pantrySpots: Point[];
  conferenceSpots: Point[];
  gatherSpots: Point[]; // in front of the video wall
  post: Rect; // the trading hub
  pitCenter: { x: number; y: number }; // world px: middle of the trading floor
  lamps: Array<{ x: number; y: number; r: number }>; // world px
};

export function tileAt(map: FloorMap, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return T.Wall;
  return map.tiles[y * map.w + x];
}

export function walkable(map: FloorMap, x: number, y: number): boolean {
  return !BLOCKED.has(tileAt(map, x, y));
}

/** Rows that are horizontal walls, drawn with a visible face. */
export const H_WALL_ROWS = [0, 12, MAP_H - 1];

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

  // Outer shell: the top wall carries the ticker tape, the door is bottom centre.
  hline(0, MAP_W - 1, 0, T.Wall);
  hline(0, MAP_W - 1, MAP_H - 1, T.Wall);
  vline(0, 0, MAP_H - 1, T.Wall);
  vline(MAP_W - 1, 0, MAP_H - 1, T.Wall);
  set(19, MAP_H - 1, T.Door);
  set(20, MAP_H - 1, T.Door);

  // Top row of rooms: a two-tile back wall, partitions, and a wall onto the corridor.
  fill({ x: 1, y: 1, w: MAP_W - 2, h: 2 }, T.WallFace);
  vline(16, 1, 12, T.Wall);
  vline(31, 1, 12, T.Wall);
  hline(1, MAP_W - 2, 12, T.Wall);
  for (const x of [7, 8, 24, 25, 35]) set(x, 12, T.Door);

  // Bottom row of rooms: a one-tile back wall, open to the lobby in the middle.
  hline(1, MAP_W - 2, 15, T.WallFace);
  for (const x of [9, 18, 21, 30]) vline(x, 15, MAP_H - 2, T.Wall);
  for (const x of [19, 20]) set(x, 15, T.Floor);
  for (const x of [5, 14, 23, 32]) set(x, 15, T.Door);

  // The video wall on the trading floor's back wall, and the hub in front of it.
  const board: Rect = { x: 21, y: 1, w: 8, h: 2 };
  fill(board, T.Board);
  const post: Rect = { x: 23, y: 7, w: 4, h: 3 };
  fill(post, T.Post);

  // Desks, three tiles wide, everyone facing up at their screens.
  const spot = (dx: number, dy: number): DeskSpot => ({ desk: { x: dx, y: dy }, seat: { x: dx, y: dy + 1 }, facing: 3 });
  const research: DeskSpot[] = [];
  for (const y of [4, 7, 10]) for (const x of [2, 6, 10, 14]) research.push(spot(x, y));
  const spots: DeskSpot[] = [
    spot(18, 6), spot(29, 6), spot(18, 9), spot(29, 9), // trading operations, around the hub
    ...research,
    spot(4, 18), // portfolio manager
    spot(35, 5), // risk manager
  ];
  const ordered = [...ROLES].sort((a, b) => deptOrder(a.dept) - deptOrder(b.dept));
  const desks = {} as Record<RoleId, DeskSpot>;
  ordered.forEach((role, i) => {
    const s = spots[i];
    for (let k = -1; k <= 1; k++) set(s.desk.x + k, s.desk.y, T.Desk);
    desks[role.id] = s;
  });

  // Furniture.
  for (const [x, y] of [[1, 3], [15, 3], [8, 3], [30, 3], [17, 11], [30, 11], [32, 11], [38, 11], [1, 22], [10, 16], [17, 22], [22, 22], [31, 22], [8, 22]]) {
    set(x, y, T.Plant);
  }
  for (const [x, y] of [[37, 3], [38, 3], [7, 16], [8, 16], [1, 16], [2, 16]]) set(x, y, T.Shelf);
  set(1, 19, T.Lamp);
  set(38, 7, T.Lamp);
  fill({ x: 12, y: 18, w: 4, h: 2 }, T.Table);
  hline(26, 29, 16, T.Counter);
  hline(26, 28, 22, T.Sofa);
  hline(34, 38, 16, T.Server);
  hline(34, 37, 19, T.Server);

  const conferenceSpots: Point[] = [];
  for (let x = 12; x <= 15; x++) conferenceSpots.push({ x, y: 17 }, { x, y: 20 });
  conferenceSpots.push({ x: 11, y: 18 }, { x: 16, y: 19 });

  const pantrySpots: Point[] = [
    { x: 23, y: 18 }, { x: 25, y: 19 }, { x: 27, y: 18 }, { x: 28, y: 20 },
    { x: 24, y: 21 }, { x: 26, y: 20 }, { x: 29, y: 19 }, { x: 23, y: 20 },
  ];

  const gatherSpots: Point[] = [];
  for (const y of [3, 4]) for (let x = 17; x <= 30; x++) if (tiles[y * MAP_W + x] === T.Floor) gatherSpots.push({ x, y });

  const zones: Zone[] = [
    // The board comes first so pointing at the video wall finds it, not the room around it.
    { id: "board", name: "Video wall", rect: board },
    { id: "research", name: "Research & Intelligence", rect: { x: 1, y: 1, w: 15, h: 11 } },
    { id: "ops", name: "Trading Floor", rect: { x: 17, y: 1, w: 14, h: 11 } },
    { id: "risk", name: "Risk Management", rect: { x: 32, y: 1, w: 7, h: 11 } },
    { id: "portfolio", name: "Portfolio Management", rect: { x: 1, y: 15, w: 8, h: 8 } },
    { id: "conference", name: "Conference", rect: { x: 10, y: 15, w: 8, h: 8 } },
    { id: "pantry", name: "Pantry", rect: { x: 22, y: 15, w: 8, h: 8 } },
    { id: "it", name: "IT & Systems", rect: { x: 31, y: 15, w: 8, h: 8 } },
  ];

  const grounds: FloorMap["grounds"] = [
    { rect: { x: 1, y: 13, w: MAP_W - 2, h: 2 }, ground: "stone" },
    { rect: { x: 19, y: 15, w: 2, h: 8 }, ground: "marble" },
    { rect: { x: 1, y: 1, w: 15, h: 11 }, ground: "wood" },
    { rect: { x: 17, y: 1, w: 14, h: 11 }, ground: "wood" },
    { rect: { x: 32, y: 1, w: 7, h: 11 }, ground: "risk" },
    { rect: { x: 1, y: 15, w: 8, h: 8 }, ground: "wood" },
    { rect: { x: 10, y: 15, w: 8, h: 8 }, ground: "carpet" },
    { rect: { x: 22, y: 15, w: 8, h: 8 }, ground: "tile" },
    { rect: { x: 31, y: 15, w: 8, h: 8 }, ground: "server" },
  ];

  const W = (x: number, y: number, w: number, h: number, kind: WallScreen["kind"]): WallScreen => ({ x, y, w, h, kind });
  // Kept clear of the room labels, which sit at the left end of each back wall.
  const wallScreens: WallScreen[] = [
    W(8 * TILE, 17, 22, 12, "charts"), W(8 * TILE + 24, 17, 22, 12, "charts"),
    W(11 * TILE + 8, 17, 22, 12, "charts"), W(11 * TILE + 32, 17, 22, 12, "charts"),
    W(36 * TILE + 8, 16, 34, 14, "risk"),
  ];
  const decor: Decor[] = [
    { kind: "clock", x: 15 * TILE + 4, y: 22 },
    { kind: "window", x: 29 * TILE + 2, y: 14 },
    { kind: "whiteboard", x: 15 * TILE + 4, y: 15 * TILE + 2 },
    { kind: "clock", x: 25 * TILE + 8, y: 15 * TILE + 8 },
  ];

  const c = (x: number, y: number) => ({ x: x * TILE, y: y * TILE });
  return {
    w: MAP_W,
    h: MAP_H,
    tiles,
    desks,
    zones,
    grounds,
    wallScreens,
    decor,
    entrance: { x: 19, y: MAP_H - 2 },
    exit: { x: 19, y: MAP_H - 1 },
    pantrySpots,
    conferenceSpots,
    gatherSpots,
    post,
    pitCenter: c(25, 8.5),
    lamps: [
      { ...c(8, 7.5), r: 90 },
      { ...c(24, 7.5), r: 90 },
      { ...c(35.5, 7), r: 52 },
      { ...c(5, 19.5), r: 56 },
      { ...c(14, 19.5), r: 56 },
      { ...c(26, 19.5), r: 56 },
      { ...c(35, 19.5), r: 56 },
      { ...c(10, 14), r: 44 },
      { ...c(30, 14), r: 44 },
      { ...c(1.5, 19.3), r: 30 },
      { ...c(38.5, 7.3), r: 30 },
    ],
  };
}

function deptOrder(d: DeptId): number {
  return d === "ops" ? 0 : d === "research" ? 1 : 2;
}

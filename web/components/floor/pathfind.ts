// A* on a 4-connected tile grid. Pure.

import type { Point } from "./tilemap";

/**
 * Shortest path from `start` to `goal`.
 *
 * Returns the tiles to step through, excluding `start` and including `goal`;
 * an empty array when already there; null when the goal is unreachable or
 * blocked. `canWalk` decides passability; the goal itself must be walkable.
 * `maxNodes` bounds the search so a bad target can't stall a frame.
 */
export function findPath(
  start: Point,
  goal: Point,
  canWalk: (x: number, y: number) => boolean,
  width: number,
  height: number,
  maxNodes = 4000
): Point[] | null {
  if (start.x === goal.x && start.y === goal.y) return [];
  if (!canWalk(goal.x, goal.y)) return null;

  const key = (x: number, y: number) => y * width + x;
  const h = (x: number, y: number) => Math.abs(x - goal.x) + Math.abs(y - goal.y);

  const g = new Map<number, number>([[key(start.x, start.y), 0]]);
  const came = new Map<number, number>();
  // Small open list; the floor is 960 tiles, so a sorted array beats a heap's overhead.
  const open: Array<{ k: number; x: number; y: number; f: number }> = [
    { k: key(start.x, start.y), x: start.x, y: start.y, f: h(start.x, start.y) },
  ];
  const closed = new Set<number>();
  let expanded = 0;

  while (open.length > 0) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i;
    const cur = open.splice(best, 1)[0];
    if (cur.x === goal.x && cur.y === goal.y) {
      const path: Point[] = [];
      let k: number | undefined = cur.k;
      const startKey = key(start.x, start.y);
      while (k !== undefined && k !== startKey) {
        path.push({ x: k % width, y: Math.floor(k / width) });
        k = came.get(k);
      }
      return path.reverse();
    }
    if (closed.has(cur.k)) continue;
    closed.add(cur.k);
    if (++expanded > maxNodes) return null;

    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || !canWalk(nx, ny)) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const ng = (g.get(cur.k) ?? 0) + 1;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        came.set(nk, cur.k);
        open.push({ k: nk, x: nx, y: ny, f: ng + h(nx, ny) });
      }
    }
  }
  return null;
}

// Agent simulation for the floor. Pure: seeded RNG, time comes in as `dt`.
//
// Each person sits at their desk, wanders to the pantry or a colleague now and
// then, and reacts to FloorEvents: a new signal is carried to the Trade
// Analyst, a risk block sends the Risk Manager to the trading desk, FORCE FLAT
// gathers everyone at the board, and a closed market sends them home.

import { findPath } from "./pathfind";
import { factFor, type FloorSnapshot } from "./snapshot";
import type { FloorEvent } from "./events";
import { NIGHT_SHIFT, ROLES, ROLE_BY_ID, type RoleId } from "./roster";
import { TILE, walkable, type FloorMap, type Point } from "./tilemap";

export type Dir = 0 | 1 | 2 | 3; // down, left, right, up
export type Errand = "sit" | "talk" | "break" | "gather" | "leave";
export type State = "seated" | "walking" | "talking" | "offDuty";

export type Bubble = { text: string; ttl: number; alert: boolean };

/** A glowing data-flow line from one desk to another while a message travels. */
export type Link = { from: Point; to: Point; color: string; ttl: number; life: number };

export type Agent = {
  role: RoleId;
  px: number;
  py: number;
  tile: Point;
  state: State;
  hidden: boolean;
  dir: Dir;
  walkT: number;
  path: Point[];
  speed: number;
  onArrive: Errand;
  timer: number; // seconds until the next decision (seated) or until leaving (talking)
  delay: number; // stagger before a pending move starts
  pending: { dest: Point; onArrive: Errand; speed: number } | null;
  carrying: boolean;
  deliverTo: RoleId | null; // who reacts when this agent arrives
  bubble: Bubble | null;
};

export type World = {
  map: FloorMap;
  agents: Agent[];
  byRole: Record<RoleId, Agent>;
  rng: () => number;
  alarm: boolean; // FORCE FLAT
  riskAlarm: boolean; // NO NEW RISK
  closed: boolean;
  links: Link[];
  time: number;
};

const WALK = 28; // px per second
const RUN = 56;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const center = (p: Point) => ({ x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE / 2 });

export function createWorld(map: FloorMap, seed = 1): World {
  const rng = mulberry32(seed);
  const agents: Agent[] = ROLES.map((r) => {
    const seat = map.desks[r.id].seat;
    const c = center(seat);
    return {
      role: r.id,
      px: c.x,
      py: c.y,
      tile: { ...seat },
      state: "seated",
      hidden: false,
      dir: map.desks[r.id].facing,
      walkT: 0,
      path: [],
      speed: WALK,
      onArrive: "sit",
      timer: 4 + rng() * 14,
      delay: 0,
      pending: null,
      carrying: false,
      deliverTo: null,
      bubble: null,
    };
  });
  const byRole = Object.fromEntries(agents.map((a) => [a.role, a])) as Record<RoleId, Agent>;
  return { map, agents, byRole, rng, alarm: false, riskAlarm: false, closed: false, time: 0, links: [] };
}

function say(a: Agent, text: string, ttl = 5, alert = false) {
  a.bubble = { text, ttl, alert };
}

/** A walkable tile beside someone's seat, so visitors stand next to them, not on them. */
function besideSeat(w: World, role: RoleId): Point {
  const s = w.map.desks[role].seat;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [-1, 1], [1, 1]]) {
    const p = { x: s.x + dx, y: s.y + dy };
    if (walkable(w.map, p.x, p.y)) return p;
  }
  return s;
}

function goTo(w: World, a: Agent, dest: Point, onArrive: Errand, speed = WALK): boolean {
  const path = findPath(a.tile, dest, (x, y) => walkable(w.map, x, y), w.map.w, w.map.h);
  if (path === null) return false;
  a.path = path;
  a.onArrive = onArrive;
  a.speed = speed;
  a.state = "walking";
  a.hidden = false;
  if (path.length === 0) arrive(w, a);
  return true;
}

function schedule(a: Agent, dest: Point, onArrive: Errand, delay: number, speed = WALK) {
  a.pending = { dest, onArrive, speed };
  a.delay = delay;
}

function goHome(w: World, a: Agent) {
  if (!goTo(w, a, w.map.desks[a.role].seat, "sit")) {
    const c = center(w.map.desks[a.role].seat);
    Object.assign(a, { px: c.x, py: c.y, tile: { ...w.map.desks[a.role].seat }, state: "seated", path: [] });
  }
}

function arrive(w: World, a: Agent) {
  a.path = [];
  switch (a.onArrive) {
    case "sit":
      a.state = "seated";
      a.dir = w.map.desks[a.role].facing;
      a.timer = 6 + w.rng() * 16;
      break;
    case "talk":
      a.state = "talking";
      a.timer = 5;
      a.carrying = false;
      if (a.deliverTo) {
        const target = w.byRole[a.deliverTo];
        a.dir = target.px < a.px ? 1 : target.px > a.px ? 2 : 3;
        if (!target.hidden) say(target, a.role === "risk_manager" ? "Understood — standing down" : "Got it 👍", 4);
        a.deliverTo = null;
      }
      break;
    case "break":
      a.state = "talking";
      a.timer = 4 + w.rng() * 6;
      a.dir = 3;
      break;
    case "gather":
      a.state = "talking";
      a.timer = Infinity; // until FORCE FLAT ends
      a.dir = 3;
      break;
    case "leave":
      a.state = "offDuty";
      a.hidden = true;
      a.bubble = null;
      break;
  }
}

function moveAlongPath(w: World, a: Agent, dt: number) {
  let budget = a.speed * dt;
  while (budget > 0 && a.path.length > 0) {
    const next = a.path[0];
    const c = center(next);
    const dx = c.x - a.px;
    const dy = c.y - a.py;
    const dist = Math.hypot(dx, dy);
    if (Math.abs(dx) > Math.abs(dy)) a.dir = dx < 0 ? 1 : 2;
    else if (dy !== 0) a.dir = dy < 0 ? 3 : 0;
    if (dist <= budget) {
      a.px = c.x;
      a.py = c.y;
      a.tile = { ...next };
      a.path.shift();
      budget -= dist;
    } else {
      a.px += (dx / dist) * budget;
      a.py += (dy / dist) * budget;
      budget = 0;
    }
  }
  a.walkT += dt;
  if (a.path.length === 0) arrive(w, a);
}

function ambient(w: World, a: Agent, snap: FloorSnapshot) {
  a.timer = 8 + w.rng() * 18;
  if (w.alarm || w.closed) return;
  const r = w.rng();
  if (r < 0.12) {
    const spot = w.map.pantrySpots[Math.floor(w.rng() * w.map.pantrySpots.length)];
    goTo(w, a, spot, "break");
    say(a, "☕", 3);
  } else if (r < 0.22) {
    const mates = ROLES.filter((x) => x.dept === ROLE_BY_ID[a.role].dept && x.id !== a.role && !w.byRole[x.id].hidden);
    if (mates.length) {
      const mate = mates[Math.floor(w.rng() * mates.length)].id;
      a.deliverTo = null;
      goTo(w, a, besideSeat(w, mate), "talk");
    }
  } else if (r < 0.6) {
    const fact = factFor(a.role, snap);
    if (fact) say(a, fact, 5);
  } else if (r < 0.66) {
    say(a, "📞 …", 3); // on the phone
  }
}

/** Advance the world by `dt` seconds. */
export function step(w: World, dt: number, snap: FloorSnapshot) {
  dt = Math.min(dt, 0.1); // a stalled tab must not teleport people through walls
  w.time += dt;
  for (const l of w.links) l.ttl -= dt;
  w.links = w.links.filter((l) => l.ttl > 0);
  for (const a of w.agents) {
    if (a.bubble) {
      a.bubble.ttl -= dt;
      if (a.bubble.ttl <= 0) a.bubble = null;
    }
    if (a.pending) {
      a.delay -= dt;
      if (a.delay <= 0) {
        const p = a.pending;
        a.pending = null;
        if (!goTo(w, a, p.dest, p.onArrive, p.speed) && p.onArrive === "leave") {
          Object.assign(a, { state: "offDuty", hidden: true });
        }
      }
      continue;
    }
    switch (a.state) {
      case "walking":
        moveAlongPath(w, a, dt);
        break;
      case "talking":
        a.timer -= dt;
        if (a.timer <= 0) goHome(w, a);
        break;
      case "seated":
        a.walkT += dt; // drives the typing animation
        a.timer -= dt;
        if (a.timer <= 0) ambient(w, a, snap);
        break;
      case "offDuty":
        break;
    }
  }
}

/** React to a data change. */
export function applyEvent(w: World, ev: FloorEvent) {
  const on = (role: RoleId) => !w.byRole[role].hidden && !w.closed;
  const deliver = (from: RoleId, to: RoleId, text: string, color: string, speed = WALK, alert = false) => {
    if (!on(from)) return;
    const a = w.byRole[from];
    const life = 7;
    w.links.push({ from: center(w.map.desks[from].seat), to: center(w.map.desks[to].seat), color, ttl: life, life });
    a.carrying = true;
    a.deliverTo = to;
    say(a, text, 7, alert);
    goTo(w, a, besideSeat(w, to), "talk", speed);
  };

  switch (ev.kind) {
    case "marketClosed":
      w.closed = true;
      w.agents.forEach((a, i) => {
        if (a.role === NIGHT_SHIFT || a.hidden) return;
        a.carrying = false;
        a.deliverTo = null;
        schedule(a, w.map.exit, "leave", 0.3 * i * w.rng() + w.rng() * 2);
      });
      say(w.byRole[NIGHT_SHIFT], "Night watch 🌙", 4);
      break;
    case "marketOpen":
      w.closed = false;
      w.agents.forEach((a) => {
        if (!a.hidden) return;
        const c = center(w.map.exit);
        Object.assign(a, { px: c.x, py: c.y, tile: { ...w.map.exit }, state: "offDuty" });
        schedule(a, w.map.desks[a.role].seat, "sit", w.rng() * 8);
      });
      break;
    case "forceFlat":
      w.alarm = true;
      w.agents.forEach((a, i) => {
        if (a.hidden) return;
        say(a, "FLAT BY 16:45!", 6, true);
        const spot = w.map.gatherSpots[i % w.map.gatherSpots.length];
        schedule(a, spot, "gather", w.rng() * 1.5, RUN);
      });
      break;
    case "forceFlatEnd":
      w.alarm = false;
      w.agents.forEach((a) => {
        if (!a.hidden && a.state === "talking") goHome(w, a);
      });
      break;
    case "riskBlocked":
      w.riskAlarm = true;
      deliver("risk_manager", "trade_analyst", `NO NEW RISK: ${ev.text}`, "#ef4444", RUN, true);
      break;
    case "riskClear":
      w.riskAlarm = false;
      if (on("risk_manager")) say(w.byRole.risk_manager, "Risk OK ✓", 5);
      break;
    case "signal":
      deliver("strategy_analyst", "trade_analyst", `New setup: ${ev.text}`, "#a78bfa");
      if (on("quant_analyst")) say(w.byRole.quant_analyst, "Checking size…", 4);
      break;
    case "headline":
      deliver("news_analyst", "trade_analyst", ev.text.length > 46 ? ev.text.slice(0, 45) + "…" : ev.text, "#facc15");
      if (on("broadcast_analyst")) say(w.byRole.broadcast_analyst, "📺 On air now", 4);
      break;
    case "bigMover":
      deliver("monitoring_analyst", "trade_analyst", `Mover: ${ev.text}`, "#22d3ee", RUN);
      break;
    case "econ":
      deliver("macro_analyst", "economic_research_analyst", ev.text, "#fbbf24");
      break;
  }
}

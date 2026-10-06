import { describe, expect, it } from "vitest";
import { carYFor, FLOOR_BAND, floorAtPoint } from "./building";
import { diffSnapshots, warRoomEvents } from "./events";
import { findPath } from "./pathfind";
import { createPlayer, drinkCoffee, fixtures, nearestInteractable, stepPlayer, walkTo } from "./player";
import { ROLES } from "./roster";
import { iconRows, SPRITE_H, SPRITE_W, spriteRows } from "./sprites";
import { applyEvent, createWorld, step } from "./sim";
import { cryptoSnapshot, equitySnapshot, factFor, futuresSnapshot, nextEconEvent, reportFor, type FloorSnapshot } from "./snapshot";
import { buildFloor, walkable } from "./tilemap";

const MAP = buildFloor();
const NOW = new Date("2026-10-05T14:00:00Z"); // Monday 10:00 ET
const canWalk = (x: number, y: number) => walkable(MAP, x, y);

const base = (over: Partial<FloorSnapshot> = {}): FloorSnapshot => ({
  open: true,
  phase: "open",
  board: [],
  headline: null,
  signal: null,
  riskBlocked: false,
  riskReason: null,
  pnl: null,
  bigMover: null,
  econEvent: null,
  brokerNote: null,
  ...over,
});

describe("floor plan", () => {
  it("seats all 17 roles at distinct, walkable seats", () => {
    const seats = ROLES.map((r) => MAP.desks[r.id].seat);
    expect(seats).toHaveLength(17);
    expect(new Set(seats.map((s) => `${s.x},${s.y}`)).size).toBe(17);
    for (const s of seats) expect(walkable(MAP, s.x, s.y)).toBe(true);
  });

  it("connects every seat to the door, the pantry and the board", () => {
    for (const r of ROLES) {
      const seat = MAP.desks[r.id].seat;
      expect(findPath(seat, MAP.exit, canWalk, MAP.w, MAP.h), `${r.id} -> exit`).not.toBeNull();
      expect(findPath(seat, MAP.pantrySpots[0], canWalk, MAP.w, MAP.h), `${r.id} -> pantry`).not.toBeNull();
      expect(findPath(seat, MAP.gatherSpots[0], canWalk, MAP.w, MAP.h), `${r.id} -> board`).not.toBeNull();
    }
  });

  it("has enough room in front of the video wall for everyone", () => {
    expect(MAP.gatherSpots.length).toBeGreaterThanOrEqual(ROLES.length);
    for (const g of MAP.gatherSpots) expect(walkable(MAP, g.x, g.y)).toBe(true);
  });

  it("lets you walk into every room from the door", () => {
    for (const z of MAP.zones) {
      if (z.id === "board") continue;
      const r = z.rect;
      let inside: { x: number; y: number } | null = null;
      for (let y = r.y; y < r.y + r.h && !inside; y++) for (let x = r.x; x < r.x + r.w && !inside; x++) if (canWalk(x, y)) inside = { x, y };
      expect(inside, z.id).not.toBeNull();
      expect(findPath(MAP.entrance, inside!, canWalk, MAP.w, MAP.h), `door -> ${z.id}`).not.toBeNull();
    }
  });

  it("keeps rooms from overlapping", () => {
    const rooms = MAP.zones.filter((z) => z.id !== "board");
    for (const a of rooms) for (const b of rooms) {
      if (a === b) continue;
      const apart = a.rect.x + a.rect.w <= b.rect.x || b.rect.x + b.rect.w <= a.rect.x || a.rect.y + a.rect.h <= b.rect.y || b.rect.y + b.rect.h <= a.rect.y;
      expect(apart, `${a.id} / ${b.id}`).toBe(true);
    }
  });

  it("can reach the coffee machine and the bell", () => {
    const f = fixtures(MAP);
    for (const p of [f.coffee, f.bell]) {
      const t = { x: Math.floor(p.x / 16), y: Math.floor(p.y / 16) };
      expect(findPath(MAP.entrance, t, canWalk, MAP.w, MAP.h)).not.toBeNull();
    }
  });
});

describe("findPath", () => {
  const open = () => true;
  it("walks a straight line", () => {
    expect(findPath({ x: 0, y: 0 }, { x: 3, y: 0 }, open, 5, 5)).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);
  });
  it("is empty when already there", () => {
    expect(findPath({ x: 2, y: 2 }, { x: 2, y: 2 }, open, 5, 5)).toEqual([]);
  });
  it("goes around a wall, never through it", () => {
    const wall = (x: number, y: number) => !(x === 2 && y < 4);
    const path = findPath({ x: 0, y: 0 }, { x: 4, y: 0 }, wall, 5, 5)!;
    expect(path.some((p) => p.x === 2 && p.y < 4)).toBe(false);
    expect(path.at(-1)).toEqual({ x: 4, y: 0 });
  });
  it("returns null for a blocked or unreachable goal", () => {
    expect(findPath({ x: 0, y: 0 }, { x: 4, y: 4 }, (x, y) => !(x === 4 && y === 4), 5, 5)).toBeNull();
    expect(findPath({ x: 0, y: 0 }, { x: 4, y: 0 }, (x) => x !== 2, 5, 5)).toBeNull();
  });
});

describe("diffSnapshots", () => {
  it("first snapshot sets state but replays no news", () => {
    const evs = diffSnapshots(null, base({ open: false, headline: "x", signal: { id: "1", text: "s" } }));
    expect(evs).toEqual([{ kind: "marketClosed", bell: false }]); // loading into a closed market: no bell
  });
  it("unknown market state (null) fires nothing", () => {
    expect(diffSnapshots(null, base({ open: null, riskBlocked: null }))).toEqual([]);
  });
  it("detects a new signal, a new headline and a risk block", () => {
    const prev = base({ signal: { id: "a", text: "old" }, headline: "h1" });
    const next = base({ signal: { id: "b", text: "MCL LONG" }, headline: "h2", riskBlocked: true, riskReason: "daily stop" });
    expect(diffSnapshots(prev, next)).toEqual([
      { kind: "riskBlocked", text: "daily stop" },
      { kind: "signal", text: "MCL LONG" },
      { kind: "headline", text: "h2" },
    ]);
  });
  it("rings the closing bell only for a close it watched", () => {
    expect(diffSnapshots(base({ open: true }), base({ open: false }))).toEqual([{ kind: "marketClosed", bell: true }]);
  });
  it("cheers or panics once when the lead market crosses ±2%", () => {
    const at = (c: number) => base({ board: [{ label: "SPY", value: "1", changePct: c }] });
    expect(diffSnapshots(at(1.5), at(2.1))).toEqual([{ kind: "rally", text: "SPY +2.10%" }]);
    expect(diffSnapshots(at(2.1), at(2.4))).toEqual([]); // already through
    expect(diffSnapshots(at(-1), at(-2.5))).toEqual([{ kind: "selloff", text: "SPY -2.50%" }]);
    expect(diffSnapshots(at(-1), base({ board: [{ label: "SPY", value: "1", changePct: null }] }))).toEqual([]);
  });
  it("opens, force-flats and clears", () => {
    expect(diffSnapshots(base({ open: false, phase: "closed" }), base())).toEqual([{ kind: "marketOpen" }]);
    expect(diffSnapshots(base(), base({ phase: "force_flat" }))).toEqual([{ kind: "forceFlat" }]);
    expect(diffSnapshots(base({ phase: "force_flat" }), base({ phase: "past_deadline" }))).toEqual([{ kind: "forceFlatEnd" }]);
    expect(diffSnapshots(base({ riskBlocked: true }), base({ riskBlocked: false }))).toEqual([{ kind: "riskClear" }]);
  });
});

describe("warRoomEvents", () => {
  const cpi = { title: "USD CPI", when: "Mon 08:30 ET", at: 1_000_000_000_000 };
  it("convenes inside five minutes of a release", () => {
    expect(warRoomEvents(null, cpi, cpi.at - 4 * 60_000)).toEqual([{ kind: "warRoom", text: "USD CPI", at: cpi.at }]);
    expect(warRoomEvents(null, cpi, cpi.at - 10 * 60_000)).toEqual([]);
  });
  it("stays during the release and breaks up after", () => {
    const active = { title: cpi.title, at: cpi.at };
    expect(warRoomEvents(active, cpi, cpi.at + 60_000)).toEqual([]);
    expect(warRoomEvents(active, null, cpi.at + 3 * 60_000)).toEqual([{ kind: "warRoomEnd" }]);
  });
  it("does nothing with no release scheduled", () => {
    expect(warRoomEvents(null, null, Date.now())).toEqual([]);
  });
});

describe("simulation", () => {
  const run = (seed: number) => {
    const w = createWorld(MAP, seed);
    for (let i = 0; i < 600; i++) step(w, 0.05, base());
    return w.agents.map((a) => [a.role, Math.round(a.px), Math.round(a.py), a.state]);
  };

  it("is deterministic for a seed", () => {
    expect(run(7)).toEqual(run(7));
  });

  it("sends everyone but the night watch home when the market closes, and back when it opens", () => {
    const w = createWorld(MAP, 3);
    applyEvent(w, { kind: "marketClosed", bell: false });
    for (let i = 0; i < 1200; i++) step(w, 0.05, base({ open: false }));
    const onDuty = w.agents.filter((a) => !a.hidden).map((a) => a.role);
    expect(onDuty).toEqual(["monitoring_analyst"]);

    applyEvent(w, { kind: "marketOpen" });
    for (let i = 0; i < 1600; i++) step(w, 0.05, base());
    expect(w.agents.every((a) => !a.hidden)).toBe(true);
  });

  it("an open that interrupts a close brings everyone back, and vice versa", () => {
    const w = createWorld(MAP, 12);
    applyEvent(w, { kind: "marketClosed", bell: false });
    for (let i = 0; i < 20; i++) step(w, 0.05, base({ open: false })); // a second in: half-way out
    applyEvent(w, { kind: "marketOpen" });
    for (let i = 0; i < 1600; i++) step(w, 0.05, base());
    expect(w.agents.filter((a) => a.hidden)).toHaveLength(0);

    applyEvent(w, { kind: "marketClosed", bell: false });
    for (let i = 0; i < 1200; i++) step(w, 0.05, base({ open: false }));
    applyEvent(w, { kind: "marketOpen" });
    for (let i = 0; i < 2; i++) step(w, 0.05, base());
    applyEvent(w, { kind: "marketClosed", bell: false }); // closes again before anyone got in
    for (let i = 0; i < 1600; i++) step(w, 0.05, base({ open: false }));
    expect(w.agents.filter((a) => !a.hidden).map((a) => a.role)).toEqual(["monitoring_analyst"]);
  });

  it("walks the signal to the Trade Analyst", () => {
    const w = createWorld(MAP, 5);
    applyEvent(w, { kind: "signal", text: "MCL LONG 69.90" });
    const s = w.byRole.strategy_analyst;
    expect(s.carrying).toBe(true);
    expect(s.bubble?.text).toContain("MCL LONG 69.90");
    for (let i = 0; i < 400 && s.carrying; i++) step(w, 0.05, base());
    expect(s.carrying).toBe(false);
    const ta = MAP.desks.trade_analyst.seat;
    expect(Math.abs(s.tile.x - ta.x) + Math.abs(s.tile.y - ta.y)).toBeLessThanOrEqual(2);
  });

  it("raises the risk alarm and clears it", () => {
    const w = createWorld(MAP, 9);
    applyEvent(w, { kind: "riskBlocked", text: "daily stop" });
    expect(w.riskAlarm).toBe(true);
    expect(w.byRole.risk_manager.bubble?.alert).toBe(true);
    applyEvent(w, { kind: "riskClear" });
    expect(w.riskAlarm).toBe(false);
  });

  it("rings the opening bell and applauds", () => {
    const w = createWorld(MAP, 4);
    applyEvent(w, { kind: "marketOpen" });
    expect(w.bell?.kind).toBe("open");
    for (let i = 0; i < 200; i++) step(w, 0.05, base());
    expect(w.bell).toBeNull();
  });

  it("throws confetti on a rally and it settles", () => {
    const w = createWorld(MAP, 6);
    applyEvent(w, { kind: "rally", text: "SPY +2.10%" });
    expect(w.confetti.length).toBeGreaterThan(100);
    for (let i = 0; i < 200; i++) step(w, 0.05, base());
    expect(w.confetti).toHaveLength(0);
  });

  it("gathers the war room in the conference room, then sends them back", () => {
    const w = createWorld(MAP, 8);
    applyEvent(w, { kind: "warRoom", text: "USD CPI", at: 0 });
    for (let i = 0; i < 600; i++) step(w, 0.05, base());
    const conf = MAP.zones.find((z) => z.id === "conference")!.rect;
    const inRoom = (r: (typeof ROLES)[number]["id"]) => {
      const t = w.byRole[r].tile;
      return t.x >= conf.x && t.x < conf.x + conf.w && t.y >= conf.y && t.y < conf.y + conf.h;
    };
    expect(inRoom("macro_analyst")).toBe(true);
    expect(inRoom("risk_manager")).toBe(true);
    expect(inRoom("news_analyst")).toBe(false);
    applyEvent(w, { kind: "warRoomEnd" });
    for (let i = 0; i < 800; i++) step(w, 0.05, base());
    expect(inRoom("macro_analyst")).toBe(false);
    expect(w.warRoom).toBeNull();
  });

  it("treats a negative dt as no time passing", () => {
    const w = createWorld(MAP, 2);
    step(w, -0.002, base());
    expect(w.time).toBe(0);
    for (const a of w.agents) expect(a.walkT).toBeGreaterThanOrEqual(0);
  });

  it("survives a huge dt without leaving the map", () => {
    const w = createWorld(MAP, 1);
    applyEvent(w, { kind: "forceFlat" });
    step(w, 30, base({ phase: "force_flat" }));
    for (const a of w.agents) {
      expect(a.px).toBeGreaterThanOrEqual(0);
      expect(a.px).toBeLessThanOrEqual(MAP.w * 16);
    }
  });
});

describe("snapshots", () => {
  it("futures: market-closed is not a risk block", () => {
    const s = futuresSnapshot({
      session: { phase: "closed", minutes_to_flat: null },
      risk: { can_trade: false, reasons: ["market closed"], risk_budget: 300 },
      journalPnl: 0,
      now: NOW,
    });
    expect(s.open).toBe(false);
    expect(s.riskBlocked).toBe(false);
  });

  it("futures: picks the newest setup that isn't late", () => {
    const s = futuresSnapshot({
      signals: [
        { ts_utc: "b", symbol: "MCL", direction: "long", entry: 70, risk_reward: 2, late: true },
        { ts_utc: "a", symbol: "MCL", direction: "short", entry: 69.5, risk_reward: 3.25, late: false },
      ],
      journalPnl: null,
      now: NOW,
    });
    expect(s.signal?.text).toBe("MCL SHORT 69.50 RR 3.3");
    expect(s.open).toBeNull(); // no session data yet
  });

  it("equity: empty input doesn't crash and stays unknown", () => {
    const s = equitySnapshot({ nyseOpen: true, now: NOW });
    expect(s.board).toEqual([]);
    expect(s.pnl).toBeNull();
    expect(factFor("trade_analyst", s)).toBeNull();
  });

  it("equity: biggest mover by absolute change", () => {
    const s = equitySnapshot({
      nyseOpen: true,
      heat: [{ symbol: "A", changePercent: 2 }, { symbol: "B", changePercent: -5 }, { symbol: "C", changePercent: null }],
      now: NOW,
    });
    expect(s.bigMover).toEqual({ symbol: "B", changePct: -5 });
  });

  it("crypto is always open", () => {
    expect(cryptoSnapshot({ now: NOW }).open).toBe(true);
  });

  it("next econ event skips the past and low impact", () => {
    const e = nextEconEvent(
      [
        { title: "Old", date: "2026-10-05T12:00:00Z", impact: "High", country: "USD" },
        { title: "Minor", date: "2026-10-05T15:00:00Z", impact: "Low", country: "USD" },
        { title: "CPI", date: "2026-10-05T16:30:00Z", impact: "High", country: "USD" },
      ],
      NOW
    );
    expect(e?.title).toBe("USD CPI");
  });
});


describe("player", () => {
  const still = { dx: 0, dy: 0, run: false };

  it("spawns on a walkable tile inside the floor", () => {
    const p = createPlayer(MAP);
    expect(walkable(MAP, Math.floor(p.px / 16), Math.floor(p.py / 16))).toBe(true);
  });

  it("walks with the keys and never goes through the outer wall", () => {
    const p = createPlayer(MAP);
    const start = p.py;
    for (let i = 0; i < 20; i++) stepPlayer(p, MAP, { dx: 0, dy: -1, run: false }, 0.05);
    expect(p.py).toBeLessThan(start);
    for (let i = 0; i < 400; i++) stepPlayer(p, MAP, { dx: 1, dy: 0, run: true }, 0.05);
    expect(Math.floor(p.px / 16)).toBeLessThan(MAP.w - 1); // stopped by a wall, not outside
    expect(walkable(MAP, Math.floor(p.px / 16), Math.floor(p.py / 16))).toBe(true);
  });

  it("follows a click-to-move route to the bell", () => {
    const p = createPlayer(MAP);
    expect(walkTo(p, MAP, { x: 25, y: 3 })).toBe(true);
    for (let i = 0; i < 600 && p.path.length; i++) stepPlayer(p, MAP, still, 0.05);
    const f = fixtures(MAP);
    expect(Math.hypot(p.px - f.bell.x, p.py - f.bell.y)).toBeLessThan(22);
  });

  it("refuses a route into a wall", () => {
    expect(walkTo(createPlayer(MAP), MAP, { x: 0, y: 0 })).toBe(false);
  });

  it("prefers talking to a person over the desk beside them", () => {
    const w = createWorld(MAP, 3);
    const p = createPlayer(MAP);
    const seat = MAP.desks.risk_manager.seat;
    p.px = seat.x * 16 + 8 + 10;
    p.py = seat.y * 16 + 8;
    expect(nearestInteractable(p, w)).toMatchObject({ kind: "person", role: "risk_manager" });
    w.byRole.risk_manager.hidden = true; // gone home: now it's just their desk
    expect(nearestInteractable(p, w)?.kind).toBe("desk");
  });

  it("running tires you and coffee fixes it", () => {
    const p = createPlayer(MAP);
    p.energy = 20;
    for (let i = 0; i < 40; i++) stepPlayer(p, MAP, { dx: 0, dy: -1, run: true }, 0.05);
    expect(p.energy).toBeLessThan(20);
    drinkCoffee(p);
    expect(p.energy).toBeGreaterThan(50);
  });
});

describe("reportFor", () => {
  it("never invents numbers when there's no data", () => {
    const lines = reportFor("trade_analyst", base());
    expect(lines.join(" ")).not.toMatch(/\d/);
  });
  it("reports a risk block in plain words", () => {
    expect(reportFor("risk_manager", base({ riskBlocked: true, riskReason: "daily stop" }))).toEqual([
      "NO NEW RISK.",
      "Reason: daily stop.",
      "Stand down until it clears.",
    ]);
  });
  it("says when someone is off duty", () => {
    expect(reportFor("news_analyst", base(), true)[0]).toContain("off for the night");
  });
});

describe("sprites", () => {
  it("draws every pose, hairstyle and walk frame on a full 12x20 grid", () => {
    for (const view of ["down", "up", "side"] as const) {
      for (const hair of ["short", "crop", "long"] as const) {
        for (let f = 0; f < 4; f++) {
          const rows = spriteRows(view, hair, f);
          expect(rows, `${view}/${hair}/${f}`).toHaveLength(SPRITE_H);
          for (const r of rows) expect(r.length, `${view}/${hair}/${f}: "${r}"`).toBe(SPRITE_W);
        }
      }
    }
  });
});

describe("roster", () => {
  it("gives everyone a workstation and a unique name", () => {
    for (const r of ROLES) {
      expect(r.station, r.id).toBeTruthy();
      expect(r.name.length, r.id).toBeGreaterThan(1);
    }
    expect(new Set(ROLES.map((r) => r.name)).size).toBe(ROLES.length);
  });

  it("draws every status icon on a 7x7 grid", () => {
    for (const icon of ["alert", "risk", "news", "idea", "phone", "setup", "calendar"] as const) {
      const rows = iconRows(icon);
      expect(rows).toHaveLength(7);
      for (const r of rows) expect(r.length, icon).toBe(7);
    }
  });
});

describe("staff reactions", () => {
  const snap = base();

  it("puts a setup on the strategy and trading screens, pointing the right way, then lets it go", () => {
    const w = createWorld(MAP, 5);
    applyEvent(w, { kind: "signal", text: "MCL SHORT 70.10 RR 3.0" });
    expect(w.byRole.strategy_analyst.screen).toMatchObject({ mode: "setup", label: "SHORT" });
    expect(w.byRole.trade_analyst.screen).toMatchObject({ mode: "setup", label: "SHORT" });
    expect(w.byRole.strategy_analyst.status?.icon).toBe("idea");
    for (let i = 0; i < 200; i++) step(w, 0.1, snap);
    expect(w.byRole.trade_analyst.screen).toBeNull();
    expect(w.byRole.strategy_analyst.status).toBeNull();
  });

  it("raises a risk alert that holds until the block clears", () => {
    const w = createWorld(MAP, 5);
    applyEvent(w, { kind: "riskBlocked", text: "daily stop" });
    const rm = w.byRole.risk_manager;
    expect(rm.status?.icon).toBe("risk");
    expect(rm.standing).toBeGreaterThan(0); // up out of the chair before heading over
    for (let i = 0; i < 300; i++) step(w, 0.1, snap);
    expect(w.byRole.trade_analyst.screen?.mode).toBe("risk");
    applyEvent(w, { kind: "riskClear" });
    expect(w.byRole.trade_analyst.screen).toBeNull();
    expect(rm.screen).toBeNull();
  });

  it("has the monitoring desk stand up for a big mover, then run it over", () => {
    const w = createWorld(MAP, 5);
    applyEvent(w, { kind: "bigMover", text: "MCL +3.20%" });
    const a = w.byRole.monitoring_analyst;
    expect(a.status?.icon).toBe("alert");
    expect(a.standing).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) step(w, 0.1, snap);
    expect(a.state).toBe("walking");
    expect(a.standing).toBe(0);
  });

  it("gives nobody an icon or a screen while they're off duty", () => {
    const w = createWorld(MAP, 5);
    w.byRole.news_analyst.hidden = true;
    applyEvent(w, { kind: "headline", text: "Something happened" });
    expect(w.byRole.news_analyst.status).toBeNull();
    expect(w.byRole.news_analyst.screen).toBeNull();
  });
});

describe("gathering", () => {
  it("sends home anyone who reaches the board after FORCE FLAT is over", () => {
    const w = createWorld(MAP, 9);
    applyEvent(w, { kind: "forceFlat" });
    for (let i = 0; i < 20; i++) step(w, 0.1, base()); // the call ends while people are still walking
    applyEvent(w, { kind: "forceFlatEnd" });
    for (let i = 0; i < 1200; i++) step(w, 0.1, base());
    const stuck = w.agents.filter((a) => a.state === "talking" && a.timer === Infinity);
    expect(stuck.map((a) => a.role)).toEqual([]);
  });
});

describe("desk widgets", () => {
  it("pops up the widget each desk is for", () => {
    const want: Record<string, string> = {
      broker_rm: "accounts", trade_analyst: "journal", strategy_analyst: "signals",
      technical_analyst: "chart", market_data_analyst: "quote", monitoring_analyst: "watchlist",
      equity_research_analyst: "screener", intelligence_analyst: "heatmap", news_analyst: "news",
      economic_research_analyst: "calendar", macro_analyst: "macro", research_analyst: "recap",
      institutional_research_analyst: "insider", broadcast_analyst: "tv", quant_researcher: "ai",
      portfolio_manager: "portfolio", risk_manager: "risk",
    };
    expect(Object.fromEntries(ROLES.map((r) => [r.id, r.opens]))).toEqual(want);
  });
});

describe("Kimi Tower street view", () => {
  it("rides up from a floor's band or from its label to the left", () => {
    for (const f of ["futures", "crypto", "equity"] as const) {
      const y = (FLOOR_BAND[f].y0 + FLOOR_BAND[f].y1) / 2;
      expect(floorAtPoint(200, y)).toBe(f); // on the tower
      expect(floorAtPoint(150, y)).toBe(f); // on its label
    }
    expect(floorAtPoint(10, 70)).toBeNull(); // Merdeka 118, far left
    expect(floorAtPoint(270, 70)).toBeNull(); // KLCC
    expect(floorAtPoint(200, 30)).toBeNull(); // above the floors
  });

  it("parks the elevator car inside each floor's band", () => {
    for (const f of ["futures", "crypto", "equity"] as const) {
      expect(carYFor(f)).toBeGreaterThanOrEqual(FLOOR_BAND[f].y0);
      expect(carYFor(f) + 10).toBeLessThanOrEqual(FLOOR_BAND[f].y1);
    }
  });
});

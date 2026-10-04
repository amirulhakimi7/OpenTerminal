import { describe, expect, it } from "vitest";
import { diffSnapshots, warRoomEvents } from "./events";
import { findPath } from "./pathfind";
import { ROLES } from "./roster";
import { applyEvent, createWorld, step } from "./sim";
import { cryptoSnapshot, equitySnapshot, factFor, futuresSnapshot, nextEconEvent, type FloorSnapshot } from "./snapshot";
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
  it("seats all 18 roles at distinct, walkable seats", () => {
    const seats = ROLES.map((r) => MAP.desks[r.id].seat);
    expect(seats).toHaveLength(18);
    expect(new Set(seats.map((s) => `${s.x},${s.y}`)).size).toBe(18);
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

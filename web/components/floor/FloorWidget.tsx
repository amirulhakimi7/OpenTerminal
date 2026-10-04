"use client";

// The live trading floor. Data hooks -> FloorSnapshot -> FloorEvents -> the
// simulation, drawn on a canvas. Display only: nobody on this floor trades.

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet } from "../../lib/api";
import { marketStateNY } from "../../lib/markets";
import { useRisk, useSessionPnl } from "../../lib/risk";
import { useCmeSessionQuery } from "../../lib/session";
import { useSignals } from "../../lib/signals";
import { useTerminal, type WidgetInstance } from "../../store/terminal";
import { diffSnapshots, warRoomEvents, type FloorEvent } from "./events";
import { B_H, B_W, carYFor, FLOOR_BAND, drawBuilding, drawBuildingOverlay, floorAtPoint, type BuildingState, type FloorStatus } from "./building";
import { play, unlockAudio, type Sfx } from "../../lib/sfx";
import { FLOOR_ORDER, FLOORS, type FloorId } from "./floors";
import { drawOverlay, drawWorld, hitTest, WORLD_H, WORLD_W, zoneAt, type View } from "./render";
import { DEPARTMENTS, ROLE_BY_ID, type RoleId } from "./roster";
import { applyEvent, createWorld, step, type World } from "./sim";
import {
  cryptoSnapshot,
  equitySnapshot,
  factFor,
  futuresSnapshot,
  type BrokerIn,
  type CryptoGlobalIn,
  type CryptoIn,
  type EconIn,
  type FloorSnapshot,
  type HeatIn,
  type NewsIn,
  type QuoteIn,
} from "./snapshot";
import { buildFloor, type ZoneId } from "./tilemap";

const MAP = buildFloor();
const MAX_ZOOM = 3.5;
const SEEDS: Record<FloorId, number> = { equity: 11, crypto: 23, futures: 37 };

/** Every query a floor might need; only the active floor's are enabled. */
function useFloorSnapshot(floor: FloorId): FloorSnapshot {
  const is = (f: FloorId) => floor === f;
  const theme = FLOORS[floor];

  const quotes = useQuery({
    queryKey: ["floor-quotes", "SPY,QQQ,DIA"],
    queryFn: () => apiGet<QuoteIn[]>("/api/quotes?symbols=SPY,QQQ,DIA"),
    refetchInterval: 15_000,
    enabled: is("equity"),
  });
  const heat = useQuery({
    queryKey: ["heatmap", "us"],
    queryFn: () => apiGet<HeatIn[]>("/api/heatmap?market=us"),
    refetchInterval: 30_000,
    enabled: is("equity"),
  });
  const broker = useQuery({
    queryKey: ["broker", "moomoo"],
    queryFn: () => apiGet<BrokerIn>("/api/brokers/moomoo/summary"),
    refetchInterval: 15_000,
    retry: 0,
    enabled: is("equity"),
  });
  const crypto = useQuery({
    queryKey: ["crypto"],
    queryFn: () => apiGet<CryptoIn[]>("/api/crypto"),
    refetchInterval: 10_000,
    enabled: is("crypto"),
  });
  const cryptoGlobal = useQuery({
    queryKey: ["crypto-global"],
    queryFn: () => apiGet<CryptoGlobalIn>("/api/crypto/global"),
    refetchInterval: 30_000,
    enabled: is("crypto"),
  });
  const news = useQuery({
    queryKey: ["news", "symbol", theme.newsSymbol],
    queryFn: () => apiGet<NewsIn[]>(`/api/news?symbol=${encodeURIComponent(theme.newsSymbol)}`),
    refetchInterval: 60_000,
  });
  const econ = useQuery({
    queryKey: ["econ-calendar"],
    queryFn: () => apiGet<EconIn[]>("/api/econ-calendar"),
    refetchInterval: 300_000,
  });
  const session = useCmeSessionQuery();
  const signals = useSignals(is("futures"));
  const risk = useRisk();
  const { pnl } = useSessionPnl();

  // The NYSE open flag comes from the clock; tick so it flips on time.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  return useMemo(() => {
    const now = new Date();
    if (floor === "equity") {
      return equitySnapshot({
        quotes: quotes.data,
        nyseOpen: marketStateNY().open,
        news: news.data,
        heat: heat.data,
        econ: econ.data,
        broker: broker.data,
        brokerError: broker.error ? (broker.error as Error).message : null,
        now,
      });
    }
    if (floor === "crypto") {
      return cryptoSnapshot({ rows: crypto.data, global: cryptoGlobal.data, news: news.data, econ: econ.data, now });
    }
    return futuresSnapshot({
      session: session.data,
      signals: signals.data?.signals,
      risk: risk.data,
      journalPnl: pnl,
      news: news.data,
      econ: econ.data,
      now,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor, tick, quotes.data, heat.data, broker.data, broker.error, crypto.data, cryptoGlobal.data, news.data, econ.data, session.data, signals.data, risk.data, pnl]);
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

type FeedItem = { id: number; at: Date; text: string; color: string };

const EVENT_TEXT: Record<FloorEvent["kind"], { label: string; color: string }> = {
  marketOpen: { label: "Market open — desks filling up", color: "#4ade80" },
  marketClosed: { label: "Market closed — night watch on", color: "#94a3b8" },
  forceFlat: { label: "FORCE FLAT — flatten before 16:45 ET", color: "#f87171" },
  forceFlatEnd: { label: "Flat deadline passed", color: "#94a3b8" },
  riskBlocked: { label: "Risk Manager: NO NEW RISK", color: "#f87171" },
  riskClear: { label: "Risk Manager: risk OK", color: "#4ade80" },
  signal: { label: "Strategy → Trade Analyst", color: "#c4b5fd" },
  headline: { label: "News → Trade Analyst", color: "#facc15" },
  bigMover: { label: "Monitoring → Trade Analyst", color: "#22d3ee" },
  econ: { label: "Macro → Economic Research", color: "#fbbf24" },
  rally: { label: "🎉 Rally on the floor", color: "#4ade80" },
  selloff: { label: "😱 Sell-off", color: "#f87171" },
  warRoom: { label: "War room convened", color: "#fbbf24" },
  warRoomEnd: { label: "War room dismissed", color: "#94a3b8" },
};

const SFX_FOR: Partial<Record<FloorEvent["kind"], Sfx>> = {
  marketOpen: "bell",
  forceFlat: "siren",
  rally: "cheer",
  selloff: "drop",
  warRoom: "gong",
  signal: "chime",
  headline: "chime",
  riskBlocked: "drop",
};

function sfxFor(ev: FloorEvent): Sfx | null {
  if (ev.kind === "marketClosed") return ev.bell ? "bell" : null; // no bell for a close we only loaded into
  return SFX_FOR[ev.kind] ?? null;
}

function eventLine(ev: FloorEvent): { text: string; color: string } {
  const base = EVENT_TEXT[ev.kind];
  return { text: "text" in ev ? `${base.label}: ${ev.text}` : base.label, color: base.color };
}

const fmtTime = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function FloorWidget({ widget }: { widget: WidgetInstance }) {
  const lastFloor = useTerminal((s) => s.lastFloor);
  const setLastFloor = useTerminal((s) => s.setLastFloor);
  const addWidget = useTerminal((s) => s.addWidget);
  const floorView = useTerminal((s) => s.floorView);
  const setFloorView = useTerminal((s) => s.setFloorView);
  const sound = useTerminal((s) => s.sound);
  const setSound = useTerminal((s) => s.setSound);
  const floor: FloorId = widget.floor ?? lastFloor;
  // A widget pinned to one floor has no building to go back to.
  const mode: "building" | "floor" = widget.floor ? "floor" : floorView;
  const snap = useFloorSnapshot(floor);
  const theme = FLOORS[floor];
  const cme = useCmeSessionQuery();

  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worlds = useRef(new Map<FloorId, World>());
  const prevSnaps = useRef(new Map<FloorId, FloorSnapshot>());
  const live = useRef({
    floor,
    snap,
    hovered: null as RoleId | null,
    zone: null as ZoneId | null,
    selected: null as RoleId | null,
    view: { scale: 1, ox: 0, oy: 0, fonts: { pixel: "monospace", vt: "monospace" } } as View,
    base: { scale: 1, ox: 0, oy: 0 }, // the whole floor fitted into the panel
    cam: { k: 1, cx: WORLD_W / 2, cy: WORLD_H / 2 }, // zoom and the world point at the centre
    drag: null as null | { x: number; y: number; cx: number; cy: number; moved: boolean },
    mode,
    sound,
    futuresOpen: null as boolean | null,
    building: { t: 0, hover: null, carY: carYFor(floor) } as BuildingState,
    bview: { scale: 1, ox: 0, oy: 0 },
    carTarget: null as null | { floor: FloorId; y: number },
  });
  live.current.mode = mode;
  live.current.sound = sound;
  live.current.futuresOpen = cme.data ? ["open", "force_flat", "past_deadline"].includes(cme.data.phase) : null;
  const [doors, setDoors] = useState<"open" | "closed">("open");
  const [doorLabel, setDoorLabel] = useState("");
  const [selected, setSelected] = useState<RoleId | null>(null);
  const [feed, setFeed] = useState<Record<FloorId, FeedItem[]>>({ equity: [], crypto: [], futures: [] });
  const [box, setBox] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [, setTick] = useState(0);
  const [zoom, setZoom] = useState(1);
  const feedId = useRef(0);

  /** Recompute the view from the fitted base and the camera, keeping the floor filling its frame. */
  const applyCamera = () => {
    const { base, cam, view } = live.current;
    cam.k = Math.min(MAX_ZOOM, Math.max(1, cam.k));
    const hw = WORLD_W / (2 * cam.k);
    const hh = WORLD_H / (2 * cam.k);
    cam.cx = Math.min(WORLD_W - hw, Math.max(hw, cam.cx));
    cam.cy = Math.min(WORLD_H - hh, Math.max(hh, cam.cy));
    view.scale = base.scale * cam.k;
    view.ox = base.ox + (WORLD_W * base.scale) / 2 - cam.cx * view.scale;
    view.oy = base.oy + (WORLD_H * base.scale) / 2 - cam.cy * view.scale;
    view.frame = { l: base.ox, r: base.ox + WORLD_W * base.scale };
  };
  /** Zoom by `factor`, keeping the world point under screen point (sx, sy) where it is. */
  const zoomAt = (factor: number, sx: number, sy: number) => {
    const { view, cam, base } = live.current;
    const wx = (sx - view.ox) / view.scale;
    const wy = (sy - view.oy) / view.scale;
    cam.k = Math.min(MAX_ZOOM, Math.max(1, cam.k * factor));
    const scale = base.scale * cam.k;
    cam.cx = (base.ox + (WORLD_W * base.scale) / 2 - (sx - wx * scale)) / scale;
    cam.cy = (base.oy + (WORLD_H * base.scale) / 2 - (sy - wy * scale)) / scale;
    applyCamera();
    setZoom(cam.k);
  };
  const resetCamera = () => {
    Object.assign(live.current.cam, { k: 1, cx: WORLD_W / 2, cy: WORLD_H / 2 });
    applyCamera();
    setZoom(1);
  };

  const worldFor = (f: FloorId) => {
    let w = worlds.current.get(f);
    if (!w) {
      w = createWorld(MAP, SEEDS[f]);
      worlds.current.set(f, w);
    }
    return w;
  };

  /** Apply events to a floor: the world reacts, the feed logs them, and (if on) they make a sound. */
  const fire = (f: FloorId, evs: FloorEvent[], demo = false) => {
    if (!evs.length) return;
    const w = worldFor(f);
    for (const ev of evs) applyEvent(w, ev);
    const now = new Date();
    const line = (ev: FloorEvent) => {
      const l = eventLine(ev);
      return demo ? { ...l, text: `[DEMO] ${l.text}` } : l;
    };
    setFeed((all) => ({
      ...all,
      [f]: [...evs.map((ev) => ({ id: ++feedId.current, at: now, ...line(ev) })).reverse(), ...all[f]].slice(0, 6),
    }));
    if (!demo && live.current.sound && live.current.mode === "floor" && live.current.floor === f) {
      const sfx = evs.map(sfxFor).find((x) => x !== null);
      if (sfx) play(sfx);
    }
  };

  // Data changes become events on that floor's world, and lines in its feed.
  useEffect(() => {
    const prev = prevSnaps.current.get(floor) ?? null;
    fire(floor, diffSnapshots(prev, snap));
    prevSnaps.current.set(floor, snap);
    live.current.floor = floor;
    live.current.snap = snap;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor, snap]);

  useEffect(() => {
    setSelected(null);
    live.current.selected = null;
  }, [floor]);

  // The header chips (people on the floor, clocks) refresh once a second.
  useEffect(() => {
    const t = setInterval(() => {
      setTick((n) => n + 1);
      // The war room runs on the clock, not on data changes.
      const f = live.current.floor;
      fire(f, warRoomEvents(worldFor(f).warRoom, live.current.snap.econEvent, Date.now()));
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Close the elevator doors, do `action` behind them, open on the new view. */
  const elevator = (label: string, action: () => void) => {
    setDoorLabel(label);
    setDoors("closed");
    setTimeout(() => {
      action();
      setTimeout(() => setDoors("open"), 120);
    }, 420);
  };
  const goToFloor = (f: FloorId) => {
    // Read live state: this also runs from the render loop's closure.
    if (f === live.current.floor && live.current.mode === "floor") return;
    if (live.current.sound) play("chime");
    elevator(`▲ ${FLOOR_BAND[f].level}F · ${FLOORS[f].label.toUpperCase()}`, () => {
      setLastFloor(f);
      setFloorView("floor");
    });
  };
  /**
   * A scripted tour of every floor event, so the effects can be seen when the
   * market isn't providing them. Clearly tagged [DEMO]; the real state is put
   * back at the end.
   */
  const [demoRunning, setDemoRunning] = useState(false);
  const runDemo = () => {
    if (demoRunning) return;
    unlockAudio();
    setDemoRunning(true);
    const f = floor;
    const w = worldFor(f);
    const wasClosed = w.closed;
    const steps: Array<[number, FloorEvent]> = [
      [0, { kind: "marketOpen" }],
      [7000, { kind: "signal", text: "MCL LONG 69.90 RR 4.3" }],
      [12000, { kind: "rally", text: "SPY +2.10%" }],
      [18000, { kind: "warRoom", text: "USD CPI", at: Date.now() + 40_000 }],
      [30000, { kind: "warRoomEnd" }],
      [34000, { kind: "selloff", text: "SPY -2.40%" }],
      [40000, { kind: "forceFlat" }],
      [46000, { kind: "forceFlatEnd" }],
      ...(wasClosed ? ([[50000, { kind: "marketClosed", bell: true }]] as Array<[number, FloorEvent]>) : []),
    ];
    for (const [delay, ev] of steps) {
      setTimeout(() => {
        fire(f, [ev], true);
        if (live.current.sound) {
          const sfx = sfxFor(ev);
          if (sfx) play(sfx);
        }
      }, delay);
    }
    setTimeout(() => setDemoRunning(false), (steps.at(-1)?.[0] ?? 0) + 6000);
  };

  const goToBuilding = () => {
    live.current.building.carY = carYFor(floor);
    elevator("▼ LOBBY · KIMI TOWER", () => setFloorView("building"));
  };

  // Render loop: ~30 fps, paused while the tab is hidden or the widget is off screen.
  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext("2d")!;
    const worldCanvas = document.createElement("canvas");
    worldCanvas.width = WORLD_W;
    worldCanvas.height = WORLD_H;
    const wctx = worldCanvas.getContext("2d")!;
    const buildingCanvas = document.createElement("canvas");
    buildingCanvas.width = B_W;
    buildingCanvas.height = B_H;
    const bctx = buildingCanvas.getContext("2d")!;
    const fonts = { pixel: cssVar("--font-pixel", "monospace"), vt: cssVar("--font-vt", "monospace") };
    live.current.view.fonts = fonts;
    // Canvas text won't trigger a web-font download on its own; ask for both.
    document.fonts?.load(`16px ${fonts.pixel}`).catch(() => {});
    document.fonts?.load(`16px ${fonts.vt}`).catch(() => {});

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const minFrameMs = reduced ? 500 : 1000 / 30;
    let raf = 0;
    let last = performance.now();
    let lastDraw = 0;
    let visible = !document.hidden;
    let inView = true;
    let size = "";

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      const key = `${w}x${h}`;
      if (key === size || w === 0 || h === 0) return;
      size = key;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const scale = Math.min(w / WORLD_W, h / WORLD_H);
      // Centred across; pinned to the top so a tall stacked panel doesn't float it mid-way.
      const ox = (w - WORLD_W * scale) / 2;
      const oy = Math.min((h - WORLD_H * scale) / 2, 8);
      live.current.base = { scale, ox, oy };
      const bs = Math.min(w / B_W, h / B_H);
      live.current.bview = { scale: bs, ox: (w - B_W * bs) / 2, oy: Math.min((h - B_H * bs) / 2, 8) };
      applyCamera();
      setBox({ left: ox, top: oy, width: WORLD_W * scale, height: WORLD_H * scale });
    };

    const frame = (t: number) => {
      if (!visible || !inView) {
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(frame);
      // A little slack so a 60 Hz display draws every 2nd frame (30 fps), not every 3rd.
      if (t - lastDraw < minFrameMs - 4) return;
      const dt = (t - last) / 1000;
      last = t;
      lastDraw = t;

      if (live.current.mode === "building") {
        const L = live.current;
        const b = L.building;
        b.t += dt;
        if (L.carTarget) {
          const d = L.carTarget.y - b.carY;
          const stepY = Math.sign(d) * Math.min(Math.abs(d), 60 * dt);
          b.carY += stepY;
          if (Math.abs(d) < 0.5) {
            const target = L.carTarget.floor;
            L.carTarget = null;
            goToFloor(target);
          }
        }
        const statuses: FloorStatus[] = FLOOR_ORDER.map((id) => {
          const open = id === "crypto" ? true : id === "equity" ? marketStateNY().open : L.futuresOpen;
          const wld = worlds.current.get(id);
          return { id, open, onDuty: wld ? wld.agents.filter((a) => !a.hidden).length : open === false ? 1 : 18 };
        });
        const local = new Date();
        drawBuilding(bctx, b, statuses, local.getHours() + local.getMinutes() / 60);
        const v = L.bview;
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = "#04060a";
        ctx.fillRect(0, 0, host.clientWidth, host.clientHeight);
        ctx.drawImage(buildingCanvas, v.ox, v.oy, B_W * v.scale, B_H * v.scale);
        drawBuildingOverlay(ctx, { ...v, pixel: L.view.fonts.pixel, vt: L.view.fonts.vt }, b, statuses);
        return;
      }

      const { floor: f, snap: s, hovered, zone, selected: sel, view } = live.current;
      const w = worldFor(f);
      step(w, dt, s);
      drawWorld(wctx, w, f, s, { person: hovered ?? sel, zone });

      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#04060a";
      ctx.fillRect(0, 0, host.clientWidth, host.clientHeight);
      const b = live.current.base;
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.ox, b.oy, WORLD_W * b.scale, WORLD_H * b.scale);
      ctx.clip();
      ctx.drawImage(worldCanvas, view.ox, view.oy, WORLD_W * view.scale, WORLD_H * view.scale);
      drawOverlay(ctx, view, w, f, s, hovered, Date.now());
      ctx.restore();
    };

    const kick = () => {
      if (!raf && visible && inView) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    const ro = new ResizeObserver(() => resize());
    ro.observe(host);
    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      kick();
    });
    io.observe(host);
    const onVis = () => {
      visible = !document.hidden;
      kick();
    };
    document.addEventListener("visibilitychange", onVis);
    const onWheel = (e: WheelEvent) => {
      if (live.current.mode !== "floor") return;
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    resize();
    kick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toWorld = (e: React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const v = live.current.view;
    return { x: (e.clientX - r.left - v.ox) / v.scale, y: (e.clientY - r.top - v.oy) / v.scale };
  };
  const toBuilding = (e: React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const v = live.current.bview;
    return { x: (e.clientX - r.left - v.ox) / v.scale, y: (e.clientY - r.top - v.oy) / v.scale };
  };
  const onDown = (e: React.MouseEvent) => {
    const { cam } = live.current;
    live.current.drag = { x: e.clientX, y: e.clientY, cx: cam.cx, cy: cam.cy, moved: false };
  };
  const onUp = () => {
    setTimeout(() => (live.current.drag = null), 0); // let onClick see whether it was a drag
  };
  const onMove = (e: React.MouseEvent) => {
    if (live.current.mode === "building") {
      const p = toBuilding(e);
      const f = floorAtPoint(p.x, p.y);
      live.current.building.hover = f;
      canvasRef.current!.style.cursor = f ? "pointer" : "default";
      return;
    }
    const d = live.current.drag;
    if (d && e.buttons === 1) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
      if (d.moved && live.current.cam.k > 1) {
        live.current.cam.cx = d.cx - dx / live.current.view.scale;
        live.current.cam.cy = d.cy - dy / live.current.view.scale;
        applyCamera();
        canvasRef.current!.style.cursor = "grabbing";
        return;
      }
    }
    const p = toWorld(e);
    const w = worldFor(floor);
    const role = hitTest(w, p.x, p.y);
    live.current.hovered = role;
    live.current.zone = role ? null : zoneAt(w, p.x, p.y);
    canvasRef.current!.style.cursor = role ? "pointer" : "default";
  };
  const onClick = (e: React.MouseEvent) => {
    if (live.current.mode === "building") {
      const p = toBuilding(e);
      const f = floorAtPoint(p.x, p.y);
      if (f && !live.current.carTarget) {
        unlockAudio();
        live.current.carTarget = { floor: f, y: carYFor(f) }; // ride up, then step out
      }
      return;
    }
    if (live.current.drag?.moved) return;
    const p = toWorld(e);
    const role = hitTest(worldFor(floor), p.x, p.y);
    setSelected(role);
    live.current.selected = role;
  };

  const world = worldFor(floor);
  const onFloor = world.agents.filter((a) => !a.hidden).length;
  const role = selected ? ROLE_BY_ID[selected] : null;
  const agent = selected ? world.byRole[selected] : null;
  const fact = selected ? factFor(selected, snap) : null;
  const now = new Date();
  const status = world.alarm
    ? { text: "FORCE FLAT", cls: "down" }
    : snap.open === null
      ? { text: "CONNECTING", cls: "dim" }
      : snap.open
        ? { text: floor === "crypto" ? "OPEN 24/7" : "MARKET OPEN", cls: "up" }
        : { text: "MARKET CLOSED", cls: "dim" };
  const risk = snap.riskBlocked == null ? null : snap.riskBlocked ? { text: "NO NEW RISK", cls: "down" } : { text: "RISK OK", cls: "up" };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex gap-1.5 px-2.5 py-2 items-center shrink-0 flex-wrap">
        {!widget.floor && (
          <button className={`term-btn ${mode === "building" ? "active" : ""}`} onClick={goToBuilding} title="Step out to the street view">
            🏙 Kimi Tower
          </button>
        )}
        {!widget.floor &&
          FLOOR_ORDER.map((f) => (
            <button
              key={f}
              className={`term-btn ${mode === "floor" && f === floor ? "active" : ""}`}
              onClick={() => goToFloor(f)}
              title={`Take the elevator to ${FLOOR_BAND[f].level}F`}
            >
              {FLOOR_BAND[f].level}F {FLOORS[f].label}
            </button>
          ))}
        {mode === "floor" && (
          <>
            <span className="ml-1 font-semibold" style={{ color: theme.accent, fontFamily: "var(--font-pixel)" }}>
              {theme.company}
            </span>
            <span className={`pill ${status.cls}`}>● {status.text}</span>
            <span className="pill" title="People on the floor right now">👥 {onFloor}/18</span>
            {risk && <span className={`pill ${risk.cls}`}>{risk.text}</span>}
          </>
        )}
        {mode === "floor" && (
          <button
            className={`term-btn ${demoRunning ? "active" : ""}`}
            onClick={runDemo}
            disabled={demoRunning}
            title="Play every floor event once (bell, setup, rally, war room, sell-off, FORCE FLAT), tagged [DEMO]"
          >
            {demoRunning ? "● Demo running" : "▶ Demo"}
          </button>
        )}
        <button
          className={`term-btn ${sound ? "active" : ""}`}
          title={sound ? "Sound on — bells, siren, cheers" : "Sound off"}
          onClick={() => {
            unlockAudio();
            if (!sound) play("chime");
            setSound(!sound);
          }}
        >
          {sound ? "🔊" : "🔇"}
        </button>
        <span className="ml-auto hidden lg:flex gap-3 dim text-[11px] num">
          {([["NY", "America/New_York"], ["LDN", "Europe/London"], ["TYO", "Asia/Tokyo"], ["KL", "Asia/Kuala_Lumpur"]] as const).map(([l, tz]) => (
            <span key={l}>
              {l} <span className="text-[var(--text)]">{now.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" })}</span>
            </span>
          ))}
        </span>
      </div>

      <div ref={hostRef} className="relative flex-1 min-h-0 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block"
          onMouseMove={onMove}
          onMouseDown={onDown}
          onMouseUp={onUp}
          onDoubleClick={resetCamera}
          onMouseLeave={() => {
            live.current.drag = null;
            live.current.hovered = null;
            live.current.zone = null;
          }}
          onClick={onClick}
        />

        {/* Live feed, over the pantry (bottom-right); the conference room is the war room. */}
        {mode === "floor" && box.width > 520 && (
          <div
            className="absolute pointer-events-none"
            style={{ left: box.left + box.width * 0.735, top: box.top + box.height * 0.66, width: Math.min(300, box.width * 0.24) }}
          >
            <div className="rounded-md border border-white/10 bg-black/55 backdrop-blur-sm px-2 py-1.5">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest dim" style={{ fontFamily: "var(--font-pixel)" }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--down)] animate-pulse" /> Live floor feed
              </div>
              {(feed[floor].length ? feed[floor] : [{ id: 0, at: now, text: "Waiting for the next event…", color: "#64748b" }]).map((f) => (
                <div key={f.id} className="flex gap-1.5 text-[13px] leading-tight mt-0.5" style={{ fontFamily: "var(--font-vt)" }}>
                  <span className="dim shrink-0">{fmtTime(f.at)}</span>
                  <span className="truncate" style={{ color: f.color }}>{f.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {mode === "floor" && (
        <div
          className="absolute flex flex-col gap-1"
          style={{ right: Math.max(8, box.left + 8), top: box.top + box.height * 0.13 }}
        >
          {([["+", () => zoomAt(1.4, box.left + box.width / 2, box.top + box.height / 2)], ["−", () => zoomAt(1 / 1.4, box.left + box.width / 2, box.top + box.height / 2)], ["⟲", resetCamera]] as const).map(([label, fn]) => (
            <button
              key={label}
              onClick={fn}
              title={label === "⟲" ? "Reset view (or double-click)" : label === "+" ? "Zoom in (or scroll)" : "Zoom out"}
              className="w-7 h-7 rounded-md border border-white/15 bg-black/60 backdrop-blur-sm text-[14px] hover:border-[var(--amber)] hover:text-[var(--amber)]"
            >
              {label}
            </button>
          ))}
          {zoom > 1 && <div className="text-center text-[10px] dim num">{zoom.toFixed(1)}×</div>}
        </div>
        )}

        {mode === "floor" && role && (
          <div
            className="absolute w-72 rounded-lg border border-[var(--border-strong)] bg-[var(--panel)]/92 backdrop-blur p-3 shadow-2xl"
            style={{ right: Math.max(12, box.left + box.width * 0.03), top: Math.max(12, box.top + box.height * 0.08) }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[12px]" style={{ fontFamily: "var(--font-pixel)", color: theme.accent }}>{role.title}</div>
                <div className="dim text-[11px] mt-0.5">
                  {DEPARTMENTS.find((d) => d.id === role.dept)?.name} · {theme.company}
                </div>
              </div>
              <button className="dim hover:text-[var(--text)]" onClick={() => { setSelected(null); live.current.selected = null; }}>✕</button>
            </div>
            <div className="mt-2 text-[11px] dim">Watching</div>
            <div className="text-[12px]">{role.watches}</div>
            <div className="mt-2 text-[11px] dim">Right now</div>
            <div className="text-[16px] leading-tight" style={{ fontFamily: "var(--font-vt)" }}>{fact ?? "Nothing live to report yet."}</div>
            <div className="mt-2 text-[11px] dim">
              {agent?.hidden ? "Off duty" : agent?.state === "walking" ? "On the move" : agent?.state === "seated" ? "At desk" : "Away from desk"}
            </div>
            <button className="term-btn active w-full mt-3" onClick={() => addWidget(role.opens)}>
              Open {role.opens} widget
            </button>
          </div>
        )}

        {/* Elevator doors: slide shut, change the view behind them, slide open. */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {(["left", "right"] as const).map((side) => (
            <div
              key={side}
              className="absolute top-0 bottom-0 w-1/2 transition-transform duration-[400ms] ease-in-out"
              style={{
                [side]: 0,
                transform: doors === "closed" ? "translateX(0)" : `translateX(${side === "left" ? "-101%" : "101%"})`,
                background:
                  "repeating-linear-gradient(90deg, #4b5563 0 2px, #6b7280 2px 6px, #9ca3af 6px 7px, #6b7280 7px 12px), linear-gradient(#1f2937, #111827)",
                boxShadow: side === "left" ? "inset -3px 0 0 #111827" : "inset 3px 0 0 #111827",
              }}
            />
          ))}
          <div
            className="absolute left-1/2 top-6 -translate-x-1/2 px-3 py-1 rounded border border-amber-400/60 bg-black/85 text-amber-300 transition-opacity duration-300"
            style={{ fontFamily: "var(--font-pixel)", fontSize: 13, opacity: doors === "closed" ? 1 : 0, textShadow: "0 0 8px #f5a524" }}
          >
            {doorLabel}
          </div>
        </div>
      </div>
    </div>
  );
}

// Drawing. Two passes:
//   1. the world, on a 640x384 canvas, in pixels, in a 3/4 view: floors,
//      back walls, furniture, screens, light, data-flow lines and people;
//   2. text on the display canvas at screen resolution: the LED ticker, the
//      video wall, labels and speech bubbles, in pixel fonts.

import { FLOORS, type FloorId } from "./floors";
import { ROLE_BY_ID, type RoleId } from "./roster";
import { personSprite, playerSprite, SEATED_ROWS, SPRITE_H, SPRITE_W } from "./sprites";
import type { Interactable, Player } from "./player";
import type { FloorSnapshot } from "./snapshot";
import { H_WALL_ROWS, MAP_H, MAP_W, T, TILE, tileAt, type FloorMap, type Ground, type ZoneId } from "./tilemap";
import {
  chair, counter, decor, desk, deskScreens, doorway, exitDoor, floorLamp, ground, hub, hubScreens, plant, px,
  server, serverLeds, shelf, sofa, table, wallCap, wallFace, wallScreenFrame, wallSouth,
} from "./furniture";
import type { Agent, World } from "./sim";

export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

const staticCache = new Map<FloorId, HTMLCanvasElement>();

function hexRgb(hex: string): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function groundAt(map: FloorMap, x: number, y: number): Ground | null {
  for (const g of map.grounds) {
    const r = g.rect;
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return g.ground;
  }
  return null;
}

const COUNTER_ITEMS = ["plain", "coffee", "sink", "fridge"] as const;

/** Everything that never moves. Cached per company theme. */
function staticLayer(map: FloorMap, floor: FloorId): HTMLCanvasElement {
  const hit = staticCache.get(floor);
  if (hit) return hit;
  const theme = FLOORS[floor];
  const c = document.createElement("canvas");
  c.width = WORLD_W;
  c.height = WORLD_H;
  const ctx = c.getContext("2d")!;
  const isWall = (x: number, y: number) => {
    const t = tileAt(map, x, y);
    return t === T.Wall || t === T.WallFace || t === T.Board;
  };

  // 1. Floor finish everywhere, so doorways and wall edges sit on the right floor.
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const g = groundAt(map, x, y);
      if (g) ground(ctx, g, x, y, theme);
      else px(ctx, x * TILE, y * TILE, TILE, TILE, (x + y) % 2 ? theme.floor[0] : theme.floor[1]);
    }
  }

  // 2. Walls and doors.
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const X = x * TILE;
      const Y = y * TILE;
      switch (tileAt(map, x, y)) {
        case T.Wall:
          if (y === 0) {
            // LED ticker housing; the text scrolls in the overlay pass.
            px(ctx, X, Y, TILE, TILE, "#03050a");
            px(ctx, X, Y + TILE - 2, TILE, 2, theme.accent + "66");
            for (let i = 1; i < TILE; i += 3) px(ctx, X + i, Y + 2, 1, 1, "#0d1420");
          } else if (H_WALL_ROWS.includes(y)) wallSouth(ctx, X, Y, theme);
          else wallCap(ctx, X, Y);
          break;
        case T.WallFace:
        case T.Board:
          wallFace(ctx, X, Y, y === 1 ? "upper" : y === 2 ? "lower" : "single", theme);
          break;
        case T.Door:
          if (y === MAP_H - 1) exitDoor(ctx, X, Y, theme.accent);
          else doorway(ctx, X, Y, isWall(x - 1, y), isWall(x + 1, y), y === 15);
          break;
      }
    }
  }

  // Things on the back walls: the video wall, screens, clocks, windows.
  const board = map.zones.find((z) => z.id === "board")!.rect;
  px(ctx, board.x * TILE - 2, board.y * TILE + 1, board.w * TILE + 4, board.h * TILE - 1, "#05070b");
  px(ctx, board.x * TILE - 2, board.y * TILE + 1, board.w * TILE + 4, 1, "#2b2f37");
  px(ctx, board.x * TILE, board.y * TILE + 3, board.w * TILE, board.h * TILE - 5, "#03060b");
  for (let i = 1; i < board.w; i++) px(ctx, (board.x + i) * TILE, board.y * TILE + 3, 1, board.h * TILE - 5, "#0d1320");
  for (const d of map.decor) decor(ctx, d);
  for (const s of map.wallScreens) wallScreenFrame(ctx, s.x, s.y, s.w, s.h);

  // 3. Furniture, row by row, so tall props overlap the row behind them.
  const deskAt = new Set(Object.values(map.desks).map((d) => `${d.desk.x},${d.desk.y}`));
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const X = x * TILE;
      const Y = y * TILE;
      switch (tileAt(map, x, y)) {
        case T.Plant:
          plant(ctx, X, Y, x + y);
          break;
        case T.Shelf:
          shelf(ctx, X, Y, y < 12, x * 31 + y);
          break;
        case T.Server:
          server(ctx, X, Y);
          break;
        case T.Lamp:
          floorLamp(ctx, X, Y);
          break;
        case T.Sofa:
          sofa(ctx, X, Y, tileAt(map, x - 1, y) !== T.Sofa, tileAt(map, x + 1, y) !== T.Sofa);
          break;
        case T.Counter: {
          let i = 0;
          while (tileAt(map, x - i - 1, y) === T.Counter) i++;
          counter(ctx, X, Y, COUNTER_ITEMS[Math.min(i, COUNTER_ITEMS.length - 1)]);
          break;
        }
        case T.Table:
          table(ctx, X, Y, tileAt(map, x, y + 1) !== T.Table, (x + y) % 2 === 0);
          break;
        case T.Desk:
          if (deskAt.has(`${x},${y}`)) desk(ctx, X, Y);
          break;
        case T.Post:
          if (x === map.post.x && y === map.post.y) {
            const P = map.post;
            hub(ctx, P.x * TILE, P.y * TILE, P.w * TILE, P.h * TILE, theme.accent);
            for (const r of hubScreens(P.x * TILE, P.y * TILE, P.w * TILE)) {
              px(ctx, r.x - 1, r.y - 1, r.w + 2, r.h + 2, "#0b0d11");
              px(ctx, r.x + r.w / 2 - 1, r.y + r.h + 1, 2, 2, "#2a2d33");
            }
          }
          break;
      }
    }
  }

  staticCache.set(floor, c);
  return c;
}

const SCREEN: Record<string, string[]> = {
  ops: ["#38bdf8", "#0ea5e9", "#7dd3fc"],
  research: ["#22c55e", "#4ade80", "#16a34a"],
  risk: ["#f472b6", "#e879f9", "#f9a8d4"],
};

const OFF = "#0b0f16";

/** A small screen with a live chart line moving across it; `OFF` when nobody's there. */
function screen(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, t: number, seed: number) {
  if (color === OFF) {
    px(ctx, x, y, w, h, OFF);
    px(ctx, x, y, w, 1, "#161c27");
    return;
  }
  px(ctx, x, y, w, h, "#07101d");
  px(ctx, x, y + Math.floor(h / 2), w, 1, "rgba(148,163,184,0.12)");
  ctx.fillStyle = color;
  for (let i = 0; i < w; i++) {
    const v = Math.sin(t * 1.6 + i * 0.8 + seed) * 0.35 + Math.sin(i * 0.31 + seed * 1.7 + t * 0.4) * 0.15 + 0.5;
    const yy = y + Math.round((1 - v) * (h - 1));
    ctx.fillRect(x + i, yy, 1, 1);
    ctx.globalAlpha = 0.25;
    ctx.fillRect(x + i, yy + 1, 1, y + h - yy - 1);
    ctx.globalAlpha = 1;
  }
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${alpha})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export type Highlight = { person: RoleId | null; zone: ZoneId | null };

/** Pass 1: the pixel world. */
export function drawWorld(ctx: CanvasRenderingContext2D, w: World, floor: FloorId, snap: FloorSnapshot, hl: Highlight, player: Player | null = null, target: Interactable | null = null) {
  const theme = FLOORS[floor];
  // Lights follow the floor's own state (set by open/close events), so the
  // opening bell visibly switches them on.
  const night = w.closed;
  const t = w.time;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(staticLayer(w.map, floor), 0, 0);

  // Desk screens: live charts while someone's there; red when FORCE FLAT.
  const flash = w.alarm && Math.floor(t * 4) % 2 === 0;
  for (const [role, spot] of Object.entries(w.map.desks) as Array<[RoleId, FloorMap["desks"][RoleId]]>) {
    const on = !w.byRole[role].hidden;
    const pal = SCREEN[ROLE_BY_ID[role].dept];
    const col = (k: number) => (!on ? OFF : flash ? "#ef4444" : pal[(k + Math.floor(t / 3)) % pal.length]);
    deskScreens(spot.desk.x * TILE, spot.desk.y * TILE).forEach((r, k) => screen(ctx, r.x, r.y, r.w, r.h, col(k), t, spot.desk.x + k * 3));
  }

  // The trading hub's monitors.
  const p = w.map.post;
  hubScreens(p.x * TILE, p.y * TILE, p.w * TILE).forEach((r, i) =>
    screen(ctx, r.x, r.y, r.w, r.h, flash ? "#ef4444" : night ? OFF : i % 2 ? theme.accent : "#38bdf8", t, i * 5)
  );

  // Wall screens: research charts and the drawdown monitor.
  for (const [i, s] of w.map.wallScreens.entries()) {
    const color = flash ? "#ef4444" : s.kind === "risk" ? (w.riskAlarm ? "#ef4444" : "#22c55e") : SCREEN.research[i % 3];
    screen(ctx, s.x, s.y, s.w, s.h, night && s.kind === "charts" ? OFF : color, t * (s.kind === "risk" ? 0.5 : 1), i * 7);
  }

  // Server LEDs, blinking.
  for (let y = 0; y < w.map.h; y++) {
    for (let x = 0; x < w.map.w; x++) {
      if (tileAt(w.map, x, y) !== T.Server) continue;
      for (const [k, led] of serverLeds(x * TILE, y * TILE).entries()) {
        const blink = Math.sin(t * (3 + (k % 5)) + x * 1.7 + y + k * 2.3) > 0.2;
        px(ctx, led.x, led.y, 1, 1, blink ? (k % 7 === 3 ? "#f59e0b" : "#22c55e") : "#14361f");
      }
    }
  }

  // Chart strip along the bottom of the video wall, trending with the lead market.
  const board = w.map.zones.find((z) => z.id === "board")!.rect;
  const up = (snap.board[0]?.changePct ?? 0) >= 0;
  ctx.fillStyle = up ? "#22c55e" : "#ef4444";
  for (let x = 0; x < board.w * TILE - 4; x++) {
    const v = Math.sin((x + t * 20) * 0.08) * 2 + Math.sin((x + t * 9) * 0.21) * 1.5 + (up ? -x * 0.012 : x * 0.012);
    ctx.fillRect(board.x * TILE + 2 + x, (board.y + board.h) * TILE - 6 + Math.round(v), 1, 1);
  }

  // Light: warm ceiling lamps while open, screen glow always, the post's halo.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  if (!night) for (const l of w.map.lamps) glow(ctx, l.x, l.y, l.r, "255,226,170", 0.07);
  for (const [role, spot] of Object.entries(w.map.desks) as Array<[RoleId, FloorMap["desks"][RoleId]]>) {
    if (w.byRole[role].hidden) continue;
    glow(ctx, spot.desk.x * TILE + 8, spot.desk.y * TILE, 24, flash ? "239,68,68" : "56,189,248", night ? 0.16 : 0.07);
  }
  glow(ctx, w.map.pitCenter.x, w.map.pitCenter.y, 46, hexRgb(theme.accent), 0.12 + 0.04 * Math.sin(t * 2));
  ctx.restore();

  // Data-flow lines: packets travelling from sender to receiver.
  for (const l of w.links) {
    const fade = Math.max(0, Math.min(1, l.ttl / 1.5, (l.life - l.ttl) / 0.4));
    ctx.save();
    ctx.globalAlpha = 0.5 * fade;
    ctx.strokeStyle = l.color;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.lineDashOffset = -t * 20;
    ctx.beginPath();
    ctx.moveTo(l.from.x, l.from.y);
    ctx.lineTo(l.to.x, l.to.y);
    ctx.stroke();
    ctx.globalAlpha = fade;
    for (let k = 0; k < 3; k++) {
      const f = (t * 0.6 + k / 3) % 1;
      const x = Math.round(l.from.x + (l.to.x - l.from.x) * f);
      const y = Math.round(l.from.y + (l.to.y - l.from.y) * f);
      px(ctx, x - 1, y - 1, 3, 3, l.color);
      px(ctx, x, y, 1, 1, "#ffffff");
    }
    ctx.restore();
  }

  // Risk room glows red while new risk is blocked.
  if (w.riskAlarm) {
    const r = w.map.zones.find((z) => z.id === "risk")!.rect;
    ctx.fillStyle = `rgba(239,68,68,${0.16 + 0.1 * Math.sin(t * 4)})`;
    ctx.fillRect(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE);
  }

  // War room: the conference room glows amber while the team is in session.
  if (w.warRoom) {
    const r = w.map.zones.find((z) => z.id === "conference")!.rect;
    ctx.fillStyle = `rgba(251,191,36,${0.1 + 0.06 * Math.sin(t * 3)})`;
    ctx.fillRect(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE);
  }

  // Hovered room outline.
  if (hl.zone && hl.zone !== "board") {
    const r = w.map.zones.find((z) => z.id === hl.zone)!.rect;
    ctx.strokeStyle = `rgba(${hexRgb(theme.accent)},${0.55 + 0.25 * Math.sin(t * 5)})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x * TILE + 0.5, r.y * TILE + 0.5, r.w * TILE - 1, r.h * TILE - 1);
  }

  // What the player can use right now gets a pulsing marker.
  if (target && target.kind !== "person") {
    ctx.strokeStyle = `rgba(253,224,71,${0.6 + 0.4 * Math.sin(t * 6)})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(target.x) - 8.5, Math.round(target.y) - 8.5, 17, 17);
  }

  // People (and Kimi) and the chairs they sit in, back to front, with a ring
  // under the highlighted one. A chair sorts just after whoever sits in it.
  type Drawable = { y: number; draw: () => void };
  const chairs: Drawable[] = Object.values(w.map.desks).map((d) => {
    const cx = d.seat.x * TILE + 8;
    const cy = d.seat.y * TILE + 8;
    return { y: cy + 0.5, draw: () => chair(ctx, cx, cy) };
  });
  const list: Drawable[] = w.agents
    .filter((a) => !a.hidden)
    .map((a) => ({
      y: a.py,
      draw: () => {
        const ring = hl.person === a.role || (target?.kind === "person" && target.role === a.role);
        if (ring) {
          ctx.strokeStyle = target?.kind === "person" && target.role === a.role ? "#fde047" : theme.accent;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(a.px, a.py + 2, 7, 3, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        drawPerson(ctx, a);
      },
    }));
  list.push(...chairs);
  if (player) {
    list.push({
      y: player.py,
      draw: () => {
        ctx.strokeStyle = "#f5a524";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(player.px, player.py + 2, 7, 3, 0, 0, Math.PI * 2);
        ctx.stroke();
        const sprite = playerSprite(player.dir, player.moving ? Math.floor(player.walkT * 8) : 0);
        const x = Math.round(player.px - SPRITE_W / 2);
        const y = Math.round(player.py - STAND);
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(x + 3, Math.round(player.py) + 1, 6, 2);
        ctx.drawImage(sprite, x, y);
      },
    });
  }
  list.sort((a, b) => a.y - b.y).forEach((d) => d.draw());

  // The bell, swinging in front of the video wall during a ceremony.
  if (w.bell) {
    const bx = w.map.pitCenter.x;
    const by = 3 * TILE + 2;
    const swing = Math.round(Math.sin(t * 14) * 2);
    px(ctx, bx - 6, by - 4, 12, 2, "#5b3f2c"); // bracket
    px(ctx, bx - 4 + swing, by - 2, 8, 2, "#e7c063");
    px(ctx, bx - 5 + swing, by, 10, 5, "#d4a73a");
    px(ctx, bx - 6 + swing, by + 5, 12, 2, "#b8892f");
    px(ctx, bx - 1 + swing * 2, by + 7, 2, 2, "#7a5a1f"); // clapper
    ctx.strokeStyle = `rgba(253,224,71,${0.5 + 0.5 * Math.sin(t * 10)})`;
    for (let k = 1; k <= 3; k++) {
      const r = ((t * 30 + k * 8) % 26) + 6;
      ctx.globalAlpha = 1 - r / 32;
      ctx.beginPath();
      ctx.arc(bx, by + 3, r, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Confetti.
  for (const c of w.confetti) px(ctx, Math.round(c.x), Math.round(c.y), 2, 2, c.color);

  // After hours: lights down; FORCE FLAT: the whole floor pulses red.
  if (night && !w.alarm) {
    ctx.fillStyle = "rgba(3,5,12,0.5)";
    ctx.fillRect(0, TILE, WORLD_W, WORLD_H - TILE);
  }
  if (w.alarm) {
    ctx.fillStyle = `rgba(239,68,68,${0.07 + 0.07 * Math.sin(t * 6)})`;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  }
  if (w.panic > 0) {
    ctx.fillStyle = `rgba(239,68,68,${Math.min(0.18, w.panic * 0.05) * (0.6 + 0.4 * Math.sin(t * 12))})`;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  }
}

// Sprite top relative to the feet: standing, and seated with the shoulders
// just above the chair back.
const STAND = 17;
const SIT = 17;

function drawPerson(ctx: CanvasRenderingContext2D, a: Agent) {
  const frame = a.state === "walking" ? Math.floor(a.walkT * 8) % 4 : 0;
  const sprite = personSprite(a.role, a.dir, frame);
  const x = Math.round(a.px - SPRITE_W / 2);
  const seated = a.state === "seated";
  const bob = seated && Math.floor(a.walkT * 3) % 2 ? 1 : 0; // typing
  const y = Math.round(a.py - (seated ? SIT - bob : STAND));
  if (seated) {
    ctx.drawImage(sprite, 0, 0, SPRITE_W, SEATED_ROWS, x, y, SPRITE_W, SEATED_ROWS);
    return;
  }
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(x + 3, Math.round(a.py) + 1, 6, 2);
  ctx.drawImage(sprite, x, y);
  if (a.carrying) {
    px(ctx, x + 9, y + 10, 4, 5, "#f8fafc");
    px(ctx, x + 10, y + 11, 2, 1, "#94a3b8");
    px(ctx, x + 10, y + 13, 2, 1, "#94a3b8");
  }
}

// ---- pass 2: text at screen resolution --------------------------------------

export type Fonts = { pixel: string; vt: string };
// frame: the on-screen box the floor is shown in; with zoom the world extends past it.
export type View = { scale: number; ox: number; oy: number; fonts: Fonts; frame?: { l: number; r: number } };

const toScreen = (v: View, x: number, y: number) => ({ x: v.ox + x * v.scale, y: v.oy + y * v.scale });

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export type TickerItem = { text: string; color: string };

/** What scrolls across the LED tape: the board, then the floor's live items. */
export function tickerItems(snap: FloorSnapshot): TickerItem[] {
  const arrow = (c: number) => `${c >= 0 ? "▲" : "▼"}${Math.abs(c).toFixed(2)}%`;
  const out: TickerItem[] = snap.board.map((b) => ({
    text: `${b.label} ${b.value}${b.changePct == null ? "" : ` ${arrow(b.changePct)}`}`,
    color: b.changePct == null ? "#fbbf24" : b.changePct >= 0 ? "#4ade80" : "#f87171",
  }));
  if (snap.bigMover) out.push({ text: `MOVER ${snap.bigMover.symbol} ${arrow(snap.bigMover.changePct)}`, color: "#22d3ee" });
  if (snap.signal) out.push({ text: `SETUP ${snap.signal.text}`, color: "#c4b5fd" });
  if (snap.econEvent) out.push({ text: `NEXT ${snap.econEvent.title} ${snap.econEvent.when}`, color: "#fbbf24" });
  if (snap.headline) out.push({ text: `NEWS ${snap.headline}`, color: "#e2e8f0" });
  return out;
}

export function drawOverlay(ctx: CanvasRenderingContext2D, v: View, w: World, floor: FloorId, snap: FloorSnapshot, hovered: RoleId | null, nowMs: number, player: Player | null = null, target: Interactable | null = null) {
  const theme = FLOORS[floor];
  const s = v.scale;
  const { pixel, vt } = v.fonts;
  const fs = (n: number, min = 9, max = 16) => Math.round(Math.min(max, Math.max(min, n * s)));
  ctx.textBaseline = "middle";

  // LED ticker tape along the top wall.
  const tape = { x: v.ox + TILE * s, y: v.oy, w: (WORLD_W - 2 * TILE) * s, h: TILE * s };
  const items = tickerItems(snap);
  if (items.length) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(tape.x, tape.y, tape.w, tape.h);
    ctx.clip();
    const f = fs(11, 12, 22);
    ctx.font = `${f}px ${vt}`;
    ctx.textAlign = "left";
    const gap = f * 2.2;
    const texts = items.map((it) => (it.text.length > 80 ? it.text.slice(0, 79) + "…" : it.text));
    const widths = texts.map((tx) => ctx.measureText(tx).width + gap);
    const total = widths.reduce((a, b) => a + b, 0);
    let x = tape.x - ((w.time * 42 * Math.max(s, 1)) % total);
    while (x < tape.x + tape.w) {
      items.forEach((it, i) => {
        if (x + widths[i] > tape.x && x < tape.x + tape.w) {
          ctx.fillStyle = it.color;
          ctx.shadowColor = it.color;
          ctx.shadowBlur = 6;
          ctx.fillText(texts[i], x, tape.y + tape.h / 2);
          ctx.shadowBlur = 0;
          ctx.fillStyle = "#334155";
          ctx.fillText("◆", x + widths[i] - gap * 0.62, tape.y + tape.h / 2);
        }
        x += widths[i];
      });
    }
    ctx.restore();
  }

  // Video wall: the company, then live panels while they fit.
  const board = w.map.zones.find((z) => z.id === "board")!.rect;
  const b0 = toScreen(v, board.x * TILE, board.y * TILE);
  const bw = board.w * TILE * s;
  const bh = board.h * TILE * s - 7 * s; // keep the chart strip clear
  ctx.save();
  ctx.beginPath();
  ctx.rect(b0.x, b0.y, bw, bh);
  ctx.clip();
  const titleF = fs(7, 10, 16);
  ctx.font = `${titleF}px ${pixel}`;
  ctx.textAlign = "left";
  ctx.fillStyle = theme.accent;
  ctx.shadowColor = theme.accent;
  ctx.shadowBlur = 8;
  const company = theme.company.toUpperCase();
  ctx.fillText(company, b0.x + 6, b0.y + bh * 0.45);
  ctx.shadowBlur = 0;
  const companyW = ctx.measureText(company).width + 18;
  const valueF = fs(9, 13, 20);
  ctx.font = `${valueF}px ${vt}`;
  const panels = snap.board.slice(0, 4);
  const room = bw - companyW;
  const colW = Math.max(1, ...panels.map((it) => ctx.measureText(`${it.label} ${it.value} ▲0.00%`).width)) + 14;
  const cols = Math.max(0, Math.min(panels.length, Math.floor(room / colW)));
  panels.slice(0, cols).forEach((it, i) => {
    const x = b0.x + companyW + i * (room / cols);
    px(ctx, x - 7, b0.y + 3, 1, bh - 6, "#1e293b");
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(it.label, x, b0.y + bh * 0.45);
    const lw = ctx.measureText(it.label + " ").width;
    ctx.fillStyle = it.changePct == null ? "#f8fafc" : it.changePct >= 0 ? "#4ade80" : "#f87171";
    const chg = it.changePct == null ? "" : ` ${it.changePct >= 0 ? "▲" : "▼"}${Math.abs(it.changePct).toFixed(2)}%`;
    ctx.fillText(`${it.value}${chg}`, x + lw, b0.y + bh * 0.45);
  });
  ctx.restore();

  // Company plate on the centre post.
  const post = w.map.post;
  const pc = toScreen(v, (post.x + post.w / 2) * TILE, (post.y + post.h / 2) * TILE);
  const initials = theme.company.split(" ").map((p) => p[0]).join("").slice(0, 3);
  const plateF = fs(8, 11, 20);
  ctx.font = `${plateF}px ${pixel}`;
  ctx.textAlign = "center";
  const iw = ctx.measureText(initials).width + 12;
  const ih = plateF + 8;
  ctx.fillStyle = "rgba(3,6,12,0.92)";
  roundRect(ctx, pc.x - iw / 2, pc.y - ih / 2, iw, ih, 3);
  ctx.fill();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = theme.accent;
  ctx.shadowColor = theme.accent;
  ctx.shadowBlur = 10;
  ctx.fillText(initials, pc.x, pc.y + 1);
  ctx.shadowBlur = 0;

  // Room labels.
  const zoneF = fs(4.6, 8, 12);
  for (const z of w.map.zones) {
    if (z.id === "board") continue;
    const p = toScreen(v, z.rect.x * TILE + 3, z.rect.y * TILE + 2);
    const alarm = z.id === "risk" && w.riskAlarm;
    const label = z.name.toUpperCase();
    ctx.font = `${zoneF}px ${pixel}`;
    const maxW = z.rect.w * TILE * s - 6;
    const tw = Math.min(ctx.measureText(label).width, maxW - zoneF);
    if (tw < zoneF * 3) continue;
    const h = zoneF + 7;
    ctx.fillStyle = alarm ? "rgba(239,68,68,0.92)" : "rgba(3,6,12,0.78)";
    roundRect(ctx, p.x, p.y, tw + zoneF, h, 3);
    ctx.fill();
    ctx.fillStyle = alarm ? "#fff" : "#cbd5e1";
    ctx.textAlign = "left";
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x, p.y, tw + zoneF, h);
    ctx.clip();
    ctx.fillText(label, p.x + zoneF / 2, p.y + h / 2 + 1);
    ctx.restore();
  }

  // War-room countdown on the conference room wall.
  if (w.warRoom) {
    const r = w.map.zones.find((z) => z.id === "conference")!.rect;
    const left = Math.round((w.warRoom.at - nowMs) / 1000);
    const clock = left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "LIVE";
    const label = `${w.warRoom.title} ${clock}`;
    const f = fs(7, 12, 18);
    ctx.font = `${f}px ${vt}`;
    ctx.textAlign = "center";
    const p = toScreen(v, (r.x + r.w / 2) * TILE, (r.y + 1.5) * TILE);
    const tw = ctx.measureText(label).width + f;
    ctx.fillStyle = "rgba(3,6,12,0.9)";
    roundRect(ctx, p.x - tw / 2, p.y - f * 0.75, tw, f * 1.5, 3);
    ctx.fill();
    ctx.strokeStyle = "#fbbf24";
    ctx.stroke();
    ctx.fillStyle = left > 0 && left <= 60 && Math.floor(nowMs / 500) % 2 ? "#f87171" : "#fbbf24";
    ctx.fillText(label, p.x, p.y + 1);
  }

  // Speech bubbles, and the name tag of whoever is hovered.
  const bubbleF = fs(8, 14, 19);
  const bounds = v.frame ?? { l: v.ox, r: v.ox + WORLD_W * s };
  for (const a of w.agents) {
    if (a.hidden) continue;
    const head = toScreen(v, a.px, a.py - SPRITE_H - 1);
    if (a.bubble) bubble(ctx, bubbleF, head.x, head.y, a.bubble.text, a.bubble.alert, vt, false, bounds);
    else if (hovered === a.role) bubble(ctx, bubbleF, head.x, head.y, ROLE_BY_ID[a.role].title, false, vt, true, bounds);
  }

  // Kimi's name tag, and the key prompt over whatever can be used.
  if (player) {
    const head = toScreen(v, player.px, player.py - SPRITE_H - 1);
    const f = fs(5, 10, 13);
    ctx.font = `${f}px ${pixel}`;
    ctx.textAlign = "center";
    const tw = ctx.measureText("KIMI").width + 8;
    ctx.fillStyle = "rgba(180,83,9,0.92)";
    ctx.fillRect(head.x - tw / 2, head.y - f - 4, tw, f + 4);
    ctx.fillStyle = "#fef3c7";
    ctx.fillText("KIMI", head.x, head.y - f / 2 - 2);
    if (target) {
      const label = { person: "Talk", desk: "Peek at screen", bell: "Ring the bell", coffee: "Grab a coffee", wall: "Open the video wall" }[target.kind];
      const at = toScreen(v, target.x, target.y - (target.kind === "person" ? SPRITE_H + 12 : 14));
      const pf = fs(7, 13, 18);
      ctx.font = `${pf}px ${vt}`;
      const text = `E · ${label}`;
      const pw = ctx.measureText(text).width + pf;
      ctx.fillStyle = "rgba(3,6,12,0.9)";
      ctx.fillRect(at.x - pw / 2, at.y - pf * 0.7, pw, pf * 1.4);
      ctx.strokeStyle = "#fde047";
      ctx.lineWidth = 1;
      ctx.strokeRect(at.x - pw / 2 + 0.5, at.y - pf * 0.7 + 0.5, pw - 1, pf * 1.4 - 1);
      ctx.fillStyle = "#fde047";
      ctx.fillText(text, at.x, at.y + 1);
    }
  }

  // Opening / closing bell banner.
  if (w.bell) {
    const life = w.bell.kind === "open" ? 6 : w.bell.kind === "close" ? 5 : 3.5;
    const alpha = Math.min(1, w.bell.ttl / 0.6, (life - w.bell.ttl) / 0.3);
    const text = w.bell.kind === "open" ? "OPENING BELL" : w.bell.kind === "close" ? "CLOSING BELL" : "DING DING DING!";
    const f = fs(16, 18, 40);
    const c = toScreen(v, WORLD_W / 2, WORLD_H * 0.32);
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.font = `${f}px ${pixel}`;
    ctx.textAlign = "center";
    const tw = ctx.measureText(text).width + f * 2;
    ctx.fillStyle = "rgba(3,6,12,0.85)";
    roundRect(ctx, c.x - tw / 2, c.y - f, tw, f * 2, 6);
    ctx.fill();
    ctx.strokeStyle = "#e7c063";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#fde68a";
    ctx.shadowColor = "#f5a524";
    ctx.shadowBlur = 18;
    ctx.fillText(text, c.x, c.y + 2);
    ctx.restore();
  }
}

function bubble(ctx: CanvasRenderingContext2D, f: number, x: number, y: number, text: string, alert: boolean, font: string, tag: boolean, bounds: { l: number; r: number }) {
  ctx.font = `${f}px ${font}`;
  ctx.textAlign = "center";
  const full = ctx.measureText(text).width;
  const tw = Math.min(full, f * 18);
  const pad = f * 0.5;
  const w = tw + pad * 2;
  const h = f * 1.35;
  // Keep the box on the floor; the tail still points at the speaker.
  const bx = Math.min(Math.max(x - w / 2, bounds.l + 2), bounds.r - w - 2);
  const by = y - h - f * 0.4;
  ctx.fillStyle = alert ? "#ef4444" : tag ? "rgba(3,6,12,0.92)" : "#f8fafc";
  // Pixel-style box: square corners with the corner pixels notched out.
  ctx.fillRect(bx + 2, by, w - 4, h);
  ctx.fillRect(bx, by + 2, w, h - 4);
  if (!tag) {
    ctx.fillRect(x - 2, by + h, 4, f * 0.2);
    ctx.fillRect(x - 1, by + h + f * 0.2, 2, f * 0.2);
  }
  ctx.fillStyle = alert || tag ? "#fff" : "#0f172a";
  const shown = tw < full ? text.slice(0, Math.max(1, Math.floor((text.length * tw) / full) - 1)) + "…" : text;
  ctx.fillText(shown, bx + w / 2, by + h / 2 + 1);
}

/** The person under a world-space point, front-most first. */
export function hitTest(w: World, x: number, y: number): RoleId | null {
  const hits = w.agents
    .filter((a) => !a.hidden && Math.abs(a.px - x) <= SPRITE_W / 2 + 1 && y >= a.py - SPRITE_H && y <= a.py + 4)
    .sort((a, b) => b.py - a.py);
  return hits[0]?.role ?? null;
}

/** The room under a world-space point. */
export function zoneAt(w: World, x: number, y: number): ZoneId | null {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  const z = w.map.zones.find((z) => tx >= z.rect.x && tx < z.rect.x + z.rect.w && ty >= z.rect.y && ty < z.rect.y + z.rect.h);
  return z?.id ?? null;
}

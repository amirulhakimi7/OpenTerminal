// Snapshot diff -> floor events. Pure.
//
// The first snapshot only establishes state (closed floor, risk already
// blocked, FORCE FLAT already on); "new" things — a signal, a headline, a
// mover — need a previous snapshot to be new relative to, so opening the
// page doesn't replay the whole day.

import type { FloorSnapshot } from "./snapshot";

export type FloorEvent =
  | { kind: "marketOpen" }
  | { kind: "marketClosed"; bell: boolean } // bell: a close we saw happen, not one we loaded into
  | { kind: "rally"; text: string }
  | { kind: "selloff"; text: string }
  | { kind: "warRoom"; text: string; at: number }
  | { kind: "warRoomEnd" }
  | { kind: "forceFlat" }
  | { kind: "forceFlatEnd" }
  | { kind: "riskBlocked"; text: string }
  | { kind: "riskClear" }
  | { kind: "signal"; text: string }
  | { kind: "headline"; text: string }
  | { kind: "bigMover"; text: string }
  | { kind: "econ"; text: string };

/** Day change on the lead market that makes the floor cheer (or panic). */
export const RALLY = 2;
/** Minutes before a high-impact release that the war room convenes, and stays after. */
export const WAR_ROOM_BEFORE_MIN = 5;
export const WAR_ROOM_AFTER_MIN = 2;

/**
 * Clock-driven war room: convene before the next high-impact release, break
 * up shortly after it. Separate from diffSnapshots because it moves with time,
 * not with data.
 */
export function warRoomEvents(
  active: { title: string; at: number } | null,
  next: FloorSnapshot["econEvent"],
  nowMs: number
): FloorEvent[] {
  if (active) {
    return nowMs - active.at > WAR_ROOM_AFTER_MIN * 60_000 ? [{ kind: "warRoomEnd" }] : [];
  }
  if (!next) return [];
  const until = next.at - nowMs;
  return until <= WAR_ROOM_BEFORE_MIN * 60_000 && until > -WAR_ROOM_AFTER_MIN * 60_000
    ? [{ kind: "warRoom", text: next.title, at: next.at }]
    : [];
}

export function diffSnapshots(prev: FloorSnapshot | null, next: FloorSnapshot): FloorEvent[] {
  const out: FloorEvent[] = [];

  // Market open/closed: a state. Unknown (null) never fires.
  if (next.open !== null && next.open !== (prev?.open ?? null)) {
    if (next.open) {
      if (prev?.open === false) out.push({ kind: "marketOpen" });
    } else {
      out.push({ kind: "marketClosed", bell: prev?.open === true });
    }
  }

  // FORCE FLAT: a state.
  const wasFlat = prev?.phase === "force_flat";
  const isFlat = next.phase === "force_flat";
  if (isFlat && !wasFlat) out.push({ kind: "forceFlat" });
  if (!isFlat && wasFlat) out.push({ kind: "forceFlatEnd" });

  // Risk: a state.
  if (next.riskBlocked === true && prev?.riskBlocked !== true) {
    out.push({ kind: "riskBlocked", text: next.riskReason ?? "no new risk" });
  }
  if (next.riskBlocked === false && prev?.riskBlocked === true) out.push({ kind: "riskClear" });

  // Novelties: need a previous value to compare with.
  if (prev) {
    // The lead market crossing ±2% on the day: the floor reacts once per crossing.
    const lead = next.board[0];
    const before = prev.board[0]?.changePct;
    const now = lead?.changePct;
    if (lead && before != null && now != null) {
      if (before < RALLY && now >= RALLY) out.push({ kind: "rally", text: `${lead.label} +${now.toFixed(2)}%` });
      if (before > -RALLY && now <= -RALLY) out.push({ kind: "selloff", text: `${lead.label} ${now.toFixed(2)}%` });
    }
    if (next.signal && prev.signal && next.signal.id !== prev.signal.id) out.push({ kind: "signal", text: next.signal.text });
    if (next.headline && prev.headline && next.headline !== prev.headline) out.push({ kind: "headline", text: next.headline });
    if (next.bigMover && prev.bigMover && next.bigMover.symbol !== prev.bigMover.symbol) {
      const c = next.bigMover.changePct;
      out.push({ kind: "bigMover", text: `${next.bigMover.symbol} ${c >= 0 ? "+" : ""}${c.toFixed(2)}%` });
    }
    if (next.econEvent && prev.econEvent && next.econEvent.title !== prev.econEvent.title) {
      out.push({ kind: "econ", text: `${next.econEvent.title} · ${next.econEvent.when}` });
    }
  }
  return out;
}

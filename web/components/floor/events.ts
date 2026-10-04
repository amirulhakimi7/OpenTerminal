// Snapshot diff -> floor events. Pure.
//
// The first snapshot only establishes state (closed floor, risk already
// blocked, FORCE FLAT already on); "new" things — a signal, a headline, a
// mover — need a previous snapshot to be new relative to, so opening the
// page doesn't replay the whole day.

import type { FloorSnapshot } from "./snapshot";

export type FloorEvent =
  | { kind: "marketOpen" }
  | { kind: "marketClosed" }
  | { kind: "forceFlat" }
  | { kind: "forceFlatEnd" }
  | { kind: "riskBlocked"; text: string }
  | { kind: "riskClear" }
  | { kind: "signal"; text: string }
  | { kind: "headline"; text: string }
  | { kind: "bigMover"; text: string }
  | { kind: "econ"; text: string };

export function diffSnapshots(prev: FloorSnapshot | null, next: FloorSnapshot): FloorEvent[] {
  const out: FloorEvent[] = [];

  // Market open/closed: a state. Unknown (null) never fires.
  if (next.open !== null && next.open !== (prev?.open ?? null)) {
    if (next.open) {
      if (prev?.open === false) out.push({ kind: "marketOpen" });
    } else {
      out.push({ kind: "marketClosed" });
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

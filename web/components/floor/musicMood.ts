// Which music fits the scene. Pure: the floor passes in its state.

import type { Mood } from "../../lib/music";

/** The skyline by the local hour, matching the sky (see city.ts skyFor). */
export function towerMood(hour: number): Mood {
  if (hour < 5 || hour >= 20) return "tower-night";
  if (hour < 7) return "tower-dawn";
  if (hour < 17) return "tower-day";
  return "tower-dusk";
}

export type FloorMusicState = {
  closed: boolean;
  alarm: boolean; // FORCE FLAT
  warRoom: boolean;
  riskAlarm: boolean; // NO NEW RISK
  panic: number; // seconds of sell-off left
  rally: boolean; // confetti still falling
  bellOpen: boolean; // the opening bell ringing
};

/** Most urgent first: FORCE FLAT, the war room, trouble, a rally, the open, then calm. */
export function floorMood(s: FloorMusicState): Mood {
  if (s.alarm) return "floor-flat";
  if (s.warRoom) return "floor-warroom";
  if (s.closed) return "floor-closed";
  if (s.panic > 0 || s.riskAlarm) return "floor-tension";
  if (s.rally) return "floor-rally";
  if (s.bellOpen) return "floor-open";
  return "floor-calm";
}

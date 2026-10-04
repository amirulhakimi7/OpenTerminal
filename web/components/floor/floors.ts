// The three floors. Same staff and layout, different company and colours.
// Company names are fictional; change them here.

import type { FloorId } from "../../store/terminal";

export type { FloorId };

export type FloorTheme = {
  id: FloorId;
  label: string; // tab label
  company: string;
  tagline: string;
  accent: string; // board LEDs, logo
  floor: [string, string]; // corridor checker
  wall: string;
  wallTop: string;
  newsSymbol: string; // symbol whose headlines the News Analyst reads
};

export const FLOORS: Record<FloorId, FloorTheme> = {
  equity: {
    id: "equity",
    label: "Equity",
    company: "Merdeka Equity Partners",
    tagline: "US & regional equities",
    accent: "#38bdf8",
    floor: ["#3a3530", "#35302b"],
    wall: "#1d2433",
    wallTop: "#2c3650",
    newsSymbol: "SPY",
  },
  crypto: {
    id: "crypto",
    label: "Crypto",
    company: "Nusantara Digital Assets",
    tagline: "Spot digital assets, 24/7",
    accent: "#a78bfa",
    floor: ["#2b2a3a", "#272635"],
    wall: "#1c1830",
    wallTop: "#2e2650",
    newsSymbol: "BTC",
  },
  futures: {
    id: "futures",
    label: "Futures",
    company: "Selat Commodities Desk",
    tagline: "CME energy futures",
    accent: "#f5a524",
    floor: ["#33302a", "#2e2b25"],
    wall: "#26201a",
    wallTop: "#40342a",
    newsSymbol: "CL=F",
  },
};

export const FLOOR_ORDER: FloorId[] = ["equity", "crypto", "futures"];

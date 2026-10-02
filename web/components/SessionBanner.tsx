"use client";

import { useEffect } from "react";
import { notifyOnce } from "../lib/notify";
import { fmtCountdown, useCmeSession } from "../lib/session";

// Full-width FORCE_FLAT strip. Shown from the 16:30 ET alert until the market
// stops trading; invisible the rest of the day.
export default function SessionBanner() {
  const { session, minutesLeft } = useCmeSession();
  const phase = session?.phase;
  const day = session?.session_date ?? "";

  useEffect(() => {
    if (phase === "force_flat") {
      notifyOnce(`force-flat-${day}`, "FORCE FLAT — CL/MCL", "16:30 ET: flatten every position before 16:45 ET.");
    } else if (phase === "past_deadline") {
      notifyOnce(`past-deadline-${day}`, "PAST 16:45 ET", "Flat deadline passed. Any open CL/MCL position breaches LucidFlex rules.");
    }
  }, [phase, day]);

  if (phase !== "force_flat" && phase !== "past_deadline") return null;

  return (
    <div className="flex items-center gap-3 px-3 py-1 bg-[var(--down)] text-black font-bold text-[12px] shrink-0 animate-pulse">
      <span>⚠ {phase === "force_flat" ? "FORCE FLAT" : "PAST FLAT DEADLINE"}</span>
      <span className="font-normal">
        {phase === "force_flat"
          ? `Flatten all CL/MCL positions — ${fmtCountdown(minutesLeft)} to 16:45 ET. No new trades.`
          : "16:45 ET has passed. Any open position breaches the LucidFlex rules."}
      </span>
    </div>
  );
}

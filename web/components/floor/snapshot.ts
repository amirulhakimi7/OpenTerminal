// Live data -> one FloorSnapshot per floor. Pure: no fetching, no clock
// (callers pass `now`). Missing data stays undefined/null so the floor shows
// "unknown" rather than inventing a calm market.

import type { RoleId } from "./roster";

export type BoardItem = { label: string; value: string; changePct: number | null };

export type FloorSnapshot = {
  open: boolean | null; // null = not loaded yet
  phase: string | null; // CME phase on the futures floor
  board: BoardItem[];
  headline: string | null;
  signal: { id: string; text: string } | null;
  riskBlocked: boolean | null;
  riskReason: string | null;
  pnl: { label: string; value: number } | null;
  bigMover: { symbol: string; changePct: number } | null;
  econEvent: { title: string; when: string; at: number } | null; // at: epoch ms
  brokerNote: string | null;
};

// ---- input shapes (subsets of what the API returns) -------------------------

export type QuoteIn = { symbol: string; price: number | null; changePercent: number | null };
export type CryptoIn = { symbol: string; price: number; changePercent24h: number | null };
export type CryptoGlobalIn = { btcDominance: number };
export type NewsIn = { title: string };
export type HeatIn = { symbol: string; changePercent: number | null };
export type EconIn = { title: string; date: string; impact: string; country: string };
export type BrokerIn = { accounts: Array<{ unrealized_pl: number | null; currency: string }> };
export type SignalIn = { ts_utc: string; symbol: string; direction: string; entry: number; risk_reward: number; late: boolean };
export type RiskIn = { can_trade: boolean; reasons: string[]; risk_budget: number };
export type SessionIn = { phase: string; minutes_to_flat: number | null };

const EMPTY: FloorSnapshot = {
  open: null,
  phase: null,
  board: [],
  headline: null,
  signal: null,
  riskBlocked: null,
  riskReason: null,
  pnl: null,
  bigMover: null,
  econEvent: null,
  brokerNote: null,
};

const price = (n: number | null | undefined, digits = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

function biggestMover<T extends { symbol: string }>(rows: T[], pct: (r: T) => number | null) {
  let best: { symbol: string; changePct: number } | null = null;
  for (const r of rows) {
    const c = pct(r);
    if (c == null || !isFinite(c)) continue;
    if (!best || Math.abs(c) > Math.abs(best.changePct)) best = { symbol: r.symbol, changePct: c };
  }
  return best;
}

/** The next high-impact release after `now`, if the calendar has one. */
export function nextEconEvent(events: EconIn[] | undefined, now: Date): FloorSnapshot["econEvent"] {
  if (!events) return null;
  const upcoming = events
    .filter((e) => e.impact === "High" && new Date(e.date).getTime() > now.getTime())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  if (!upcoming) return null;
  const when = new Date(upcoming.date).toLocaleString("en-US", {
    timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  return { title: `${upcoming.country} ${upcoming.title}`, when: `${when} ET`, at: new Date(upcoming.date).getTime() };
}

// ETF prices, so label them as the ETFs — "S&P 500 769.64" would misstate the index.
const EQUITY_LABELS: Record<string, string> = { SPY: "SPY", QQQ: "QQQ", DIA: "DIA" };

export function equitySnapshot(i: {
  quotes?: QuoteIn[];
  nyseOpen: boolean;
  news?: NewsIn[];
  heat?: HeatIn[];
  econ?: EconIn[];
  broker?: BrokerIn;
  brokerError?: string | null;
  now: Date;
}): FloorSnapshot {
  const usd = i.broker?.accounts.filter((a) => a.currency === "USD" && a.unrealized_pl != null) ?? [];
  return {
    ...EMPTY,
    open: i.nyseOpen,
    board: (i.quotes ?? []).map((q) => ({
      label: EQUITY_LABELS[q.symbol] ?? q.symbol,
      value: price(q.price),
      changePct: q.changePercent,
    })),
    headline: i.news?.[0]?.title ?? null,
    bigMover: i.heat ? biggestMover(i.heat, (h) => h.changePercent) : null,
    econEvent: nextEconEvent(i.econ, i.now),
    pnl: usd.length ? { label: "moomoo open P&L", value: usd.reduce((s, a) => s + (a.unrealized_pl ?? 0), 0) } : null,
    brokerNote: i.broker ? "moomoo connected" : i.brokerError ? "moomoo offline — open OpenD" : null,
  };
}

export function cryptoSnapshot(i: {
  rows?: CryptoIn[];
  global?: CryptoGlobalIn;
  news?: NewsIn[];
  econ?: EconIn[];
  now: Date;
}): FloorSnapshot {
  const pick = ["BTC", "ETH", "SOL"];
  const board: BoardItem[] = pick
    .map((s) => i.rows?.find((r) => r.symbol === s))
    .filter((r): r is CryptoIn => !!r)
    .map((r) => ({ label: r.symbol, value: price(r.price, r.price < 10 ? 4 : 2), changePct: r.changePercent24h }));
  if (i.global) board.push({ label: "BTC DOM", value: `${i.global.btcDominance.toFixed(1)}%`, changePct: null });
  return {
    ...EMPTY,
    open: true, // crypto never closes
    board,
    headline: i.news?.[0]?.title ?? null,
    bigMover: i.rows ? biggestMover(i.rows.slice(0, 20), (r) => r.changePercent24h) : null,
    econEvent: nextEconEvent(i.econ, i.now),
    brokerNote: "Hata — waiting for API documentation",
  };
}

const OPEN_PHASES = new Set(["open", "force_flat", "past_deadline"]);
// Reasons that only mean "the market isn't trading" — not a risk breach.
const NOT_RISK = (r: string) => r === "market closed" || r.startsWith("past the 16:45");

export function futuresSnapshot(i: {
  session?: SessionIn;
  signals?: SignalIn[];
  risk?: RiskIn;
  journalPnl: number | null;
  news?: NewsIn[];
  econ?: EconIn[];
  now: Date;
}): FloorSnapshot {
  const s = i.session;
  const latest = i.signals?.find((x) => !x.late) ?? null;
  const blocking = i.risk ? i.risk.reasons.filter((r) => !NOT_RISK(r)) : null;
  const flat = s?.minutes_to_flat;
  return {
    ...EMPTY,
    open: s ? OPEN_PHASES.has(s.phase) : null,
    phase: s?.phase ?? null,
    board: [
      { label: "CME", value: s ? s.phase.replace("_", " ").toUpperCase() : "—", changePct: null },
      { label: "FLAT IN", value: flat == null ? "—" : `${Math.floor(flat / 60)}h ${String(Math.floor(flat % 60)).padStart(2, "0")}m`, changePct: null },
      { label: "RISK/TRADE", value: i.risk ? `$${price(i.risk.risk_budget, 0)}` : "—", changePct: null },
      { label: "TODAY P&L", value: i.journalPnl == null ? "—" : `${i.journalPnl < 0 ? "-" : ""}$${price(Math.abs(i.journalPnl))}`, changePct: i.journalPnl },
    ],
    headline: i.news?.[0]?.title ?? null,
    signal: latest
      ? {
          id: `${latest.ts_utc}-${latest.entry}`,
          text: `${latest.symbol} ${latest.direction.toUpperCase()} ${price(latest.entry)} RR ${latest.risk_reward.toFixed(1)}`,
        }
      : null,
    riskBlocked: blocking ? blocking.length > 0 : null,
    riskReason: blocking?.[0] ?? null,
    pnl: i.journalPnl == null ? null : { label: "Today P&L", value: i.journalPnl },
    econEvent: nextEconEvent(i.econ, i.now),
    brokerNote: "Lucid — off until Rithmic is approved",
  };
}

const pct = (n: number | null) => (n == null ? "" : ` ${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);
const clip = (s: string, n = 46) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** What a role says right now, from the snapshot. Null when it has nothing real to say. */
export function factFor(role: RoleId, s: FloorSnapshot): string | null {
  const b = s.board;
  switch (role) {
    case "trade_analyst":
    case "market_data_analyst":
      return b[0] ? `${b[0].label} ${b[0].value}${pct(b[0].changePct)}` : null;
    case "technical_analyst":
      return b[1] ? `${b[1].label} ${b[1].value}${pct(b[1].changePct)}` : null;
    case "monitoring_analyst":
      return s.bigMover ? `Mover: ${s.bigMover.symbol}${pct(s.bigMover.changePct)}` : null;
    case "news_analyst":
    case "broadcast_analyst":
    case "research_analyst":
      return s.headline ? clip(s.headline) : null;
    case "economic_research_analyst":
    case "macro_analyst":
      return s.econEvent ? clip(`${s.econEvent.title} · ${s.econEvent.when}`) : null;
    case "strategy_analyst":
    case "quant_researcher":
      return s.signal ? s.signal.text : null;
    case "broker_rm":
      return s.brokerNote;
    case "portfolio_manager":
      return s.pnl ? `${s.pnl.label} ${s.pnl.value < 0 ? "-" : "+"}$${price(Math.abs(s.pnl.value))}` : null;
    case "risk_manager":
      return s.riskBlocked == null ? null : s.riskBlocked ? `NO NEW RISK: ${clip(s.riskReason ?? "", 34)}` : "Risk OK";
    case "intelligence_analyst":
    case "equity_research_analyst":
    case "institutional_research_analyst":
      return b[2] ? `${b[2].label} ${b[2].value}${pct(b[2].changePct)}` : null;
  }
}

/**
 * What a role tells you when you walk up and talk to them: two or three
 * lines, all from the snapshot. Never invents a number; says so when there
 * is nothing live.
 */
export function reportFor(role: RoleId, s: FloorSnapshot, offDuty = false): string[] {
  if (offDuty) return ["I'm off for the night — the market's closed.", "Market Monitoring has the floor until the open."];
  const board = s.board.map((b) => `${b.label} ${b.value}${pct(b.changePct)}`);
  const none = "Nothing live on my screens yet.";
  switch (role) {
    case "trade_analyst":
    case "market_data_analyst":
      return board.length ? ["Here's the board:", ...board.slice(0, 3)] : [none];
    case "technical_analyst":
      return board[0] ? [`Lead market: ${board[0]}.`, s.bigMover ? `Watching ${s.bigMover.symbol}${pct(s.bigMover.changePct)} for a break.` : "No standout move to chart yet."] : [none];
    case "monitoring_analyst":
      return s.bigMover ? [`Biggest mover: ${s.bigMover.symbol}${pct(s.bigMover.changePct)}.`, "I'll run it over if it keeps going."] : ["Quiet tape. Nothing's moving hard.", "I'll shout if that changes."];
    case "news_analyst":
    case "research_analyst":
      return s.headline ? ["Latest headline:", clip(s.headline, 70), "Full story's in the News widget."] : ["No fresh headline for this market."];
    case "broadcast_analyst":
      return s.headline ? ["On air right now:", clip(s.headline, 70)] : ["Nothing breaking on the networks."];
    case "economic_research_analyst":
    case "macro_analyst":
      return s.econEvent
        ? [`Next big release: ${s.econEvent.title}.`, `That's ${s.econEvent.when}.`, "We'll convene the war room five minutes before."]
        : ["No high-impact release on the calendar soon."];
    case "strategy_analyst":
    case "quant_researcher":
      return s.signal ? [`Latest setup: ${s.signal.text}.`, "Sizing is on the LucidFlex Risk panel. Execution is yours."] : ["No setup that passes the rules right now.", "I'll bring it over the moment one does."];
    case "broker_rm":
      return [s.brokerNote ?? "No broker connected for this floor.", "Balances show in Broker Accounts."];
    case "portfolio_manager":
      return s.pnl ? [`${s.pnl.label}: ${s.pnl.value < 0 ? "-" : "+"}$${price(Math.abs(s.pnl.value))}.`, "Details are in Broker Accounts and the Journal."] : ["No P&L to report for this floor yet."];
    case "risk_manager":
      if (s.riskBlocked == null) return ["No risk feed on this floor.", "Risk is tracked for the futures account."];
      return s.riskBlocked
        ? ["NO NEW RISK.", `Reason: ${s.riskReason ?? "a limit was hit"}.`, "Stand down until it clears."]
        : ["Risk is OK — there's room for a trade.", "Budget per trade is on the LucidFlex Risk panel."];
    case "intelligence_analyst":
    case "equity_research_analyst":
    case "institutional_research_analyst":
      return board.length ? [`Breadth check: ${board.slice(0, 2).join(", ")}.`, "Nothing here is advice — just what the screens say."] : [none];
  }
}

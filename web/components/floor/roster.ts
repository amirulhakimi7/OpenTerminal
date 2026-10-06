// The people on every trading floor: three departments, seventeen roles.
// Pure data. Each floor is a different company but staffs the same desks.

import type { WidgetType } from "../../store/terminal";

export type DeptId = "ops" | "research" | "risk";

export type RoleId =
  | "broker_rm"
  | "trade_analyst"
  | "strategy_analyst"
  | "technical_analyst"
  | "market_data_analyst"
  | "monitoring_analyst"
  | "equity_research_analyst"
  | "intelligence_analyst"
  | "news_analyst"
  | "economic_research_analyst"
  | "macro_analyst"
  | "research_analyst"
  | "institutional_research_analyst"
  | "broadcast_analyst"
  | "quant_researcher"
  | "portfolio_manager"
  | "risk_manager";

export type Dept = { id: DeptId; name: string; carpet: [string, string] };

export const DEPARTMENTS: Dept[] = [
  { id: "ops", name: "Trading Operations", carpet: ["#2b3a55", "#263349"] },
  { id: "research", name: "Research & Intelligence", carpet: ["#2f3b2c", "#2a3527"] },
  { id: "risk", name: "Portfolio & Risk", carpet: ["#4a2f3a", "#422a34"] },
];

/** What a desk looks like: its props and what its middle monitor shows. */
export type Station =
  | "trade" | "broker" | "quant" | "strategy" | "chart" | "data" | "monitor"
  | "news" | "research" | "macro" | "broadcast" | "portfolio" | "risk";

export type Role = {
  id: RoleId;
  name: string; // a fictional first name, the same on every floor
  title: string;
  station: Station;
  dept: DeptId;
  shirt: string; // sprite shirt colour
  watches: string; // what this person is looking at, shown on the info card
  opens: WidgetType; // the dashboard widget their desk pops up
};

export const ROLES: Role[] = [
  { id: "broker_rm", name: "Daniel", station: "broker", title: "Broker Relationship Manager", dept: "ops", shirt: "#3b82f6", watches: "Broker connection and account status", opens: "accounts" },
  { id: "trade_analyst", name: "Aisyah", station: "trade", title: "Trade Analyst", dept: "ops", shirt: "#60a5fa", watches: "The main board and incoming trade ideas", opens: "journal" },
  { id: "strategy_analyst", name: "Mei Ling", station: "strategy", title: "Strategy Analyst", dept: "ops", shirt: "#a78bfa", watches: "New setups from the signal engine", opens: "signals" },

  { id: "technical_analyst", name: "Hafiz", station: "chart", title: "Technical Analyst", dept: "research", shirt: "#34d399", watches: "Chart structure on the lead market", opens: "chart" },
  { id: "market_data_analyst", name: "Sofia", station: "data", title: "Market Data Analyst", dept: "research", shirt: "#10b981", watches: "Price feed and the big board", opens: "quote" },
  { id: "monitoring_analyst", name: "Kenji", station: "monitor", title: "Market Monitoring Analyst", dept: "research", shirt: "#22d3ee", watches: "Biggest movers right now", opens: "watchlist" },
  { id: "equity_research_analyst", name: "Nurul", station: "research", title: "Equity Research Analyst", dept: "research", shirt: "#4ade80", watches: "Company and asset fundamentals", opens: "screener" },
  { id: "intelligence_analyst", name: "Marcus", station: "research", title: "Market Intelligence Analyst", dept: "research", shirt: "#2dd4bf", watches: "Market breadth and sentiment", opens: "heatmap" },
  { id: "news_analyst", name: "Farah", station: "news", title: "News Analyst", dept: "research", shirt: "#facc15", watches: "Latest headline for this market", opens: "news" },
  { id: "economic_research_analyst", name: "Wei Jie", station: "macro", title: "Economic Research Analyst", dept: "research", shirt: "#fbbf24", watches: "Next high-impact economic release", opens: "calendar" },
  { id: "macro_analyst", name: "Elena", station: "macro", title: "Macro Analyst", dept: "research", shirt: "#f59e0b", watches: "Rates, dollar and the macro picture", opens: "macro" },
  { id: "research_analyst", name: "Imran", station: "news", title: "Research Analyst", dept: "research", shirt: "#84cc16", watches: "Desk research notes", opens: "recap" },
  { id: "institutional_research_analyst", name: "Priya", station: "research", title: "Institutional Research Analyst", dept: "research", shirt: "#65a30d", watches: "Institutional flows", opens: "insider" },
  { id: "broadcast_analyst", name: "Zara", station: "broadcast", title: "Broadcast Analyst", dept: "research", shirt: "#fb923c", watches: "Financial TV and live broadcasts", opens: "tv" },
  { id: "quant_researcher", name: "Lucas", station: "quant", title: "Quant Researcher", dept: "research", shirt: "#c084fc", watches: "Signal statistics and backtests", opens: "ai" },

  { id: "portfolio_manager", name: "Siti", station: "portfolio", title: "Portfolio Manager", dept: "risk", shirt: "#f472b6", watches: "Account equity and P&L", opens: "portfolio" },
  { id: "risk_manager", name: "Rahman", station: "risk", title: "Risk Manager", dept: "risk", shirt: "#ef4444", watches: "Drawdown room and daily loss limit", opens: "risk" },
];

export const ROLE_BY_ID: Record<RoleId, Role> = Object.fromEntries(ROLES.map((r) => [r.id, r])) as Record<RoleId, Role>;

/** The one role who stays on the floor when the market is closed. */
export const NIGHT_SHIFT: RoleId = "monitoring_analyst";

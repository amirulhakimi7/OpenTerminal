// The body of every dashboard widget by type, shared by the workspace grid
// and the trading floor's popups. The floor widget itself is not here: the
// workspace renders it directly, so the floor can use this file without an
// import cycle.

import type { WidgetInstance, WidgetType } from "../store/terminal";
import QuoteWidget from "./widgets/QuoteWidget";
import ChartWidget from "./widgets/ChartWidget";
import WatchlistWidget from "./widgets/WatchlistWidget";
import NewsWidget from "./widgets/NewsWidget";
import HeatmapWidget from "./widgets/HeatmapWidget";
import ScreenerWidget from "./widgets/ScreenerWidget";
import CryptoWidget from "./widgets/CryptoWidget";
import MacroWidget from "./widgets/MacroWidget";
import OptionsWidget from "./widgets/OptionsWidget";
import PortfolioWidget from "./widgets/PortfolioWidget";
import AiWidget from "./widgets/AiWidget";
import CalendarWidget from "./widgets/CalendarWidget";
import InsiderWidget from "./widgets/InsiderWidget";
import TvWidget from "./widgets/TvWidget";
import RecapWidget from "./widgets/RecapWidget";
import SignalsWidget from "./widgets/SignalsWidget";
import RiskWidget from "./widgets/RiskWidget";
import JournalWidget from "./widgets/JournalWidget";
import AccountsWidget from "./widgets/AccountsWidget";

export function WidgetBody({ widget }: { widget: WidgetInstance }) {
  switch (widget.type) {
    case "quote": return <QuoteWidget widget={widget} />;
    case "chart": return <ChartWidget widget={widget} />;
    case "watchlist": return <WatchlistWidget />;
    case "news": return <NewsWidget widget={widget} />;
    case "heatmap": return <HeatmapWidget />;
    case "screener": return <ScreenerWidget />;
    case "crypto": return <CryptoWidget />;
    case "macro": return <MacroWidget />;
    case "options": return <OptionsWidget widget={widget} />;
    case "portfolio": return <PortfolioWidget />;
    case "ai": return <AiWidget />;
    case "calendar": return <CalendarWidget />;
    case "insider": return <InsiderWidget widget={widget} />;
    case "tv": return <TvWidget />;
    case "recap": return <RecapWidget />;
    case "signals": return <SignalsWidget />;
    case "risk": return <RiskWidget />;
    case "journal": return <JournalWidget />;
    case "accounts": return <AccountsWidget widget={widget} />;
    case "floor": return null;
  }
}

export const BROKER_TITLES: Record<string, string> = { moomoo: "moomoo", hata: "Hata", lucid: "Lucid" };

export const TITLES: Record<WidgetType, string> = {
  quote: "Quote", chart: "Chart", watchlist: "Watchlist", news: "News",
  heatmap: "Heatmap", screener: "Screener", crypto: "Crypto",
  macro: "Macro / Indexes", options: "Option Chain", portfolio: "Portfolio", ai: "AI Assistant",
  calendar: "Calendar", insider: "Insider Transactions", tv: "Live TV", recap: "Market Recap",
  signals: "CL / MCL Signals", risk: "LucidFlex Risk", journal: "Trade Journal", accounts: "Broker Accounts", floor: "Trading Floor",
};

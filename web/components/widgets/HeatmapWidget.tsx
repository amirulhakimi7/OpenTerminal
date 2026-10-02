"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { apiGet } from "../../lib/api";
import { useTerminal } from "../../store/terminal";

type Cell = { symbol: string; name: string | null; sector: string; marketCap: number | null; changePercent: number | null };

export default function HeatmapWidget() {
  const ref = useRef<HTMLDivElement>(null);
  const setActiveSymbol = useTerminal((s) => s.setActiveSymbol);
  const [market, setMarket] = useState<"us" | "eu">("us");
  const { data, error } = useQuery({
    queryKey: ["heatmap", market],
    queryFn: () => apiGet<Cell[]>(`/api/heatmap?market=${market}`),
    refetchInterval: 3_000,
  });

  // Redrawing used to wipe and rebuild all ~150 cells, and the inline SVG's
  // baseline gap overflowed the panel: a scrollbar appeared, the width
  // changed, the ResizeObserver redrew, the scrollbar went away — a loop that
  // stuttered even with no new data. Now the SVG is absolutely positioned (it
  // can't affect layout), redraws only on a real size change, at most once a
  // frame, and cells are updated in place by symbol.
  useEffect(() => {
    const el = ref.current;
    if (!el || !data) return;

    let frame = 0;
    let lastSize = "";

    const render = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (width === 0 || height === 0) return;

      const valid = data.filter((d) => d.marketCap && d.changePercent !== null);
      type Node = { name: string; children?: Node[]; data?: Cell };
      const root = d3
        .hierarchy<Node>({
          name: "root",
          children: [...d3.group(valid, (d) => d.sector)].map(([sector, items]) => ({
            name: sector,
            children: items.map((d) => ({ name: d.symbol, data: d })),
          })),
        })
        .sum((d) => d.data?.marketCap ?? 0)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

      d3.treemap<Node>().size([width, height]).paddingInner(1).paddingTop(12)(root);

      const color = (chg: number) => {
        const clamped = Math.max(-3, Math.min(3, chg));
        return clamped >= 0
          ? d3.interpolateRgb("#1a2030", "#22c55e")(clamped / 3)
          : d3.interpolateRgb("#1a2030", "#f43f5e")(-clamped / 3);
      };

      const svg = d3
        .select(el)
        .selectAll<SVGSVGElement, null>("svg")
        .data([null])
        .join("svg")
        .style("position", "absolute")
        .style("inset", "0")
        .style("display", "block")
        .attr("width", width)
        .attr("height", height);

      // Clip each sector label to its own column so long names never bleed
      // into the neighboring sector.
      const sectorClipId = (name: string) => `sector-clip-${name.replace(/[^a-zA-Z0-9]/g, "")}`;
      const sectors = root.children ?? [];

      svg
        .selectAll("clipPath.sector-clip")
        .data(sectors, (d: any) => d.data.name)
        .join((enter) => {
          const c = enter.append("clipPath").attr("class", "sector-clip");
          c.append("rect").attr("height", 12);
          return c;
        })
        .attr("id", (d: any) => sectorClipId(d.data.name))
        .select("rect")
        .attr("x", (d: any) => d.x0)
        .attr("y", (d: any) => d.y0)
        .attr("width", (d: any) => Math.max(0, d.x1 - d.x0 - 4));

      svg
        .selectAll("text.sector")
        .data(sectors.filter((d: any) => d.x1 - d.x0 > 20), (d: any) => d.data.name)
        .join("text")
        .attr("class", "sector")
        .attr("x", (d: any) => d.x0 + 3)
        .attr("y", (d: any) => d.y0 + 9)
        .attr("clip-path", (d: any) => `url(#${sectorClipId(d.data.name)})`)
        .attr("fill", "#8b93a7")
        .attr("font-size", 8)
        .text((d: any) => d.data.name.toUpperCase());

      const leaf = svg
        .selectAll<SVGGElement, any>("g.leaf")
        .data(root.leaves(), (d: any) => d.data.name)
        .join((enter) => {
          const g = enter.append("g").attr("class", "leaf").style("cursor", "pointer");
          g.append("rect").append("title");
          g.append("text").attr("class", "sym").attr("x", 3).attr("y", 11).attr("fill", "#fff").attr("font-size", 9).attr("font-weight", "bold");
          g.append("text").attr("class", "chg").attr("x", 3).attr("y", 22).attr("fill", "#ddd").attr("font-size", 8);
          return g;
        })
        .attr("transform", (d: any) => `translate(${d.x0},${d.y0})`)
        .on("click", (_e, d: any) => setActiveSymbol(d.data.data.symbol));

      leaf
        .select("rect")
        .attr("width", (d: any) => Math.max(0, d.x1 - d.x0))
        .attr("height", (d: any) => Math.max(0, d.y1 - d.y0))
        .attr("fill", (d: any) => color(d.data.data.changePercent))
        .select("title")
        .text((d: any) => `${d.data.data.symbol} ${d.data.data.name ?? ""}: ${d.data.data.changePercent?.toFixed(2)}%`);

      leaf
        .select("text.sym")
        .text((d: any) => (d.x1 - d.x0 > 32 && d.y1 - d.y0 > 18 ? d.data.data.symbol : ""));

      leaf
        .select("text.chg")
        .text((d: any) =>
          d.x1 - d.x0 > 40 && d.y1 - d.y0 > 30
            ? `${d.data.data.changePercent >= 0 ? "+" : ""}${d.data.data.changePercent.toFixed(2)}%`
            : ""
        );
    };

    render();
    lastSize = `${el.clientWidth}x${el.clientHeight}`;
    const obs = new ResizeObserver(() => {
      const size = `${el.clientWidth}x${el.clientHeight}`;
      if (size === lastSize) return;
      lastSize = size;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(render);
    });
    obs.observe(el);
    return () => {
      obs.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [data, setActiveSymbol]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex gap-1 p-1 shrink-0">
        {(["us", "eu"] as const).map((m) => (
          <button key={m} className={`term-btn ${market === m ? "active" : ""}`} onClick={() => setMarket(m)}>
            {m.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {error ? (
          <div className="p-2 down">Error: {(error as Error).message}</div>
        ) : !data ? (
          <div className="p-2 dim">Loading heatmap…</div>
        ) : (
          <div ref={ref} className="relative w-full h-full overflow-hidden" />
        )}
      </div>
    </div>
  );
}

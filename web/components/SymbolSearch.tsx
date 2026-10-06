"use client";

// An inline ticker search with suggestions, for a widget header. Same lookup as
// the command palette (/api/search); picking a result calls `onPick`.

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { apiGet } from "../lib/api";

type SearchResult = { symbol: string; name: string; exchange: string; type: string };

export function SymbolSearch({ symbol, onPick }: { symbol: string; onPick: (symbol: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim();
  const { data: results = [], isFetching } = useQuery({
    queryKey: ["search", q],
    queryFn: () => apiGet<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`),
    enabled: open && q.length > 0,
    staleTime: 300_000,
  });
  useEffect(() => setSelected(0), [results.length]);

  const pick = (s: string) => {
    const v = s.trim().toUpperCase();
    if (v) onPick(v);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  };

  return (
    <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        value={open ? query : symbol}
        placeholder="Search symbol…"
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)} // let a click on a result land first
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelected((s) => Math.min(s + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelected((s) => Math.max(s - 1, 0));
          } else if (e.key === "Enter") {
            // A suggestion if there is one, else whatever was typed (e.g. CL=F).
            pick(results[selected]?.symbol ?? query);
          }
        }}
        className="w-40 !py-0.5 !px-2 text-[12px] font-semibold"
        aria-label="Symbol"
      />
      {open && q && (
        <div className="absolute right-0 top-full mt-1 z-50 w-80 max-h-72 overflow-auto rounded-md border border-[var(--border-strong)] bg-[var(--panel)] shadow-2xl">
          {results.length === 0 && (
            <div className="px-3 py-2 dim text-[12px]">{isFetching ? "Searching…" : `Enter to load ${q.toUpperCase()}`}</div>
          )}
          {results.map((r, i) => (
            <div
              key={r.symbol + i}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r.symbol);
              }}
              onMouseEnter={() => setSelected(i)}
              className={`px-3 py-1.5 flex gap-2 cursor-pointer text-[12px] ${i === selected ? "bg-[#241d10] text-[var(--amber)]" : ""}`}
            >
              <span className="w-20 font-bold shrink-0">{r.symbol}</span>
              <span className="flex-1 truncate">{r.name}</span>
              <span className="dim shrink-0">{r.exchange}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

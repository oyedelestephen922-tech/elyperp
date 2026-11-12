"use client";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_LABEL, type Market, type MarketCategory } from "@/lib/lighter/markets";
import { change24, fmtCompact, fmtPct, fmtPx, marketPath, pnlClass } from "@/lib/format";
import { useMarkets, usePrefs } from "@/store/markets";
import { Badge } from "@/components/ui/primitives";

const CATS: ("fav" | MarketCategory)[] = ["fav", "crypto", "stock", "etf", "commodity", "private", "other"];

export function MarketSelector({ current, onClose }: { current: Market; onClose: () => void }) {
  const router = useRouter();
  const markets = useMarkets((s) => s.markets);
  const { favorites, toggleFavorite } = usePrefs();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"fav" | MarketCategory>(current.category);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const listed = useMemo(() => Object.values(markets).filter((m) => m.status !== "inactive"), [markets]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { fav: favorites.length };
    listed.forEach((m) => (c[m.category] = (c[m.category] ?? 0) + 1));
    return c;
  }, [listed, favorites]);

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return listed
      .filter((m) => (ql ? m.base.toLowerCase().includes(ql) || (m.name ?? "").toLowerCase().includes(ql) : cat === "fav" ? favorites.includes(m.symbol) : m.category === cat))
      .sort((a, b) => (b.ctx?.amount24 ?? 0) - (a.ctx?.amount24 ?? 0))
      .slice(0, 200);
  }, [listed, q, cat, favorites]);

  return (
    <div className="absolute left-0 top-full mt-1 z-50 w-[min(560px,calc(100vw-1rem))] panel bg-panel-2 rise shadow-2xl">
      <div className="p-2 border-b border-line">
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search markets (e.g. ETH, NVDA, XAU)"
          onKeyDown={(e) => e.key === "Escape" && onClose()}
          className="w-full bg-panel border border-line-2 rounded px-3 py-2 text-sm outline-none focus:border-accent/60" />
      </div>
      {!q && (
        <div className="flex gap-1 px-2 pt-2 overflow-x-auto scroll-thin">
          {CATS.filter((c) => c === "fav" || counts[c]).map((c) => (
            <button key={c} onClick={() => setCat(c)}
              className={clsx("px-2.5 py-1 rounded text-xs whitespace-nowrap", cat === c ? "bg-accent/10 text-accent" : "text-muted hover:text-fg")}>
              {c === "fav" ? "★ Favorites" : CATEGORY_LABEL[c]} <span className="text-faint">{counts[c] ?? 0}</span>
            </button>
          ))}
        </div>
      )}
      <div className="max-h-[60vh] overflow-y-auto scroll-thin p-1">
        <div className="grid grid-cols-[1.6rem_1fr_6rem_5rem_5.5rem] px-2 py-1 text-[10px] uppercase text-faint">
          <span /> <span>Market</span><span className="text-right">Price</span><span className="text-right">24h</span><span className="text-right">Volume</span>
        </div>
        {rows.length === 0 && <div className="text-xs text-muted text-center py-8">No markets match.</div>}
        {rows.map((m) => {
          const chg = change24(m.ctx);
          return (
            <div key={m.symbol}
              onClick={() => { router.push(marketPath(m.slug)); onClose(); }}
              className={clsx("grid grid-cols-[1.6rem_1fr_6rem_5rem_5.5rem] items-center px-2 py-1.5 rounded cursor-pointer text-xs hover:bg-raised", m.symbol === current.symbol && "bg-raised")}>
              <button onClick={(e) => { e.stopPropagation(); toggleFavorite(m.symbol); }} className={favorites.includes(m.symbol) ? "text-warn" : "text-faint hover:text-muted"} aria-label="Favorite">★</button>
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="font-medium truncate" title={m.name ?? undefined}>{m.base}</span>
                {m.name && <span className="text-faint truncate hidden sm:inline">{m.name}</span>}
                <span className="text-faint">{m.maxLeverage}x</span>
                {m.status !== "active" && <Badge tone="warn">{m.status.replace("_", " ")}</Badge>}
              </span>
              <span className="num text-right">{fmtPx(m.ctx?.markPx || null, m.pxDecimals)}</span>
              <span className={clsx("num text-right", pnlClass(chg))}>{fmtPct(chg)}</span>
              <span className="num text-right text-muted">{fmtCompact(m.ctx?.amount24)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

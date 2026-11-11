"use client";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CATEGORY_LABEL, type Market, type MarketCategory } from "@/lib/orderly/markets";
import { change24, fmtCompact, fmtPct, fmtPx, marketPath, pnlClass } from "@/lib/format";
import { useMarkets, usePrefs } from "@/store/markets";
import { useIsStale } from "@/hooks/useMarketData";
import { Badge, Empty, Spinner } from "@/components/ui/primitives";

type Sort = "volume" | "change" | "oi" | "funding" | "name";
const MAIN: MarketCategory[] = ["crypto", "stock", "index"];
const EXTRA: MarketCategory[] = ["commodity", "fx", "other"];

export default function MarketsPage() {
  const router = useRouter();
  const markets = useMarkets((s) => s.markets);
  const loaded = useMarkets((s) => s.loaded);
  const error = useMarkets((s) => s.error);
  const { favorites, toggleFavorite } = usePrefs();
  const stale = useIsStale();
  const [cat, setCat] = useState<MarketCategory | "fav">("crypto");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("volume");
  const [desc, setDesc] = useState(true);
  const [status, setStatus] = useState<"active" | "all">("active");
  const [source, setSource] = useState<"all" | "orderly" | "builders">("all");

  const all = Object.values(markets);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    all.forEach((m) => (c[m.category] = (c[m.category] ?? 0) + 1));
    return c;
  }, [all]);

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const val = (m: Market) => {
      const c = m.ctx;
      if (sort === "volume") return c?.amount24 ?? -1;
      if (sort === "change") return change24(c) ?? -Infinity;
      if (sort === "oi") return c ? c.openInterest * c.markPx : -1;
      if (sort === "funding") return c?.estFunding ?? -Infinity;
      return 0;
    };
    return all
      .filter((m) => (cat === "fav" ? favorites.includes(m.symbol) : m.category === cat))
      .filter((m) => status === "all" || m.status === "active")
      .filter((m) => source === "all" || (source === "orderly" ? !m.builder : !!m.builder))
      .filter((m) => !ql || m.base.toLowerCase().includes(ql) || (m.builder ?? "").toLowerCase().includes(ql))
      .sort((a, b) => (sort === "name" ? a.base.localeCompare(b.base) * (desc ? -1 : 1) : (val(b) - val(a)) * (desc ? 1 : -1)));
  }, [all, cat, favorites, status, source, q, sort, desc]);

  const header = (k: Sort, label: string, right = true) => (
    <th className={clsx("px-3 py-2 font-normal text-faint cursor-pointer select-none whitespace-nowrap", right ? "text-right" : "text-left")}
      onClick={() => (sort === k ? setDesc(!desc) : (setSort(k), setDesc(true)))}>
      {label}{sort === k ? (desc ? " ↓" : " ↑") : ""}
    </th>
  );

  return (
    <div className="p-3 md:p-5 max-w-7xl w-full mx-auto flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Markets</h1>
          <p className="text-xs text-muted mt-1">
            {loaded ? `${all.length} perpetual markets on Orderly's shared order book, updated live.` : "Loading markets…"}
            {loaded && stale && <span className="text-warn"> Live prices paused, showing last snapshot.</span>}
          </p>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ticker or builder"
          className="w-full sm:w-64 bg-panel border border-line-2 rounded px-3 py-2 text-sm outline-none focus:border-accent/60" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {MAIN.map((c) => <CatBtn key={c} on={cat === c} onClick={() => setCat(c)} label={CATEGORY_LABEL[c]} n={counts[c] ?? 0} />)}
        <CatBtn on={cat === "fav"} onClick={() => setCat("fav")} label="★ Watchlist" n={favorites.length} />
        {EXTRA.filter((c) => counts[c]).map((c) => <CatBtn key={c} on={cat === c} onClick={() => setCat(c)} label={CATEGORY_LABEL[c]} n={counts[c]} subtle />)}
        <div className="flex-1" />
        <select value={source} onChange={(e) => setSource(e.target.value as typeof source)} className="bg-panel border border-line-2 rounded px-2 py-1.5 text-xs text-muted">
          <option value="all">All listings</option>
          <option value="orderly">Listed by Orderly</option>
          <option value="builders">Listed by builders</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="bg-panel border border-line-2 rounded px-2 py-1.5 text-xs text-muted">
          <option value="active">Active only</option>
          <option value="all">Include restricted & delisting</option>
        </select>
      </div>


      <div className="panel overflow-x-auto scroll-thin">
        {!loaded ? (
          <div className="py-16 grid place-items-center">{error ? <span className="text-short text-sm">{error}</span> : <Spinner />}</div>
        ) : rows.length === 0 ? (
          <Empty>{cat === "fav" ? "Your watchlist is empty. Star a market to add it." : "No markets in this category right now."}</Empty>
        ) : (
          <table className="w-full text-xs">
            <thead><tr className="border-b border-line">
              <th className="w-8" />
              {header("name", "Market", false)}
              <th className="px-3 py-2 font-normal text-faint text-left">Listed by</th>
              <th className="px-3 py-2 font-normal text-faint text-right">Price</th>
              {header("change", "24h change")}
              {header("volume", "24h volume")}
              {header("oi", "Open interest")}
              {header("funding", "Funding")}
              <th className="px-3 py-2 font-normal text-faint text-right">Max lev.</th>
              <th className="px-3 py-2 font-normal text-faint text-right">Status</th>
            </tr></thead>
            <tbody>
              {rows.map((m) => {
                const c = m.ctx;
                const chg = change24(c);
                const open = m.status !== "inactive";
                return (
                  <tr key={m.symbol} onClick={() => open && router.push(marketPath(m.slug))}
                    className={clsx("border-t border-line", open ? "cursor-pointer hover:bg-panel-2" : "opacity-50")}>
                    <td className="pl-3"><button onClick={(e) => { e.stopPropagation(); toggleFavorite(m.symbol); }} className={favorites.includes(m.symbol) ? "text-warn" : "text-faint hover:text-muted"} aria-label="Watchlist">★</button></td>
                    <td className="px-3 py-2"><span className="font-medium">{m.base}</span><span className="text-faint">-PERP</span></td>
                    <td className="px-3 py-2 text-muted">{m.builder ?? "Orderly"}</td>
                    <td className="px-3 py-2 text-right num">{fmtPx(c?.markPx || null, m.pxDecimals)}</td>
                    <td className={clsx("px-3 py-2 text-right num", pnlClass(chg))}>{fmtPct(chg)}</td>
                    <td className="px-3 py-2 text-right num">{fmtCompact(c?.amount24)}</td>
                    <td className="px-3 py-2 text-right num">{c && c.openInterest > 0 ? fmtCompact(c.openInterest * c.markPx) : "--"}</td>
                    <td className="px-3 py-2 text-right num text-fg" title={`Per ${m.fundingPeriodH}h period`}>{c ? (c.estFunding * 100).toFixed(4) + "%" : "--"} <span className="text-faint">{m.fundingPeriodH}h</span></td>
                    <td className="px-3 py-2 text-right num">{m.maxLeverage}x</td>
                    <td className="px-3 py-2 text-right"><Badge tone={m.status === "active" ? "accent" : m.status === "delisting" || m.status === "inactive" ? "short" : "warn"}>{m.status.replace("_", " ")}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CatBtn({ on, onClick, label, n, subtle }: { on: boolean; onClick: () => void; label: string; n: number; subtle?: boolean }) {
  return (
    <button onClick={onClick} className={clsx("px-3 py-1.5 rounded-md text-sm border", on ? "border-accent/50 bg-accent/10 text-accent" : subtle ? "border-transparent text-faint hover:text-fg" : "border-line-2 text-muted hover:text-fg")}>
      {label} <span className="text-faint text-xs">{n}</span>
    </button>
  );
}

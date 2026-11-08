"use client";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CATEGORY_LABEL, type MarketCategory } from "@/lib/hl/classify";
import { coinToPath, type Market } from "@/lib/hl/markets";
import { fmtCompact, fmtPct, fmtPx, pnlClass, shortAddr } from "@/lib/format";
import { useMarkets, usePrefs } from "@/store/markets";
import { useIsStale } from "@/hooks/useMarketData";
import { Badge, Empty, Spinner } from "@/components/ui/primitives";

type Sort = "volume" | "change" | "oi" | "funding" | "name";
const MAIN: MarketCategory[] = ["crypto", "stock", "index"];
const EXTRA: MarketCategory[] = ["commodity", "fx", "other"];

export default function MarketsPage() {
  const router = useRouter();
  const markets = useMarkets((s) => s.markets);
  const dexes = useMarkets((s) => s.dexes);
  const loaded = useMarkets((s) => s.loaded);
  const error = useMarkets((s) => s.error);
  const { favorites, toggleFavorite } = usePrefs();
  const stale = useIsStale("");
  const [cat, setCat] = useState<MarketCategory | "fav">("crypto");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("volume");
  const [desc, setDesc] = useState(true);
  const [status, setStatus] = useState<"active" | "all">("active");
  const [dex, setDex] = useState<string>("all");

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
      if (sort === "volume") return c?.dayNtlVlm ?? -1;
      if (sort === "change") return c && c.prevDayPx > 0 ? c.markPx / c.prevDayPx - 1 : -Infinity;
      if (sort === "oi") return c ? c.openInterest * c.markPx : -1;
      if (sort === "funding") return c?.funding ?? -Infinity;
      return 0;
    };
    return all
      .filter((m) => (cat === "fav" ? favorites.includes(m.coin) : m.category === cat))
      .filter((m) => status === "all" || m.status === "active")
      .filter((m) => dex === "all" || m.dex === dex)
      .filter((m) => !ql || m.coin.toLowerCase().includes(ql) || m.dexFullName.toLowerCase().includes(ql))
      .sort((a, b) => (sort === "name" ? a.coin.localeCompare(b.coin) * (desc ? -1 : 1) : (val(b) - val(a)) * (desc ? 1 : -1)));
  }, [all, cat, favorites, status, dex, q, sort, desc]);

  const header = (k: Sort, label: string, right = true) => (
    <th className={clsx("px-3 py-2 font-normal text-faint cursor-pointer select-none whitespace-nowrap", right ? "text-right" : "text-left")}
      onClick={() => (sort === k ? setDesc(!desc) : (setSort(k), setDesc(true)))}>
      {label}{sort === k ? (desc ? " ↓" : " ↑") : ""}
    </th>
  );

  const dexOptions = dexes.filter((d) => (cat === "crypto" ? true : d.name !== "") && d.marketCount > 0);

  return (
    <div className="p-3 md:p-5 max-w-7xl w-full mx-auto flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Markets</h1>
          <p className="text-xs text-muted mt-1">
            {loaded ? `${all.length} perpetual markets across ${dexes.length} dexes, discovered live from Hyperliquid.` : "Discovering markets…"}
            {loaded && stale && <span className="text-warn"> Live prices paused, showing last snapshot.</span>}
          </p>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ticker or dex"
          className="w-full sm:w-64 bg-panel border border-line-2 rounded px-3 py-2 text-sm outline-none focus:border-accent/60" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {MAIN.map((c) => <CatBtn key={c} on={cat === c} onClick={() => setCat(c)} label={CATEGORY_LABEL[c]} n={counts[c] ?? 0} />)}
        <CatBtn on={cat === "fav"} onClick={() => setCat("fav")} label="★ Watchlist" n={favorites.length} />
        {EXTRA.filter((c) => counts[c]).map((c) => <CatBtn key={c} on={cat === c} onClick={() => setCat(c)} label={CATEGORY_LABEL[c]} n={counts[c]} subtle />)}
        <div className="flex-1" />
        <select value={dex} onChange={(e) => setDex(e.target.value)} className="w-44 bg-panel border border-line-2 rounded px-2 py-1.5 text-xs text-muted">
          <option value="all">All dexes</option>
          {dexOptions.map((d) => <option key={d.name || "hl"} value={d.name}>{d.fullName}{d.name ? ` (${d.name})` : ""}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="bg-panel border border-line-2 rounded px-2 py-1.5 text-xs text-muted">
          <option value="active">Active only</option>
          <option value="all">Include inactive & delisted</option>
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
              <th className="px-3 py-2 font-normal text-faint text-left">Dex</th>
              <th className="px-3 py-2 font-normal text-faint text-right">Price</th>
              {header("change", "24h change")}
              {header("volume", "24h volume")}
              {header("oi", "Open interest")}
              {header("funding", "Funding (1h)")}
              <th className="px-3 py-2 font-normal text-faint text-right">Max lev.</th>
              <th className="px-3 py-2 font-normal text-faint text-right">Status</th>
            </tr></thead>
            <tbody>
              {rows.map((m) => {
                const c = m.ctx;
                const chg = c && c.prevDayPx > 0 ? c.markPx / c.prevDayPx - 1 : null;
                return (
                  <tr key={m.coin} onClick={() => m.status !== "delisted" && router.push(coinToPath(m.coin))}
                    className={clsx("border-t border-line", m.status !== "delisted" ? "cursor-pointer hover:bg-panel-2" : "opacity-50")}>
                    <td className="pl-3"><button onClick={(e) => { e.stopPropagation(); toggleFavorite(m.coin); }} className={favorites.includes(m.coin) ? "text-warn" : "text-faint hover:text-muted"} aria-label="Watchlist">★</button></td>
                    <td className="px-3 py-2"><span className="font-medium">{m.base}</span><span className="text-faint">-USD</span> <span className="num text-faint text-[10px]">{m.coin !== m.base ? m.coin : ""}</span></td>
                    <td className="px-3 py-2 text-muted" title={m.dexDeployer ? `Deployer ${m.dexDeployer}` : undefined}>{m.dex ? <>{m.dexFullName} <span className="text-faint">{shortAddr(m.dexDeployer)}</span></> : "Hyperliquid"}</td>
                    <td className="px-3 py-2 text-right num">{fmtPx(c?.markPx, m.szDecimals)}</td>
                    <td className={clsx("px-3 py-2 text-right num", pnlClass(chg))}>{fmtPct(chg)}</td>
                    <td className="px-3 py-2 text-right num">{fmtCompact(c?.dayNtlVlm)}</td>
                    <td className="px-3 py-2 text-right num">{c ? fmtCompact(c.openInterest * c.markPx) : "--"}</td>
                    <td className={clsx("px-3 py-2 text-right num", "text-fg")}>{c ? (c.funding * 100).toFixed(4) + "%" : "--"}</td>
                    <td className="px-3 py-2 text-right num">{m.maxLeverage}x{m.isolatedOnly && <span className="text-faint"> iso</span>}</td>
                    <td className="px-3 py-2 text-right"><Badge tone={m.status === "active" ? "accent" : m.status === "delisted" ? "short" : "warn"}>{m.status}</Badge></td>
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

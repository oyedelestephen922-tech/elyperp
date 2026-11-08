"use client";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import type { Market } from "@/lib/hl/markets";
import { fmtCompact, fmtPct, fmtPx, pnlClass, shortAddr } from "@/lib/format";
import { useDayRange, useIsStale, useNow, useWsStatus } from "@/hooks/useMarketData";
import { usSessionStatus } from "@/lib/marketHours";
import { Badge, Stat } from "@/components/ui/primitives";
import { MarketSelector } from "./MarketSelector";
import { usePrefs } from "@/store/markets";
import { CATEGORY_LABEL } from "@/lib/hl/classify";

export function MarketHeader({ market }: { market: Market }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const range = useDayRange(market.coin);
  const stale = useIsStale(market.dex, market.coin);
  const ws = useWsStatus();
  const now = useNow(1000);
  const { favorites, toggleFavorite } = usePrefs();
  const ctx = market.ctx;
  const px = ctx?.markPx ?? null;
  const prevPx = useRef<number | null>(null);
  const [flash, setFlash] = useState<"" | "flash-up" | "flash-down">("");

  useEffect(() => {
    if (px != null && prevPx.current != null && px !== prevPx.current) setFlash(px > prevPx.current ? "flash-up" : "flash-down");
    prevPx.current = px;
  }, [px]);

  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const chg = ctx && ctx.prevDayPx > 0 ? ctx.markPx / ctx.prevDayPx - 1 : null;
  const nextFunding = Math.ceil(now / 3600_000) * 3600_000;
  const left = Math.max(0, nextFunding - now);
  const mmss = `${String(Math.floor(left / 60000)).padStart(2, "0")}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`;
  const isEquity = market.category === "stock" || market.category === "index";
  const session = isEquity ? usSessionStatus(new Date(now)) : null;

  return (
    <div className="panel flex flex-col">
      <div className="flex flex-wrap md:flex-nowrap items-center gap-x-4 gap-y-2 px-3 py-2">
        <div className="relative shrink-0" ref={ref}>
          <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-raised">
            <span className="text-base font-semibold">{market.base}-USD</span>
            {market.dex && <Badge tone="accent">{market.dex}</Badge>}
            <span className="text-faint text-xs">▾</span>
          </button>
          {open && <MarketSelector current={market} onClose={() => setOpen(false)} />}
        </div>
        <button onClick={() => toggleFavorite(market.coin)} className={clsx("shrink-0", favorites.includes(market.coin) ? "text-warn" : "text-faint")} aria-label="Favorite">★</button>
        <div className="contents md:flex md:items-center md:gap-4 md:min-w-0 md:flex-1 md:overflow-x-auto scroll-thin">
        <div className="shrink-0 flex flex-col">
          <span className={clsx("num text-lg leading-tight rounded px-1 -mx-1", flash, stale ? "text-muted" : pnlClass(chg))} key={px ?? 0}>
            {fmtPx(px, market.szDecimals)}
          </span>
          <span className="text-[10px] text-faint">
            {stale ? <span className="text-warn">{ws === "open" ? "awaiting live data" : "reconnecting, prices may be delayed"}</span> : "Mark price · live"}
          </span>
        </div>
        <Stat label="24h change" value={<span className={pnlClass(chg)}>{fmtPct(chg)}</span>} />
        <Stat label="24h volume" value={fmtCompact(ctx?.dayNtlVlm)} />
        <Stat label="24h high" value={range ? fmtPx(Math.max(range.high, px ?? 0), market.szDecimals) : "--"} />
        <Stat label="24h low" value={range ? fmtPx(px ? Math.min(range.low, px) : range.low, market.szDecimals) : "--"} />
        <Stat label="Oracle / index" value={fmtPx(ctx?.oraclePx, market.szDecimals)} />
        <Stat label="Open interest" value={ctx ? fmtCompact(ctx.openInterest * ctx.markPx) : "--"} />
        <Stat
          label="Funding / countdown"
          value={<><span className={"text-fg"}>{ctx ? (ctx.funding * 100).toFixed(4) + "%" : "--"}</span> <span className="text-muted">{mmss}</span></>}
        />
        <Stat label="Max leverage" value={`${market.maxLeverage}x`} />
        </div>
      </div>
      {(market.dex || market.status !== "active") && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 border-t border-line text-[11px] text-muted">
          {market.status !== "active" && <Badge tone="short">{market.status}, trading disabled</Badge>}
          {market.dex && (
            <>
              <span>{CATEGORY_LABEL[market.category]} · HIP-3 dex <b className="text-fg">{market.dexFullName}</b> (<span className="num">{market.coin}</span>)</span>
              {market.dexDeployer && <span>Deployer <span className="num">{shortAddr(market.dexDeployer)}</span></span>}
              <span>Collateral <b className="text-fg">{market.collateral}</b></span>
              {market.isolatedOnly && <span className="text-warn">Isolated margin only</span>}
            </>
          )}
          {session && (
            <span title="Oracle pricing and any trading halts are set by the deploying dex. Outside the underlying's regular session, prices follow the deployer's off-hours methodology and spreads can widen.">
              <span className={clsx("inline-block h-1.5 w-1.5 rounded-full mr-1", session.open ? "bg-accent" : "bg-warn")} />
              {session.label} (regular hours 9:30–16:00 ET) ⓘ
            </span>
          )}
        </div>
      )}
    </div>
  );
}

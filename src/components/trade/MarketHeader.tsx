"use client";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { CATEGORY_LABEL, SESSION_LABEL, type Market } from "@/lib/orderly/markets";
import { change24, fmtCompact, fmtDateTime, fmtPct, fmtPx, pnlClass } from "@/lib/format";
import { useIsStale, useNow, useWsStatus } from "@/hooks/useMarketData";
import { Badge, Stat } from "@/components/ui/primitives";
import { MarketSelector } from "./MarketSelector";
import { useMarkets, usePrefs } from "@/store/markets";

export function MarketHeader({ market }: { market: Market }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const stale = useIsStale();
  const ws = useWsStatus();
  const now = useNow(1000);
  const session = useMarkets((s) => s.sessions[market.symbol]);
  const { favorites, toggleFavorite } = usePrefs();
  const ctx = market.ctx;
  const px = ctx?.markPx || null;
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

  const chg = change24(ctx);
  const left = ctx?.nextFundingTime ? Math.max(0, ctx.nextFundingTime - now) : null;
  const hhmmss = left == null ? "" : [Math.floor(left / 3600000), Math.floor((left % 3600000) / 60000), Math.floor((left % 60000) / 1000)]
    .map((n) => String(n).padStart(2, "0")).join(":");

  return (
    <div className="panel flex flex-col">
      <div className="flex flex-wrap md:flex-nowrap items-center gap-x-4 gap-y-2 px-3 py-2">
        <div className="relative shrink-0" ref={ref}>
          <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-raised">
            <span className="text-base font-semibold">{market.base}-PERP</span>
            {market.name && <span className="text-xs text-muted hidden sm:inline">{market.name}</span>}
            {market.builder && <Badge tone="accent">{market.builder}</Badge>}
            <span className="text-faint text-xs">▾</span>
          </button>
          {open && <MarketSelector current={market} onClose={() => setOpen(false)} />}
        </div>
        <button onClick={() => toggleFavorite(market.symbol)} className={clsx("shrink-0", favorites.includes(market.symbol) ? "text-warn" : "text-faint")} aria-label="Favorite">★</button>
        <div className="contents md:flex md:items-center md:gap-4 md:min-w-0 md:flex-1 md:overflow-x-auto scroll-thin">
          <div className="shrink-0 flex flex-col">
            <span className={clsx("num text-lg leading-tight rounded px-1 -mx-1", flash, stale ? "text-muted" : pnlClass(chg))} key={px ?? 0}>
              {fmtPx(px, market.pxDecimals)}
            </span>
            <span className="text-[10px] text-faint">
              {stale ? <span className="text-warn">{ws === "open" ? "awaiting live data" : "reconnecting, prices may be delayed"}</span> : "Mark price · live"}
            </span>
          </div>
          <Stat label="24h change" value={<span className={pnlClass(chg)}>{fmtPct(chg)}</span>} />
          <Stat label="24h volume" value={fmtCompact(ctx?.amount24)} />
          <Stat label="24h high" value={ctx?.high24 ? fmtPx(ctx.high24, market.pxDecimals) : "--"} />
          <Stat label="24h low" value={ctx?.low24 ? fmtPx(ctx.low24, market.pxDecimals) : "--"} />
          <Stat label="Index price" value={fmtPx(ctx?.indexPx || null, market.pxDecimals)} />
          <Stat label="Open interest" value={ctx && ctx.openInterest > 0 && ctx.markPx > 0 ? fmtCompact(ctx.openInterest * ctx.markPx) : "--"} />
          <Stat
            label={`Funding (${market.fundingPeriodH}h) / countdown`}
            value={<><span className="text-fg">{ctx ? (ctx.estFunding * 100).toFixed(4) + "%" : "--"}</span> <span className="text-muted">{hhmmss}</span></>}
          />
          <Stat label="Max leverage" value={`${market.maxLeverage}x`} />
        </div>
      </div>
      {(market.builder || market.session || market.status !== "active") && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 border-t border-line text-[11px] text-muted">
          {market.status !== "active" && <Badge tone="short">{market.status.replace("_", " ")}</Badge>}
          <span>{CATEGORY_LABEL[market.category]} · <span className="num">{market.symbol}</span></span>
          {market.builder && <span>Listed on Orderly by builder <b className="text-fg">{market.builder}</b></span>}
          {session && (
            <span title="Real-world-asset markets follow the underlying market's hours. Outside the session, orders may be rejected and prices can move sharply at the open.">
              <span className={clsx("inline-block h-1.5 w-1.5 rounded-full mr-1", session.open ? "bg-accent" : "bg-warn")} />
              {SESSION_LABEL[session.session] ?? session.session} session {session.open ? "open" : "closed"}
              {session.open && session.nextClose ? ` · closes ${fmtDateTime(session.nextClose)}` : ""}
              {!session.open && session.nextOpen ? ` · opens ${fmtDateTime(session.nextOpen)}` : ""} ⓘ
            </span>
          )}
        </div>
      )}
    </div>
  );
}

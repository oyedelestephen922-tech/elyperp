"use client";
import clsx from "clsx";
import { useMemo, useState } from "react";
import { useMarketTradeStream, useOrderbookStream } from "@orderly.network/hooks";
import type { Market } from "@/lib/orderly/markets";
import { fmtPx, fmtSize, fmtTime } from "@/lib/format";
import { Empty, Spinner, Tabs } from "@/components/ui/primitives";
import { useTerminal } from "@/store/terminal";

const ROWS = 11;

export function BookAndTrades({ market, className }: { market: Market; className?: string }) {
  const [tab, setTab] = useState<"book" | "trades">("book");
  return (
    <div className={clsx("panel flex flex-col min-h-0", className)}>
      <Tabs value={tab} onChange={setTab} items={[{ value: "book", label: "Order Book" }, { value: "trades", label: "Recent Trades" }]} className="border-b border-line px-1" />
      <div className="flex-1 min-h-0">
        {/* keyed so a market switch never shows the previous market's book */}
        {tab === "book" ? <OrderBook key={market.symbol} market={market} /> : <RecentTrades key={market.symbol} market={market} />}
      </div>
    </div>
  );
}

interface Level { px: number; sz: number; total: number }
interface WsTrade { price: number; size: number; side: "BUY" | "SELL"; ts: number }

function levels(raw: number[][] | undefined, side: "ask" | "bid"): Level[] {
  const rows = (raw ?? [])
    .map((r) => ({ px: Number(r[0]), sz: Number(r[1]) }))
    .filter((r) => Number.isFinite(r.px) && Number.isFinite(r.sz) && r.sz > 0)
    .sort((a, b) => (side === "ask" ? a.px - b.px : b.px - a.px))
    .slice(0, ROWS);
  let t = 0;
  return rows.map((r) => ({ ...r, total: (t += r.sz) }));
}

export function OrderBook({ market }: { market: Market }) {
  const [data, { onDepthChange, depth, allDepths, isLoading }] = useOrderbookStream(market.symbol, undefined, { level: ROWS, padding: false });
  const pickPx = useTerminal((s) => s.pickPx);
  const grouped = depth != null && depth > market.quoteTick;
  const groupDec = grouped ? Math.min(market.pxDecimals, Math.max(0, Math.round(-Math.log10(depth!)))) : market.pxDecimals;

  const { asks, bids, max, spread, spreadPct } = useMemo(() => {
    const a = levels(data.asks, "ask");
    const b = levels(data.bids, "bid");
    const m = Math.max(a.at(-1)?.total ?? 0, b.at(-1)?.total ?? 0);
    const sp = a[0] && b[0] ? a[0].px - b[0].px : null;
    return { asks: [...a].reverse(), bids: b, max: m, spread: sp, spreadPct: sp != null && b[0] ? sp / b[0].px : null };
  }, [data.asks, data.bids]);

  return (
    <div className="flex flex-col h-full text-[11px]">
      <div className="flex items-center justify-between px-2 py-1.5 text-faint">
        <span>Group</span>
        <select value={depth ?? ""} onChange={(e) => onDepthChange?.(Number(e.target.value))}
          className="bg-panel-2 border border-line-2 rounded px-1 py-0.5 text-muted outline-none">
          {(allDepths ?? []).map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-3 px-2 pb-1 text-faint">
        <span>Price</span><span className="text-right">Size ({market.base})</span><span className="text-right">Total</span>
      </div>
      {isLoading && !asks.length && !bids.length ? (
        <div className="flex-1 grid place-items-center"><Spinner /></div>
      ) : !asks.length && !bids.length ? (
        <Empty>Order book is empty.</Empty>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col justify-end">
            {asks.map((l) => <Row key={"a" + l.px} l={l} max={max} side="ask" pxDec={groupDec} szDec={market.szDecimals} onPick={pickPx} />)}
          </div>
          <div className="flex justify-between px-2 py-1 my-0.5 bg-panel-2 text-muted num">
            <span>Spread</span>
            <span>{spread != null ? fmtPx(spread, market.pxDecimals) : "--"}</span>
            <span>{spreadPct != null ? (spreadPct * 100).toFixed(3) + "%" : ""}</span>
          </div>
          <div className="flex-1">
            {bids.map((l) => <Row key={"b" + l.px} l={l} max={max} side="bid" pxDec={groupDec} szDec={market.szDecimals} onPick={pickPx} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ l, max, side, pxDec, szDec, onPick }: { l: Level; max: number; side: "bid" | "ask"; pxDec: number; szDec: number; onPick: (px: number) => void }) {
  return (
    <button onClick={() => onPick(l.px)} className="relative grid grid-cols-3 px-2 py-[2px] num hover:bg-raised text-left w-full">
      <span className={clsx("absolute inset-y-0 right-0", side === "bid" ? "bg-long/10" : "bg-short/10")} style={{ width: `${max ? (l.total / max) * 100 : 0}%` }} />
      <span className={clsx("relative", side === "bid" ? "text-long" : "text-short")}>{fmtPx(l.px, pxDec)}</span>
      <span className="relative text-right">{fmtSize(l.sz, szDec)}</span>
      <span className="relative text-right text-muted">{fmtSize(l.total, szDec)}</span>
    </button>
  );
}

export function RecentTrades({ market }: { market: Market }) {
  const { data, isLoading } = useMarketTradeStream(market.symbol, { limit: 60 });
  // Orderly's trade stream sends { price, size, side, ts } (checked live), which differs from the SDK's typing.
  const trades = useMemo(() => [...((data ?? []) as unknown as WsTrade[])].sort((a, b) => b.ts - a.ts).slice(0, 60), [data]);
  return (
    <div className="flex flex-col h-full text-[11px]">
      <div className="grid grid-cols-3 px-2 py-1.5 text-faint">
        <span>Price</span><span className="text-right">Size</span><span className="text-right">Time</span>
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin">
        {isLoading && !trades.length && <div className="grid place-items-center py-8"><Spinner /></div>}
        {!isLoading && !trades.length && <Empty>No recent trades.</Empty>}
        {trades.map((t, i) => (
          <div key={`${t.ts}-${i}`} className="grid grid-cols-3 px-2 py-[2px] num">
            <span className={t.side === "BUY" ? "text-long" : "text-short"}>{fmtPx(t.price, market.pxDecimals)}</span>
            <span className="text-right">{fmtSize(t.size, market.szDecimals)}</span>
            <span className="text-right text-muted">{fmtTime(t.ts)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

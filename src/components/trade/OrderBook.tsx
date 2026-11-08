"use client";
import clsx from "clsx";
import { useMemo, useState } from "react";
import type { Market } from "@/lib/hl/markets";
import { useL2Book, useTrades } from "@/hooks/useMarketData";
import { fmtPx, fmtSize, fmtTime } from "@/lib/format";
import { Empty, Spinner, Tabs } from "@/components/ui/primitives";
import { useTerminal } from "@/store/terminal";

const ROWS = 11;

export function BookAndTrades({ market, className }: { market: Market; className?: string }) {
  const [tab, setTab] = useState<"book" | "trades">("book");
  return (
    <div className={clsx("panel flex flex-col min-h-0", className)}>
      <Tabs value={tab} onChange={setTab} items={[{ value: "book", label: "Order Book" }, { value: "trades", label: "Recent Trades" }]} className="border-b border-line px-1" />
      <div className="flex-1 min-h-0">{tab === "book" ? <OrderBook market={market} /> : <RecentTrades market={market} />}</div>
    </div>
  );
}

export function OrderBook({ market }: { market: Market }) {
  const [sig, setSig] = useState<5 | 4 | 3 | 2 | null>(null);
  const book = useL2Book(market.coin, sig);
  const pickPx = useTerminal((s) => s.pickPx);

  const { asks, bids, max, spread, spreadPct } = useMemo(() => {
    if (!book) return { asks: [], bids: [], max: 0, spread: null, spreadPct: null };
    const cum = (lv: typeof book.bids) => { let t = 0; return lv.slice(0, ROWS).map((l) => ({ ...l, total: (t += l.sz) })); };
    const a = cum(book.asks);
    const b = cum(book.bids);
    const m = Math.max(a.at(-1)?.total ?? 0, b.at(-1)?.total ?? 0);
    const sp = book.asks[0] && book.bids[0] ? book.asks[0].px - book.bids[0].px : null;
    return { asks: a.reverse(), bids: b, max: m, spread: sp, spreadPct: sp != null && book.bids[0] ? sp / book.bids[0].px : null };
  }, [book]);

  return (
    <div className="flex flex-col h-full text-[11px]">
      <div className="flex items-center justify-between px-2 py-1.5 text-faint">
        <span>Group</span>
        <select value={sig ?? "full"} onChange={(e) => setSig(e.target.value === "full" ? null : (Number(e.target.value) as 5))}
          className="bg-panel-2 border border-line-2 rounded px-1 py-0.5 text-muted outline-none">
          <option value="full">Full precision</option>
          <option value="5">5 sig figs</option>
          <option value="4">4 sig figs</option>
          <option value="3">3 sig figs</option>
          <option value="2">2 sig figs</option>
        </select>
      </div>
      <div className="grid grid-cols-3 px-2 pb-1 text-faint">
        <span>Price</span><span className="text-right">Size ({market.base})</span><span className="text-right">Total</span>
      </div>
      {!book ? (
        <div className="flex-1 grid place-items-center"><Spinner /></div>
      ) : !asks.length && !bids.length ? (
        <Empty>Order book is empty.</Empty>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col justify-end">
            {asks.map((l) => <Row key={"a" + l.px} l={l} max={max} side="ask" sz={market.szDecimals} onPick={pickPx} />)}
          </div>
          <div className="flex justify-between px-2 py-1 my-0.5 bg-panel-2 text-muted num">
            <span>Spread</span>
            <span>{spread != null ? fmtPx(spread, market.szDecimals) : "--"}</span>
            <span>{spreadPct != null ? (spreadPct * 100).toFixed(3) + "%" : ""}</span>
          </div>
          <div className="flex-1">
            {bids.map((l) => <Row key={"b" + l.px} l={l} max={max} side="bid" sz={market.szDecimals} onPick={pickPx} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ l, max, side, sz, onPick }: { l: { px: number; sz: number; total: number }; max: number; side: "bid" | "ask"; sz: number; onPick: (px: number) => void }) {
  return (
    <button onClick={() => onPick(l.px)} className="relative grid grid-cols-3 px-2 py-[2px] num hover:bg-raised text-left w-full">
      <span className={clsx("absolute inset-y-0 right-0", side === "bid" ? "bg-long/10" : "bg-short/10")} style={{ width: `${max ? (l.total / max) * 100 : 0}%` }} />
      <span className={clsx("relative", side === "bid" ? "text-long" : "text-short")}>{fmtPx(l.px, sz)}</span>
      <span className="relative text-right">{fmtSize(l.sz, sz)}</span>
      <span className="relative text-right text-muted">{fmtSize(l.total, sz)}</span>
    </button>
  );
}

export function RecentTrades({ market }: { market: Market }) {
  const trades = useTrades(market.coin);
  return (
    <div className="flex flex-col h-full text-[11px]">
      <div className="grid grid-cols-3 px-2 py-1.5 text-faint">
        <span>Price</span><span className="text-right">Size</span><span className="text-right">Time</span>
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin">
        {!trades.length && <div className="grid place-items-center py-8"><Spinner /></div>}
        {trades.map((t) => (
          <div key={t.tid} className="grid grid-cols-3 px-2 py-[2px] num">
            <span className={t.side === "B" ? "text-long" : "text-short"}>{fmtPx(t.px, market.szDecimals)}</span>
            <span className="text-right">{fmtSize(t.sz, market.szDecimals)}</span>
            <span className="text-right text-muted">{fmtTime(t.time)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

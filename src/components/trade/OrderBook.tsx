"use client";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import type { Market } from "@/lib/lighter/markets";
import { lighterWs, type WsMessage } from "@/lib/lighter/ws";
import { fmtPx, fmtSize, fmtTime, toMs } from "@/lib/format";
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
        {tab === "book" ? <OrderBook key={market.id} market={market} /> : <RecentTrades key={market.id} market={market} />}
      </div>
    </div>
  );
}

interface Level { px: number; sz: number; total: number }
type RawLevel = { price: string; size: string };

/** Live order book for one market: full snapshot on subscribe, then deltas (size 0 removes a level). */
export function useOrderBook(marketId: number) {
  const [book, setBook] = useState<{ asks: Map<string, number>; bids: Map<string, number>; at: number } | null>(null);
  useEffect(() => {
    let asks = new Map<string, number>();
    let bids = new Map<string, number>();
    let raf = 0;
    const flush = () => {
      raf = 0;
      setBook({ asks: new Map(asks), bids: new Map(bids), at: Date.now() });
    };
    const apply = (side: Map<string, number>, rows: RawLevel[] | undefined) => {
      for (const r of rows ?? []) {
        const sz = Number(r.size);
        if (!(sz > 0)) side.delete(r.price);
        else side.set(r.price, sz);
      }
    };
    const unsub = lighterWs().subscribe(`order_book/${marketId}`, (m: WsMessage) => {
      const ob = m.order_book as { asks?: RawLevel[]; bids?: RawLevel[] } | undefined;
      if (!ob) return;
      if (m.type === "subscribed/order_book") {
        asks = new Map();
        bids = new Map();
      }
      apply(asks, ob.asks);
      apply(bids, ob.bids);
      if (!raf) raf = requestAnimationFrame(flush);
    });
    return () => {
      unsub();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [marketId]);
  return book;
}

function levels(side: Map<string, number> | undefined, kind: "ask" | "bid", group: number, dec: number): Level[] {
  const agg = new Map<number, number>();
  for (const [p, sz] of side ?? []) {
    const px = Number(p);
    if (!Number.isFinite(px)) continue;
    // asks round up, bids round down, so grouped levels never cross
    const k = kind === "ask" ? Math.ceil(px / group - 1e-9) * group : Math.floor(px / group + 1e-9) * group;
    const key = Number(k.toFixed(dec));
    agg.set(key, (agg.get(key) ?? 0) + sz);
  }
  const rows = [...agg.entries()].map(([px, sz]) => ({ px, sz }))
    .sort((a, b) => (kind === "ask" ? a.px - b.px : b.px - a.px))
    .slice(0, ROWS);
  let t = 0;
  return rows.map((r) => ({ ...r, total: (t += r.sz) }));
}

export function OrderBook({ market }: { market: Market }) {
  const book = useOrderBook(market.id);
  const pickPx = useTerminal((s) => s.pickPx);
  const groups = useMemo(() => [1, 10, 100, 1000].map((x) => x * market.quoteTick).filter((g) => g <= (market.ctx?.markPx ?? Infinity) / 100 || g === market.quoteTick), [market]);
  const [group, setGroup] = useState(market.quoteTick);
  const groupDec = Math.max(0, Math.min(market.pxDecimals, Math.round(-Math.log10(group))));

  const { asks, bids, max, spread, spreadPct } = useMemo(() => {
    const a = levels(book?.asks, "ask", group, groupDec);
    const b = levels(book?.bids, "bid", group, groupDec);
    const m = Math.max(a.at(-1)?.total ?? 0, b.at(-1)?.total ?? 0);
    const sp = a[0] && b[0] ? a[0].px - b[0].px : null;
    return { asks: [...a].reverse(), bids: b, max: m, spread: sp, spreadPct: sp != null && b[0] ? sp / b[0].px : null };
  }, [book, group, groupDec]);

  return (
    <div className="flex flex-col h-full text-[11px]">
      <div className="flex items-center justify-between px-2 py-1.5 text-faint">
        <span>Group</span>
        <select value={group} onChange={(e) => setGroup(Number(e.target.value))}
          className="bg-panel-2 border border-line-2 rounded px-1 py-0.5 text-muted outline-none">
          {groups.map((g) => <option key={g} value={g}>{g.toFixed(Math.max(0, Math.round(-Math.log10(g))))}</option>)}
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

interface Trade { id: number; price: number; size: number; buy: boolean; ts: number }
type RawWsTrade = { trade_id: number; price: string; size: string; is_maker_ask: boolean; timestamp: number; type?: string };

export function useTrades(marketId: number, limit = 60) {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  useEffect(() => {
    const unsub = lighterWs().subscribe(`trade/${marketId}`, (m) => {
      const rows = (m.trades as RawWsTrade[] | undefined) ?? [];
      // taker bought when the resting (maker) order was the ask
      const parsed = rows.map((t) => ({ id: t.trade_id, price: Number(t.price), size: Number(t.size), buy: !!t.is_maker_ask, ts: toMs(t.timestamp) }));
      setTrades((prev) => {
        const base = m.type === "subscribed/trade" ? [] : prev ?? [];
        const seen = new Set(base.map((t) => t.id));
        const merged = [...parsed.filter((t) => !seen.has(t.id)), ...base];
        return merged.sort((a, b) => b.ts - a.ts || b.id - a.id).slice(0, limit);
      });
    });
    return unsub;
  }, [marketId, limit]);
  return trades;
}

export function RecentTrades({ market }: { market: Market }) {
  const trades = useTrades(market.id);
  return (
    <div className="flex flex-col h-full text-[11px]">
      <div className="grid grid-cols-3 px-2 py-1.5 text-faint">
        <span>Price</span><span className="text-right">Size</span><span className="text-right">Time</span>
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin">
        {!trades && <div className="grid place-items-center py-8"><Spinner /></div>}
        {trades && !trades.length && <Empty>No recent trades.</Empty>}
        {trades?.map((t) => (
          <div key={t.id} className="grid grid-cols-3 px-2 py-[2px] num">
            <span className={t.buy ? "text-long" : "text-short"}>{fmtPx(t.price, market.pxDecimals)}</span>
            <span className="text-right">{fmtSize(t.size, market.szDecimals)}</span>
            <span className="text-right text-muted">{fmtTime(t.ts)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

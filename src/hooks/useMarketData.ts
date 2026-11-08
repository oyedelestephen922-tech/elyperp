"use client";
import { useEffect, useState } from "react";
import { getInfo, getSubs, getWsStatus, onWsStatus } from "@/lib/hl/clients";
import { subscriptionScope } from "@/lib/hl/subscribe";
import { logError } from "@/lib/hl/errors";
import { STALE_AFTER_MS } from "@/lib/config";
import { useMarkets } from "@/store/markets";
import { parseCtx } from "@/lib/hl/markets";

export interface BookLevel { px: number; sz: number; n: number }
export interface Book { bids: BookLevel[]; asks: BookLevel[]; time: number }

export function useL2Book(coin: string | null, nSigFigs: 2 | 3 | 4 | 5 | null) {
  const [book, setBook] = useState<Book | null>(null);
  useEffect(() => {
    setBook(null);
    if (!coin) return;
    const scope = subscriptionScope();
    const params = nSigFigs ? { coin, nSigFigs } : { coin };
    scope.add(
      getSubs().l2Book(params, (ev) => {
        const map = (l: { px: string; sz: string; n: number }) => ({ px: Number(l.px), sz: Number(l.sz), n: l.n });
        setBook({ bids: ev.levels[0].map(map), asks: ev.levels[1].map(map), time: ev.time });
      }),
      `l2Book ${coin}`,
    );
    return scope.close;
  }, [coin, nSigFigs]);
  return book;
}

export interface TradeRow { px: number; sz: number; side: "B" | "A"; time: number; tid: number }

export function useTrades(coin: string | null) {
  const [trades, setTrades] = useState<TradeRow[]>([]);
  useEffect(() => {
    setTrades([]);
    if (!coin) return;
    let cancelled = false;
    const map = (t: { px: string; sz: string; side: "B" | "A"; time: number; tid: number }) =>
      ({ px: Number(t.px), sz: Number(t.sz), side: t.side, time: t.time, tid: t.tid });
    getInfo().recentTrades({ coin }).then((r) => !cancelled && setTrades((cur) => (cur.length ? cur : r.map(map).sort((a, b) => b.time - a.time)))).catch((e) => logError("recentTrades", e));
    const scope = subscriptionScope();
    scope.add(
      getSubs().trades({ coin }, (ev) => {
        setTrades((cur) => {
          const seen = new Set(cur.map((t) => t.tid));
          const fresh = ev.map(map).filter((t) => !seen.has(t.tid));
          return [...fresh.sort((a, b) => b.time - a.time), ...cur].slice(0, 60);
        });
      }),
      `trades ${coin}`,
    );
    return () => {
      cancelled = true;
      scope.close();
    };
  }, [coin]);
  return trades;
}

export function useDayRange(coin: string | null) {
  const [range, setRange] = useState<{ high: number; low: number } | null>(null);
  useEffect(() => {
    setRange(null);
    if (!coin) return;
    let cancelled = false;
    const load = () =>
      getInfo()
        .candleSnapshot({ coin, interval: "15m", startTime: Date.now() - 24 * 3600_000 })
        .then((c) => {
          if (cancelled || !c.length) return;
          setRange({ high: Math.max(...c.map((x) => Number(x.h))), low: Math.min(...c.map((x) => Number(x.l))) });
        })
        .catch((e) => logError("day range", e));
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [coin]);
  return range;
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function useWsStatus() {
  const [s, setS] = useState(getWsStatus);
  useEffect(() => {
    setS(getWsStatus());
    const off = onWsStatus(setS);
    return () => {
      off();
    };
  }, []);
  return s;
}

export function useIsStale(dex: string | undefined, coin?: string) {
  const dexAt = useMarkets((s) => (dex == null ? 0 : s.liveAt[dex] ?? 0));
  const coinAt = useMarkets((s) => (coin ? s.liveCoinAt[coin] ?? 0 : 0));
  const now = useNow(2000);
  const last = Math.max(dexAt, coinAt);
  return !last || now - last > STALE_AFTER_MS;
}

export function useLiveCoinCtx(coin: string | null) {
  const applyCoinCtx = useMarkets((s) => s.applyCoinCtx);
  useEffect(() => {
    if (!coin) return;
    const scope = subscriptionScope();
    scope.add(getSubs().activeAssetCtx({ coin }, (ev) => applyCoinCtx(ev.coin, parseCtx(ev.ctx))), `activeAssetCtx ${coin}`);
    return scope.close;
  }, [coin, applyCoinCtx]);
}

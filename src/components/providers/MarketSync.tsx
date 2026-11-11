"use client";
import { useEffect } from "react";
import { useMarkPricesStream, useMarketsStream } from "@orderly.network/hooks";
import type { MarketUniverse } from "@/lib/orderly/markets";
import { useMarkets, type LiveTicker } from "@/store/markets";
import { logError } from "@/lib/errors";

const CACHE_KEY = "elyperp:universe:orderly";

async function loadUniverse(): Promise<MarketUniverse> {
  const r = await fetch("/api/markets", { cache: "no-store" });
  if (!r.ok) throw new Error(`/api/markets ${r.status}`);
  return (await r.json()) as MarketUniverse;
}

export function MarketSync() {
  const setUniverse = useMarkets((s) => s.setUniverse);
  const setError = useMarkets((s) => s.setError);
  const applyTickers = useMarkets((s) => s.applyTickers);
  const applyMarkPrices = useMarkets((s) => s.applyMarkPrices);
  const { data: tickers } = useMarketsStream();
  const { data: markPrices } = useMarkPricesStream();

  useEffect(() => {
    let cancelled = false;
    // show the last list we had straight away (prices get replaced by the live stream)
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const u = JSON.parse(cached) as MarketUniverse;
        if (Date.now() - u.fetchedAt < 30 * 60_000 && Array.isArray(u.markets)) setUniverse(u.markets, u.sessions ?? {}, u.fetchedAt);
      }
    } catch {
      /* ignore bad cache */
    }
    // REST refresh picks up new listings, funding rates and trading sessions
    const refresh = () =>
      loadUniverse()
        .then((u) => {
          if (cancelled) return;
          setUniverse(u.markets, u.sessions, u.fetchedAt);
          try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(u));
          } catch {
            /* storage full or blocked */
          }
        })
        .catch((e) => {
          logError("market list", e);
          if (!cancelled) setError(e instanceof Error ? e.message : String(e));
        });
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [setUniverse, setError]);

  useEffect(() => {
    if (tickers?.length) applyTickers(tickers as unknown as LiveTicker[]);
  }, [tickers, applyTickers]);

  useEffect(() => {
    if (markPrices && Object.keys(markPrices).length) applyMarkPrices(markPrices);
  }, [markPrices, applyMarkPrices]);

  return null;
}

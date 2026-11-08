"use client";
import { useEffect } from "react";
import { getInfo, getSubs } from "@/lib/hl/clients";
import { discoverMarkets, parseCtx, type MarketUniverse } from "@/lib/hl/markets";
import { useMarkets } from "@/store/markets";
import { logError } from "@/lib/hl/errors";
import { subscriptionScope } from "@/lib/hl/subscribe";
import { IS_TESTNET } from "@/lib/config";

async function loadUniverse(): Promise<MarketUniverse> {
  try {
    const r = await fetch("/api/markets", { cache: "no-store" });
    if (!r.ok) throw new Error(`/api/markets ${r.status}`);
    return (await r.json()) as MarketUniverse;
  } catch (e) {
    logError("server discovery failed, falling back to direct", e);
    return discoverMarkets(getInfo(), { isTestnet: IS_TESTNET });
  }
}

const CACHE_KEY = `elyperp:universe:${IS_TESTNET ? "testnet" : "mainnet"}`;

export function MarketSync() {
  const setUniverse = useMarkets((s) => s.setUniverse);
  const setError = useMarkets((s) => s.setError);
  const applyCtxs = useMarkets((s) => s.applyCtxs);

  useEffect(() => {
    let cancelled = false;
    // show the last list we had straight away (prices get replaced by the live stream)
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const u = JSON.parse(cached) as MarketUniverse;
        if (Date.now() - u.fetchedAt < 30 * 60_000) setUniverse(u.markets, u.dexes, u.fetchedAt);
      }
    } catch {
      /* ignore bad cache */
    }
    const refresh = () =>
      loadUniverse()
        .then((u) => {
          if (cancelled) return;
          setUniverse(u.markets, u.dexes, u.fetchedAt);
          try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({ markets: u.markets, dexes: u.dexes, fetchedAt: u.fetchedAt }));
          } catch {
            /* storage full or blocked */
          }
        })
        .catch((e) => {
          logError("market discovery", e);
          if (!cancelled) setError(e instanceof Error ? e.message : String(e));
        });
    refresh();
    const id = setInterval(refresh, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [setUniverse, setError]);

  useEffect(() => {
    const scope = subscriptionScope();
    scope.add(
      getSubs().allDexsAssetCtxs((ev) => {
        applyCtxs(ev.ctxs.map(([dex, ctxs]) => [dex, ctxs.map(parseCtx)]));
      }),
      "allDexsAssetCtxs",
    );
    return scope.close;
  }, [applyCtxs]);

  return null;
}

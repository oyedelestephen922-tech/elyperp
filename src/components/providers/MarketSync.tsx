"use client";
import { useEffect } from "react";
import { fetchDetails } from "@/lib/lighter/api";
import { buildUniverse, type MarketUniverse, type RawStats } from "@/lib/lighter/markets";
import { lighterWs } from "@/lib/lighter/ws";
import { useMarkets } from "@/store/markets";
import { logError } from "@/lib/errors";

const CACHE_KEY = "elyperp:universe:lighter";

// Latest stats per market id, so a market list that loads after the stream's snapshot still gets them.
const latestStats = new Map<number, RawStats>();

export function MarketSync() {
  const setUniverse = useMarkets((s) => s.setUniverse);
  const setError = useMarkets((s) => s.setError);
  const applyStats = useMarkets((s) => s.applyStats);

  useEffect(() => {
    let cancelled = false;
    // show the last list we had straight away (stats get replaced by the live stream)
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const u = JSON.parse(cached) as MarketUniverse;
        if (Date.now() - u.fetchedAt < 30 * 60_000 && Array.isArray(u.markets)) setUniverse(u.markets, u.fetchedAt);
      }
    } catch {
      /* ignore bad cache */
    }
    // REST refresh picks up new listings and parameter changes
    const refresh = () =>
      fetchDetails()
        .then((rows) => {
          if (cancelled) return;
          const u = buildUniverse(rows);
          setUniverse(u.markets, u.fetchedAt);
          if (latestStats.size) applyStats([...latestStats.values()]);
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
  }, [setUniverse, setError, applyStats]);

  // Live prices, funding, volume and open interest for every market.
  useEffect(() => {
    return lighterWs().subscribe("market_stats/all", (m) => {
      const stats = m.market_stats as Record<string, RawStats> | undefined;
      if (!stats || typeof stats !== "object") return;
      const rows = Object.values(stats).filter((r) => r && typeof r.market_id === "number");
      for (const r of rows) latestStats.set(r.market_id, r);
      applyStats(rows);
    });
  }, [applyStats]);

  return null;
}

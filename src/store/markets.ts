"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Market, MarketCtx, SessionInfo } from "@/lib/orderly/markets";

/** Row from Orderly's useMarketsStream: /v1/public/futures merged with the live `tickers` topic. */
export interface LiveMarketRow {
  symbol: string;
  mark_price?: number;
  index_price?: number;
  open_interest?: number | string;
  est_funding_rate?: number;
  last_funding_rate?: number;
  next_funding_time?: number;
  "24h_open"?: number;
  "24h_high"?: number;
  "24h_low"?: number;
  "24h_volume"?: number;
  "24h_amount"?: number;
}

const num = (v: unknown) => (v == null || v === "" ? NaN : Number(v));

interface MarketsState {
  markets: Record<string, Market>; // by symbol
  slugs: Record<string, string>; // slug (lower case) → symbol
  sessions: Record<string, SessionInfo>;
  loaded: boolean;
  error: string | null;
  fetchedAt: number;
  liveAt: number; // last live stream update
  setUniverse: (markets: Market[], sessions: Record<string, SessionInfo>, fetchedAt: number) => void;
  setError: (e: string | null) => void;
  applyTickers: (rows: LiveMarketRow[]) => void;
  applyMarkPrices: (prices: Record<string, number>) => void;
}

const emptyCtx = (): MarketCtx => ({
  markPx: 0, indexPx: 0, open24: 0, high24: 0, low24: 0, volume24: 0, amount24: 0, openInterest: 0,
  estFunding: 0, lastFunding: 0, nextFundingTime: 0,
});

export const useMarkets = create<MarketsState>((set) => ({
  markets: {},
  slugs: {},
  sessions: {},
  loaded: false,
  error: null,
  fetchedAt: 0,
  liveAt: 0,
  setUniverse: (list, sessions, fetchedAt) =>
    set((s) => {
      const markets: Record<string, Market> = {};
      const slugs: Record<string, string> = {};
      for (const m of list) {
        // keep live prices we already have if the REST snapshot is older
        const prev = s.markets[m.symbol];
        markets[m.symbol] = prev?.ctx && s.liveAt > fetchedAt
          ? { ...m, ctx: { ...(m.ctx ?? emptyCtx()), markPx: prev.ctx.markPx, indexPx: prev.ctx.indexPx, high24: prev.ctx.high24, low24: prev.ctx.low24, open24: prev.ctx.open24, volume24: prev.ctx.volume24, amount24: prev.ctx.amount24, openInterest: prev.ctx.openInterest } }
          : m;
        slugs[m.slug.toLowerCase()] = m.symbol;
      }
      return { markets, slugs, sessions, loaded: true, error: null, fetchedAt };
    }),
  setError: (error) => set({ error }),
  applyTickers: (rows) =>
    set((s) => {
      if (!rows.length) return s;
      const markets = { ...s.markets };
      for (const r of rows) {
        const m = markets[r.symbol];
        if (!m) continue;
        const ctx = { ...(m.ctx ?? emptyCtx()) };
        // only overwrite fields the stream actually carries
        const put = (k: keyof MarketCtx, v: unknown) => {
          const n = num(v);
          if (Number.isFinite(n)) ctx[k] = n;
        };
        put("open24", r["24h_open"]);
        put("high24", r["24h_high"]);
        put("low24", r["24h_low"]);
        put("volume24", r["24h_volume"]);
        put("amount24", r["24h_amount"]);
        put("openInterest", r.open_interest);
        put("indexPx", r.index_price);
        put("estFunding", r.est_funding_rate);
        put("lastFunding", r.last_funding_rate);
        put("nextFundingTime", r.next_funding_time);
        if (!(ctx.markPx > 0)) put("markPx", r.mark_price);
        markets[r.symbol] = { ...m, ctx };
      }
      return { markets, liveAt: Date.now() };
    }),
  applyMarkPrices: (prices) =>
    set((s) => {
      const markets = { ...s.markets };
      let n = 0;
      for (const [symbol, px] of Object.entries(prices)) {
        const m = markets[symbol];
        if (!m || !(px > 0)) continue;
        if (m.ctx?.markPx === px) continue;
        markets[symbol] = { ...m, ctx: { ...(m.ctx ?? emptyCtx()), markPx: px } };
        n++;
      }
      return n ? { markets, liveAt: Date.now() } : { liveAt: Date.now() };
    }),
}));

export function useMarketBySlug(slug: string) {
  return useMarkets((s) => {
    const sym = s.slugs[slug.toLowerCase()];
    return sym ? s.markets[sym] : undefined;
  });
}

interface PrefsState {
  favorites: string[]; // symbols
  slippage: number;
  layout: "standard" | "chart" | "bookLeft";
  toggleFavorite: (symbol: string) => void;
  setSlippage: (v: number) => void;
  setLayout: (l: PrefsState["layout"]) => void;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      favorites: ["PERP_BTC_USDC", "PERP_ETH_USDC", "PERP_SOL_USDC", "PERP_NVDA_USDC"],
      slippage: 0.01,
      layout: "standard",
      toggleFavorite: (symbol) =>
        set((s) => ({
          favorites: s.favorites.includes(symbol) ? s.favorites.filter((c) => c !== symbol) : [...s.favorites, symbol],
        })),
      setSlippage: (slippage) => set({ slippage }),
      setLayout: (layout) => set({ layout }),
    }),
    {
      name: "elyperp:prefs:v2",
      // only touch localStorage in the browser (avoids a Node warning during server render)
      storage: createJSONStorage(() =>
        typeof window === "undefined"
          ? { getItem: () => null, setItem: () => {}, removeItem: () => {} }
          : window.localStorage,
      ),
    },
  ),
);

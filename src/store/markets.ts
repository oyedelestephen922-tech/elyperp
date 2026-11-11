"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Market, MarketCtx, SessionInfo } from "@/lib/orderly/markets";

export interface LiveTicker {
  symbol: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  open_interest?: number;
  index_price?: number;
}

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
  applyTickers: (tickers: LiveTicker[]) => void;
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
  applyTickers: (tickers) =>
    set((s) => {
      if (!tickers.length) return s;
      const markets = { ...s.markets };
      for (const t of tickers) {
        const m = markets[t.symbol];
        if (!m) continue;
        const ctx = { ...(m.ctx ?? emptyCtx()) };
        ctx.open24 = Number(t.open);
        ctx.high24 = Number(t.high);
        ctx.low24 = Number(t.low);
        ctx.volume24 = Number(t.volume);
        ctx.amount24 = Number(t.amount);
        if (t.open_interest != null) ctx.openInterest = Number(t.open_interest);
        if (t.index_price != null) ctx.indexPx = Number(t.index_price);
        if (!(ctx.markPx > 0)) ctx.markPx = Number(t.close);
        markets[t.symbol] = { ...m, ctx };
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

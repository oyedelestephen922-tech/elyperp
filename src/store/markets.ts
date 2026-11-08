"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { DexInfo, Market, MarketCtx } from "@/lib/hl/markets";
import { statusOf } from "@/lib/hl/markets";

interface MarketsState {
  markets: Record<string, Market>;
  dexOrder: Record<string, string[]>;
  dexes: DexInfo[];
  loaded: boolean;
  error: string | null;
  fetchedAt: number;
  liveAt: Record<string, number>;
  setUniverse: (markets: Market[], dexes: DexInfo[], fetchedAt: number) => void;
  setError: (e: string | null) => void;
  applyCtxs: (batch: [dex: string, ctxs: MarketCtx[]][]) => void;
  liveCoinAt: Record<string, number>;
  applyCoinCtx: (coin: string, ctx: MarketCtx) => void;
}

export const useMarkets = create<MarketsState>((set) => ({
  markets: {},
  dexOrder: {},
  dexes: [],
  loaded: false,
  error: null,
  fetchedAt: 0,
  liveAt: {},
  liveCoinAt: {},
  setUniverse: (list, dexes, fetchedAt) => {
    const markets: Record<string, Market> = {};
    const dexOrder: Record<string, string[]> = {};
    for (const m of list) {
      markets[m.coin] = m;
      const idx = m.dexIndex === 0 ? m.assetId : m.assetId - 100000 - m.dexIndex * 10000;
      (dexOrder[m.dex] ??= [])[idx] = m.coin;
    }
    set({ markets, dexOrder, dexes, loaded: true, error: null, fetchedAt });
  },
  setError: (error) => set({ error }),
  // One state update per WS message, however many dexes it carries (testnet has hundreds).
  applyCtxs: (batch) =>
    set((s) => {
      const markets = { ...s.markets };
      const liveAt = { ...s.liveAt };
      const now = Date.now();
      for (const [dex, ctxs] of batch) {
        const order = s.dexOrder[dex];
        if (!order) continue;
        ctxs.forEach((ctx, i) => {
          const coin = order[i];
          const m = coin && markets[coin];
          if (m) markets[coin] = { ...m, ctx, status: statusOf(m.isDelisted, ctx) };
        });
        liveAt[dex] = now;
      }
      return { markets, liveAt };
    }),
  applyCoinCtx: (coin, ctx) =>
    set((s) => {
      const m = s.markets[coin];
      if (!m) return s;
      return {
        markets: { ...s.markets, [coin]: { ...m, ctx, status: statusOf(m.isDelisted, ctx) } },
        liveCoinAt: { ...s.liveCoinAt, [coin]: Date.now() },
      };
    }),
}));

interface PrefsState {
  favorites: string[];
  slippage: number;
  layout: "standard" | "chart" | "bookLeft";
  toggleFavorite: (coin: string) => void;
  setSlippage: (v: number) => void;
  setLayout: (l: PrefsState["layout"]) => void;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      favorites: ["BTC", "ETH", "SOL", "HYPE"],
      slippage: 0.01,
      layout: "standard",
      toggleFavorite: (coin) =>
        set((s) => ({
          favorites: s.favorites.includes(coin) ? s.favorites.filter((c) => c !== coin) : [...s.favorites, coin],
        })),
      setSlippage: (slippage) => set({ slippage }),
      setLayout: (layout) => set({ layout }),
    }),
    {
      name: "elyperp:prefs",
      // only touch localStorage in the browser (avoids a Node warning during server render)
      storage: createJSONStorage(() =>
        typeof window === "undefined"
          ? { getItem: () => null, setItem: () => {}, removeItem: () => {} }
          : window.localStorage,
      ),
    },
  ),
);

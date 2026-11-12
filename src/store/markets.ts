"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { statsToCtx, type Market, type RawStats } from "@/lib/lighter/markets";

interface MarketsState {
  markets: Record<string, Market>; // by symbol
  slugs: Record<string, string>; // slug (lower case) → symbol
  byId: Record<number, string>; // market_id → symbol
  loaded: boolean;
  error: string | null;
  fetchedAt: number;
  liveAt: number; // last live stream update
  setUniverse: (markets: Market[], fetchedAt: number) => void;
  setError: (e: string | null) => void;
  applyStats: (rows: RawStats[]) => void;
}

export const useMarkets = create<MarketsState>((set) => ({
  markets: {},
  slugs: {},
  byId: {},
  loaded: false,
  error: null,
  fetchedAt: 0,
  liveAt: 0,
  setUniverse: (list, fetchedAt) =>
    set((s) => {
      const markets: Record<string, Market> = {};
      const slugs: Record<string, string> = {};
      const byId: Record<number, string> = {};
      for (const m of list) {
        // keep live stats we already have if the REST snapshot is older
        const prev = s.markets[m.symbol];
        markets[m.symbol] = prev?.ctx && s.liveAt > fetchedAt ? { ...m, ctx: prev.ctx } : m;
        slugs[m.slug.toLowerCase()] = m.symbol;
        byId[m.id] = m.symbol;
      }
      return { markets, slugs, byId, loaded: true, error: null, fetchedAt };
    }),
  setError: (error) => set({ error }),
  applyStats: (rows) =>
    set((s) => {
      if (!rows.length) return s;
      const markets = { ...s.markets };
      let changed = false;
      for (const r of rows) {
        const sym = s.byId[r.market_id];
        const m = sym ? markets[sym] : undefined;
        if (!m) continue;
        markets[sym] = { ...m, ctx: statsToCtx(r, m.ctx) };
        changed = true;
      }
      return changed ? { markets, liveAt: Date.now() } : { liveAt: Date.now() };
    }),
}));

export function useMarketBySlug(slug: string) {
  return useMarkets((s) => {
    const sym = s.slugs[slug.toLowerCase()];
    return sym ? s.markets[sym] : undefined;
  });
}

export function useMarketById(id: number | null | undefined) {
  return useMarkets((s) => (id == null ? undefined : s.markets[s.byId[id]]));
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
      favorites: ["BTC", "ETH", "SOL", "NVDA"],
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
      name: "elyperp:prefs:v3",
      // only touch localStorage in the browser (avoids a Node warning during server render)
      storage: createJSONStorage(() =>
        typeof window === "undefined"
          ? { getItem: () => null, setItem: () => {}, removeItem: () => {} }
          : window.localStorage,
      ),
    },
  ),
);

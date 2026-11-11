import { ORDERLY_API_URL } from "../config";

export type MarketCategory = "crypto" | "stock" | "index" | "commodity" | "fx" | "other";
export type MarketStatus = "active" | "post_only" | "reduce_only" | "delisting" | "inactive";

export interface MarketCtx {
  markPx: number;
  indexPx: number;
  open24: number;
  high24: number;
  low24: number;
  volume24: number; // base units
  amount24: number; // USD notional
  openInterest: number; // base units
  estFunding: number; // rate per funding period
  lastFunding: number;
  nextFundingTime: number;
}

export interface Market {
  symbol: string; // PERP_BTC_USDC, PERP_AAPL_USDC_mythos
  slug: string; // URL id: BTC, AAPL-mythos
  base: string; // display name: BTC, AAPL
  builder: string | null; // builder that listed it; null = listed by Orderly
  category: MarketCategory;
  session: string | null; // RWA trading session (US_STOCK, US_FUTURES, FX…)
  quoteTick: number;
  baseTick: number;
  baseMin: number;
  baseMax: number;
  minNotional: number;
  pxDecimals: number;
  szDecimals: number;
  maxLeverage: number;
  baseImr: number;
  baseMmr: number;
  imrFactor: number;
  fundingPeriodH: number;
  status: MarketStatus;
  ctx: MarketCtx | null;
}

export interface SessionInfo {
  open: boolean;
  nextOpen: number | null;
  nextClose: number | null;
  session: string;
}

export interface MarketUniverse {
  markets: Market[];
  sessions: Record<string, SessionInfo>;
  fetchedAt: number;
}

// ---- raw API shapes (checked against api.orderly.org, Nov 2026) ----
export interface RawInfo {
  symbol: string;
  display_symbol_name?: string;
  broker_id?: string | null;
  quote_tick: number;
  base_min: number;
  base_max: number;
  base_tick: number;
  min_notional: number;
  base_imr: number;
  base_mmr: number;
  imr_factor: number;
  funding_period?: number;
  status?: string;
}
export interface RawFutures {
  symbol: string;
  index_price: number;
  mark_price: number;
  est_funding_rate: number;
  last_funding_rate: number;
  next_funding_time: number;
  open_interest: number | string;
  "24h_open": number;
  "24h_close": number;
  "24h_high": number;
  "24h_low": number;
  "24h_volume": number;
  "24h_amount": number;
}
export interface RawRwa {
  symbol: string;
  status: string;
  next_open?: number | null;
  next_close?: number | null;
  market_session: string;
}

const INDEX_SYMBOLS = new Set([
  "SPX500", "SPX", "SP500", "US500", "NAS100", "NDX", "US100", "US30", "DJI", "RUT", "US2000",
  "JP225", "DAX", "GER40", "UK100", "HK50", "EU50", "KOSPI", "VIX", "QQQ", "SPY", "IWM", "DIA", "SOXL", "TQQQ", "EWY", "EWJ", "KORU",
]);
const COMMODITY_SYMBOLS = new Set([
  "XAU", "GOLD", "XAG", "SILVER", "CL", "WTI", "BZ", "BRENT", "NATGAS", "NG", "COPPER", "HG", "PLATINUM", "PALLADIUM", "XPT", "XPD",
]);
const FX_SYMBOLS = new Set(["EURUSD", "USDJPY", "GBPUSD", "AUDUSD", "USDCAD", "USDCHF", "HKDUSD", "KRWUSD", "DXY"]);

export function decimalsOf(step: number): number {
  if (!(step > 0) || step >= 1) return 0;
  return Math.min(12, Math.max(0, Math.round(-Math.log10(step))));
}

/** PERP_<BASE>_USDC[_<builder>] → { base, builder } */
export function parseSymbol(symbol: string, displayName?: string | null, brokerId?: string | null) {
  const m = /^PERP_(.+?)_USDC(?:_(.+))?$/.exec(symbol);
  const base = displayName || (m ? m[1] : symbol);
  const builder = brokerId ?? (m && m[2] ? m[2] : null);
  return { base, builder: builder || null };
}

export function categorize(base: string, session: string | null): MarketCategory {
  const b = base.toUpperCase();
  if (session === "FX" || FX_SYMBOLS.has(b)) return "fx";
  if (session === "US_FUTURES") return INDEX_SYMBOLS.has(b) ? "index" : "commodity";
  if (session && /STOCK/.test(session)) return INDEX_SYMBOLS.has(b) ? "index" : "stock";
  if (INDEX_SYMBOLS.has(b)) return "index";
  if (COMMODITY_SYMBOLS.has(b)) return "commodity";
  return session ? "other" : "crypto";
}

export function statusOf(raw: string | undefined): MarketStatus {
  switch ((raw || "").toUpperCase()) {
    case "ACTIVE": return "active";
    case "POST_ONLY": return "post_only";
    case "REDUCE_ONLY": return "reduce_only";
    case "DELISTING": return "delisting";
    default: return "inactive";
  }
}

export function parseFutures(f: RawFutures): MarketCtx {
  return {
    markPx: Number(f.mark_price),
    indexPx: Number(f.index_price),
    open24: Number(f["24h_open"]),
    high24: Number(f["24h_high"]),
    low24: Number(f["24h_low"]),
    volume24: Number(f["24h_volume"]),
    amount24: Number(f["24h_amount"]),
    openInterest: Number(f.open_interest),
    estFunding: Number(f.est_funding_rate),
    lastFunding: Number(f.last_funding_rate),
    nextFundingTime: Number(f.next_funding_time),
  };
}

export function buildUniverse(info: RawInfo[], futures: RawFutures[], rwa: RawRwa[], fetchedAt = Date.now()): MarketUniverse {
  const fut = new Map(futures.map((f) => [f.symbol, f]));
  const rw = new Map(rwa.map((r) => [r.symbol, r]));
  const parsed = info.map((i) => ({ i, ...parseSymbol(i.symbol, i.display_symbol_name, i.broker_id) }));

  // Plain slug goes to Orderly's own listing when there is one, otherwise to a lone builder listing.
  const byBase = new Map<string, typeof parsed>();
  for (const p of parsed) {
    const k = p.base.toUpperCase();
    byBase.set(k, [...(byBase.get(k) ?? []), p]);
  }
  const plainOwner = new Map<string, string>();
  for (const [k, list] of byBase) {
    const core = list.find((p) => !p.builder);
    if (core) plainOwner.set(k, core.i.symbol);
    else if (list.length === 1) plainOwner.set(k, list[0].i.symbol);
  }

  const markets: Market[] = parsed.map(({ i, base, builder }) => {
    const r = rw.get(i.symbol);
    const f = fut.get(i.symbol);
    const plain = plainOwner.get(base.toUpperCase()) === i.symbol;
    return {
      symbol: i.symbol,
      slug: plain || !builder ? base : `${base}-${builder}`,
      base,
      builder,
      category: categorize(base, r?.market_session ?? null),
      session: r?.market_session ?? null,
      quoteTick: Number(i.quote_tick),
      baseTick: Number(i.base_tick),
      baseMin: Number(i.base_min),
      baseMax: Number(i.base_max),
      minNotional: Number(i.min_notional),
      pxDecimals: decimalsOf(Number(i.quote_tick)),
      szDecimals: decimalsOf(Number(i.base_tick)),
      maxLeverage: i.base_imr > 0 ? Math.round(1 / Number(i.base_imr)) : 1,
      baseImr: Number(i.base_imr),
      baseMmr: Number(i.base_mmr),
      imrFactor: Number(i.imr_factor),
      fundingPeriodH: Number(i.funding_period ?? 8),
      status: statusOf(i.status),
      ctx: f ? parseFutures(f) : null,
    };
  });

  const sessions: Record<string, SessionInfo> = {};
  for (const r of rwa) {
    sessions[r.symbol] = {
      open: r.status === "open",
      nextOpen: r.next_open ?? null,
      nextClose: r.next_close ?? null,
      session: r.market_session,
    };
  }
  return { markets, sessions, fetchedAt };
}

async function getRows<T>(path: string): Promise<T[]> {
  const r = await fetch(`${ORDERLY_API_URL}${path}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  const j = (await r.json()) as { success: boolean; message?: string; data?: { rows?: T[] } };
  if (!j.success) throw new Error(`${path}: ${j.message ?? "request failed"}`);
  return j.data?.rows ?? [];
}

export async function fetchUniverse(): Promise<MarketUniverse> {
  const [info, futures, rwa] = await Promise.all([
    getRows<RawInfo>("/v1/public/info"),
    getRows<RawFutures>("/v1/public/futures"),
    getRows<RawRwa>("/v1/public/rwa/info").catch(() => [] as RawRwa[]),
  ]);
  return buildUniverse(info, futures, rwa);
}

export const CATEGORY_LABEL: Record<MarketCategory, string> = {
  crypto: "Crypto",
  stock: "Stocks",
  index: "Indices",
  commodity: "Commodities",
  fx: "FX",
  other: "Other",
};

export const SESSION_LABEL: Record<string, string> = {
  US_STOCK: "US stocks",
  US_STOCK_EXT: "US stocks (extended)",
  US_FUTURES: "US futures",
  FX: "FX",
  CN_STOCK: "China stocks",
  HK_STOCK: "Hong Kong stocks",
};

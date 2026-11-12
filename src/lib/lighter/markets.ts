export type MarketCategory = "crypto" | "stock" | "etf" | "commodity" | "private" | "other";
export type MarketStatus = "active" | "reduce_only" | "frozen" | "inactive";

export interface MarketCtx {
  markPx: number;
  indexPx: number;
  lastPx: number;
  bestBid: number; // 0 when unknown
  bestAsk: number;
  changePct24: number; // % change over 24h, e.g. -2.09
  high24: number;
  low24: number;
  volume24: number; // base units
  amount24: number; // quote (USD) notional
  oiUsd: number; // open interest in USD
  funding: number; // current hourly funding rate as a fraction (0.000012 = 0.0012%)
  fundingAt: number; // ms of the last funding payment
}

export interface Market {
  id: number; // Lighter market_id
  symbol: string; // BTC, AAPL
  slug: string; // URL id (same as symbol)
  base: string;
  name: string | null;
  category: MarketCategory;
  pxDecimals: number;
  szDecimals: number;
  quoteTick: number; // 10^-pxDecimals
  baseTick: number; // 10^-szDecimals
  minBase: number;
  minNotional: number;
  maxLeverage: number;
  defaultImf: number; // initial margin fraction in 1/10000 (500 = 5% = 20x)
  minImf: number;
  mmf: number; // maintenance margin fraction, 1/10000
  takerFee: number; // percent, e.g. 0.0000
  makerFee: number;
  status: MarketStatus;
  ctx: MarketCtx | null;
}

export interface MarketUniverse {
  markets: Market[];
  fetchedAt: number;
}

// ---- raw API shapes (checked against api.rh.lighter.xyz, Nov 2026) ----
export interface RawDetail {
  symbol: string;
  market_id: number;
  market_type: string;
  status: string;
  taker_fee: string;
  maker_fee: string;
  min_base_amount: string;
  min_quote_amount: string;
  size_decimals: number;
  price_decimals: number;
  default_initial_margin_fraction: number;
  min_initial_margin_fraction: number;
  maintenance_margin_fraction: number;
  mark_price: string;
  index_price: string;
  last_trade_price: number;
  daily_base_token_volume: number;
  daily_quote_token_volume: number;
  daily_price_low: number;
  daily_price_high: number;
  daily_price_change: number;
  open_interest: number; // base units here (the WS stream sends USD)
  is_frozen?: boolean;
  market_config?: { force_reduce_only?: boolean; hidden?: boolean; trading_hours?: string };
}

/** One entry of the market_stats WebSocket channel. Prices are strings, open interest is USD. */
export interface RawStats {
  symbol: string;
  market_id: number;
  index_price: string;
  mark_price: string;
  last_trade_price: string;
  best_bid_price?: string;
  best_ask_price?: string;
  open_interest: string;
  current_funding_rate: string; // percent per hour
  funding_timestamp: number;
  daily_base_token_volume: number;
  daily_quote_token_volume: number;
  daily_price_low: number;
  daily_price_high: number;
  daily_price_change: number;
}

const STOCKS = new Set([
  "AAPL", "AMZN", "GOOGL", "MSFT", "META", "NVDA", "TSLA", "AMD", "INTC", "MU", "TSM", "ORCL", "PLTR", "COIN", "CRCL", "UBER",
  "MCD", "BABA", "SMCI", "SOFI", "RGTI", "QBTS", "LUNR", "ASTS", "IREN", "CLSK", "WULF", "BMNR", "CRWV", "SNDK", "AMC", "BE",
  "SKHY", "USAR", "SPCX",
]);
const ETFS = new Set(["SPY", "QQQ", "SLV", "SGOV", "SOXL", "USO"]);
const COMMODITIES = new Set(["XAU", "XAG"]);
const PRIVATE = new Set(["OPENAI", "ANTHROPIC", "SHEIN"]);
// Tickers we can't place with confidence stay in "Other" rather than being guessed.
const UNSURE = new Set(["AI"]);

const NAMES: Record<string, string> = {
  AAPL: "Apple", AMZN: "Amazon", GOOGL: "Alphabet", MSFT: "Microsoft", META: "Meta", NVDA: "Nvidia", TSLA: "Tesla",
  AMD: "AMD", INTC: "Intel", MU: "Micron", TSM: "TSMC", ORCL: "Oracle", PLTR: "Palantir", COIN: "Coinbase", CRCL: "Circle",
  UBER: "Uber", MCD: "McDonald's", BABA: "Alibaba", SMCI: "Supermicro", SOFI: "SoFi", RGTI: "Rigetti", QBTS: "D-Wave",
  LUNR: "Intuitive Machines", ASTS: "AST SpaceMobile", CLSK: "CleanSpark", WULF: "TeraWulf", BMNR: "BitMine",
  CRWV: "CoreWeave", SNDK: "Sandisk", BE: "Bloom Energy", SKHY: "SK hynix", USAR: "USA Rare Earth", SPCX: "SpaceX",
  SPY: "S&P 500 ETF", QQQ: "Nasdaq-100 ETF", SLV: "Silver ETF", SGOV: "0-3M T-Bill ETF", SOXL: "Semiconductor 3x ETF",
  USO: "Oil ETF", XAU: "Gold", XAG: "Silver", OPENAI: "OpenAI (pre-IPO)", ANTHROPIC: "Anthropic (pre-IPO)", SHEIN: "Shein (pre-IPO)",
  BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana",
};

export function categorize(symbol: string): MarketCategory {
  const s = symbol.toUpperCase();
  if (UNSURE.has(s)) return "other";
  if (STOCKS.has(s)) return "stock";
  if (ETFS.has(s)) return "etf";
  if (COMMODITIES.has(s)) return "commodity";
  if (PRIVATE.has(s)) return "private";
  return "crypto";
}

export function statusOf(d: Pick<RawDetail, "status" | "is_frozen" | "market_config">): MarketStatus {
  if (d.is_frozen) return "frozen";
  if ((d.status || "").toLowerCase() !== "active") return "inactive";
  if (d.market_config?.force_reduce_only) return "reduce_only";
  return "active";
}

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export function parseDetail(d: RawDetail): Market {
  const markPx = n(d.mark_price);
  const minImf = n(d.min_initial_margin_fraction);
  return {
    id: d.market_id,
    symbol: d.symbol,
    slug: d.symbol,
    base: d.symbol,
    name: NAMES[d.symbol.toUpperCase()] ?? null,
    category: categorize(d.symbol),
    pxDecimals: d.price_decimals,
    szDecimals: d.size_decimals,
    quoteTick: 10 ** -d.price_decimals,
    baseTick: 10 ** -d.size_decimals,
    minBase: n(d.min_base_amount),
    minNotional: n(d.min_quote_amount),
    maxLeverage: minImf > 0 ? Math.floor(10_000 / minImf) : 1,
    defaultImf: n(d.default_initial_margin_fraction),
    minImf,
    mmf: n(d.maintenance_margin_fraction),
    takerFee: n(d.taker_fee),
    makerFee: n(d.maker_fee),
    status: statusOf(d),
    ctx: {
      markPx,
      indexPx: n(d.index_price),
      lastPx: n(d.last_trade_price),
      bestBid: 0,
      bestAsk: 0,
      changePct24: n(d.daily_price_change),
      high24: n(d.daily_price_high),
      low24: n(d.daily_price_low),
      volume24: n(d.daily_base_token_volume),
      amount24: n(d.daily_quote_token_volume),
      oiUsd: n(d.open_interest) * markPx,
      funding: 0, // filled in by the market_stats stream
      fundingAt: 0,
    },
  };
}

export function statsToCtx(s: RawStats, prev: MarketCtx | null): MarketCtx {
  return {
    markPx: n(s.mark_price) || prev?.markPx || 0,
    indexPx: n(s.index_price) || prev?.indexPx || 0,
    lastPx: n(s.last_trade_price) || prev?.lastPx || 0,
    bestBid: n(s.best_bid_price),
    bestAsk: n(s.best_ask_price),
    changePct24: n(s.daily_price_change),
    high24: n(s.daily_price_high),
    low24: n(s.daily_price_low),
    volume24: n(s.daily_base_token_volume),
    amount24: n(s.daily_quote_token_volume),
    oiUsd: n(s.open_interest),
    funding: n(s.current_funding_rate) / 100,
    fundingAt: n(s.funding_timestamp),
  };
}

export function buildUniverse(details: RawDetail[], fetchedAt = Date.now()): MarketUniverse {
  const markets = details
    .filter((d) => d.market_type === "perp" && !d.market_config?.hidden)
    .map(parseDetail)
    .sort((a, b) => a.id - b.id);
  return { markets, fetchedAt };
}

/** Funding is paid every hour on the hour. */
export function nextFundingTime(now = Date.now()) {
  return Math.ceil((now + 1) / 3_600_000) * 3_600_000;
}

/** Leverage for an initial margin fraction in 1/10000 units (500 → 20x). */
export function imfToLeverage(imf: number) {
  return imf > 0 ? Math.floor(10_000 / imf) : 1;
}
/** IMF for a whole-number leverage (20x → 500). Rounds up so the result never exceeds the asked leverage. */
export function leverageToImf(lev: number) {
  return Math.ceil(10_000 / Math.max(1, lev));
}

// ---- integer scaling for signed orders ----
/** Decimal string → scaled integer string (truncates extra digits). "1.2345", 2 → "123". */
export function toScaled(value: string | number, decimals: number): string {
  const s = typeof value === "number" ? value.toFixed(Math.min(20, decimals + 6)) : value.trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return "0";
  const [i = "", f = ""] = s.split(".");
  const digits = (i + f.padEnd(decimals, "0").slice(0, decimals)).replace(/^0+(?=\d)/, "");
  return digits === "" ? "0" : digits;
}
export function fromScaled(v: string | number, decimals: number): number {
  return Number(v) / 10 ** decimals;
}

export const CATEGORY_LABEL: Record<MarketCategory, string> = {
  crypto: "Crypto",
  stock: "Stocks",
  etf: "ETFs",
  commodity: "Commodities",
  private: "Pre-IPO",
  other: "Other",
};

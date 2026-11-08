
export type MarketCategory = "crypto" | "stock" | "index" | "commodity" | "fx" | "other";

const INDEX_SYMBOLS = new Set([
  "SPX", "SP500", "US500", "SPY", "ES",
  "NDX", "NAS100", "US100", "QQQ", "NQ", "NASDAQ",
  "DJI", "DJIA", "US30", "DOW", "YM",
  "RUT", "RUSSELL", "US2000", "IWM", "RTY",
  "JP225", "NIKKEI", "N225", "DAX", "GER40", "DE40", "UK100", "FTSE",
  "HSI", "HK50", "EU50", "STOXX50", "CAC40", "FR40", "KOSPI", "VIX", "XYZ100",
  "USA500", "USTECH", "SMALL2000", "KR200", "NIFTY", "NIFTY50",
]);

const STOCK_SYMBOLS = new Set([
  "AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "GOOGL", "GOOG", "META", "COIN", "MSTR",
  "NFLX", "AMD", "INTC", "PLTR", "HOOD", "ORCL", "AVGO", "CRCL", "BABA", "UBER",
  "SHOP", "PYPL", "DIS", "JPM", "V", "MA", "WMT", "COST", "BA", "IBM", "SMCI", "ARM",
  "TSM", "MU", "SNOW", "CRM", "ADBE", "RIVN", "LCID", "NIO", "GME", "AMC", "SBUX",
  "NKE", "KO", "PEP", "XOM", "CVX", "GS", "MS", "BAC", "C", "SQ", "XYZ", "RBLX", "ABNB",
]);

const COMMODITY_SYMBOLS = new Set([
  "GOLD", "XAU", "SILVER", "XAG", "OIL", "WTI", "BRENT", "CL", "NATGAS", "NG",
  "COPPER", "HG", "PLATINUM", "PALLADIUM", "URANIUM", "CORN", "WHEAT", "SOY",
  "GAS", "USOIL", "BRENTOIL", "ALUMINIUM", "ALUMINUM", "HO",
]);

const FX_SYMBOLS = new Set([
  "EUR", "EURUSD", "GBP", "GBPUSD", "JPY", "USDJPY", "AUD", "CAD", "CHF", "CNH", "DXY", "MXN", "KRW",
]);

export function normalizeCategory(raw: string | undefined): MarketCategory | null {
  if (!raw) return null;
  // Values observed live (Nov 2026): stocks, stock, equity, Equities, preipo, indices,
  // commodities, fx, FX, rates, crypto, Crypto, plus free-form labels on testnet.
  const c = raw.trim().toLowerCase();
  if (c === "indices" || c === "index" || c === "indexes") return "index";
  if (c === "stocks" || c === "stock" || c.startsWith("equit") || c === "preipo" || c === "pre-ipo") return "stock";
  if (c === "commodities" || c === "commodity" || c === "metals" || c === "energy") return "commodity";
  if (c === "fx" || c === "forex" || c === "currencies") return "fx";
  if (c === "crypto") return "crypto";
  return null; // unknown/free-form label → fall back to symbol rules
}

export function classify(
  base: string,
  isHip3: boolean,
  apiCategory: string | undefined,
  canonicalCrypto?: Set<string>,
): MarketCategory {
  const fromApi = normalizeCategory(apiCategory);
  if (fromApi) return fromApi;
  // The canonical Hyperliquid universe (dex "") is crypto.
  if (!isHip3) return "crypto";
  // A HIP-3 listing of a ticker that trades on the canonical dex (e.g. "ignp:BTC") is crypto.
  if (canonicalCrypto?.has(base)) return "crypto";
  const b = base.toUpperCase();
  if (INDEX_SYMBOLS.has(b)) return "index";
  if (STOCK_SYMBOLS.has(b)) return "stock";
  if (COMMODITY_SYMBOLS.has(b)) return "commodity";
  if (FX_SYMBOLS.has(b)) return "fx";
  return "other";
}

export const CATEGORY_LABEL: Record<MarketCategory, string> = {
  crypto: "Crypto",
  stock: "Stocks",
  index: "Indices",
  commodity: "Commodities",
  fx: "FX",
  other: "Other HIP-3",
};

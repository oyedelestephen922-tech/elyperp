import { describe, expect, it } from "vitest";
import { buildUniverse, categorize, decimalsOf, parseSymbol, statusOf, type RawFutures, type RawInfo, type RawRwa } from "../src/lib/orderly/markets";
import { change24, fmtPct, fmtPx } from "../src/lib/format";

// Shapes copied from api.orderly.org responses (Nov 2026), trimmed.
const info = (symbol: string, extra: Partial<RawInfo> = {}): RawInfo => ({
  symbol, quote_tick: 0.1, base_min: 0.00001, base_max: 20, base_tick: 0.00001, min_notional: 10,
  base_imr: 0.01, base_mmr: 0.006, imr_factor: 0.0000002, funding_period: 8, status: "ACTIVE", broker_id: null, ...extra,
});
const fut = (symbol: string, mark: number, open: number): RawFutures => ({
  symbol, index_price: mark, mark_price: mark, est_funding_rate: 0.0001, last_funding_rate: 0.0001, next_funding_time: 1794412800000,
  open_interest: 187.5, "24h_open": open, "24h_close": mark, "24h_high": mark * 1.01, "24h_low": open * 0.99, "24h_volume": 235, "24h_amount": 17335362,
});

describe("symbols", () => {
  it("parses Orderly and builder-listed symbols", () => {
    expect(parseSymbol("PERP_BTC_USDC")).toEqual({ base: "BTC", name: null, builder: null });
    expect(parseSymbol("PERP_AAPL_USDC_mythos", "AAPL", "mythos")).toEqual({ base: "AAPL", name: null, builder: "mythos" });
    expect(parseSymbol("PERP_1000PEPE_USDC")).toEqual({ base: "1000PEPE", name: null, builder: null });
    expect(parseSymbol("PERP_AAPL_USDC_mythos")).toEqual({ base: "AAPL", name: null, builder: "mythos" });
  });

  it("splits descriptions out of display names (live: \"XAU (Gold)\", \"CL (WTI Crude Oil)\")", () => {
    expect(parseSymbol("PERP_XAU_USDC", "XAU (Gold)")).toEqual({ base: "XAU", name: "Gold", builder: null });
    expect(parseSymbol("PERP_CL_USDC", "CL (WTI Crude Oil)")).toEqual({ base: "CL", name: "WTI Crude Oil", builder: null });
  });

  it("derives decimals from ticks", () => {
    expect(decimalsOf(0.1)).toBe(1);
    expect(decimalsOf(0.01)).toBe(2);
    expect(decimalsOf(0.000001)).toBe(6);
    expect(decimalsOf(1e-7)).toBe(7);
    expect(decimalsOf(1)).toBe(0);
    expect(decimalsOf(10)).toBe(0);
  });

  it("maps statuses", () => {
    expect(statusOf("ACTIVE")).toBe("active");
    expect(statusOf("REDUCE_ONLY")).toBe("reduce_only");
    expect(statusOf("POST_ONLY")).toBe("post_only");
    expect(statusOf("DELISTING")).toBe("delisting");
    expect(statusOf(undefined)).toBe("inactive");
  });
});

describe("categories", () => {
  it("uses the RWA trading session first", () => {
    expect(categorize("NVDA", "US_STOCK")).toBe("stock");
    expect(categorize("SPY", "US_STOCK_EXT")).toBe("index");
    expect(categorize("SPX500", "US_FUTURES")).toBe("index");
    expect(categorize("XAU", "US_FUTURES")).toBe("commodity");
    expect(categorize("SPCX", "US_FUTURES")).toBe("other");
    expect(categorize("EURUSD", "FX")).toBe("fx");
  });
  it("falls back to symbol rules, crypto by default", () => {
    expect(categorize("BTC", null)).toBe("crypto");
    // PERP_SPX_USDC on Orderly is the SPX6900 token, not the S&P 500 (that's SPX500)
    expect(categorize("SPX", null)).toBe("crypto");
    expect(categorize("NAS100", null)).toBe("index");
    expect(categorize("XAG", null)).toBe("commodity");
    expect(categorize("USDJPY", null)).toBe("fx");
  });
});

describe("buildUniverse", () => {
  const rwa: RawRwa[] = [
    { symbol: "PERP_NVDA_USDC", status: "open", next_open: null, next_close: 1794434399000, market_session: "US_STOCK" },
    { symbol: "PERP_AAPL_USDC_mythos", status: "close", next_open: 1794438000000, next_close: null, market_session: "US_STOCK_EXT" },
  ];
  const u = buildUniverse(
    [
      info("PERP_BTC_USDC"),
      info("PERP_NVDA_USDC", { quote_tick: 0.01, base_tick: 0.01, base_imr: 0.1 }),
      info("PERP_NVDA_USDC_mythos", { broker_id: "mythos", display_symbol_name: "NVDA" }),
      info("PERP_AAPL_USDC_mythos", { broker_id: "mythos", display_symbol_name: "AAPL" }),
      info("PERP_OLD_USDC", { status: "DELISTING" }),
    ],
    [fut("PERP_BTC_USDC", 73634.4, 74430.2), fut("PERP_NVDA_USDC", 190, 200)],
    rwa,
    1,
  );
  const by = (slug: string) => u.markets.find((m) => m.slug === slug)!;

  it("gives the plain slug to Orderly's listing and suffixes builder copies", () => {
    expect(by("NVDA").symbol).toBe("PERP_NVDA_USDC");
    expect(by("NVDA-mythos").symbol).toBe("PERP_NVDA_USDC_mythos");
    // only one listing of AAPL, so it keeps the plain slug
    expect(by("AAPL").symbol).toBe("PERP_AAPL_USDC_mythos");
    expect(new Set(u.markets.map((m) => m.slug)).size).toBe(u.markets.length);
  });

  it("parses market parameters", () => {
    const n = by("NVDA");
    expect(n.category).toBe("stock");
    expect(n.pxDecimals).toBe(2);
    expect(n.szDecimals).toBe(2);
    expect(n.maxLeverage).toBe(10);
    expect(by("BTC").maxLeverage).toBe(100);
    expect(by("BTC").ctx?.markPx).toBe(73634.4);
    expect(by("OLD").status).toBe("delisting");
    expect(by("NVDA-mythos").ctx).toBeNull();
  });

  it("keeps trading sessions", () => {
    expect(u.sessions["PERP_NVDA_USDC"]).toEqual({ open: true, nextOpen: null, nextClose: 1794434399000, session: "US_STOCK" });
    expect(u.sessions["PERP_AAPL_USDC_mythos"].open).toBe(false);
  });
});

describe("formatting", () => {
  it("formats prices to the market's tick", () => {
    expect(fmtPx(73634.4, 1)).toBe("73,634.4");
    expect(fmtPx(0.01081, 6)).toBe("0.010810");
    expect(fmtPx(null, 2)).toBe("--");
  });
  it("computes 24h change from the rolling open", () => {
    expect(change24({ markPx: 110, open24: 100 })).toBeCloseTo(0.1);
    expect(change24({ markPx: 110, open24: 0 })).toBeNull();
    expect(fmtPct(-0.00001)).toBe("0.00%");
  });
});

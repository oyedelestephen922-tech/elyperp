import { describe, expect, it } from "vitest";
import {
  buildUniverse, categorize, imfToLeverage, leverageToImf, nextFundingTime, parseDetail, statsToCtx, statusOf, toScaled,
  type RawDetail, type RawStats,
} from "../src/lib/lighter/markets";
import { change24, fmtPct, fmtPx, toMs } from "../src/lib/format";
import { leverageFromPct, toPosition } from "../src/lib/lighter/positions";
import { buildEntry, buildExits, worstPrice } from "../src/lib/lighter/actions";

// Shapes copied from api.rh.lighter.xyz responses (Nov 2026), trimmed.
const detail = (symbol: string, id: number, extra: Partial<RawDetail> = {}): RawDetail => ({
  symbol, market_id: id, market_type: "perp", status: "active", taker_fee: "0.0000", maker_fee: "0.0000",
  min_base_amount: "0.00020", min_quote_amount: "10.000000", size_decimals: 5, price_decimals: 1,
  default_initial_margin_fraction: 500, min_initial_margin_fraction: 200, maintenance_margin_fraction: 120,
  mark_price: "73547.9", index_price: "73557.2", last_trade_price: 73544, daily_base_token_volume: 899.6,
  daily_quote_token_volume: 66619048.2, daily_price_low: 73378.2, daily_price_high: 74799.5, daily_price_change: -0.248,
  open_interest: 214.0, is_frozen: false, market_config: { force_reduce_only: false, hidden: false, trading_hours: "" }, ...extra,
});

describe("market list", () => {
  it("parses decimals, limits and leverage", () => {
    const m = parseDetail(detail("BTC", 1));
    expect(m.id).toBe(1);
    expect(m.slug).toBe("BTC");
    expect(m.pxDecimals).toBe(1);
    expect(m.szDecimals).toBe(5);
    expect(m.quoteTick).toBeCloseTo(0.1);
    expect(m.minBase).toBe(0.0002);
    expect(m.minNotional).toBe(10);
    expect(m.maxLeverage).toBe(50); // min IMF 200 = 2%
    expect(m.ctx?.markPx).toBe(73547.9);
    expect(m.ctx?.oiUsd).toBeCloseTo(214 * 73547.9);
  });

  it("keeps perps only, drops hidden markets, sorts by id", () => {
    const u = buildUniverse([
      detail("ETH", 0), detail("SPOTX", 2048, { market_type: "spot" }), detail("HIDDEN", 99, { market_config: { hidden: true } }), detail("AAPL", 10),
    ]);
    expect(u.markets.map((m) => m.symbol)).toEqual(["ETH", "AAPL"]);
  });

  it("categorizes the live listing", () => {
    expect(categorize("BTC")).toBe("crypto");
    expect(categorize("PUMP")).toBe("crypto");
    expect(categorize("NVDA")).toBe("stock");
    expect(categorize("SPCX")).toBe("stock");
    expect(categorize("QQQ")).toBe("etf");
    expect(categorize("XAU")).toBe("commodity");
    expect(categorize("OPENAI")).toBe("private");
    expect(categorize("AI")).toBe("other");
  });

  it("maps status flags", () => {
    expect(statusOf({ status: "active" })).toBe("active");
    expect(statusOf({ status: "active", market_config: { force_reduce_only: true } })).toBe("reduce_only");
    expect(statusOf({ status: "active", is_frozen: true })).toBe("frozen");
    expect(statusOf({ status: "inactive" })).toBe("inactive");
  });

  it("applies live stats (open interest in USD, funding in percent per hour)", () => {
    const s: RawStats = {
      symbol: "BTC", market_id: 1, index_price: "73557.2", mark_price: "73547.9", last_trade_price: "73544.0",
      best_bid_price: "73545.8", best_ask_price: "73554.0", open_interest: "15741181.967854", current_funding_rate: "0.0012",
      funding_timestamp: 1794466800000, daily_base_token_volume: 899.6, daily_quote_token_volume: 66619048.2,
      daily_price_low: 73378.2, daily_price_high: 74799.5, daily_price_change: -0.248,
    };
    const c = statsToCtx(s, null);
    expect(c.oiUsd).toBeCloseTo(15741181.97);
    expect(c.funding).toBeCloseTo(0.000012);
    expect(c.bestAsk).toBe(73554);
    expect(change24(c)).toBeCloseTo(-0.00248);
  });

  it("counts down to the next hourly funding", () => {
    expect(nextFundingTime(Date.UTC(2026, 10, 12, 8, 30))).toBe(Date.UTC(2026, 10, 12, 9, 0));
    expect(nextFundingTime(Date.UTC(2026, 10, 12, 9, 0))).toBe(Date.UTC(2026, 10, 12, 10, 0));
  });
});

describe("scaling", () => {
  it("turns decimal strings into Lighter integers without float error", () => {
    expect(toScaled("73547.9", 1)).toBe("735479");
    expect(toScaled("0.00012", 5)).toBe("12");
    expect(toScaled("1.23456789", 5)).toBe("123456"); // extra digits truncated
    expect(toScaled("0.1", 6)).toBe("100000");
    expect(toScaled("10", 2)).toBe("1000");
    expect(toScaled(".5", 2)).toBe("50");
    expect(toScaled("", 2)).toBe("0");
    expect(toScaled("abc", 2)).toBe("0");
  });

  it("converts leverage and margin fractions", () => {
    expect(imfToLeverage(500)).toBe(20);
    expect(imfToLeverage(666)).toBe(15);
    expect(leverageToImf(20)).toBe(500);
    expect(leverageToImf(3)).toBe(3334); // rounds up: never more leverage than asked
    expect(leverageFromPct("33.33")).toBe(3);
    expect(leverageFromPct("5.00")).toBe(20);
  });

  it("handles every timestamp unit Lighter uses", () => {
    expect(toMs(1794469433536)).toBe(1794469433536);
    expect(toMs(1794469433)).toBe(1794469433000);
    expect(toMs(1794469474315514)).toBe(1794469474315);
    expect(toMs(0)).toBe(0);
  });
});

describe("orders", () => {
  const btc = parseDetail(detail("BTC", 1));

  it("prices market orders at the worst acceptable price, rounded away from the book", () => {
    expect(worstPrice(btc, "buy", 73554.0, 0.01)).toBe("742896"); // 74289.54 → ceil to 74289.6
    expect(worstPrice(btc, "sell", 73545.8, 0.01)).toBe("728103"); // 72810.342 → floor to 72810.3
  });

  it("builds a market entry as IOC with expiry 0", () => {
    const o = buildEntry({ market: btc, side: "buy", kind: "market", size: "0.01", slippage: 0.005, refPrice: 73554 });
    expect(o).toMatchObject({ marketIndex: 1, baseAmount: "1000", isAsk: false, orderType: 1, timeInForce: 0, orderExpiry: 0, triggerPrice: "0", reduceOnly: false });
    expect(o.clientOrderIndex).toBeGreaterThan(0);
    expect(o.clientOrderIndex).toBeLessThan(2 ** 48);
  });

  it("builds limit entries for each time in force", () => {
    const gtt = buildEntry({ market: btc, side: "sell", kind: "limit", size: "0.5", price: "80000", tif: "GTT", slippage: 0, refPrice: 0 });
    expect(gtt).toMatchObject({ price: "800000", isAsk: true, orderType: 0, timeInForce: 1, orderExpiry: -1 });
    const po = buildEntry({ market: btc, side: "buy", kind: "limit", size: "0.5", price: "70000", tif: "POST_ONLY", slippage: 0, refPrice: 0 });
    expect(po).toMatchObject({ timeInForce: 2, orderExpiry: -1 });
    const ioc = buildEntry({ market: btc, side: "buy", kind: "limit", size: "0.5", price: "70000", tif: "IOC", slippage: 0, refPrice: 0 });
    expect(ioc).toMatchObject({ timeInForce: 0, orderExpiry: 0 });
  });

  it("refuses empty sizes and missing prices", () => {
    expect(() => buildEntry({ market: btc, side: "buy", kind: "market", size: "0", slippage: 0.01, refPrice: 1 })).toThrow();
    expect(() => buildEntry({ market: btc, side: "buy", kind: "market", size: "1", slippage: 0.01, refPrice: 0 })).toThrow();
    expect(() => buildEntry({ market: btc, side: "buy", kind: "limit", size: "1", price: "", slippage: 0, refPrice: 0 })).toThrow();
  });

  it("builds TP/SL exits on the closing side, reduce-only, with a fill band past the trigger", () => {
    const [tp, sl] = buildExits(btc, "buy", "80000", "70000");
    expect(tp).toMatchObject({ isAsk: true, orderType: 5, timeInForce: 1, reduceOnly: true, triggerPrice: "800000", baseAmount: "0", orderExpiry: -1 });
    expect(Number(tp.price)).toBeLessThan(800000);
    expect(sl).toMatchObject({ isAsk: true, orderType: 3, triggerPrice: "700000" });
    expect(Number(sl.price)).toBeLessThan(700000);
    const short = buildExits(btc, "sell", "", "76000");
    expect(short).toHaveLength(1);
    expect(short[0]).toMatchObject({ isAsk: false, orderType: 3, triggerPrice: "760000" });
    expect(Number(short[0].price)).toBeGreaterThan(760000);
  });
});

describe("positions", () => {
  it("reads Lighter's position rows (live shape)", () => {
    const p = toPosition({
      market_id: 0, symbol: "ETH", initial_margin_fraction: "33.33", open_order_count: 6, pending_order_count: 0, position_tied_order_count: 0,
      sign: -1, position: "2.5", avg_entry_price: "2053.44", position_value: "5116.77", unrealized_pnl: "-12.5", realized_pnl: "0",
      liquidation_price: "0", margin_mode: 0, allocated_margin: "0",
    })!;
    expect(p.qty).toBe(-2.5);
    expect(p.side).toBe("sell");
    expect(p.leverage).toBe(3);
    expect(p.liq).toBeNull();
    expect(p.margin).toBeCloseTo(5116.77 / 3);
    expect(toPosition({ market_id: 1, symbol: "BTC", sign: 0, position: "0" } as never)).toBeNull();
  });
});

describe("formatting", () => {
  it("formats prices and percentages", () => {
    expect(fmtPx(73547.9, 1)).toBe("73,547.9");
    expect(fmtPct(-0.00248)).toBe("-0.25%");
    expect(fmtPct(0)).toBe("0.00%");
  });
});

import { describe, expect, it } from "vitest";
import {
  checkOrder, estimateLiqPx, walkBook, isValidPrice, marketOrderPx, roundPrice, roundSize, unrealizedPnl, roe,
} from "../src/lib/hl/math";
import { hip3AssetId, statusOf, coinToPath, pathToCoin } from "../src/lib/hl/markets";
import { classify } from "../src/lib/hl/classify";
import { mapStatus } from "../src/lib/hl/trade";

describe("precision", () => {
  it("rounds size down to lot", () => {
    expect(roundSize(0.123456, 3)).toBe("0.123");
    expect(roundSize(1.9999, 0)).toBe("1");
    expect(roundSize(0.0004, 3)).toBe("0");
    expect(roundSize(-1, 2)).toBe("0");
  });
  it("formats price to 5 sig figs / 6-szDecimals decimals", () => {
    expect(roundPrice(97123.456, 5)).toBe("97123");
    expect(roundPrice(1.23456789, 5)).toBe("1.2");
    expect(roundPrice(0.123456, 0)).toBe("0.12345");
  });
  it("validates user prices", () => {
    expect(isValidPrice("97123", 5)).toBe(true);
    expect(isValidPrice("97123.5", 5)).toBe(false);
    expect(isValidPrice("1.2", 5)).toBe(true);
    expect(isValidPrice("1.25", 5)).toBe(false);
    expect(isValidPrice("0", 2)).toBe(false);
  });
  it("applies slippage in the right direction", () => {
    expect(Number(marketOrderPx(100, true, 0.01, 2))).toBeCloseTo(101, 6);
    expect(Number(marketOrderPx(100, false, 0.01, 2))).toBeCloseTo(99, 6);
  });
});

describe("risk math", () => {
  it("estimates long liquidation below entry, short above", () => {
    // 1 BTC at 100k, 10x isolated => margin 10k, maxLev 40 => mmf 1.25%
    const longLiq = estimateLiqPx({ side: "long", entryPx: 100_000, size: 1, margin: 10_000, maxLeverage: 40 })!;
    const shortLiq = estimateLiqPx({ side: "short", entryPx: 100_000, size: 1, margin: 10_000, maxLeverage: 40 })!;
    expect(longLiq).toBeLessThan(100_000);
    expect(shortLiq).toBeGreaterThan(100_000);
    // At liquidation, equity == maintenance margin
    const l = 1 / 80;
    const eqLong = 10_000 + (longLiq - 100_000);
    expect(eqLong).toBeCloseTo(longLiq * l, 4);
    const eqShort = 10_000 - (shortLiq - 100_000);
    expect(eqShort).toBeCloseTo(shortLiq * l, 4);
  });
  it("computes pnl and roe", () => {
    expect(unrealizedPnl("long", 2, 100, 110)).toBe(20);
    expect(unrealizedPnl("short", 2, 100, 110)).toBe(-20);
    expect(roe(20, 100)).toBe(0.2);
  });
});

describe("order checks", () => {
  const base = {
    side: "long" as const, type: "limit" as const, size: 0.01, limitPx: 100000, refPx: 100000,
    leverage: 10, maxLeverage: 40, szDecimals: 5, reduceOnly: false, availableMargin: 1000, marketActive: true,
  };
  it("accepts a valid order", () => {
    const c = checkOrder(base);
    expect(c.errors).toEqual([]);
    expect(c.margin).toBeCloseTo(100);
  });
  it("rejects min notional, leverage, margin, precision, inactive, bad tp/sl", () => {
    expect(checkOrder({ ...base, size: 0.00005 }).errors.join()).toMatch(/Minimum order value/);
    expect(checkOrder({ ...base, leverage: 50 }).errors.join()).toMatch(/Leverage/);
    expect(checkOrder({ ...base, availableMargin: 50 }).errors.join()).toMatch(/Insufficient margin/);
    expect(checkOrder({ ...base, limitPx: 100000.5 }).errors.join()).toMatch(/too many digits/);
    expect(checkOrder({ ...base, marketActive: false }).errors.join()).toMatch(/not currently tradable/);
    expect(checkOrder({ ...base, tpPx: 90000 }).errors.join()).toMatch(/Take-profit must be above/);
    expect(checkOrder({ ...base, slPx: 110000 }).errors.join()).toMatch(/Stop-loss must be below/);
    expect(checkOrder({ ...base, side: "short", tpPx: 90000, slPx: 110000 }).errors).toEqual([]);
  });
});

describe("markets", () => {
  it("computes HIP-3 asset ids", () => {
    expect(hip3AssetId(0, 3)).toBe(3);
    expect(hip3AssetId(1, 0)).toBe(110000);
    expect(hip3AssetId(2, 7)).toBe(120007);
  });
  it("derives status", () => {
    expect(statusOf(true, null)).toBe("delisted");
    expect(statusOf(false, null)).toBe("inactive");
    expect(statusOf(false, { markPx: 1, oraclePx: 1, midPx: 1, prevDayPx: 1, dayNtlVlm: 0, funding: 0, openInterest: 0, premium: 0 })).toBe("active");
  });
  it("classifies with API category first, conservative fallback", () => {
    expect(classify("BTC", false, undefined)).toBe("crypto");
    expect(classify("NVDA", true, undefined)).toBe("stock");
    expect(classify("SPX", true, undefined)).toBe("index");
    expect(classify("FOO", true, undefined)).toBe("other");
    expect(classify("FOO", true, "indices")).toBe("index");
    // labels observed live on Hyperliquid
    expect(classify("OPENAI", true, "preipo")).toBe("stock");
    expect(classify("SAP", true, "Equities")).toBe("stock");
    expect(classify("EUR", true, "FX")).toBe("fx");
    expect(classify("10Y", true, "rates")).toBe("other");
    expect(classify("US500", true, "test")).toBe("index"); // junk label → symbol fallback
    expect(classify("PREMIUM", true, "Goy")).toBe("other");
    expect(classify("BTC", true, undefined, new Set(["BTC"]))).toBe("crypto");
  });
  it("round-trips paths", () => {
    expect(coinToPath("xyz:NVDA")).toBe("/trade/xyz/NVDA");
    expect(pathToCoin(["xyz", "NVDA"])).toBe("xyz:NVDA");
  });
});

describe("exchange status mapping", () => {
  it("never reports success for errors", () => {
    expect(mapStatus({ error: "Insufficient margin" }, "1", "Order").state).toBe("rejected");
    expect(mapStatus({ resting: { oid: 5 } }, "1", "Order")).toMatchObject({ state: "open", oid: 5 });
    expect(mapStatus({ filled: { totalSz: "1", avgPx: "10", oid: 1 } }, "1", "Order").state).toBe("filled");
    expect(mapStatus({ filled: { totalSz: "0.4", avgPx: "10", oid: 1 } }, "1", "Order").state).toBe("partial");
    expect(mapStatus("waitingForTrigger", "1", "SL").state).toBe("open");
  });
});

describe("walkBook", () => {
  const asks = [{ px: 100, sz: 1 }, { px: 101, sz: 1 }, { px: 110, sz: 5 }];
  it("averages across levels", () => {
    expect(walkBook(asks, 2, true)).toEqual({ filled: 2, avgPx: 100.5 });
  });
  it("stops at the slippage cap", () => {
    expect(walkBook(asks, 3, true, 105)).toEqual({ filled: 2, avgPx: 100.5 });
    expect(walkBook(asks, 1, true, 99)).toEqual({ filled: 0, avgPx: null });
  });
  it("works for sells against bids", () => {
    const bids = [{ px: 99, sz: 1 }, { px: 98, sz: 1 }];
    expect(walkBook(bids, 2, false, 98.5)).toEqual({ filled: 1, avgPx: 99 });
  });
});

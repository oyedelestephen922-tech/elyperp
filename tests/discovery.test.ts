import { describe, expect, it } from "vitest";
import { discoverMarkets } from "../src/lib/hl/markets";

const ctx = (px: string) => ({
  markPx: px, midPx: px, oraclePx: px, prevDayPx: px, dayNtlVlm: "1000", funding: "0.0000125",
  openInterest: "10", premium: "0", impactPxs: null, dayBaseVlm: "1",
});

const stubInfo = {
  perpDexs: async () => [null, { name: "xyz", fullName: "XYZ", deployer: "0xabc" }, { name: "flx", fullName: "Felix", deployer: "0xdef" }],
  allPerpMetas: async () => [
    { universe: [{ name: "BTC", szDecimals: 5, maxLeverage: 40 }, { name: "OLD", szDecimals: 0, maxLeverage: 3, isDelisted: true }], collateralToken: 0 },
    { universe: [{ name: "xyz:NVDA", szDecimals: 3, maxLeverage: 10 }, { name: "xyz:SP500", szDecimals: 3, maxLeverage: 20, marginMode: "noCross" }], collateralToken: 0 },
    { universe: [{ name: "flx:BTC", szDecimals: 5, maxLeverage: 10, onlyIsolated: true }], collateralToken: 360 },
  ],
  perpCategories: async () => [["xyz:NVDA", "stocks"], ["xyz:SP500", "indices"]],
  spotMeta: async () => ({ tokens: [{ index: 0, name: "USDC" }, { index: 360, name: "USDH" }] }),
  metaAndAssetCtxs: async () => { throw new Error("should not be called when snapshot works"); },
};

describe("discoverMarkets", () => {
  it("builds the universe from allPerpMetas + one ctx snapshot", async () => {
    const u = await discoverMarkets(stubInfo as never, {
      isTestnet: true,
      ctxSnapshot: async () => new Map([["", [ctx("76000"), ctx("1")]], ["xyz", [ctx("187"), ctx("6800")]], ["flx", [ctx("76010")]]]),
    });
    const by = Object.fromEntries(u.markets.map((m) => [m.coin, m]));
    expect(u.markets).toHaveLength(5);
    expect(by.BTC).toMatchObject({ assetId: 0, category: "crypto", status: "active", collateral: "USDC" });
    expect(by.OLD.status).toBe("delisted");
    expect(by["xyz:NVDA"]).toMatchObject({ assetId: 110000, category: "stock", dex: "xyz", dexFullName: "XYZ" });
    expect(by["xyz:SP500"]).toMatchObject({ assetId: 110001, category: "index", isolatedOnly: true, marginMode: "noCross" });
    expect(by["flx:BTC"]).toMatchObject({ assetId: 120000, category: "crypto", collateral: "USDH", isolatedOnly: true });
    expect(by["xyz:NVDA"].ctx?.markPx).toBe(187);
  });

  it("falls back to canonical-dex HTTP prices if the WS snapshot fails", async () => {
    const info = { ...stubInfo, metaAndAssetCtxs: async () => [{}, [ctx("76000"), ctx("1")]] };
    const u = await discoverMarkets(info as never, { isTestnet: true, ctxSnapshot: async () => { throw new Error("ws down"); } });
    expect(u.markets.find((m) => m.coin === "BTC")?.status).toBe("active");
    expect(u.markets.find((m) => m.coin === "xyz:NVDA")?.status).toBe("inactive"); // no price yet → not tradable
    expect(u.errors.join()).toMatch(/ws down/);
  });
});

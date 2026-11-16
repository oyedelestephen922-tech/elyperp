import { describe, expect, it } from "vitest";
import { agentsiReportUrl, evidenceKind, isEvm, looksLikeAddress, readNdjson, sourceOf, tierInfo, type Report } from "../src/lib/intel/agentsi";
import { compare, snapshotOf } from "../src/lib/intel/history";

// trimmed from a real Agent SI scan of $AGSI on Robinhood Chain (Nov 16, 2026)
const report = (over: Partial<Report> = {}): Report => ({
  address: "0xffe4cc7ee5dfd6734631dfc65c0feef40428d33e",
  chain: "robinhood",
  createdAt: "2026-11-16T15:43:45.420Z",
  token: { name: "AGENTSI", symbol: "AGSI" },
  market: { value: { liquidityUsd: 12752, marketCap: null, fdv: 20661 }, status: "ok", source: "market", fetchedAt: "2026-11-16T15:43:44.405Z" },
  control: { value: { isContract: true, owner: null, ownerKnown: false, functions: [] }, status: "ok", source: "chain-evm", fetchedAt: "2026-11-16T15:43:44.696Z" },
  security: { value: { honeypot: false, buyTaxPct: 0, sellTaxPct: 0, mintable: false, blacklist: false, pausable: false, proxy: false, tradingLimits: false }, status: "ok", source: "security-scan" },
  holders: { value: { top10WalletPct: 28.9 }, status: "ok", source: "si-index" },
  findings: [
    { id: "liquidity", category: "liquidity", severity: "medium", title: "Shallow liquidity", evidence: "$12.75K across 2 pool(s).", source: "market" },
    { id: "proxy", severity: "pass", title: "Not upgradeable", source: "chain-evm" },
  ],
  score: { points: 78, tier: "solid", label: "SOLID", confidence: "verified", checks: { checked: 6, total: 6 } },
  sources: [
    { id: "market", label: "Market data", fetchedAt: "2026-11-16T15:43:44.405Z" },
    { id: "chain-evm", label: "On-chain read", fetchedAt: "2026-11-16T15:43:44.696Z" },
    { id: "si-index", label: "Holder index" },
    { id: "si-memory", label: "SI memory" },
    { id: "risk-registry", label: "Risk registry" },
  ],
  ...over,
});

describe("addresses", () => {
  it("accepts real token address formats and rejects junk", () => {
    expect(looksLikeAddress("0xffe4cc7ee5dfd6734631dfc65c0feef40428d33e")).toBe(true);
    expect(looksLikeAddress("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263")).toBe(true); // Solana
    expect(looksLikeAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")).toBe(true); // Tron
    expect(looksLikeAddress("0x2::sui::SUI")).toBe(true);
    expect(looksLikeAddress("hello")).toBe(false);
    expect(looksLikeAddress("0x123")).toBe(true); // short hex ids exist on Sui/Aptos; Agent SI decides
    expect(looksLikeAddress("0xZZ")).toBe(false);
    expect(looksLikeAddress("not an address at all")).toBe(false);
    expect(isEvm("0xffe4cc7ee5dfd6734631dfc65c0feef40428d33e")).toBe(true);
    expect(isEvm("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263")).toBe(false);
  });

  it("builds Agent SI's documented report URL", () => {
    expect(agentsiReportUrl("robinhood", "0xabc")).toBe("https://agentsi.site/scan/robinhood/0xabc");
  });
});

describe("score and sources", () => {
  it("uses Agent SI's tier, not one derived from points", () => {
    expect(tierInfo("solid").label).toBe("SOLID");
    expect(tierInfo("hazard").label).toBe("HAZARD");
    expect(tierInfo("FORTIFIED").tier).toBe("fortified");
    expect(tierInfo("something-new").label).toBe("SOMETHING-NEW");
  });

  it("maps sources to the documented evidence kinds", () => {
    expect(evidenceKind("Market data (second source)")).toBe("Market data");
    expect(evidenceKind("On-chain read")).toBe("On-chain read");
    expect(evidenceKind("Holder index")).toBe("Holder index");
    expect(evidenceKind("SI memory")).toBe("SI memory");
    expect(evidenceKind("Risk registry")).toBe("Contract record");
    expect(evidenceKind("Security scanner")).toBe("Security scanner"); // shown as Agent SI names it
    expect(sourceOf(report(), "market")).toEqual({ id: "market", label: "Market data", fetchedAt: "2026-11-16T15:43:44.405Z" });
  });
});

describe("history comparison", () => {
  it("reports real changes only", () => {
    const before = snapshotOf(report());
    const after = snapshotOf(report({
      createdAt: "2026-11-17T10:00:00.000Z",
      market: { value: { liquidityUsd: 6000 }, status: "ok", source: "market" },
      security: { value: { mintable: true, pausable: false, proxy: false }, status: "ok", source: "security-scan" },
      findings: [{ id: "mint", severity: "high", title: "Owner can mint", source: "chain-evm" }],
      score: { points: 40, tier: "fragile", label: "FRAGILE" },
    }));
    const c = compare(before, after);
    const labels = c.map((x) => x.label);
    expect(labels).toContain("SI Score");
    expect(labels).toContain("Liquidity");
    expect(labels).toContain("Can mint");
    expect(labels).toContain("New finding");
    expect(labels).toContain("Finding cleared");
    expect(labels).not.toContain("Can pause"); // unchanged
    expect(labels).not.toContain("Blacklist"); // missing in the newer scan: skipped, not guessed
  });

  it("skips fields that weren't read", () => {
    const a = snapshotOf(report({ security: { value: null, status: "unknown", source: "security-scan" } }));
    const b = snapshotOf(report({ createdAt: "2026-11-17T10:00:00.000Z" }));
    expect(compare(a, b).filter((x) => x.label === "Can mint")).toHaveLength(0);
  });
});

describe("streaming", () => {
  it("reads NDJSON split across chunks", async () => {
    const enc = new TextEncoder();
    const chunks = ['{"type":"step","id":"validate","sta', 'tus":"done"}\n{"type":"step","id":"market","status":"running"}\n', '{"type":"report","cached":false,"report":{"address":"0x1","chain":"base","createdAt":"x"}}'];
    const body = new ReadableStream<Uint8Array>({ start(c) { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close(); } });
    const out = [];
    for await (const l of readNdjson(body)) out.push(l);
    expect(out.map((l) => l.type)).toEqual(["step", "step", "report"]);
    expect((out[2] as { cached: boolean }).cached).toBe(false);
  });
});

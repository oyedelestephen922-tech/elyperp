/**
 * Integration test against a real chain (skipped unless REGISTRY_IT=1).
 * Run a Hardhat node with chainId 4663, deploy the registry with publisher = Hardhat account #2, then:
 *   REGISTRY_IT=1 NEXT_PUBLIC_ROBINHOOD_RPC_URL=http://127.0.0.1:8545 NEXT_PUBLIC_INTEL_REGISTRY=0x… \
 *   ELYPERP_PUBLISHER_KEY=<account #2 key> npx vitest run tests/registry.it.test.ts
 */
import { describe, expect, it } from "vitest";

const run = process.env.REGISTRY_IT === "1";

describe.skipIf(!run)("registry publishing (live chain)", () => {
  const report = {
    id: `it_${Date.now()}`,
    chain: "robinhood",
    address: "0xFFE4CC7EE5DFD6734631DFC65C0FEEF40428D33E",
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    token: { name: "AGENTSI", symbol: "AGSI" },
    score: { points: 78, tier: "solid", label: "SOLID" },
  };

  it("publishes a scan, then skips duplicates and older scans", async () => {
    const { publishScan, readRecord } = await import("../src/lib/server/registry");
    const { reportHash } = await import("../src/lib/intel/registry");
    const first = await publishScan(report as never);
    expect(first.status).toBe("sent");
    await new Promise((r) => setTimeout(r, 1500));
    const rec = await readRecord("robinhood", report.address);
    expect(rec.record?.tierName).toBe("SOLID");
    expect(rec.record?.reportHash).toBe(reportHash(report as never));
    expect(rec.record?.scannedAt).toBe(Math.floor(Date.parse(report.createdAt) / 1000));

    expect((await publishScan(report as never)).status).toBe("skipped"); // same scan
    const older = { ...report, id: "older", createdAt: new Date(Date.now() - 3_600_000).toISOString() };
    expect(await publishScan(older as never)).toEqual({ status: "skipped", reason: "already recorded" });
    const newerSameTier = { ...report, id: "newer", createdAt: new Date().toISOString() };
    expect(await publishScan(newerSameTier as never)).toEqual({ status: "skipped", reason: "recorded recently, same tier" });
    const newerTierChange = { ...newerSameTier, id: "newer2", score: { points: 50, tier: "watchlist" } };
    expect((await publishScan(newerTierChange as never)).status).toBe("sent");
    await new Promise((r) => setTimeout(r, 1500));
    expect((await readRecord("robinhood", report.address)).record?.tierName).toBe("WATCHLIST");
  }, 60_000);
});

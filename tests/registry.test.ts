import { describe, expect, it } from "vitest";
import { keccak256, stringToHex } from "viem";
import { registryKeyParts, reportHash, tierCode, TIER_NAMES } from "../src/lib/intel/registry";

const r = {
  id: "rep_123",
  chain: "Robinhood",
  address: "0xFFE4cc7ee5dfd6734631dfc65c0feef40428d33e",
  createdAt: "2026-11-16T15:43:45.420Z",
  score: { points: 78, tier: "solid" },
} as const;

describe("registry encoding", () => {
  it("normalises keys: lowercase chain and EVM address, other chains as written", () => {
    expect(registryKeyParts("Robinhood", "0xFFE4cc7ee5dfd6734631dfc65c0feef40428d33e")).toEqual({ chain: "robinhood", token: "0xffe4cc7ee5dfd6734631dfc65c0feef40428d33e" });
    expect(registryKeyParts("solana", "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263").token).toBe("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263");
  });

  it("hashes the documented recipe", () => {
    const expected = keccak256(stringToHex("agentsi:v1|rep_123|robinhood|0xffe4cc7ee5dfd6734631dfc65c0feef40428d33e|2026-11-16T15:43:45.420Z|78|solid"));
    expect(reportHash(r as never)).toBe(expected);
    expect(reportHash({ ...r, score: { points: 77, tier: "solid" } } as never)).not.toBe(expected);
  });

  it("maps tiers", () => {
    expect(tierCode("solid")).toBe(4);
    expect(tierCode("FORTIFIED")).toBe(5);
    expect(tierCode("hazard")).toBe(1);
    expect(tierCode(undefined)).toBe(0);
    expect(tierCode("other")).toBe(0);
    expect(TIER_NAMES[4]).toBe("SOLID");
  });
});

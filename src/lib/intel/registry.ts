/**
 * Elyperp Intelligence registry on Robinhood Chain (contracts/contracts/ElyperpIntelRegistry.sol).
 * Shared by the server (publishing) and the browser (checking a report against its record).
 */
import { getAddress, isAddress, keccak256, stringToHex, type Hex } from "viem";
import type { Report } from "./agentsi";

const raw = process.env.NEXT_PUBLIC_INTEL_REGISTRY?.trim();
/** Registry address, or null when the contract isn't deployed/configured yet. */
export const REGISTRY_ADDRESS: `0x${string}` | null = raw && isAddress(raw) ? getAddress(raw) : null;

export const TIER_CODES: Record<string, number> = { hazard: 1, fragile: 2, watchlist: 3, solid: 4, fortified: 5 };
export const TIER_NAMES = ["Unknown", "HAZARD", "FRAGILE", "WATCHLIST", "SOLID", "FORTIFIED"] as const;

export function tierCode(tier: string | null | undefined): number {
  return (tier && TIER_CODES[tier.toLowerCase()]) || 0;
}

/** Keys used on-chain: chain id lowercase, EVM addresses lowercase, other chains as written. */
export function registryKeyParts(chain: string, address: string): { chain: string; token: string } {
  const c = chain.trim().toLowerCase();
  const a = address.trim();
  return { chain: c, token: /^0x[0-9a-fA-F]+$/.test(a) ? a.toLowerCase() : a };
}

/**
 * The report hash stored on-chain. Anyone can recompute it from Agent SI's public report
 * (GET https://agentsi.site/api/report/<address>?chain=<chain>):
 *
 *   keccak256(utf8("agentsi:v1|" + id + "|" + chain + "|" + token + "|" + createdAt + "|" + score.points + "|" + score.tier))
 *
 * with chain/token normalised as in registryKeyParts and missing values as empty strings.
 */
export function reportHash(report: Pick<Report, "id" | "chain" | "address" | "createdAt" | "score">): Hex {
  const { chain, token } = registryKeyParts(report.chain, report.address);
  const parts = ["agentsi:v1", report.id ?? "", chain, token, report.createdAt ?? "", report.score?.points ?? "", report.score?.tier ?? ""];
  return keccak256(stringToHex(parts.map(String).join("|")));
}

export const REGISTRY_ABI = [
  {
    type: "function",
    name: "publish",
    stateMutability: "nonpayable",
    inputs: [
      { name: "chain", type: "string" },
      { name: "token", type: "string" },
      { name: "reportHash", type: "bytes32" },
      { name: "tier", type: "uint8" },
      { name: "scannedAt", type: "uint64" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "latest",
    stateMutability: "view",
    inputs: [
      { name: "chain", type: "string" },
      { name: "token", type: "string" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "reportHash", type: "bytes32" },
          { name: "tier", type: "uint8" },
          { name: "scannedAt", type: "uint64" },
          { name: "publishedAt", type: "uint64" },
          { name: "count", type: "uint32" },
        ],
      },
    ],
  },
  { type: "function", name: "isPublisher", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
] as const;

/** What /api/intel/onchain returns. */
export type OnchainRecord = {
  configured: boolean;
  registry: string | null;
  record: { reportHash: Hex; tier: number; tierName: string; scannedAt: number; publishedAt: number; count: number } | null;
  error?: string;
};

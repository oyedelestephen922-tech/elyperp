/**
 * Server only. Publishes Agent SI scan results to the Elyperp Intelligence registry on
 * Robinhood Chain with the publisher key in ELYPERP_PUBLISHER_KEY (never NEXT_PUBLIC_).
 * Does nothing unless both the key and NEXT_PUBLIC_INTEL_REGISTRY are set.
 */
import { createPublicClient, createWalletClient, http, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhood } from "@/lib/config";
import type { Report } from "@/lib/intel/agentsi";
import { REGISTRY_ABI, REGISTRY_ADDRESS, registryKeyParts, reportHash, tierCode, TIER_NAMES, type OnchainRecord } from "@/lib/intel/registry";

/** Don't spend gas re-recording a token more often than this unless its tier changed. */
const MIN_REPUBLISH_MS = 6 * 60 * 60 * 1000;
/** Hard cap on transactions per server instance per hour. */
const MAX_PER_HOUR = 30;
/** Stop publishing (and log) when the publisher holds less ETH than this. */
const MIN_BALANCE = parseEther("0.0005");

const publicClient = createPublicClient({ chain: robinhood, transport: http(undefined, { timeout: 10_000 }) });

function publisherAccount() {
  const k = process.env.ELYPERP_PUBLISHER_KEY?.trim();
  if (!k) return null;
  const hex = (k.startsWith("0x") ? k : `0x${k}`) as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    console.error("[intel-registry] ELYPERP_PUBLISHER_KEY is not a 32-byte hex key; publishing disabled.");
    return null;
  }
  return privateKeyToAccount(hex);
}

export function publishingEnabled(): boolean {
  return !!REGISTRY_ADDRESS && !!process.env.ELYPERP_PUBLISHER_KEY?.trim();
}

const sent: number[] = [];
const inFlight = new Set<string>();

export async function readRecord(chain: string, address: string): Promise<OnchainRecord> {
  if (!REGISTRY_ADDRESS) return { configured: false, registry: null, record: null };
  const p = registryKeyParts(chain, address);
  const r = await publicClient.readContract({ address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "latest", args: [p.chain, p.token] });
  if (!r.count) return { configured: true, registry: REGISTRY_ADDRESS, record: null };
  return {
    configured: true,
    registry: REGISTRY_ADDRESS,
    record: {
      reportHash: r.reportHash,
      tier: r.tier,
      tierName: TIER_NAMES[r.tier] ?? "Unknown",
      scannedAt: Number(r.scannedAt),
      publishedAt: Number(r.publishedAt),
      count: r.count,
    },
  };
}

export type PublishResult = { status: "sent"; tx: Hex } | { status: "skipped"; reason: string } | { status: "failed"; reason: string };

/** Record a scan on-chain if it is newer than what's stored. Never throws. */
export async function publishScan(report: Report): Promise<PublishResult> {
  try {
    if (!REGISTRY_ADDRESS) return { status: "skipped", reason: "registry not configured" };
    const account = publisherAccount();
    if (!account) return { status: "skipped", reason: "publisher key not configured" };
    if (!report?.id || !report.chain || !report.address || !report.createdAt) return { status: "skipped", reason: "incomplete report" };

    const scannedAt = Math.floor(Date.parse(report.createdAt) / 1000);
    if (!Number.isFinite(scannedAt) || scannedAt <= 0) return { status: "skipped", reason: "bad scan time" };
    const { chain, token } = registryKeyParts(report.chain, report.address);
    if (chain.length > 32 || token.length > 130) return { status: "skipped", reason: "chain or token too long" };

    const k = `${chain}|${token}`;
    if (inFlight.has(k)) return { status: "skipped", reason: "already publishing" };
    const now = Date.now();
    while (sent.length && now - sent[0] > 3_600_000) sent.shift();
    if (sent.length >= MAX_PER_HOUR) return { status: "skipped", reason: "hourly cap reached" };

    inFlight.add(k);
    try {
      const tier = tierCode(report.score?.tier);
      const current = await publicClient.readContract({ address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "latest", args: [chain, token] });
      if (current.count > 0) {
        if (Number(current.scannedAt) >= scannedAt) return { status: "skipped", reason: "already recorded" };
        const age = now - Number(current.publishedAt) * 1000;
        if (current.tier === tier && age < MIN_REPUBLISH_MS) return { status: "skipped", reason: "recorded recently, same tier" };
      }

      const balance = await publicClient.getBalance({ address: account.address });
      if (balance < MIN_BALANCE) {
        console.error(`[intel-registry] publisher ${account.address} is low on ETH; not publishing.`);
        return { status: "skipped", reason: "publisher low on gas" };
      }

      const hash = reportHash(report);
      // simulate first so a revert (paused, not a publisher, older scan) costs nothing
      const { request } = await publicClient.simulateContract({
        account,
        address: REGISTRY_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: "publish",
        args: [chain, token, hash, tier, BigInt(scannedAt)],
      });
      const wallet = createWalletClient({ account, chain: robinhood, transport: http(undefined, { timeout: 15_000 }) });
      const tx = await wallet.writeContract(request);
      sent.push(now);
      console.log(`[intel-registry] published ${chain}:${token} tier ${tier} tx ${tx}`);
      return { status: "sent", tx };
    } finally {
      inFlight.delete(k);
    }
  } catch (e) {
    const reason = e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? e.message : String(e);
    console.error(`[intel-registry] publish failed: ${reason}`);
    return { status: "failed", reason };
  }
}

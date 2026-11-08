"use client";
import { ExchangeClient } from "@nktkas/hyperliquid";
import type { WalletClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { HL_NETWORK } from "../config";
import { getHttpTransport, getInfo } from "./clients";


// The wallet signs approveAgent once for a key generated in the browser. That key signs
// orders afterwards. It can trade but cannot withdraw.
const AGENT_NAME = "Elyperp";

export interface StoredAgent {
  privateKey: `0x${string}`;
  address: `0x${string}`;
  approvedAt: number;
}

const key = (user: string) => `elyperp:agent:${HL_NETWORK}:${user.toLowerCase()}`;

export function loadAgent(user: string): StoredAgent | null {
  try {
    const raw = localStorage.getItem(key(user));
    return raw ? (JSON.parse(raw) as StoredAgent) : null;
  } catch {
    return null;
  }
}

export function clearAgent(user: string) {
  try {
    localStorage.removeItem(key(user));
  } catch {
    /* storage unavailable */
  }
}

export async function verifyAgent(user: `0x${string}`, agent: StoredAgent): Promise<boolean> {
  const agents = await getInfo().extraAgents({ user });
  const now = Date.now();
  return agents.some(
    (a) => a.address.toLowerCase() === agent.address.toLowerCase() && (a.validUntil == null || a.validUntil > now),
  );
}

export async function approveNewAgent(user: `0x${string}`, wallet: WalletClient): Promise<StoredAgent> {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const exchange = new ExchangeClient({
    transport: getHttpTransport(),
    // viem WalletClient with an account satisfies the SDK's AbstractViemJsonRpcAccount.
    wallet: wallet as never,
  });
  await exchange.approveAgent({ agentAddress: account.address, agentName: AGENT_NAME });
  const stored: StoredAgent = { privateKey, address: account.address, approvedAt: Date.now() };
  localStorage.setItem(key(user), JSON.stringify(stored));
  return stored;
}

export function agentExchange(agent: StoredAgent) {
  return new ExchangeClient({
    transport: getHttpTransport(),
    wallet: privateKeyToAccount(agent.privateKey),
  });
}

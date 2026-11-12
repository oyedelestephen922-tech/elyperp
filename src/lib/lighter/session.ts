"use client";
import { create } from "zustand";
import type { RawAccount, RawOrder } from "./api";

/**
 * The connected wallet's Lighter state: which account index it owns, the API key
 * this browser signs with, and the latest account snapshot (balances, positions,
 * open orders). Filled in by <LighterSession/>.
 */

export interface StoredKey {
  account: number;
  apiKeyIndex: number;
  privateKey: string; // 40-byte hex, never leaves this browser
  publicKey: string;
}

export type AccountStage =
  | "disconnected"
  | "checking"
  | "no_account" // wallet has never deposited to Lighter
  | "no_key" // account exists, no API key registered from this browser
  | "ready";

interface SessionState {
  address: string | null; // lower-case L1 address
  lookup: "idle" | "loading" | "none" | "found" | "error";
  lookupError: string | null;
  accountIndex: number | null;
  key: StoredKey | null;
  keyStatus: "none" | "checking" | "valid" | "invalid";
  account: RawAccount | null;
  accountAt: number;
  orders: RawOrder[] | null;
  ordersAt: number;
  tier: string | null; // Lighter account tier name, when known
  set: (p: Partial<SessionState>) => void;
  reset: (address: string | null) => void;
}

export const useSession = create<SessionState>((set) => ({
  address: null,
  lookup: "idle",
  lookupError: null,
  accountIndex: null,
  key: null,
  keyStatus: "none",
  account: null,
  accountAt: 0,
  orders: null,
  ordersAt: 0,
  tier: null,
  set: (p) => set(p),
  reset: (address) =>
    set({
      address, lookup: address ? "loading" : "idle", lookupError: null, accountIndex: null, key: null, keyStatus: "none",
      account: null, accountAt: 0, orders: null, ordersAt: 0, tier: null,
    }),
}));

export function stageOf(s: Pick<SessionState, "address" | "lookup" | "keyStatus">): AccountStage {
  if (!s.address) return "disconnected";
  if (s.lookup === "loading" || s.lookup === "idle") return "checking";
  if (s.lookup === "none") return "no_account";
  if (s.lookup === "error") return "checking";
  if (s.keyStatus === "checking") return "checking";
  if (s.keyStatus !== "valid") return "no_key";
  return "ready";
}

export function useAccountStage() {
  const address = useSession((s) => s.address);
  const lookup = useSession((s) => s.lookup);
  const keyStatus = useSession((s) => s.keyStatus);
  const accountIndex = useSession((s) => s.accountIndex);
  return { stage: stageOf({ address, lookup, keyStatus }), accountIndex, address };
}

// ---- API key storage (localStorage, per wallet + account) ----
const keyName = (address: string, account: number) => `elyperp:lighter:key:${address.toLowerCase()}:${account}`;

export function loadStoredKey(address: string, account: number): StoredKey | null {
  try {
    const raw = localStorage.getItem(keyName(address, account));
    if (!raw) return null;
    const k = JSON.parse(raw) as StoredKey;
    if (k.account !== account || !Number.isInteger(k.apiKeyIndex) || !/^[0-9a-f]{80}$/i.test(k.privateKey)) return null;
    return k;
  } catch {
    return null;
  }
}

export function saveStoredKey(address: string, k: StoredKey) {
  try {
    localStorage.setItem(keyName(address, k.account), JSON.stringify(k));
  } catch {
    /* storage blocked: the key only lives for this page load */
  }
}

export function forgetStoredKey(address: string, account: number) {
  try {
    localStorage.removeItem(keyName(address, account));
  } catch {
    /* ignore */
  }
}

/** Last API key index this browser used for an account, so a re-setup overwrites our own slot. */
export function lastKeyIndex(address: string, account: number): number | null {
  try {
    const v = Number(localStorage.getItem(`${keyName(address, account)}:idx`));
    return Number.isInteger(v) && v >= 4 && v <= 254 ? v : null;
  } catch {
    return null;
  }
}
export function rememberKeyIndex(address: string, account: number, idx: number) {
  try {
    localStorage.setItem(`${keyName(address, account)}:idx`, String(idx));
  } catch {
    /* ignore */
  }
}

export function openConnect() {
  window.dispatchEvent(new Event("elyperp:connect"));
}

export function openOnboard() {
  window.dispatchEvent(new Event("elyperp:onboard"));
}

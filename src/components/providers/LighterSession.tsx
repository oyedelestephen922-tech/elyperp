"use client";
import { useEffect } from "react";
import { useConnection } from "wagmi";
import { fetchAccountsByL1, fetchApiKeys } from "@/lib/lighter/api";
import { refreshAccount, refreshOrders, refreshTier } from "@/lib/lighter/actions";
import { loadStoredKey, useSession } from "@/lib/lighter/session";
import { logError } from "@/lib/errors";

/**
 * Keeps useSession in step with the connected wallet:
 * 1. finds the wallet's Lighter account (polls while there is none, so a first deposit shows up),
 * 2. checks whether this browser holds a registered API key for it,
 * 3. polls balances/positions and open orders while connected.
 */
export function LighterSession() {
  const { address, status } = useConnection();
  const addr = status === "connected" && address ? address.toLowerCase() : null;
  const lookup = useSession((s) => s.lookup);
  const accountIndex = useSession((s) => s.accountIndex);
  const keyStatus = useSession((s) => s.keyStatus);

  // 1. wallet → account index
  useEffect(() => {
    const st = useSession.getState();
    if (st.address !== addr) st.reset(addr);
    if (!addr) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const find = async () => {
      try {
        const subs = await fetchAccountsByL1(addr);
        if (cancelled) return;
        if (subs.length) {
          useSession.getState().set({ lookup: "found", accountIndex: subs[0].index, lookupError: null });
          return;
        }
        useSession.getState().set({ lookup: "none", lookupError: null });
      } catch (e) {
        if (cancelled) return;
        logError("account lookup", e);
        useSession.getState().set({ lookup: "error", lookupError: e instanceof Error ? e.message : String(e) });
      }
      // keep looking: a deposit creates the account a little after it confirms on chain
      timer = setTimeout(find, 10_000);
    };
    find();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [addr]);

  // 2. stored API key → still registered on Lighter?
  useEffect(() => {
    if (!addr || lookup !== "found" || accountIndex == null) return;
    let cancelled = false;
    const stored = loadStoredKey(addr, accountIndex);
    if (!stored) {
      useSession.getState().set({ key: null, keyStatus: "none" });
      return;
    }
    useSession.getState().set({ key: stored, keyStatus: "checking" });
    fetchApiKeys(accountIndex)
      .then((keys) => {
        if (cancelled) return;
        const k = keys.find((x) => x.api_key_index === stored.apiKeyIndex);
        const ok = !!k && k.public_key.toLowerCase() === stored.publicKey.toLowerCase();
        useSession.getState().set({ keyStatus: ok ? "valid" : "invalid" });
      })
      .catch((e) => {
        logError("api key check", e);
        // can't tell right now; treat as valid and let Lighter reject if it isn't
        if (!cancelled) useSession.getState().set({ keyStatus: "valid" });
      });
    return () => {
      cancelled = true;
    };
  }, [addr, lookup, accountIndex]);

  // 3. account snapshot every 4s, open orders every 5s, tier once
  useEffect(() => {
    if (accountIndex == null) return;
    const tick = () => refreshAccount().catch((e) => logError("account", e));
    tick();
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, [accountIndex]);

  useEffect(() => {
    if (accountIndex == null || keyStatus !== "valid") return;
    const tick = () => refreshOrders().catch((e) => logError("orders", e));
    tick();
    refreshTier().catch((e) => logError("tier", e));
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [accountIndex, keyStatus]);

  return null;
}

"use client";
import { useEffect, useRef } from "react";
import { useConnection } from "wagmi";
import { getInfo, getSubs } from "@/lib/hl/clients";
import { useAccountStore, type OpenOrderRow } from "@/store/account";
import { useMarkets } from "@/store/markets";
import { useToasts } from "@/store/toasts";
import { logError } from "@/lib/hl/errors";
import { subscriptionScope } from "@/lib/hl/subscribe";

const STATUS_TO_TOAST: Record<string, "filled" | "cancelled" | "rejected"> = {
  filled: "filled",
  canceled: "cancelled",
  marginCanceled: "cancelled",
  reduceOnlyCanceled: "cancelled",
  siblingFilledCanceled: "cancelled",
  delistedCanceled: "cancelled",
  liquidatedCanceled: "cancelled",
  selfTradeCanceled: "cancelled",
  openInterestCapCanceled: "cancelled",
  scheduledCancel: "cancelled",
};

export function AccountSync() {
  const { address } = useConnection();
  const dexNames = useMarkets((s) => s.dexes.map((d) => d.name).join(","));
  const set = useAccountStore((s) => s.set);
  const reset = useAccountStore((s) => s.reset);
  const refreshOrders = useRef<() => void>(() => {});

  useEffect(() => {
    reset(address ?? null);
  }, [address, reset]);

  // HTTP snapshot + polling
  useEffect(() => {
    if (!address) return;
    const dexes = dexNames ? dexNames.split(",") : [""];
    let cancelled = false;
    const info = getInfo();

    const pullStates = async () => {
      try {
        const results = await Promise.allSettled(
          dexes.map((dex) => info.clearinghouseState(dex ? { user: address, dex } : { user: address })),
        );
        if (cancelled) return;
        const states: Record<string, Awaited<ReturnType<typeof info.clearinghouseState>>> = {};
        results.forEach((r, i) => r.status === "fulfilled" && (states[dexes[i]] = r.value));
        const main = states[""];
        const noAccount = !!main && Number(main.marginSummary.accountValue) === 0 && main.assetPositions.length === 0;
        set({ states: { ...useAccountStore.getState().states, ...states }, loaded: true, updatedAt: Date.now(), error: null, noAccount });
      } catch (e) {
        logError("clearinghouseState", e);
        if (!cancelled) set({ error: "Could not refresh account state" });
      }
    };
    const pullOrders = async () => {
      const results = await Promise.allSettled(
        dexes.map((dex) => info.frontendOpenOrders(dex ? { user: address, dex } : { user: address })),
      );
      if (cancelled) return;
      const rows: OpenOrderRow[] = [];
      results.forEach((r, i) => r.status === "fulfilled" && r.value.forEach((o) => rows.push({ ...o, dex: dexes[i] })));
      set({ openOrders: rows.sort((a, b) => b.timestamp - a.timestamp) });
    };
    const pullOnce = async () => {
      const [fills, fees, spot] = await Promise.allSettled([
        info.userFills({ user: address }),
        info.userFees({ user: address }),
        info.spotClearinghouseState({ user: address }),
      ]);
      if (cancelled) return;
      set({
        ...(fills.status === "fulfilled" ? { fills: fills.value.slice(0, 500) } : {}),
        ...(fees.status === "fulfilled" ? { fees: fees.value } : {}),
        ...(spot.status === "fulfilled" ? { spot: spot.value } : {}),
      });
    };
    refreshOrders.current = () => {
      pullOrders().catch((e) => logError("openOrders", e));
      pullStates();
    };
    pullStates();
    pullOrders().catch((e) => logError("openOrders", e));
    pullOnce().catch((e) => logError("account snapshot", e));
    const a = setInterval(pullStates, 12_000);
    const b = setInterval(() => pullOrders().catch(() => {}), 10_000);
    const c = setInterval(() => pullOnce().catch(() => {}), 60_000);
    return () => {
      cancelled = true;
      clearInterval(a);
      clearInterval(b);
      clearInterval(c);
    };
  }, [address, dexNames, set]);

  // Live streams
  useEffect(() => {
    if (!address) return;
    const subs = getSubs();
    const scope = subscriptionScope();
    const keep = scope.add;

    keep(
      subs.allDexsClearinghouseState({ user: address }, (ev) => {
        const states = { ...useAccountStore.getState().states };
        for (const [dex, st] of ev.clearinghouseStates) states[dex] = st;
        set({ states, loaded: true, updatedAt: Date.now(), error: null });
      }),
      "allDexsClearinghouseState",
    );
    keep(
      subs.orderUpdates({ user: address }, (updates) => {
        const toasts = useToasts.getState();
        for (const u of updates) {
          const st = STATUS_TO_TOAST[u.status] ?? (u.status.endsWith("Rejected") ? "rejected" : null);
          if (st) toasts.updateByOid(u.order.oid, { state: st, detail: st === "rejected" ? u.status : undefined });
        }
        refreshOrders.current();
      }),
      "orderUpdates",
    );
    keep(
      subs.userFills({ user: address }, (ev) => {
        if (ev.isSnapshot) return;
        const fills = [...ev.fills, ...useAccountStore.getState().fills].slice(0, 500);
        set({ fills });
      }),
      "userFills",
    );
    return scope.close;
  }, [address, set]);

  return null;
}

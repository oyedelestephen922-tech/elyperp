"use client";
import { useEffect, useState } from "react";
import { useWsStatus as useOrderlyWsStatus, WsNetworkStatus } from "@orderly.network/hooks";
import { STALE_AFTER_MS } from "@/lib/config";
import { useMarkets } from "@/store/markets";

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function useWsStatus(): "open" | "unstable" | "closed" {
  const s = useOrderlyWsStatus();
  return s === WsNetworkStatus.Connected ? "open" : s === WsNetworkStatus.Unstable ? "unstable" : "closed";
}

/** True when no live price update has arrived for a while. */
export function useIsStale() {
  const liveAt = useMarkets((s) => s.liveAt);
  const now = useNow(2000);
  return !liveAt || now - liveAt > STALE_AFTER_MS;
}

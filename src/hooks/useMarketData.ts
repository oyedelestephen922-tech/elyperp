"use client";
import { useEffect, useState } from "react";
import { STALE_AFTER_MS } from "@/lib/config";
import { useWsState } from "@/lib/lighter/ws";
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
  const s = useWsState((x) => x.status);
  return s === "open" ? "open" : s === "connecting" ? "unstable" : "closed";
}

/** True when no live price update has arrived for a while. */
export function useIsStale() {
  const liveAt = useMarkets((s) => s.liveAt);
  const now = useNow(2000);
  return !liveAt || now - liveAt > STALE_AFTER_MS;
}

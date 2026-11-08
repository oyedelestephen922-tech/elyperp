"use client";
import { useEffect, useState } from "react";
import { useConnection } from "wagmi";
import type { ActiveAssetDataResponse } from "@nktkas/hyperliquid/api/info";
import { getInfo, getSubs } from "@/lib/hl/clients";
import { subscriptionScope } from "@/lib/hl/subscribe";
import { logError } from "@/lib/hl/errors";

export function useActiveAsset(coin: string) {
  const { address } = useConnection();
  const [data, setData] = useState<ActiveAssetDataResponse | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setData(null);
    if (!address) return;
    let cancelled = false;
    getInfo().activeAssetData({ user: address, coin }).then((d) => !cancelled && setData(d)).catch((e) => logError("activeAssetData", e));
    const scope = subscriptionScope();
    scope.add(getSubs().activeAssetData({ user: address, coin }, (d) => !cancelled && setData(d as ActiveAssetDataResponse)), `activeAssetData ${coin}`);
    return () => {
      cancelled = true;
      scope.close();
    };
  }, [address, coin, tick]);
  return { data, refresh: () => setTick((t) => t + 1) };
}

"use client";
import { useEffect, useRef } from "react";
import { useChainId, useConnection } from "wagmi";
import { useAccount as useOrderlyAccount } from "@orderly.network/hooks";
import { ChainNamespace } from "@orderly.network/types";
import { TRADING_ENABLED, robinhood } from "@/lib/config";
import { logError } from "@/lib/errors";

/**
 * Hands the wagmi wallet to Orderly's account object, the same way Orderly's own
 * wallet connector does (account.setAddress with the EIP-1193 provider).
 * Orderly then checks for an existing account and trading key on its own.
 */
export function OrderlyWalletBridge() {
  const { address, connector, status } = useConnection();
  const chainId = useChainId();
  const { account } = useOrderlyAccount();
  const linked = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!TRADING_ENABLED) return;
    if (status !== "connected" || !address || !connector) {
      if (linked.current) {
        linked.current = null;
        account.disconnect().catch((e) => logError("orderly disconnect", e));
      }
      return;
    }
    const key = `${address.toLowerCase()}:${chainId}`;
    if (linked.current === key) return;
    (async () => {
      try {
        const provider = await connector.getProvider();
        if (cancelled || !provider) return;
        await account.setAddress(address, {
          provider,
          chain: { id: chainId ?? robinhood.id, namespace: ChainNamespace.evm },
          wallet: { name: connector.name },
        });
        if (!cancelled) linked.current = key;
      } catch (e) {
        logError("orderly setAddress", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, connector, status, chainId, account]);

  return null;
}

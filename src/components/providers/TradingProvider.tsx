"use client";
import type { ExchangeClient } from "@nktkas/hyperliquid";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useConnection, useWalletClient } from "wagmi";
import { agentExchange, approveNewAgent, clearAgent, loadAgent, verifyAgent, type StoredAgent } from "@/lib/hl/agent";
import { humanizeError, logError } from "@/lib/hl/errors";

type AgentStatus = "disconnected" | "checking" | "none" | "ready" | "approving" | "error";

interface TradingCtx {
  status: AgentStatus;
  error: string | null;
  agent: StoredAgent | null;
  exchange: ExchangeClient | null;
  enableTrading: () => Promise<boolean>;
  revoke: () => void;
}

const Ctx = createContext<TradingCtx | null>(null);

export function TradingProvider({ children }: { children: ReactNode }) {
  const { address } = useConnection();
  const { data: walletClient } = useWalletClient();
  const [agent, setAgent] = useState<StoredAgent | null>(null);
  const [status, setStatus] = useState<AgentStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (!address) {
      setAgent(null);
      setStatus("disconnected");
      return;
    }
    const stored = loadAgent(address);
    if (!stored) {
      setAgent(null);
      setStatus("none");
      return;
    }
    setStatus("checking");
    verifyAgent(address, stored)
      .then((ok) => {
        if (cancelled) return;
        if (ok) {
          setAgent(stored);
          setStatus("ready");
        } else {
          clearAgent(address);
          setAgent(null);
          setStatus("none");
        }
      })
      .catch((e) => {
        if (cancelled) return;
        logError("verifyAgent", e);
        // can't confirm it, so treat it as not approved
        setAgent(null);
        setStatus("error");
        setError("Couldn't verify your trading key with Hyperliquid. Check your connection and retry.");
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  const enableTrading = useCallback(async () => {
    if (!address || !walletClient) {
      setError("Connect a wallet first.");
      return false;
    }
    setStatus("approving");
    setError(null);
    try {
      const a = await approveNewAgent(address, walletClient);
      setAgent(a);
      setStatus("ready");
      return true;
    } catch (e) {
      logError("approveAgent", e);
      setError(humanizeError(e));
      setStatus(agent ? "ready" : "none");
      return false;
    }
  }, [address, walletClient, agent]);

  const revoke = useCallback(() => {
    if (address) clearAgent(address);
    setAgent(null);
    setStatus(address ? "none" : "disconnected");
  }, [address]);

  const exchange = useMemo(() => (agent ? agentExchange(agent) : null), [agent]);

  return (
    <Ctx.Provider value={{ status, error, agent, exchange, enableTrading, revoke }}>{children}</Ctx.Provider>
  );
}

export function useTrading() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTrading outside TradingProvider");
  return c;
}

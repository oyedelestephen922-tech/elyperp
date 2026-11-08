"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider, createConfig, http, injected } from "wagmi";
import { arbitrum } from "wagmi/chains";
import { walletConnect } from "@wagmi/connectors/walletConnect";
import { WALLETCONNECT_PROJECT_ID, elysium } from "@/lib/config";
import { MarketSync } from "./MarketSync";
import { AccountSync } from "./AccountSync";
import { TradingProvider } from "./TradingProvider";
import { Toaster } from "@/components/ui/Toaster";

const config = createConfig({
  chains: [elysium, arbitrum],
  multiInjectedProviderDiscovery: true,
  connectors: [
    injected(),
    ...(WALLETCONNECT_PROJECT_ID
      ? [walletConnect({ projectId: WALLETCONNECT_PROJECT_ID, showQrModal: true, metadata: {
          name: "Elyperp", description: "Perpetuals on Hyperliquid for the Elysium ecosystem",
          url: typeof window !== "undefined" ? window.location.origin : "https://elyperp.app", icons: [],
        } })]
      : []),
  ],
  transports: { [elysium.id]: http(), [arbitrum.id]: http() },
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }));
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={qc}>
        <TradingProvider>
          <MarketSync />
          <AccountSync />
          {children}
          <Toaster />
        </TradingProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

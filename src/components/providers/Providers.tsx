"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider, createConfig, http, injected } from "wagmi";
import { walletConnect } from "@wagmi/connectors/walletConnect";
import { OrderlyConfigProvider } from "@orderly.network/hooks";
import { DefaultEVMWalletAdapter } from "@orderly.network/default-evm-adapter";
import { EthersProvider } from "@orderly.network/web3-provider-ethers";
import { BROKER_ID, BROKER_NAME, ORDERLY_NETWORK, WALLETCONNECT_PROJECT_ID, robinhood } from "@/lib/config";
import { MarketSync } from "./MarketSync";
import { OrderlyWalletBridge } from "./OrderlyWalletBridge";
import { Toaster } from "@/components/ui/Toaster";

const config = createConfig({
  chains: [robinhood],
  multiInjectedProviderDiscovery: true,
  connectors: [
    injected(),
    ...(WALLETCONNECT_PROJECT_ID
      ? [walletConnect({ projectId: WALLETCONNECT_PROJECT_ID, showQrModal: true, metadata: {
          name: "Elyperp", description: "Perpetuals on Robinhood Chain",
          url: typeof window !== "undefined" ? window.location.origin : "https://www.elyperp.xyz", icons: [],
        } })]
      : []),
  ],
  transports: { [robinhood.id]: http() },
  ssr: true,
});

// One adapter instance for the app's lifetime.
const walletAdapters = [new DefaultEVMWalletAdapter(new EthersProvider())];

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }));
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={qc}>
        <OrderlyConfigProvider
          // Market data works without a builder ID; account actions stay disabled until one is set.
          brokerId={BROKER_ID || "elyperp_unset"}
          brokerName={BROKER_NAME}
          networkId={ORDERLY_NETWORK}
          walletAdapters={walletAdapters}
        >
          <OrderlyWalletBridge />
          <MarketSync />
          {children}
          <Toaster />
        </OrderlyConfigProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

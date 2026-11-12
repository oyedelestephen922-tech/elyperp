import { createConfig, http, injected } from "wagmi";
import { walletConnect } from "@wagmi/connectors/walletConnect";
import { WALLETCONNECT_PROJECT_ID, robinhood } from "./config";

export const wagmiConfig = createConfig({
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

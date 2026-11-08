import { defineChain, type Chain } from "viem";


export type HlNetwork = "mainnet" | "testnet";

export const HL_NETWORK: HlNetwork =
  process.env.NEXT_PUBLIC_HL_NETWORK === "mainnet" ? "mainnet" : "testnet";

export const IS_TESTNET = HL_NETWORK === "testnet";

export const HL_API_URL = IS_TESTNET
  ? "https://api.hyperliquid-testnet.xyz"
  : "https://api.hyperliquid.xyz";

export const HL_WS_URL = IS_TESTNET
  ? "wss://api.hyperliquid-testnet.xyz/ws"
  : "wss://api.hyperliquid.xyz/ws";

export const HL_APP_URL = IS_TESTNET
  ? "https://app.hyperliquid-testnet.xyz"
  : "https://app.hyperliquid.xyz";

// Kinetiq's Elysium (testnet 99801). viem's built-in elysiumTestnet is a different chain (1338).
const elysiumId = Number(process.env.NEXT_PUBLIC_ELYSIUM_CHAIN_ID || 99801);
const elysiumRpc =
  process.env.NEXT_PUBLIC_ELYSIUM_RPC_URL || "https://testnet-rpc.elysium.kinetiq.xyz";
const elysiumExplorer =
  process.env.NEXT_PUBLIC_ELYSIUM_EXPLORER_URL ||
  "https://explorer-elysium-testnet.t.conduit.xyz";

export const elysium: Chain = defineChain({
  id: elysiumId,
  name: process.env.NEXT_PUBLIC_ELYSIUM_CHAIN_NAME || (elysiumId === 99801 ? "Elysium Testnet" : "Elysium"),
  testnet: elysiumId === 99801,
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: [elysiumRpc] } },
  blockExplorers: { default: { name: "Elysium Explorer", url: elysiumExplorer } },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
});

export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

export const DEFAULT_SLIPPAGE = 0.01;

export const STALE_AFTER_MS = 30_000;

export const LINKS = {
  hyperliquidDeposit: `${HL_APP_URL}/portfolio`,
  hyperliquidDocsBridge: "https://hyperliquid.gitbook.io/hyperliquid-docs/onboarding/how-to-start-trading",
  testnetFaucet: "https://app.hyperliquid-testnet.xyz/drip",
  elysiumDocs: "https://elysium.kinetiq.xyz/docs",
  circleHyperEvmToCore: "https://developers.circle.com/cctp/transfer-usdc-from-hyperevm-to-hypercore",
};

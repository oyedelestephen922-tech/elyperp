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

// Robinhood Chain: Arbitrum Orbit L2 on Ethereum, gas in ETH.
// Mainnet 4663, testnet 46630. Follows the Hyperliquid network unless overridden.
const RH_MAINNET = {
  id: 4663,
  name: "Robinhood Chain",
  rpc: "https://rpc.mainnet.chain.robinhood.com",
  explorer: "https://robinhoodchain.blockscout.com",
};
const RH_TESTNET = {
  id: 46630,
  name: "Robinhood Chain Testnet",
  rpc: "https://rpc.testnet.chain.robinhood.com",
  explorer: "https://explorer.testnet.chain.robinhood.com",
};

const rhDefault = IS_TESTNET ? RH_TESTNET : RH_MAINNET;
const rhId = Number(process.env.NEXT_PUBLIC_ROBINHOOD_CHAIN_ID || rhDefault.id);
const rhBase = rhId === RH_MAINNET.id ? RH_MAINNET : rhId === RH_TESTNET.id ? RH_TESTNET : rhDefault;

export const robinhood: Chain = defineChain({
  id: rhId,
  name: process.env.NEXT_PUBLIC_ROBINHOOD_CHAIN_NAME || rhBase.name,
  testnet: rhId === RH_TESTNET.id,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL || rhBase.rpc] } },
  blockExplorers: {
    default: { name: "Blockscout", url: process.env.NEXT_PUBLIC_ROBINHOOD_EXPLORER_URL || rhBase.explorer },
  },
});

export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

export const DEFAULT_SLIPPAGE = 0.01;

export const STALE_AFTER_MS = 30_000;

export const LINKS = {
  hyperliquidDeposit: `${HL_APP_URL}/portfolio`,
  hyperliquidDocsBridge: "https://hyperliquid.gitbook.io/hyperliquid-docs/onboarding/how-to-start-trading",
  testnetFaucet: "https://app.hyperliquid-testnet.xyz/drip",
  robinhoodDocs: "https://docs.robinhood.com/chain/",
  robinhoodBridging: "https://docs.robinhood.com/chain/bridging/",
  circleHyperEvmToCore: "https://developers.circle.com/cctp/transfer-usdc-from-hyperevm-to-hypercore",
};

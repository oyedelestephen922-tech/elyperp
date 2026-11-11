import { defineChain, type Chain } from "viem";

// Orderly Network (shared order book). Elyperp runs on Orderly mainnet and
// takes deposits from Robinhood Chain.
export const ORDERLY_NETWORK = "mainnet" as const;
export const ORDERLY_API_URL = "https://api.orderly.org";

// Builder ID from Orderly One (https://dex.orderly.network). Market data works
// without it; account creation, deposits and trading need it.
export const BROKER_ID = (process.env.NEXT_PUBLIC_ORDERLY_BROKER_ID || "").trim();
export const BROKER_NAME = "Elyperp";
export const TRADING_ENABLED = BROKER_ID.length > 0;

// Robinhood Chain: Arbitrum Orbit L2 on Ethereum, gas in ETH.
export const robinhood: Chain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

// Collateral Orderly accepts from Robinhood Chain (checked against /v1/public/token).
export const COLLATERAL = {
  symbol: "USDG",
  decimals: 6,
  address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168" as const,
};

export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

export const DEFAULT_SLIPPAGE = 0.01;

export const STALE_AFTER_MS = 30_000;

export const LINKS = {
  orderlyBuilder: "https://dex.orderly.network",
  orderlyDocs: "https://orderly.network/docs",
  robinhoodDocs: "https://docs.robinhood.com/chain/",
  robinhoodBridging: "https://docs.robinhood.com/chain/bridging/",
  explorer: "https://robinhoodchain.blockscout.com",
};

import { defineChain, type Chain } from "viem";

// Lighter's Robinhood Chain instance. Market data, accounts, orders and
// collateral all live here. Values checked against lighter-python's endpoint
// profiles and the live API (Nov 2026).
export const LIGHTER = {
  apiUrl: "https://api.rh.lighter.xyz",
  wsUrl: "wss://api.rh.lighter.xyz/stream",
  // chain id the signer bakes into every Lighter transaction (not the EVM chain id)
  signingChainId: 466324,
  // Lighter's deposit/withdraw contract on Robinhood Chain (proxy)
  contract: "0x94bAB9693Ba2f6358507eFfcbd372b0660AFfF9d" as const,
  appUrl: "https://robinhoodchain.lighter.xyz",
};

// Robinhood Chain: Arbitrum Orbit L2 on Ethereum, gas in ETH.
export const robinhood: Chain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

// Lighter's collateral on Robinhood Chain: USDG, Lighter asset id 3.
export const COLLATERAL = {
  symbol: "USDG",
  decimals: 6,
  address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168" as const,
  assetId: 3,
  minWithdraw: 1,
};

// Optional builder fee. Lighter only lets partner fees apply to accounts on the
// Plus or Premium tiers, and only after the account approves the integrator.
// Fee units: 1,000,000 = 100%, so 25 = 0.0025% (0.25 bps).
const int = (v: string | undefined) => {
  const n = Number((v ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : 0;
};
export const INTEGRATOR = {
  accountIndex: int(process.env.NEXT_PUBLIC_LIGHTER_INTEGRATOR_INDEX),
  takerFee: int(process.env.NEXT_PUBLIC_LIGHTER_INTEGRATOR_TAKER_FEE),
  makerFee: int(process.env.NEXT_PUBLIC_LIGHTER_INTEGRATOR_MAKER_FEE),
};
export const INTEGRATOR_ENABLED = INTEGRATOR.accountIndex > 0 && (INTEGRATOR.takerFee > 0 || INTEGRATOR.makerFee > 0);

export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

export const DEFAULT_SLIPPAGE = 0.01;

export const STALE_AFTER_MS = 30_000;

export const LINKS = {
  lighterApp: "https://robinhoodchain.lighter.xyz",
  lighterDocs: "https://docs.lighter.xyz",
  robinhoodDocs: "https://docs.robinhood.com/chain/",
  robinhoodBridging: "https://docs.robinhood.com/chain/bridging/",
  explorer: "https://robinhoodchain.blockscout.com",
};

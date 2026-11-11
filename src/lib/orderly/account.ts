"use client";
import { useAccount as useOrderlyAccount } from "@orderly.network/hooks";
import { AccountStatusEnum } from "@orderly.network/types";
import { useChainId, useConnection } from "wagmi";
import { TRADING_ENABLED, robinhood } from "@/lib/config";

export type AccountStage =
  | "unavailable" // builder ID not configured yet
  | "disconnected"
  | "checking"
  | "no_account" // wallet has no Orderly account under Elyperp's builder ID
  | "no_key" // account exists, no valid trading key on this device
  | "ready";

export function useAccountStage() {
  const { address, status: walletStatus } = useConnection();
  const chainId = useChainId();
  const { account, state, createAccount, createOrderlyKey } = useOrderlyAccount();
  const onRobinhood = chainId === robinhood.id;

  let stage: AccountStage;
  if (!TRADING_ENABLED) stage = "unavailable";
  else if (walletStatus !== "connected" || !address) stage = "disconnected";
  else if (state.validating || state.status <= AccountStatusEnum.Connected) stage = "checking";
  else if (state.status === AccountStatusEnum.NotSignedIn) stage = "no_account";
  else if (state.status < AccountStatusEnum.EnableTrading) stage = "no_key";
  else stage = "ready";

  return { stage, account, state, address, chainId, onRobinhood, createAccount, createOrderlyKey };
}

export function openConnect() {
  window.dispatchEvent(new Event("elyperp:connect"));
}

export function openOnboard() {
  window.dispatchEvent(new Event("elyperp:onboard"));
}

"use client";
import { erc20Abi, parseUnits } from "viem";
import { readContract, signMessage, switchChain, getChainId, waitForTransactionReceipt, writeContract } from "@wagmi/core";
import { COLLATERAL, INTEGRATOR, INTEGRATOR_ENABLED, LIGHTER, robinhood } from "../config";
import { wagmiConfig } from "../wagmi";
import {
  LighterError, fetchAccount, fetchAccountLimits, fetchActiveOrders, fetchApiKeys, fetchNextNonce, sendTx,
} from "./api";
import { leverageToImf, toScaled, type Market } from "./markets";
import {
  EXPIRY_28D, EXPIRY_IOC, GROUPING, ORDER_TYPE, TIF, approveIntegratorMessage, createApiKey, createAuthToken, installApiKey,
  signApproveIntegrator, signCancelOrder, signChangePubKey, signCreateOrder, signGroupedOrders, signUpdateLeverage, signWithdraw,
  type IntegratorArgs, type OrderArgs, type SignedTx,
} from "./signer";
import { lastKeyIndex, rememberKeyIndex, saveStoredKey, useSession, type StoredKey } from "./session";

// API key slots 0-3 belong to Lighter's own web and mobile apps; 157 is reserved on this instance.
const RESERVED_KEY_INDEXES = new Set([157]);
const MIN_KEY_INDEX = 4;
const MAX_KEY_INDEX = 254;
const EMPTY_PUBKEY = /^0*$/;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function requireKey(): StoredKey {
  const { key, keyStatus } = useSession.getState();
  if (!key || keyStatus !== "valid") throw new Error("Trading isn't enabled in this browser yet. Open Account setup.");
  return key;
}

// ---- signer client install (once per key per page load) ----
const installed = new Set<string>();
async function ensureClient(k: StoredKey) {
  const id = `${k.account}:${k.apiKeyIndex}:${k.publicKey}`;
  if (installed.has(id)) return;
  const pk = await installApiKey(k.account, k.apiKeyIndex, k.privateKey);
  if (pk.toLowerCase() !== k.publicKey.toLowerCase()) throw new Error("Stored trading key is damaged. Set up trading again.");
  installed.add(id);
}

// ---- nonces: one tx at a time, never reusing a nonce ----
let txQueue: Promise<unknown> = Promise.resolve();
const lastNonce = new Map<string, number>();

function isNonceError(e: unknown) {
  return e instanceof LighterError && /nonce/i.test(e.message);
}

/** Sign and send one transaction with the next nonce for this key. Retries once on a nonce mismatch. */
function submit(build: (k: StoredKey, nonce: number) => Promise<SignedTx>): Promise<string> {
  const run = async () => {
    const k = requireKey();
    await ensureClient(k);
    const id = `${k.account}:${k.apiKeyIndex}`;
    for (let attempt = 0; ; attempt++) {
      const remote = await fetchNextNonce(k.account, k.apiKeyIndex);
      const local = lastNonce.get(id);
      const nonce = attempt === 0 && local != null ? Math.max(remote, local + 1) : remote;
      const tx = await build(k, nonce);
      try {
        const { txHash } = await sendTx(tx.txType, tx.txInfo);
        lastNonce.set(id, nonce);
        return txHash || tx.txHash;
      } catch (e) {
        if (attempt === 0 && isNonceError(e)) {
          lastNonce.delete(id);
          await sleep(400);
          continue;
        }
        throw e;
      }
    }
  };
  const p = txQueue.then(run);
  txQueue = p.catch(() => undefined);
  return p;
}

// ---- auth token for private reads (valid 1h; refreshed 10 min early) ----
let authCache: { id: string; token: string; until: number } | null = null;
export async function getAuth(): Promise<string> {
  const k = requireKey();
  const id = `${k.account}:${k.apiKeyIndex}:${k.publicKey}`;
  if (authCache && authCache.id === id && authCache.until - Date.now() > 10 * 60_000) return authCache.token;
  await ensureClient(k);
  const { token, deadline } = await createAuthToken(k.account, k.apiKeyIndex);
  authCache = { id, token, until: deadline };
  return token;
}

// ---- refresh helpers ----
export async function refreshAccount() {
  const { accountIndex } = useSession.getState();
  if (accountIndex == null) return;
  const account = await fetchAccount(accountIndex);
  if (useSession.getState().accountIndex === accountIndex) useSession.getState().set({ account, accountAt: Date.now() });
}

export async function refreshOrders() {
  const { accountIndex, keyStatus } = useSession.getState();
  if (accountIndex == null || keyStatus !== "valid") return;
  const orders = await fetchActiveOrders(accountIndex, await getAuth());
  if (useSession.getState().accountIndex === accountIndex) useSession.getState().set({ orders, ordersAt: Date.now() });
}

export async function refreshTier() {
  const { accountIndex, keyStatus } = useSession.getState();
  if (accountIndex == null || keyStatus !== "valid") return;
  const l = await fetchAccountLimits(accountIndex, await getAuth());
  useSession.getState().set({ tier: l.user_tier_name || l.user_tier || null });
}

function refreshSoon() {
  for (const d of [600, 2000, 5000]) setTimeout(() => {
    refreshAccount().catch(() => undefined);
    refreshOrders().catch(() => undefined);
  }, d);
}

// ---- wallet helpers ----
async function onRobinhood() {
  if (getChainId(wagmiConfig) !== robinhood.id) await switchChain(wagmiConfig, { chainId: robinhood.id });
}

// ---- account setup ----

/** Pick the API key slot: the one this browser used before, else the lowest unused one. */
async function chooseKeyIndex(address: string, account: number): Promise<number> {
  const prev = lastKeyIndex(address, account);
  if (prev != null) return prev;
  const keys = await fetchApiKeys(account);
  const used = new Set(keys.filter((k) => k.public_key && !EMPTY_PUBKEY.test(k.public_key)).map((k) => k.api_key_index));
  for (let i = MIN_KEY_INDEX; i <= MAX_KEY_INDEX; i++) if (!used.has(i) && !RESERVED_KEY_INDEXES.has(i)) return i;
  throw new Error("Every API key slot on this Lighter account is in use. Remove one in Lighter's app and retry.");
}

/**
 * Register a new API key for this browser. The wallet signs Lighter's
 * "Register Lighter Account" message; the key then signs orders without further prompts.
 */
export async function setupTradingKey(onStep?: (s: string) => void): Promise<void> {
  const { address, accountIndex } = useSession.getState();
  if (!address || accountIndex == null) throw new Error("No Lighter account found for this wallet yet.");
  onStep?.("Preparing key…");
  const apiKeyIndex = await chooseKeyIndex(address, accountIndex);
  const nonce = await fetchNextNonce(accountIndex, apiKeyIndex);
  const { privateKey, publicKey, messageToSign } = await createApiKey(accountIndex, apiKeyIndex, nonce);
  onStep?.("Sign the message in your wallet…");
  const l1Sig = await signMessage(wagmiConfig, { message: messageToSign });
  onStep?.("Registering key with Lighter…");
  const tx = await signChangePubKey(accountIndex, apiKeyIndex, l1Sig, nonce);
  await sendTx(tx.txType, tx.txInfo);
  rememberKeyIndex(address, accountIndex, apiKeyIndex);
  const key: StoredKey = { account: accountIndex, apiKeyIndex, privateKey, publicKey };
  saveStoredKey(address, key);
  installed.add(`${accountIndex}:${apiKeyIndex}:${publicKey}`);
  // Wait until Lighter shows the new key before using it.
  onStep?.("Waiting for Lighter to confirm…");
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const keys = await fetchApiKeys(accountIndex).catch(() => []);
    const k = keys.find((x) => x.api_key_index === apiKeyIndex);
    if (k && k.public_key.toLowerCase() === publicKey.toLowerCase()) {
      useSession.getState().set({ key, keyStatus: "valid" });
      lastNonce.delete(`${accountIndex}:${apiKeyIndex}`);
      refreshSoon();
      refreshTier().catch(() => undefined);
      return;
    }
  }
  throw new Error("Lighter hasn't confirmed the key yet. Wait a minute, then reload the page.");
}

// ---- deposits (on Robinhood Chain, from the wallet) ----

const DEPOSIT_ABI = [{
  type: "function", name: "deposit", stateMutability: "payable",
  inputs: [
    { name: "_to", type: "address" }, { name: "_assetIndex", type: "uint16" },
    { name: "_routeType", type: "uint8" }, { name: "_amount", type: "uint256" },
  ],
  outputs: [],
}] as const;

export async function readUsdg(owner: `0x${string}`) {
  const [balance, allowance] = await Promise.all([
    readContract(wagmiConfig, { chainId: robinhood.id, address: COLLATERAL.address, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
    readContract(wagmiConfig, { chainId: robinhood.id, address: COLLATERAL.address, abi: erc20Abi, functionName: "allowance", args: [owner, LIGHTER.contract] }),
  ]);
  return { balance, allowance };
}

export async function approveUsdg(amount: string) {
  await onRobinhood();
  const value = parseUnits(amount, COLLATERAL.decimals);
  const hash = await writeContract(wagmiConfig, {
    chainId: robinhood.id, address: COLLATERAL.address, abi: erc20Abi, functionName: "approve", args: [LIGHTER.contract, value],
  });
  const r = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: robinhood.id });
  if (r.status !== "success") throw new Error("Approval transaction failed.");
  return hash;
}

/** Deposit USDG into Lighter for `to` (the connected wallet). The first deposit creates the Lighter account. */
export async function depositUsdg(to: `0x${string}`, amount: string) {
  await onRobinhood();
  const value = parseUnits(amount, COLLATERAL.decimals);
  const hash = await writeContract(wagmiConfig, {
    chainId: robinhood.id, address: LIGHTER.contract, abi: DEPOSIT_ABI, functionName: "deposit",
    args: [to, COLLATERAL.assetId, 0, value],
  });
  const r = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: robinhood.id });
  if (r.status !== "success") throw new Error("Deposit transaction failed.");
  return hash;
}

export async function withdrawUsdg(amount: string) {
  const scaled = toScaled(amount, COLLATERAL.decimals);
  if (scaled === "0") throw new Error("Enter an amount.");
  const hash = await submit((k, nonce) => signWithdraw(k.account, k.apiKeyIndex, COLLATERAL.assetId, scaled, nonce));
  refreshSoon();
  return hash;
}

// ---- builder fee (Plus / Premium accounts only) ----

function isStandardTier(tier: string | null) {
  return !tier || /standard/i.test(tier);
}

/** Integrator fields to attach to an order, or null when the fee must not apply. */
let integratorRejected = false;
export function integratorFor(): IntegratorArgs | null {
  if (!INTEGRATOR_ENABLED || integratorRejected) return null;
  const { account, tier } = useSession.getState();
  if (isStandardTier(tier)) return null;
  const a = account?.approved_integrators?.find((x) => x.account_index === INTEGRATOR.accountIndex);
  if (!a) return null;
  if (a.max_perps_taker_fee < INTEGRATOR.takerFee || a.max_perps_maker_fee < INTEGRATOR.makerFee) return null;
  if (a.approval_expiry && a.approval_expiry < Date.now() + 60_000) return null;
  return { accountIndex: INTEGRATOR.accountIndex, takerFee: INTEGRATOR.takerFee, makerFee: INTEGRATOR.makerFee };
}

export function canApproveIntegrator() {
  return INTEGRATOR_ENABLED && !isStandardTier(useSession.getState().tier);
}

export async function approveIntegrator(): Promise<string> {
  if (!INTEGRATOR_ENABLED) throw new Error("No builder fee is configured.");
  const expiry = Date.now() + 180 * 24 * 3600_000;
  return submit(async (k, nonce) => {
    const body = await approveIntegratorMessage(k.account, k.apiKeyIndex, nonce, INTEGRATOR.accountIndex, INTEGRATOR.takerFee, INTEGRATOR.makerFee, expiry);
    const l1Sig = await signMessage(wagmiConfig, { message: body });
    return signApproveIntegrator(k.account, k.apiKeyIndex, l1Sig, nonce, INTEGRATOR.accountIndex, INTEGRATOR.takerFee, INTEGRATOR.makerFee, expiry);
  }).then((h) => {
    refreshSoon();
    return h;
  });
}

// ---- orders ----

export type Side = "buy" | "sell";
export type Tif = "GTT" | "IOC" | "POST_ONLY";

export interface PlaceOrder {
  market: Market;
  side: Side;
  kind: "market" | "limit";
  size: string; // base units, decimal string
  price?: string; // limit price
  tif?: Tif;
  reduceOnly?: boolean;
  slippage: number; // fraction for market orders
  refPrice: number; // best ask (buy) / best bid (sell) or mark, for market orders
  tp?: string; // trigger price
  sl?: string;
}

/** Worst acceptable price for an aggressive order, rounded to the tick away from the book. */
export function worstPrice(market: Market, side: Side, ref: number, slippage: number) {
  const raw = side === "buy" ? ref * (1 + slippage) : ref * (1 - slippage);
  const scale = 10 ** market.pxDecimals;
  const ticks = side === "buy" ? Math.ceil(raw * scale - 1e-9) : Math.floor(raw * scale + 1e-9);
  return String(Math.max(1, ticks));
}

/** Limit price for a TP/SL child: a band past the trigger so it fills when the trigger hits. */
function exitLimit(market: Market, closingSide: Side, trigger: number, band = 0.03) {
  return worstPrice(market, closingSide, trigger, band);
}

let lastCoi = 0;
function clientOrderIndex() {
  // unique, non-zero, < 2^48
  lastCoi = Math.max(lastCoi + 1, Date.now());
  return lastCoi;
}

export function buildEntry(o: PlaceOrder): OrderArgs {
  const { market } = o;
  const base = toScaled(o.size, market.szDecimals);
  if (base === "0") throw new Error("Enter a size.");
  if (o.kind === "market") {
    if (!(o.refPrice > 0)) throw new Error("No price available for this market right now.");
    return {
      marketIndex: market.id, clientOrderIndex: clientOrderIndex(), baseAmount: base,
      price: worstPrice(market, o.side, o.refPrice, o.slippage), isAsk: o.side === "sell",
      orderType: ORDER_TYPE.MARKET, timeInForce: TIF.IOC, reduceOnly: !!o.reduceOnly, triggerPrice: "0", orderExpiry: EXPIRY_IOC,
    };
  }
  const px = toScaled(o.price ?? "", market.pxDecimals);
  if (px === "0") throw new Error("Enter a limit price.");
  const tif = o.tif ?? "GTT";
  return {
    marketIndex: market.id, clientOrderIndex: clientOrderIndex(), baseAmount: base, price: px, isAsk: o.side === "sell",
    orderType: ORDER_TYPE.LIMIT, timeInForce: tif === "IOC" ? TIF.IOC : tif === "POST_ONLY" ? TIF.POST_ONLY : TIF.GTT,
    reduceOnly: !!o.reduceOnly, triggerPrice: "0", orderExpiry: tif === "IOC" ? EXPIRY_IOC : EXPIRY_28D,
  };
}

/** TP/SL children for an entry (or an existing position). Size 0 = sized to the filled entry / whole position. */
export function buildExits(market: Market, positionSide: Side, tp?: string, sl?: string, size = "0"): OrderArgs[] {
  const closing: Side = positionSide === "buy" ? "sell" : "buy";
  const out: OrderArgs[] = [];
  const add = (trigger: string, type: number) => {
    const t = Number(trigger);
    if (!(t > 0)) return;
    out.push({
      marketIndex: market.id, clientOrderIndex: 0, baseAmount: size, price: exitLimit(market, closing, t), isAsk: closing === "sell",
      orderType: type, timeInForce: TIF.GTT, reduceOnly: true, triggerPrice: toScaled(trigger, market.pxDecimals), orderExpiry: EXPIRY_28D,
    });
  };
  add(tp ?? "", ORDER_TYPE.TAKE_PROFIT_LIMIT);
  add(sl ?? "", ORDER_TYPE.STOP_LOSS_LIMIT);
  return out;
}

export async function placeOrder(o: PlaceOrder): Promise<string> {
  const entry = buildEntry(o);
  const exits = o.reduceOnly ? [] : buildExits(o.market, o.side, o.tp, o.sl);
  const send = (integrator: IntegratorArgs | null) => {
    if (exits.length) {
      // Grouped orders carry TP/SL that activate once the entry fills. An IOC limit stands in for a market entry.
      const primary: OrderArgs = entry.orderType === ORDER_TYPE.MARKET ? { ...entry, orderType: ORDER_TYPE.LIMIT } : entry;
      const grouping = exits.length === 2 ? GROUPING.OTOCO : GROUPING.OTO;
      return submit((k, nonce) => signGroupedOrders(k.account, k.apiKeyIndex, grouping, [primary, ...exits], nonce, integrator));
    }
    return submit((k, nonce) => signCreateOrder(k.account, k.apiKeyIndex, entry, nonce, integrator));
  };
  const integrator = integratorFor();
  let hash: string;
  try {
    hash = await send(integrator);
  } catch (e) {
    // If Lighter refuses the builder fee (tier changed, approval revoked), place the order without it.
    if (!integrator || !(e instanceof LighterError) || !/integrator|partner/i.test(e.message)) throw e;
    integratorRejected = true;
    hash = await send(null);
  }
  refreshSoon();
  return hash;
}

/** Reduce-only close of `size` (base units) at market, or at a limit price. */
export async function closePosition(market: Market, positionSide: Side, size: string, refPrice: number, slippage: number, limitPx?: string) {
  return placeOrder({
    market, side: positionSide === "buy" ? "sell" : "buy", kind: limitPx ? "limit" : "market", size, price: limitPx,
    reduceOnly: true, slippage, refPrice,
  });
}

/** TP/SL on an open position. Both: an OCO pair tied to the whole position. One: a reduce-only trigger for the current size. */
export async function setPositionTpsl(market: Market, positionSide: Side, positionSize: string, tp?: string, sl?: string) {
  const both = Number(tp) > 0 && Number(sl) > 0;
  const exits = buildExits(market, positionSide, tp, sl, both ? "0" : toScaled(positionSize, market.szDecimals));
  if (!exits.length) throw new Error("Enter a take-profit or stop-loss price.");
  const hash = both
    ? await submit((k, nonce) => signGroupedOrders(k.account, k.apiKeyIndex, GROUPING.OCO, exits, nonce, null))
    : await submit((k, nonce) => signCreateOrder(k.account, k.apiKeyIndex, exits[0], nonce, null));
  refreshSoon();
  return hash;
}

export async function cancelOrder(marketId: number, orderIndex: number | string) {
  const hash = await submit((k, nonce) => signCancelOrder(k.account, k.apiKeyIndex, marketId, String(orderIndex), nonce));
  refreshSoon();
  return hash;
}

export async function updateLeverage(market: Market, leverage: number, isolated: boolean) {
  const imf = Math.max(market.minImf, leverageToImf(leverage));
  const hash = await submit((k, nonce) => signUpdateLeverage(k.account, k.apiKeyIndex, market.id, imf, isolated ? 1 : 0, nonce));
  refreshSoon();
  return hash;
}

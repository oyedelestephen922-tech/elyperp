"use client";
import { LIGHTER } from "../config";

/**
 * Lighter's official browser signer (lighter-go/web-wasm, protocol 2, built with
 * Go 1.26.8). Each exported global returns either a Promise or a function that
 * returns one; calls are queued one at a time, the same way Lighter's own wasm
 * host page does it.
 */

declare global {
  interface Window {
    Go?: new () => { importObject: WebAssembly.Imports; run(instance: WebAssembly.Instance): Promise<void> };
    _signerVersion?: number;
  }
}

type AnyFn = (...args: unknown[]) => unknown;
export type SignedTx = { txType: number; txInfo: string; txHash: string };

let ready: Promise<void> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (window.Go) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load the Lighter signer runtime."));
    document.head.appendChild(s);
  });
}

export function loadSigner(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    await loadScript("/lighter/wasm_exec.js");
    if (!window.Go) throw new Error("Lighter signer runtime missing.");
    const go = new window.Go();
    const res = await fetch("/lighter/signer.wasm");
    if (!res.ok) throw new Error(`Couldn't download the Lighter signer (${res.status}).`);
    const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), go.importObject);
    void go.run(instance).catch(() => {
      ready = null; // signer exited; reload on next use
    });
    if (window._signerVersion !== 2) throw new Error("Unsupported Lighter signer version.");
  })();
  ready.catch(() => (ready = null));
  return ready;
}

async function rawCall<T>(name: string, ...args: unknown[]): Promise<T> {
  await loadSigner();
  const fn = (window as unknown as Record<string, AnyFn | undefined>)[name];
  if (typeof fn !== "function") throw new Error(`Signer function ${name} is missing.`);
  const first = await fn(...args);
  const result = (typeof first === "function" ? await (first as AnyFn)() : first) as T & { error?: string };
  if (result && typeof result === "object" && "error" in result && result.error) throw new Error(String(result.error));
  return result;
}

/** Run signer calls strictly one after another. */
function call<T>(name: string, ...args: unknown[]): Promise<T> {
  const p = queue.then(() => rawCall<T>(name, ...args));
  queue = p.catch(() => undefined);
  return p;
}

/** Select which installed client (account + api key) the next calls use, then run them. */
function withClient<T>(account: number, apiKeyIndex: number, name: string, ...args: unknown[]): Promise<T> {
  const p = queue.then(async () => {
    await rawCall("_selectClient", account, LIGHTER.signingChainId, apiKeyIndex);
    return rawCall<T>(name, ...args);
  });
  queue = p.catch(() => undefined);
  return p;
}

function asTx(r: { txType?: number; txInfo?: string; txHash?: string }, fallbackType: number): SignedTx {
  if (!r?.txInfo) throw new Error("Signer returned no transaction.");
  return { txType: r.txType ?? fallbackType, txInfo: r.txInfo, txHash: r.txHash ?? "" };
}

// ---- tx type ids (lighter-go/types/txtypes) ----
export const TX = {
  CHANGE_PUB_KEY: 8,
  WITHDRAW: 13,
  CREATE_ORDER: 14,
  CANCEL_ORDER: 15,
  CANCEL_ALL: 16,
  UPDATE_LEVERAGE: 20,
  CREATE_GROUPED_ORDERS: 28,
  APPROVE_INTEGRATOR: 45,
} as const;

export const ORDER_TYPE = { LIMIT: 0, MARKET: 1, STOP_LOSS: 2, STOP_LOSS_LIMIT: 3, TAKE_PROFIT: 4, TAKE_PROFIT_LIMIT: 5 } as const;
export const TIF = { IOC: 0, GTT: 1, POST_ONLY: 2 } as const;
export const GROUPING = { OTO: 1, OCO: 2, OTOCO: 3 } as const;
export const MARGIN_MODE = { CROSS: 0, ISOLATED: 1 } as const;
/** Passing -1 makes the signer use now + 28 days. IOC orders take 0. */
export const EXPIRY_28D = -1;
export const EXPIRY_IOC = 0;

// ---- key management ----

/**
 * Create a new API key from a random seed and install it as the signing client.
 * Returns the key pair and the message the wallet must sign (personal_sign) to register it.
 */
export async function createApiKey(account: number, apiKeyIndex: number, nonce: number) {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const seedHex = Array.from(seed, (b) => b.toString(16).padStart(2, "0")).join("");
  const r = await call<{ pk: string; prv: string; body: string }>("_createClient", seedHex, LIGHTER.signingChainId, account, nonce, apiKeyIndex);
  if (!r.prv || !r.pk || !r.body) throw new Error("Signer couldn't create an API key.");
  return { privateKey: r.prv, publicKey: r.pk, messageToSign: r.body };
}

/** Install an existing API key (from this browser's storage) as the signing client. Returns its public key. */
export async function installApiKey(account: number, apiKeyIndex: number, privateKey: string) {
  const r = await call<{ pk: string }>("_createClientByPrv", privateKey, LIGHTER.signingChainId, account, 0, apiKeyIndex);
  return r.pk;
}

export async function signChangePubKey(account: number, apiKeyIndex: number, l1Signature: string, nonce: number) {
  return asTx(await withClient(account, apiKeyIndex, "_signChangePubKey", account, l1Signature, nonce, apiKeyIndex), TX.CHANGE_PUB_KEY);
}

export async function createAuthToken(account: number, apiKeyIndex: number): Promise<{ token: string; deadline: number }> {
  const r = await withClient<{ token: string; deadline: number }>(account, apiKeyIndex, "_createAuthToken", account, apiKeyIndex);
  return { token: r.token, deadline: Number(r.deadline) * 1000 };
}

// ---- trading ----

export interface OrderArgs {
  marketIndex: number;
  clientOrderIndex: number;
  baseAmount: string; // scaled integer
  price: string; // scaled integer (worst acceptable price for market orders)
  isAsk: boolean;
  orderType: number;
  timeInForce: number;
  reduceOnly: boolean;
  triggerPrice: string; // scaled integer, "0" when unused
  orderExpiry: number;
}
export interface IntegratorArgs { accountIndex: number; takerFee: number; makerFee: number }

const orderParams = (o: OrderArgs) => [
  o.marketIndex, o.clientOrderIndex, o.baseAmount, o.price, o.isAsk ? 1 : 0, o.orderType, o.timeInForce,
  o.reduceOnly ? 1 : 0, o.triggerPrice, o.orderExpiry,
];
const integratorParams = (i?: IntegratorArgs | null) => (i ? [i.accountIndex, i.takerFee, i.makerFee] : []);

export async function signCreateOrder(account: number, apiKeyIndex: number, o: OrderArgs, nonce: number, integrator?: IntegratorArgs | null) {
  return asTx(await withClient(account, apiKeyIndex, "_signCreateOrder", account, ...orderParams(o), nonce, ...integratorParams(integrator)), TX.CREATE_ORDER);
}

export async function signGroupedOrders(account: number, apiKeyIndex: number, grouping: number, orders: OrderArgs[], nonce: number, integrator?: IntegratorArgs | null) {
  const flat = orders.flatMap(orderParams);
  return asTx(
    await withClient(account, apiKeyIndex, "_signCreateGroupedOrders", account, grouping, orders.length, ...flat, nonce, ...integratorParams(integrator)),
    TX.CREATE_GROUPED_ORDERS,
  );
}

export async function signCancelOrder(account: number, apiKeyIndex: number, marketIndex: number, orderIndex: string, nonce: number) {
  return asTx(await withClient(account, apiKeyIndex, "_signCancelOrder", account, marketIndex, orderIndex, nonce), TX.CANCEL_ORDER);
}

export async function signUpdateLeverage(account: number, apiKeyIndex: number, marketIndex: number, imf: number, marginMode: number, nonce: number) {
  return asTx(await withClient(account, apiKeyIndex, "_signUpdateLeverage", account, marketIndex, imf, marginMode, nonce), TX.UPDATE_LEVERAGE);
}

/** Withdraw always pays out to the account's own L1 address. Amount is a scaled integer string. */
export async function signWithdraw(account: number, apiKeyIndex: number, assetIndex: number, amount: string, nonce: number) {
  return asTx(await withClient(account, apiKeyIndex, "_signWithdraw", account, assetIndex, 0, amount, nonce), TX.WITHDRAW);
}

export async function approveIntegratorMessage(account: number, apiKeyIndex: number, nonce: number, integrator: number, maxTaker: number, maxMaker: number, expiryMs: number) {
  const r = await withClient<{ body: string }>(account, apiKeyIndex, "_getApproveIntegratorTransaction", account, nonce, apiKeyIndex, integrator, maxTaker, maxMaker, 0, 0, expiryMs);
  if (!r.body) throw new Error("Signer returned no approval message.");
  return r.body;
}

export async function signApproveIntegrator(account: number, apiKeyIndex: number, l1Signature: string, nonce: number, integrator: number, maxTaker: number, maxMaker: number, expiryMs: number) {
  return asTx(
    await withClient(account, apiKeyIndex, "_signApproveIntegrator", account, l1Signature, nonce, apiKeyIndex, integrator, maxTaker, maxMaker, 0, 0, expiryMs),
    TX.APPROVE_INTEGRATOR,
  );
}

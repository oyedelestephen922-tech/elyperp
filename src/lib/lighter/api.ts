import { LIGHTER } from "../config";
import type { RawDetail } from "./markets";

export class LighterError extends Error {
  code: number | null;
  constructor(message: string, code: number | null = null) {
    super(message);
    this.code = code;
  }
}

type Resp = { code?: number; message?: string };

/** GET from Lighter's REST API. Lighter answers HTTP 200 with a `code` field; 200 means success. */
export async function lighterGet<T extends Resp>(path: string, params: Record<string, string | number | undefined> = {}, auth?: string): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  const url = `${LIGHTER.apiUrl}${path}${qs.size ? `?${qs}` : ""}`;
  const r = await fetch(url, {
    cache: "no-store",
    headers: auth ? { Authorization: auth } : undefined,
    signal: AbortSignal.timeout(12_000),
  });
  let j: T;
  try {
    j = (await r.json()) as T;
  } catch {
    throw new LighterError(`${path} returned HTTP ${r.status}`);
  }
  if (j.code !== undefined && j.code !== 200) throw new LighterError(j.message || `${path} failed (${j.code})`, j.code);
  if (!r.ok) throw new LighterError(j.message || `${path} returned HTTP ${r.status}`);
  return j;
}

export interface SendTxResult {
  txHash: string;
}

/**
 * Submit a signed transaction. Must run in the user's browser: Lighter checks the
 * caller's IP against its restricted regions, so this is never proxied through our server.
 */
export async function sendTx(txType: number, txInfo: string): Promise<SendTxResult> {
  const body = new URLSearchParams({ tx_type: String(txType), tx_info: txInfo });
  const r = await fetch(`${LIGHTER.apiUrl}/api/v1/sendTx`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  let j: Resp & { tx_hash?: string };
  try {
    j = await r.json();
  } catch {
    throw new LighterError(`sendTx returned HTTP ${r.status}`);
  }
  if (j.code !== 200) throw new LighterError(j.message || `Transaction rejected (${j.code ?? r.status})`, j.code ?? null);
  return { txHash: j.tx_hash ?? "" };
}

// ---- typed reads ----

export async function fetchDetails(): Promise<RawDetail[]> {
  const j = await lighterGet<Resp & { order_book_details?: RawDetail[] }>("/api/v1/orderBookDetails");
  return j.order_book_details ?? [];
}

export interface RawCandle { t: number; o: number; h: number; l: number; c: number; v: number; V: number }
export const CANDLE_RESOLUTIONS = ["1m", "5m", "15m", "30m", "1h", "4h", "12h", "1d"] as const;
export type CandleResolution = (typeof CANDLE_RESOLUTIONS)[number];

export async function fetchCandles(marketId: number, resolution: CandleResolution, startMs: number, endMs: number, countBack: number): Promise<RawCandle[]> {
  const j = await lighterGet<Resp & { c?: RawCandle[] }>("/api/v1/candles", {
    market_id: marketId, resolution, start_timestamp: Math.floor(startMs), end_timestamp: Math.floor(endMs), count_back: countBack,
  });
  return j.c ?? [];
}

export interface RawSubAccount { index: number; account_type: number; l1_address: string; collateral: string }

/** Lighter account indexes owned by an L1 address. Main account first. Empty when the address never deposited. */
export async function fetchAccountsByL1(address: string): Promise<RawSubAccount[]> {
  try {
    const j = await lighterGet<Resp & { sub_accounts?: RawSubAccount[] }>("/api/v1/accountsByL1Address", { l1_address: address });
    return [...(j.sub_accounts ?? [])].sort((a, b) => a.account_type - b.account_type || a.index - b.index);
  } catch (e) {
    if (e instanceof LighterError && e.code === 21100) return []; // account not found
    throw e;
  }
}

export interface RawPosition {
  market_id: number;
  symbol: string;
  initial_margin_fraction: string; // percent, "33.33"
  open_order_count: number;
  pending_order_count: number;
  position_tied_order_count?: number;
  sign: number; // 1 long, -1 short
  position: string; // absolute size
  avg_entry_price: string;
  position_value: string;
  unrealized_pnl: string;
  realized_pnl: string;
  liquidation_price: string;
  total_funding_paid_out?: string;
  margin_mode: number; // 0 cross, 1 isolated
  allocated_margin: string;
}
export interface RawApprovedIntegrator {
  account_index: number;
  name?: string;
  max_perps_taker_fee: number;
  max_perps_maker_fee: number;
  approval_expiry: number;
}
export interface RawAccount {
  index: number;
  l1_address: string;
  available_balance: string;
  collateral: string;
  total_asset_value: string;
  cross_asset_value?: string;
  cross_initial_margin_requirement?: string;
  cross_maintenance_margin_requirement?: string;
  positions: RawPosition[];
  assets?: { symbol: string; asset_id: number; balance: string; margin_balance?: string }[];
  approved_integrators?: RawApprovedIntegrator[];
}

export async function fetchAccount(index: number): Promise<RawAccount | null> {
  try {
    const j = await lighterGet<Resp & { accounts?: RawAccount[] }>("/api/v1/account", { by: "index", value: index });
    return j.accounts?.[0] ?? null;
  } catch (e) {
    if (e instanceof LighterError && e.code === 21100) return null;
    throw e;
  }
}

export interface RawApiKey { api_key_index: number; public_key: string; nonce: number }
export async function fetchApiKeys(account: number): Promise<RawApiKey[]> {
  const j = await lighterGet<Resp & { api_keys?: RawApiKey[] }>("/api/v1/apikeys", { account_index: account });
  return j.api_keys ?? [];
}

export async function fetchNextNonce(account: number, apiKeyIndex: number): Promise<number> {
  const j = await lighterGet<Resp & { nonce: number }>("/api/v1/nextNonce", { account_index: account, api_key_index: apiKeyIndex });
  return j.nonce;
}

export interface RawOrder {
  order_index: number;
  order_id: string;
  client_order_index: number;
  market_index: number;
  initial_base_amount: string;
  remaining_base_amount: string;
  filled_base_amount: string;
  price: string;
  is_ask: boolean;
  type: string; // limit, market, stop-loss, stop-loss-limit, take-profit, take-profit-limit, twap, …
  time_in_force: string;
  reduce_only: boolean;
  trigger_price: string;
  order_expiry: number;
  status: string;
  trigger_status?: string;
  timestamp: number;
  created_at?: number;
  parent_order_index?: number;
}

export async function fetchActiveOrders(account: number, auth: string): Promise<RawOrder[]> {
  const j = await lighterGet<Resp & { orders?: RawOrder[] }>("/api/v1/accountActiveOrders", { account_index: account, market_type: "perp" }, auth);
  return j.orders ?? [];
}

export interface RawTrade {
  trade_id: number;
  market_id: number;
  size: string;
  price: string;
  usd_amount: string;
  ask_account_id: number;
  bid_account_id: number;
  is_maker_ask: boolean;
  timestamp: number;
  taker_fee?: number;
  maker_fee?: number;
  type: string;
  ask_account_pnl?: string;
  bid_account_pnl?: string;
}

export async function fetchAccountTrades(account: number, auth: string, limit = 100, marketId?: number): Promise<RawTrade[]> {
  const j = await lighterGet<Resp & { trades?: RawTrade[] }>("/api/v1/trades", {
    account_index: account, sort_by: "timestamp", sort_dir: "desc", limit, market_id: marketId, market_type: "perp",
  }, auth);
  return j.trades ?? [];
}

export interface RawFunding {
  timestamp: number;
  market_id: number;
  funding_id?: number;
  change: string; // USD received (+) or paid (-)
  rate: string;
  position_size: string;
  position_side: string;
}
export async function fetchFundingHistory(account: number, auth: string, limit = 100, marketId?: number): Promise<RawFunding[]> {
  const j = await lighterGet<Resp & { position_fundings?: RawFunding[] }>("/api/v1/positionFunding", {
    account_index: account, limit, market_ids: marketId,
  }, auth);
  return j.position_fundings ?? [];
}

export interface RawLimits { user_tier_name?: string; user_tier?: string; current_taker_fee_tick?: number; current_maker_fee_tick?: number }
export async function fetchAccountLimits(account: number, auth: string): Promise<RawLimits> {
  return lighterGet<Resp & RawLimits>("/api/v1/accountLimits", { account_index: account }, auth);
}

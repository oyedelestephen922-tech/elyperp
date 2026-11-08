"use client";
import { ApiRequestError, type ExchangeClient } from "@nktkas/hyperliquid";
import type { Market } from "./markets";
import { marketOrderPx, roundPrice, roundSize, type Side } from "./math";

export type TxState =
  | "pending" // awaiting signature / building
  | "submitted" // sent to exchange, awaiting response
  | "open" // resting on the book
  | "filled"
  | "partial"
  | "cancelled"
  | "rejected" // exchange refused it
  | "failed"; // never reached / network / signing error

export interface LegResult {
  label: string;
  state: TxState;
  oid?: number;
  filledSz?: string;
  avgPx?: string;
  error?: string;
}

type RawStatus =
  | { resting: { oid: number } }
  | { filled: { totalSz: string; avgPx: string; oid: number } }
  | { error: string }
  | "waitingForFill"
  | "waitingForTrigger"
  | string;

export function mapStatus(s: RawStatus, requestedSz: string, label: string): LegResult {
  if (typeof s === "string") {
    if (s === "waitingForFill" || s === "waitingForTrigger") return { label, state: "open" };
    return { label, state: "rejected", error: s };
  }
  if ("error" in s) return { label, state: "rejected", error: s.error };
  if ("resting" in s) return { label, state: "open", oid: s.resting.oid };
  if ("filled" in s) {
    const full = Number(s.filled.totalSz) + 1e-12 >= Number(requestedSz);
    return {
      label,
      state: full ? "filled" : "partial",
      oid: s.filled.oid,
      filledSz: s.filled.totalSz,
      avgPx: s.filled.avgPx,
    };
  }
  return { label, state: "failed", error: "Unrecognised exchange response" };
}

function statusesFrom(e: unknown): RawStatus[] | null {
  if (!(e instanceof ApiRequestError)) return null;
  const r = e.response as { response?: { data?: { statuses?: RawStatus[] } } };
  return r?.response?.data?.statuses ?? null;
}

const cloid = () =>
  ("0x" + Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;

export interface PlaceOrderParams {
  market: Market;
  side: Side;
  type: "market" | "limit";
  tif?: "Gtc" | "Ioc" | "Alo";
  size: number;
  limitPx?: number;
  refPx: number;
  slippage: number;
  reduceOnly: boolean;
  tpPx?: number;
  slPx?: number;
}

const TRIGGER_SLIPPAGE = 0.1;

export async function placeOrder(ex: ExchangeClient, p: PlaceOrderParams): Promise<LegResult[]> {
  const { market } = p;
  const isBuy = p.side === "long";
  const s = roundSize(p.size, market.szDecimals);
  if (Number(s) <= 0) return [{ label: "Order", state: "failed", error: "Size rounds to zero" }];

  const px =
    p.type === "market"
      ? marketOrderPx(p.refPx, isBuy, p.slippage, market.szDecimals)
      : roundPrice(p.limitPx!, market.szDecimals);

  const orders: Parameters<ExchangeClient["order"]>[0]["orders"] = [
    {
      a: market.assetId,
      b: isBuy,
      p: px,
      s,
      r: p.reduceOnly,
      t: { limit: { tif: p.type === "market" ? "Ioc" : p.tif ?? "Gtc" } },
      c: cloid(),
    },
  ];
  const labels = ["Order"];
  for (const [kind, trig] of [["tp", p.tpPx], ["sl", p.slPx]] as const) {
    if (!trig || trig <= 0) continue;
    const exitBuy = !isBuy;
    orders.push({
      a: market.assetId,
      b: exitBuy,
      p: marketOrderPx(trig, exitBuy, TRIGGER_SLIPPAGE, market.szDecimals),
      s,
      r: true,
      t: { trigger: { isMarket: true, triggerPx: roundPrice(trig, market.szDecimals), tpsl: kind } },
    });
    labels.push(kind === "tp" ? "Take-profit" : "Stop-loss");
  }

  let statuses: RawStatus[];
  try {
    const res = await ex.order({ orders, grouping: orders.length > 1 ? "normalTpsl" : "na" });
    statuses = res.response.data.statuses as RawStatus[];
  } catch (e) {
    const recovered = statusesFrom(e);
    if (!recovered) throw e;
    statuses = recovered;
  }
  return labels.map((label, i) =>
    statuses[i] === undefined ? { label, state: "failed" as const, error: "No status returned" } : mapStatus(statuses[i], s, label),
  );
}

export async function cancelOrder(ex: ExchangeClient, assetId: number, oid: number) {
  const res = await ex.cancel({ cancels: [{ a: assetId, o: oid }] });
  const st = res.response.data.statuses[0] as RawStatus;
  if (typeof st === "object" && st && "error" in st) throw new Error(st.error);
  return true;
}

export async function closePosition(
  ex: ExchangeClient,
  p: { market: Market; szi: number; fraction: number; type: "market" | "limit"; limitPx?: number; refPx: number; slippage: number },
): Promise<LegResult[]> {
  const side: Side = p.szi > 0 ? "short" : "long"; // opposite side
  const size = Math.abs(p.szi) * Math.min(1, Math.max(0, p.fraction));
  return placeOrder(ex, {
    market: p.market,
    side,
    type: p.type,
    size,
    limitPx: p.limitPx,
    refPx: p.refPx,
    slippage: p.slippage,
    reduceOnly: true,
  });
}

export async function setPositionTpsl(
  ex: ExchangeClient,
  p: { market: Market; szi: number; tpPx?: number; slPx?: number },
): Promise<LegResult[]> {
  const exitBuy = p.szi < 0;
  const s = roundSize(Math.abs(p.szi), p.market.szDecimals);
  const orders: Parameters<ExchangeClient["order"]>[0]["orders"] = [];
  const labels: string[] = [];
  for (const [kind, trig] of [["tp", p.tpPx], ["sl", p.slPx]] as const) {
    if (!trig || trig <= 0) continue;
    orders.push({
      a: p.market.assetId,
      b: exitBuy,
      p: marketOrderPx(trig, exitBuy, TRIGGER_SLIPPAGE, p.market.szDecimals),
      s,
      r: true,
      t: { trigger: { isMarket: true, triggerPx: roundPrice(trig, p.market.szDecimals), tpsl: kind } },
    });
    labels.push(kind === "tp" ? "Take-profit" : "Stop-loss");
  }
  if (!orders.length) return [];
  let statuses: RawStatus[];
  try {
    const res = await ex.order({ orders, grouping: "positionTpsl" });
    statuses = res.response.data.statuses as RawStatus[];
  } catch (e) {
    const recovered = statusesFrom(e);
    if (!recovered) throw e;
    statuses = recovered;
  }
  return labels.map((label, i) => mapStatus(statuses[i] ?? "missing", s, label));
}

export async function updateLeverage(ex: ExchangeClient, market: Market, leverage: number, isCross: boolean) {
  if (isCross && market.isolatedOnly) throw new Error("This market only supports isolated margin.");
  await ex.updateLeverage({ asset: market.assetId, isCross, leverage });
}

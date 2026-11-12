"use client";
import { useMemo } from "react";
import { useSession } from "./session";
import type { RawOrder, RawPosition } from "./api";
import { imfToLeverage, type Market } from "./markets";

export interface Position {
  marketId: number;
  symbol: string;
  qty: number; // signed: + long, - short
  side: "buy" | "sell";
  entry: number;
  value: number;
  upnl: number;
  rpnl: number;
  liq: number | null;
  leverage: number;
  isolated: boolean;
  margin: number;
  roi: number | null;
  tiedOrders: number;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Lighter reports the per-market IMF as a percent string ("33.33" → 3x). */
export function leverageFromPct(imfPct: string | number) {
  const p = num(imfPct);
  return p > 0 ? Math.max(1, Math.round(100 / p)) : 0;
}

export function toPosition(p: RawPosition): Position | null {
  const size = num(p.position);
  if (!(size > 0) || !p.sign) return null;
  const qty = p.sign < 0 ? -size : size;
  const value = Math.abs(num(p.position_value));
  const leverage = leverageFromPct(p.initial_margin_fraction) || 1;
  const isolated = p.margin_mode === 1;
  const margin = isolated ? num(p.allocated_margin) : value / leverage;
  const liq = num(p.liquidation_price);
  return {
    marketId: p.market_id,
    symbol: p.symbol,
    qty,
    side: qty > 0 ? "buy" : "sell",
    entry: num(p.avg_entry_price),
    value,
    upnl: num(p.unrealized_pnl),
    rpnl: num(p.realized_pnl),
    liq: liq > 0 ? liq : null,
    leverage,
    isolated,
    margin,
    roi: margin > 0 ? num(p.unrealized_pnl) / margin : null,
    tiedOrders: num(p.position_tied_order_count),
  };
}

export function usePositions(marketId?: number) {
  const account = useSession((s) => s.account);
  return useMemo(() => {
    const out: Position[] = [];
    for (const p of account?.positions ?? []) {
      if (marketId != null && p.market_id !== marketId) continue;
      const x = toPosition(p);
      if (x) out.push(x);
    }
    return out;
  }, [account, marketId]);
}

/** The account's leverage and margin mode for a market (falls back to the market default). */
export function useMarketSettings(market: Market | undefined) {
  const account = useSession((s) => s.account);
  return useMemo(() => {
    const p = market ? account?.positions?.find((x) => x.market_id === market.id) : undefined;
    const lev = p ? leverageFromPct(p.initial_margin_fraction) : 0;
    return {
      leverage: lev || (market ? imfToLeverage(market.defaultImf) : 1),
      isolated: p?.margin_mode === 1,
    };
  }, [account, market]);
}

export function useOpenOrders(marketId?: number) {
  const orders = useSession((s) => s.orders);
  return useMemo(() => (orders ?? []).filter((o) => marketId == null || o.market_index === marketId), [orders, marketId]);
}

export function orderLabel(o: RawOrder) {
  switch (o.type) {
    case "limit": return o.time_in_force === "post-only" ? "Limit (post only)" : "Limit";
    case "market": return "Market";
    case "stop-loss": return "Stop loss";
    case "stop-loss-limit": return "Stop loss limit";
    case "take-profit": return "Take profit";
    case "take-profit-limit": return "Take profit limit";
    default: return o.type.replace(/-/g, " ");
  }
}

export function isTrigger(o: RawOrder) {
  return o.type.startsWith("stop-loss") || o.type.startsWith("take-profit");
}

export function accountSummary(a: { total_asset_value?: string; available_balance?: string; collateral?: string; cross_maintenance_margin_requirement?: string; cross_initial_margin_requirement?: string } | null) {
  if (!a) return null;
  return {
    equity: num(a.total_asset_value),
    available: num(a.available_balance),
    collateral: num(a.collateral),
    maintenance: num(a.cross_maintenance_margin_requirement),
    initial: num(a.cross_initial_margin_requirement),
  };
}

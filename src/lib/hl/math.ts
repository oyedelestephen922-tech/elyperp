import { formatPrice, formatSize } from "@nktkas/hyperliquid/utils";

export const MIN_ORDER_NOTIONAL = 10;
export const BASE_TAKER_FEE = 0.00045;
export const BASE_MAKER_FEE = 0.00015;

export type Side = "long" | "short";
export const sideSign = (s: Side) => (s === "long" ? 1 : -1);

export function roundSize(size: number, szDecimals: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0";
  const f = 10 ** szDecimals;
  const truncated = Math.floor(size * f + 1e-9) / f;
  if (truncated <= 0) return "0";
  return formatSize(truncated.toFixed(szDecimals), szDecimals);
}

export function roundPrice(px: number, szDecimals: number): string {
  return formatPrice(px, szDecimals, "perp");
}

export function isValidPrice(pxStr: string, szDecimals: number): boolean {
  const px = Number(pxStr);
  if (!Number.isFinite(px) || px <= 0) return false;
  try {
    return Number(roundPrice(px, szDecimals)) === px;
  } catch {
    return false;
  }
}

// market orders go out as IOC limits at ref price +/- slippage
export function marketOrderPx(refPx: number, isBuy: boolean, slippage: number, szDecimals: number) {
  const raw = refPx * (isBuy ? 1 + slippage : 1 - slippage);
  return roundPrice(raw, szDecimals);
}

export function notional(size: number, px: number) {
  return Math.abs(size) * px;
}

export function requiredMargin(size: number, px: number, leverage: number) {
  return notional(size, px) / leverage;
}

export function estimateFee(size: number, px: number, rate: number) {
  return notional(size, px) * rate;
}

export function maintenanceFraction(maxLeverage: number) {
  return 1 / (2 * maxLeverage);
}

// liq = entry - side * marginAvailable / size / (1 - l * side), l = maintenance fraction.
// estimate only, bigger positions can land in a higher margin tier.
export function estimateLiqPx(p: {
  side: Side;
  entryPx: number;
  size: number;
  margin: number;
  maxLeverage: number;
}): number | null {
  const { entryPx, size, margin, maxLeverage } = p;
  if (!(entryPx > 0) || !(size > 0) || !(margin >= 0) || !(maxLeverage > 0)) return null;
  const s = sideSign(p.side);
  const l = maintenanceFraction(maxLeverage);
  const marginAvailable = margin - size * entryPx * l;
  if (marginAvailable <= 0) return entryPx; // already at/below maintenance
  const liq = entryPx - (s * marginAvailable) / size / (1 - l * s);
  if (!(liq > 0)) return null;
  return liq;
}

export function unrealizedPnl(side: Side, size: number, entryPx: number, markPx: number) {
  return sideSign(side) * size * (markPx - entryPx);
}

export function roe(pnl: number, margin: number) {
  return margin > 0 ? pnl / margin : 0;
}

export interface OrderInput {
  side: Side;
  type: "market" | "limit";
  size: number; // base units
  limitPx?: number;
  refPx: number; // mark/mid used for market orders and margin estimates
  leverage: number;
  maxLeverage: number;
  szDecimals: number;
  reduceOnly: boolean;
  availableMargin: number | null; // null = not connected / unknown
  maxSize?: number | null;
  tpPx?: number;
  slPx?: number;
  marketActive: boolean;
}

export interface OrderCheck {
  errors: string[];
  warnings: string[];
  sizeStr: string;
  px: number;
  notional: number;
  margin: number;
}

export function checkOrder(o: OrderInput): OrderCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const px = o.type === "limit" ? o.limitPx ?? 0 : o.refPx;
  const sizeStr = roundSize(o.size, o.szDecimals);
  const sz = Number(sizeStr);
  const ntl = notional(sz, px);
  const margin = o.leverage > 0 ? ntl / o.leverage : Infinity;

  if (!o.marketActive) errors.push("This market is not currently tradable.");
  if (!(o.size > 0)) errors.push("Enter an order size.");
  else if (sz <= 0) errors.push(`Size is below the minimum lot (${(10 ** -o.szDecimals).toFixed(o.szDecimals)}).`);
  if (o.type === "limit") {
    if (!(o.limitPx && o.limitPx > 0)) errors.push("Enter a limit price.");
    else if (!isValidPrice(String(o.limitPx), o.szDecimals))
      {
      const d = Math.max(0, 6 - o.szDecimals);
      errors.push(`Price has too many digits. Max 5 significant figures and ${d} decimal${d === 1 ? "" : "s"}.`);
    }
  }
  if (!(px > 0)) errors.push("No valid price available for this market.");
  if (o.leverage < 1 || o.leverage > o.maxLeverage || !Number.isInteger(o.leverage))
    errors.push(`Leverage must be a whole number between 1x and ${o.maxLeverage}x.`);
  if (sz > 0 && px > 0 && ntl < MIN_ORDER_NOTIONAL && !o.reduceOnly)
    errors.push(`Minimum order value is $${MIN_ORDER_NOTIONAL}.`);
  if (o.maxSize != null && !o.reduceOnly && sz > o.maxSize + 1e-12)
    errors.push(`Exceeds the maximum size available at ${o.leverage}x (${o.maxSize}). Reduce size, add margin or raise leverage.`);
  else if (o.availableMargin != null && !o.reduceOnly && margin > o.availableMargin)
    errors.push(`Insufficient margin: needs $${margin.toFixed(2)}, available $${o.availableMargin.toFixed(2)}.`);

  const s = sideSign(o.side);
  if (o.tpPx != null && o.tpPx > 0 && px > 0 && (o.tpPx - px) * s <= 0)
    errors.push(`Take-profit must be ${o.side === "long" ? "above" : "below"} the entry price.`);
  if (o.slPx != null && o.slPx > 0 && px > 0 && (o.slPx - px) * s >= 0)
    errors.push(`Stop-loss must be ${o.side === "long" ? "below" : "above"} the entry price.`);
  for (const [label, v] of [["Take-profit", o.tpPx], ["Stop-loss", o.slPx]] as const)
    if (v != null && v > 0 && !isValidPrice(String(v), o.szDecimals))
      errors.push(`${label} price has too much precision.`);

  if (o.type === "limit" && o.limitPx && o.refPx > 0) {
    const away = (o.limitPx - o.refPx) / o.refPx;
    if (away * s > 0.005) warnings.push("Limit price crosses the book and will fill right away as a taker order.");
  }
  if (o.leverage >= Math.min(20, o.maxLeverage) && o.leverage > 5)
    warnings.push("High leverage: small price moves can liquidate this position.");

  return { errors, warnings, sizeStr, px, notional: ntl, margin };
}

// Walk one side of the book (asks for a buy, bids for a sell) to estimate a market fill.
// Stops at `limitPx` (the slippage cap). `filled` < size means the rest won't fill.
export function walkBook(levels: { px: number; sz: number }[], size: number, isBuy: boolean, limitPx?: number) {
  let filled = 0;
  let cost = 0;
  for (const l of levels) {
    if (filled >= size) break;
    if (limitPx != null && (isBuy ? l.px > limitPx : l.px < limitPx)) break;
    const take = Math.min(l.sz, size - filled);
    filled += take;
    cost += take * l.px;
  }
  return { filled, avgPx: filled > 0 ? cost / filled : null };
}

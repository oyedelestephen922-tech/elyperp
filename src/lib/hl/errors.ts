import { ApiRequestError, HyperliquidError, ValidationError } from "@nktkas/hyperliquid";

export function humanizeError(e: unknown): string {
  const raw = extractMessage(e);
  const m = raw.toLowerCase();
  if (m.includes("user rejected") || m.includes("user denied") || m.includes("rejected the request"))
    return "You rejected the signature request in your wallet.";
  if (m.includes("does not exist") && m.includes("user"))
    return "This address has no Hyperliquid account yet. Deposit collateral first (see Deposit).";
  if (m.includes("insufficient margin")) return "Insufficient margin for this order.";
  if (m.includes("agent") && (m.includes("not") || m.includes("invalid")))
    return "Your trading key is no longer approved. Re-enable trading to approve a new one.";
  if (m.includes("minimum value")) return "Order is below the $10 minimum value.";
  if (m.includes("tick size") || m.includes("price must be divisible")) return "Price is not a valid tick for this market.";
  if (m.includes("reduce only")) return "Reduce-only order would increase your position.";
  if (m.includes("could not immediately match")) return "No liquidity within your slippage limit. Order not filled.";
  if (m.includes("open interest") && m.includes("cap")) return "This market is at its open-interest cap.";
  if (m.includes("rate limit")) return "Rate limited by Hyperliquid. Wait a moment and retry.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Network error reaching Hyperliquid. Check your connection.";
  return raw || "Unknown error";
}

export function extractMessage(e: unknown): string {
  if (e instanceof ApiRequestError) {
    const r = e.response as { response?: unknown } | undefined;
    const statuses = (r?.response as { data?: { statuses?: unknown[] } })?.data?.statuses;
    if (Array.isArray(statuses)) {
      const err = statuses.find((s) => typeof s === "object" && s && "error" in s) as { error: string } | undefined;
      if (err) return err.error;
    }
    if (typeof r?.response === "string") return r.response;
    return e.message;
  }
  if (e instanceof ValidationError) return `Invalid request: ${e.message}`;
  if (e instanceof HyperliquidError) return e.message;
  if (e instanceof Error) {
    const short = (e as { shortMessage?: string }).shortMessage;
    return short || e.message;
  }
  return String(e);
}

export function logError(context: string, e: unknown) {
  console.error(`[elyperp] ${context}:`, e);
}

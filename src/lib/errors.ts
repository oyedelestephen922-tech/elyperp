export function humanizeError(e: unknown): string {
  const raw = extractMessage(e);
  const m = raw.toLowerCase();
  if (m.includes("user rejected") || m.includes("user denied") || m.includes("rejected the request") || m.includes("action_rejected"))
    return "You rejected the request in your wallet.";
  if (m.includes("brokerid") || m.includes("broker_id") || m.includes("broker id"))
    return "Elyperp's Orderly builder ID isn't set up yet, so accounts can't be created.";
  if (m.includes("account") && (m.includes("not exist") || m.includes("not registered") || m.includes("not found")))
    return "This wallet has no Elyperp account yet. Create one in Account setup.";
  if (m.includes("orderly key") || m.includes("orderly-key") || (m.includes("signature") && m.includes("invalid")))
    return "Your trading key is no longer valid. Enable trading again to create a new one.";
  if (m.includes("insufficient") || m.includes("free collateral"))
    return "Not enough free collateral for this order.";
  if (m.includes("min_notional") || m.includes("min notional") || m.includes("minimum notional"))
    return "Order is below this market's minimum order value.";
  if (m.includes("quote_tick") || m.includes("price tick") || m.includes("tick size")) return "Price is not a valid tick for this market.";
  if (m.includes("base_tick") || (m.includes("quantity") && m.includes("tick"))) return "Size is not a valid step for this market.";
  if (m.includes("reduce only") || m.includes("reduce_only")) return "Reduce-only order would increase your position.";
  if (m.includes("price range") || m.includes("price_range") || m.includes("price scope"))
    return "Price is too far from the mark price for this market.";
  if (m.includes("market is closed") || m.includes("market closed") || m.includes("not open"))
    return "This market is closed right now. Check its trading session.";
  if (m.includes("rate limit")) return "Too many requests. Wait a moment and retry.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Network error reaching Orderly. Check your connection.";
  return raw || "Unknown error";
}

export function extractMessage(e: unknown): string {
  if (e && typeof e === "object") {
    const o = e as { shortMessage?: string; message?: string; code?: number | string };
    if (o.shortMessage) return o.shortMessage;
    if (o.message) return o.message;
  }
  return String(e);
}

export function logError(context: string, e: unknown) {
  console.error(`[elyperp] ${context}:`, e);
}

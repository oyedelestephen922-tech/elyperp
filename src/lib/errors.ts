export function humanizeError(e: unknown): string {
  const raw = extractMessage(e);
  const m = raw.toLowerCase();
  const code = e && typeof e === "object" && "code" in e ? Number((e as { code: unknown }).code) : NaN;
  if (m.includes("user rejected") || m.includes("user denied") || m.includes("rejected the request") || m.includes("action_rejected"))
    return "You rejected the request in your wallet.";
  if (code === 20558 || m.includes("restricted jurisdiction"))
    return "Lighter doesn't accept orders from your region. Market data stays available.";
  if (m.includes("api key") || m.includes("pubkey") || m.includes("public key") || (m.includes("signature") && m.includes("invalid")))
    return "Your trading key isn't valid any more. Set up trading again in Account setup.";
  if (m.includes("nonce")) return "Lighter rejected the order sequence number. Try again.";
  if (m.includes("not enough") || m.includes("insufficient") || m.includes("margin"))
    return "Not enough available margin for this order.";
  if (m.includes("min") && (m.includes("amount") || m.includes("size") || m.includes("quote")))
    return "Order is below this market's minimum size or value.";
  if (m.includes("reduce only") || m.includes("reduce-only") || m.includes("reduceonly")) return "Reduce-only order would increase your position.";
  if (m.includes("price") && (m.includes("band") || m.includes("range") || m.includes("too far") || m.includes("slippage")))
    return "Price is too far from the market. Adjust the price or slippage.";
  if (m.includes("post only") || m.includes("post-only")) return "Post-only order would have matched immediately, so it was cancelled.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many requests. Wait a moment and retry.";
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("timeout") || m.includes("aborted"))
    return "Network error reaching Lighter. Check your connection.";
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

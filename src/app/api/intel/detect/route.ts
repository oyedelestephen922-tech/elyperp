import { allow, cached, cleanAddress, clientIp, errorResponse, getJson, jsonError } from "@/lib/server/agentsi";

export const dynamic = "force-dynamic";

/** Which chain an address belongs to (Agent SI /api/detect). Only 0x addresses go to detect; others are detected by the scan itself. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const address = cleanAddress(url.searchParams.get("address"));
  if (!address) return jsonError(400, "That doesn't look like a token address.");
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return Response.json({ address, chain: null, reason: "scan", options: [], candidates: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  const gate = allow("detect", clientIp(req), 30, 60_000);
  if (!gate.ok) return jsonError(429, `Too many lookups. Try again in ${gate.retryAfter}s.`, {}, { "Retry-After": String(gate.retryAfter) });
  try {
    const d = await cached(`detect:${address.toLowerCase()}`, 5 * 60_000, () => getJson("/api/detect", { address }));
    return Response.json(d, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

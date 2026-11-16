import { allow, cached, cleanAddress, cleanChain, clientIp, errorResponse, getJson, jsonError } from "@/lib/server/agentsi";

export const dynamic = "force-dynamic";

/** Latest saved report, Agent SI's own scan history, scan count and rank (Agent SI /api/report/<token>). Not a new scan. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const address = cleanAddress(url.searchParams.get("address"));
  const chain = cleanChain(url.searchParams.get("chain"));
  if (!address) return jsonError(400, "That doesn't look like a token address.");
  if (!chain) return jsonError(400, "A chain is needed to open a saved report.");
  const gate = allow("report", clientIp(req), 40, 60_000);
  if (!gate.ok) return jsonError(429, `Too many requests. Try again in ${gate.retryAfter}s.`, {}, { "Retry-After": String(gate.retryAfter) });
  try {
    const d = await cached(`report:${chain}:${address.toLowerCase()}`, 30_000, () =>
      getJson(`/api/report/${encodeURIComponent(address)}`, { chain }),
    );
    return Response.json(d, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

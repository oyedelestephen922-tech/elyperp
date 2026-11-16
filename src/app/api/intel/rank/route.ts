import { allow, cached, cleanChain, clientIp, errorResponse, getJson, jsonError } from "@/lib/server/agentsi";

export const dynamic = "force-dynamic";

/** SI Score board (Agent SI /api/rank). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const chain = cleanChain(url.searchParams.get("chain")) ?? "robinhood";
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  const gate = allow("rank", clientIp(req), 30, 60_000);
  if (!gate.ok) return jsonError(429, `Too many requests. Try again in ${gate.retryAfter}s.`, {}, { "Retry-After": String(gate.retryAfter) });
  try {
    const d = await cached(`rank:${chain}:${limit}`, 60_000, () => getJson("/api/rank", { chain, limit }));
    return Response.json(d, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

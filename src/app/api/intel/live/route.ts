import { allow, cached, clientIp, errorResponse, getJson, jsonError } from "@/lib/server/agentsi";

export const dynamic = "force-dynamic";

const TYPES = new Set(["signal", "analysis", "liquidity-change", "challenge"]);

/** Agent SI live feed (/api/live). Shared by all visitors through a short cache. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const t = url.searchParams.get("type") ?? "";
  const type = TYPES.has(t) ? t : undefined;
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 30));
  const gate = allow("live", clientIp(req), 30, 60_000);
  if (!gate.ok) return jsonError(429, `Too many requests. Try again in ${gate.retryAfter}s.`, {}, { "Retry-After": String(gate.retryAfter) });
  try {
    const d = await cached(`live:${type ?? "all"}:${limit}`, 20_000, () => getJson("/api/live", { limit, type }));
    return Response.json(d, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

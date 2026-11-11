import { NextResponse } from "next/server";
import { ORDERLY_API_URL } from "@/lib/config";
import { clientIp, rateLimit } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

// TradingView-style resolutions Orderly's /tv/history accepts (4H returns no data, so it's left out).
const RESOLUTIONS = new Set(["1", "5", "15", "30", "60", "1D", "1W"]);

export async function GET(req: Request) {
  if (!rateLimit(clientIp(req))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol") ?? "";
  const resolution = url.searchParams.get("resolution") ?? "";
  const from = Number(url.searchParams.get("from"));
  const to = Number(url.searchParams.get("to"));
  if (!/^PERP_[A-Za-z0-9]+_USDC(_[A-Za-z0-9_]+)?$/.test(symbol) || !RESOLUTIONS.has(resolution) || !Number.isFinite(from) || !Number.isFinite(to))
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  try {
    const qs = new URLSearchParams({ symbol, resolution, from: String(Math.floor(from)), to: String(Math.floor(to)) });
    const r = await fetch(`${ORDERLY_API_URL}/tv/history?${qs}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`orderly ${r.status}`);
    const j = (await r.json()) as { s: string; t?: number[]; o?: number[]; h?: number[]; l?: number[]; c?: number[]; v?: number[]; errmsg?: string };
    if (j.s === "no_data") return NextResponse.json([]);
    if (j.s !== "ok" || !j.t) throw new Error(j.errmsg || `status ${j.s}`);
    const out = j.t.map((t, i) => ({ t, o: j.o![i], h: j.h![i], l: j.l![i], c: j.c![i], v: j.v![i] }));
    // The newest candle is still forming; cache briefly. The client updates it from live trades.
    return NextResponse.json(out, { headers: { "Cache-Control": "public, s-maxage=3, stale-while-revalidate=5" } });
  } catch (e) {
    console.error("[api/candles]", e);
    return NextResponse.json({ error: "Candle fetch failed", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

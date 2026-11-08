import { NextResponse } from "next/server";
import { getInfo } from "@/lib/hl/clients";
import { clientIp, rateLimit } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

const INTERVALS = new Set(["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"]);

export async function GET(req: Request) {
  if (!rateLimit(clientIp(req))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const url = new URL(req.url);
  const coin = url.searchParams.get("coin") ?? "";
  const interval = url.searchParams.get("interval") ?? "";
  const startTime = Number(url.searchParams.get("startTime"));
  const endTime = url.searchParams.get("endTime") ? Number(url.searchParams.get("endTime")) : undefined;
  if (!/^[A-Za-z0-9:_\-.@]{1,40}$/.test(coin) || !INTERVALS.has(interval) || !Number.isFinite(startTime))
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  try {
    const candles = await getInfo().candleSnapshot({
      coin,
      interval: interval as "1m",
      startTime,
      ...(endTime ? { endTime } : {}),
    });
    // The newest candle is still forming; cache briefly. The client streams updates over WS.
    return NextResponse.json(candles, { headers: { "Cache-Control": "public, s-maxage=3, stale-while-revalidate=5" } });
  } catch (e) {
    console.error("[api/candles]", e);
    return NextResponse.json({ error: "Candle fetch failed", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

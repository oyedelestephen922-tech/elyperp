import { NextResponse } from "next/server";
import { fetchUniverse, type MarketUniverse } from "@/lib/orderly/markets";
import { clientIp, rateLimit } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

let cache: { at: number; data: MarketUniverse } | null = null;
let inflight: Promise<MarketUniverse> | null = null;
const FRESH_MS = 15_000; // serve as-is
const MAX_STALE_MS = 10 * 60_000; // serve while refreshing in the background

function refresh() {
  inflight ??= fetchUniverse()
    .then((data) => {
      cache = { at: Date.now(), data };
      return data;
    })
    .finally(() => (inflight = null));
  return inflight;
}

export async function GET(req: Request) {
  if (!rateLimit(clientIp(req))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  try {
    const age = cache ? Date.now() - cache.at : Infinity;
    if (age > MAX_STALE_MS) await refresh();
    else if (age > FRESH_MS) refresh().catch((e) => console.error("[api/markets] background refresh", e));
    // prices in here are a snapshot (fetchedAt); the client switches to the live stream right away
    return NextResponse.json(cache!.data, { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=60" } });
  } catch (e) {
    console.error("[api/markets]", e);
    return NextResponse.json(
      { error: "Market list failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

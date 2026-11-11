import { NextResponse } from "next/server";
import { getInfo } from "@/lib/hl/clients";
import { HL_API_URL, HL_NETWORK, robinhood } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const out: Record<string, unknown> = { network: HL_NETWORK, api: HL_API_URL, robinhoodChainId: robinhood.id };
  try {
    const [dexes, status] = await Promise.all([getInfo().perpDexs(), getInfo().exchangeStatus().catch(() => null)]);
    out.hyperliquid = { ok: true, perpDexCount: dexes.length, exchangeStatus: status, latencyMs: Date.now() - started };
  } catch (e) {
    out.hyperliquid = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  try {
    const r = await fetch(robinhood.rpcUrls.default.http[0], {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      signal: AbortSignal.timeout(5000),
    });
    const j = await r.json();
    out.robinhood = { ok: Number(j.result) === robinhood.id, chainId: Number(j.result) };
  } catch (e) {
    out.robinhood = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const ok = (out.hyperliquid as { ok: boolean }).ok;
  return NextResponse.json(out, { status: ok ? 200 : 503 });
}

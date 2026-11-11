import { NextResponse } from "next/server";
import { BROKER_ID, ORDERLY_API_URL, TRADING_ENABLED, robinhood } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const out: Record<string, unknown> = {
    exchange: "orderly",
    api: ORDERLY_API_URL,
    brokerId: BROKER_ID || null,
    tradingEnabled: TRADING_ENABLED,
    robinhoodChainId: robinhood.id,
  };
  try {
    const r = await fetch(`${ORDERLY_API_URL}/v1/public/system_info`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    const j = (await r.json()) as { success: boolean; data?: { status: number; msg: string } };
    out.orderly = { ok: j.success && j.data?.status === 0, status: j.data?.msg, latencyMs: Date.now() - started };
  } catch (e) {
    out.orderly = { ok: false, error: e instanceof Error ? e.message : String(e) };
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
  const ok = (out.orderly as { ok: boolean }).ok;
  return NextResponse.json(out, { status: ok ? 200 : 503 });
}

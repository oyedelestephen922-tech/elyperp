import { NextResponse } from "next/server";
import { INTEGRATOR_ENABLED, LIGHTER, robinhood } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const out: Record<string, unknown> = {
    exchange: "lighter",
    api: LIGHTER.apiUrl,
    builderFee: INTEGRATOR_ENABLED,
    robinhoodChainId: robinhood.id,
  };
  const started = Date.now();
  try {
    const [status, info] = await Promise.all([
      fetch(`${LIGHTER.apiUrl}/`, { cache: "no-store", signal: AbortSignal.timeout(5000) }).then((r) => r.json() as Promise<{ status?: number }>),
      fetch(`${LIGHTER.apiUrl}/info`, { cache: "no-store", signal: AbortSignal.timeout(5000) }).then((r) => r.json() as Promise<{ contract_address?: string }>),
    ]);
    const contractOk = (info.contract_address ?? "").toLowerCase() === LIGHTER.contract.toLowerCase();
    out.lighter = { ok: status.status === 200 && contractOk, contractMatches: contractOk, latencyMs: Date.now() - started };
  } catch (e) {
    out.lighter = { ok: false, error: e instanceof Error ? e.message : String(e) };
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
  const ok = (out.lighter as { ok: boolean }).ok;
  return NextResponse.json(out, { status: ok ? 200 : 503 });
}

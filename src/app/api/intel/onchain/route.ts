import { allow, cleanAddress, cleanChain, clientIp, cached, jsonError } from "@/lib/server/agentsi";
import { registryKeyParts } from "@/lib/intel/registry";
import { readRecord } from "@/lib/server/registry";

export const dynamic = "force-dynamic";

/** The latest scan recorded on the Elyperp Intelligence registry (Robinhood Chain) for a token. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const address = cleanAddress(url.searchParams.get("address"));
  const chain = cleanChain(url.searchParams.get("chain"));
  if (!address || !chain) return jsonError(400, "address and chain are required.");
  const gate = allow("onchain", clientIp(req), 60, 60_000);
  if (!gate.ok) return jsonError(429, `Too many requests. Try again in ${gate.retryAfter}s.`);
  try {
    const data = await cached(`onchain:${Object.values(registryKeyParts(chain, address)).join(":")}`, 10_000, () => readRecord(chain, address));
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[intel-onchain]", e);
    return jsonError(502, "Couldn't read the Robinhood Chain registry right now.");
  }
}

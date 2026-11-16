import { after } from "next/server";
import type { Report } from "@/lib/intel/agentsi";
import { allow, cleanAddress, cleanChain, clientIp, jsonError, upstreamHeaders, upstreamUrl } from "@/lib/server/agentsi";
import { publishingEnabled, publishScan } from "@/lib/server/registry";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SCAN_TIMEOUT_MS = 100_000;

/**
 * Streams an Agent SI scan (application/x-ndjson) straight through to the browser:
 * step lines as SI works, then {"type":"report", "cached", "report", "rank"}.
 * Refusals (bad address, 422 with chain options, 429) come back as JSON with Agent SI's message.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const address = cleanAddress(url.searchParams.get("address"));
  const chain = cleanChain(url.searchParams.get("chain"));
  const force = url.searchParams.get("force") === "1";
  if (!address) return jsonError(400, "That doesn't look like a token address.");

  const ip = clientIp(req);
  const gate = allow("scan", ip, 6, 60_000);
  if (!gate.ok) return jsonError(429, `You've run several scans in a row. Try again in ${gate.retryAfter}s.`, {}, { "Retry-After": String(gate.retryAfter) });
  if (force) {
    const g2 = allow("force", ip, 2, 60_000);
    if (!g2.ok) return jsonError(429, `Fresh rescans are limited. Try again in ${g2.retryAfter}s.`, {}, { "Retry-After": String(g2.retryAfter) });
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), SCAN_TIMEOUT_MS);
  req.signal.addEventListener("abort", () => ac.abort());
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl("/api/scan", { address, chain, force: force ? 1 : undefined }), {
      headers: upstreamHeaders("application/x-ndjson"),
      cache: "no-store",
      signal: ac.signal,
    });
  } catch {
    clearTimeout(timer);
    return jsonError(ac.signal.aborted ? 504 : 502, ac.signal.aborted ? "Agent SI took too long to answer." : "Couldn't reach Agent SI.");
  }

  const type = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !type.includes("ndjson") || !upstream.body) {
    clearTimeout(timer);
    let body: Record<string, unknown> = {};
    try {
      body = await upstream.json();
    } catch {
      /* not JSON */
    }
    const msg = typeof body.error === "string" ? body.error
      : upstream.status === 429 ? "Agent SI is rate limiting scans right now. Try again in a minute."
      : `Agent SI answered ${upstream.status}.`;
    const status = upstream.ok ? 502 : upstream.status;
    return jsonError(status === 429 ? 429 : status >= 500 ? 502 : status, msg, { detect: body.detect ?? null });
  }

  // Pass the stream through untouched. While it passes, watch for the final report line
  // so the scan can be recorded on Robinhood Chain after the response has finished.
  const publish = publishingEnabled();
  let settle: (r: Report | null) => void = () => {};
  const finalReport = new Promise<Report | null>((resolve) => {
    settle = resolve;
    setTimeout(() => resolve(null), SCAN_TIMEOUT_MS + 5_000);
  });
  req.signal.addEventListener("abort", () => settle(null));
  const decoder = new TextDecoder();
  let pending = "";
  let report: Report | null = null;
  const readLine = (line: string) => {
    if (!line.includes('"report"')) return;
    try {
      const o = JSON.parse(line) as { type?: string; report?: Report };
      if (o.type === "report" && o.report) report = o.report;
    } catch {
      /* not a complete JSON line */
    }
  };
  const body = upstream.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        if (!publish) return;
        pending += decoder.decode(chunk, { stream: true });
        let i: number;
        while ((i = pending.indexOf("\n")) >= 0) {
          readLine(pending.slice(0, i));
          pending = pending.slice(i + 1);
        }
      },
      flush() {
        clearTimeout(timer);
        if (publish) {
          readLine(pending + decoder.decode());
          settle(report);
        }
      },
    }),
  );
  if (publish) {
    after(async () => {
      const r = await finalReport;
      if (r) await publishScan(r);
    });
  }
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

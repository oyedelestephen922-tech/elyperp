/**
 * Server-side client for Agent SI's public API (https://agentsi.site/docs).
 * Agent SI refuses calls made from other websites' pages and throttles per IP,
 * so every request goes through Elyperp's server, with our own per-visitor limits
 * and short caches so many visitors don't multiply into many upstream calls.
 */

export const AGENTSI_BASE = "https://agentsi.site";
const UA = "Elyperp/1.0 (+https://www.elyperp.xyz/intelligence)";

export class UpstreamError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export function upstreamUrl(path: string, params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  return `${AGENTSI_BASE}${path}${qs.size ? `?${qs}` : ""}`;
}

export function upstreamHeaders(accept = "application/json") {
  return { "User-Agent": UA, Accept: accept };
}

/** GET JSON from Agent SI. Non-2xx answers become UpstreamError with Agent SI's own message. */
export async function getJson<T>(path: string, params: Record<string, string | number | undefined>, timeoutMs = 15_000): Promise<T> {
  let r: Response;
  try {
    r = await fetch(upstreamUrl(path, params), { headers: upstreamHeaders(), cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new UpstreamError(timedOut ? 504 : 502, timedOut ? "Agent SI took too long to answer." : "Couldn't reach Agent SI.");
  }
  let body: unknown = null;
  try {
    body = await r.json();
  } catch {
    /* non-JSON error page */
  }
  if (!r.ok) {
    const upstreamMsg = body && typeof body === "object" && "error" in body ? (body as { error: unknown }).error : null;
    const msg = (typeof upstreamMsg === "string" && upstreamMsg)
      || (r.status === 429 ? "Agent SI is rate limiting requests right now. Try again in a minute." : `Agent SI answered ${r.status}.`);
    throw new UpstreamError(r.status, msg, body);
  }
  return body as T;
}

// ---- tiny in-memory cache (per server instance) ----
type Entry = { at: number; value: unknown };
const cache = new Map<string, Entry>();
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) for (const k of [...cache.keys()].slice(0, 100)) cache.delete(k);
  return value;
}

// ---- per-visitor limits (sliding window, per server instance) ----
const hits = new Map<string, number[]>();
export function allow(bucket: string, ip: string, max: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - arr[0])) / 1000) };
  }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) for (const k of [...hits.keys()].slice(0, 1000)) hits.delete(k);
  return { ok: true, retryAfter: 0 };
}

export function clientIp(req: Request) {
  const h = req.headers;
  return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "unknown").trim();
}

/** Loose shape check before we spend an upstream call. Agent SI is the final judge. */
export function cleanAddress(raw: string | null): string | null {
  const a = (raw ?? "").trim();
  if (!a || a.length > 130) return null;
  if (!/^[A-Za-z0-9:_.\-]+$/.test(a)) return null;
  return a;
}

export function cleanChain(raw: string | null): string | undefined {
  const c = (raw ?? "").trim().toLowerCase();
  return /^[a-z0-9-]{2,24}$/.test(c) ? c : undefined;
}

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return Response.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function errorResponse(e: unknown) {
  if (e instanceof UpstreamError) {
    const extra = e.body && typeof e.body === "object" ? { upstream: e.body } : {};
    return jsonError(e.status === 429 ? 429 : e.status >= 500 ? 502 : e.status, e.message, extra);
  }
  return jsonError(500, "Unexpected error talking to Agent SI.");
}

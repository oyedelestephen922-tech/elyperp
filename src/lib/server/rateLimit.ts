const buckets = new Map<string, { tokens: number; at: number }>();

export function rateLimit(ip: string, capacity = 60, refillPerSec = 2): boolean {
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: capacity, at: now };
  b.tokens = Math.min(capacity, b.tokens + ((now - b.at) / 1000) * refillPerSec);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(ip, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  if (buckets.size > 10_000) buckets.clear();
  return true;
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "anon";
}

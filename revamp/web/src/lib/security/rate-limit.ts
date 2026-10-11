type RateLimitEntry = { count: number; resetAt: number };

const buckets = new Map<string, RateLimitEntry>();
const maximumBuckets = 10_000;

function discardExpiredBuckets(now: number) {
  if (buckets.size < maximumBuckets) return;

  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }

  if (buckets.size < maximumBuckets) return;

  const oldestKey = buckets.keys().next().value;
  if (oldestKey) buckets.delete(oldestKey);
}

/** Process-local safeguard. Production replicas should use a shared limiter. */
export function takeRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  discardExpiredBuckets(now);
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1_000) };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clientAddress(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

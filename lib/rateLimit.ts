type WindowEntry = {
  count: number;
  resetAt: number;
};

// In-memory store — works for single-node / long-running deployments.
// For multi-instance production (Vercel serverless), replace with Upstash Redis.
const windows = new Map<string, WindowEntry>();

// Purge expired entries every 10 minutes to prevent unbounded growth
const purgeInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of windows) {
    if (entry.resetAt < now) windows.delete(key);
  }
}, 10 * 60 * 1000);

// Don't block Node.js process exit
if (purgeInterval.unref) purgeInterval.unref();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

/**
 * Fixed-window rate limiter.
 * @param key      Unique bucket key, e.g. "send-otp:1.2.3.4"
 * @param limit    Max requests allowed per window
 * @param windowMs Window duration in milliseconds
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const entry = windows.get(key);

  if (!entry || entry.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now };
  }

  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count, retryAfterMs: 0 };
}

/** Best-effort client IP from standard proxy headers */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

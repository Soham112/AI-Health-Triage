// Simple in-memory rate limiter (use Redis/Upstash in production)

interface RateLimitRecord {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitRecord>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number,
): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  const record = store.get(key);

  if (!record || now - record.windowStart > windowMs) {
    // Start new window
    store.set(key, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAt: now + windowMs,
      retryAfterSeconds: 0,
    };
  }

  if (record.count >= maxRequests) {
    const resetAt = record.windowStart + windowMs;
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfterSeconds: Math.ceil((resetAt - now) / 1000),
    };
  }

  record.count++;
  store.set(key, record);

  return {
    allowed: true,
    remaining: maxRequests - record.count,
    resetAt: record.windowStart + windowMs,
    retryAfterSeconds: 0,
  };
}

// Cleanup expired entries periodically (production: use Redis TTL instead)
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of store.entries()) {
    if (now - record.windowStart > 2 * 60 * 60 * 1000) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

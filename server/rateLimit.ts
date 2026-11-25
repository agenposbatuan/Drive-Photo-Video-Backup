interface RateBucket {
  failures: number;
  resetAt: number;
  blockedUntil: number;
}

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;

const buckets = new Map<string, RateBucket>();

export function checkPasswordRateLimit(key: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket) {
    return { allowed: true, retryAfterSec: 0 };
  }
  if (bucket.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1000)),
    };
  }
  if (bucket.resetAt <= now) {
    buckets.delete(key);
    return { allowed: true, retryAfterSec: 0 };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function recordPasswordFailure(key: string): void {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, {
      failures: 1,
      resetAt: now + WINDOW_MS,
      blockedUntil: 0,
    });
    return;
  }
  existing.failures += 1;
  if (existing.failures >= MAX_ATTEMPTS) {
    existing.blockedUntil = now + BLOCK_MS;
  }
}

export function clearPasswordFailures(key: string): void {
  buckets.delete(key);
}

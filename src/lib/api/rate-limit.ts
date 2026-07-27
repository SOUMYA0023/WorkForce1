/**
 * In-Memory Sliding Window Rate Limiter (SR-008, Refinement #13)
 *
 * Prevents brute force login attacks and endpoint abuse.
 * Configured per route type (e.g. login: 5 requests / min per IP).
 */

interface RateLimitStore {
  [key: string]: number[];
}

const store: RateLimitStore = {};

// Clean stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const key in store) {
    store[key] = store[key].filter((timestamp) => now - timestamp < 300000);
    if (store[key].length === 0) {
      delete store[key];
    }
  }
}, 300000);

export function checkRateLimit(
  identifier: string,
  limit = 10,
  windowMs = 60000
): { isAllowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const windowStart = now - windowMs;

  if (!store[identifier]) {
    store[identifier] = [];
  }

  // Filter timestamps within current window
  store[identifier] = store[identifier].filter((timestamp) => timestamp > windowStart);

  if (store[identifier].length >= limit) {
    const oldestTimestamp = store[identifier][0];
    const resetMs = oldestTimestamp + windowMs - now;
    return { isAllowed: false, remaining: 0, resetMs };
  }

  store[identifier].push(now);
  return {
    isAllowed: true,
    remaining: limit - store[identifier].length,
    resetMs: windowMs,
  };
}

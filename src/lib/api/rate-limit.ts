/**
 * In-Memory Sliding Window Rate Limiter (SR-008, Refinement #13)
 *
 * PERSISTENCE & DEPLOYMENT ARCHITECTURE MODEL:
 * 1. Single-VPS Deployment (Target Architecture per PRD §1.2 & §10.4):
 *    State is held in Node.js process memory (`const store`). This provides
 *    sub-millisecond rate limit checks with zero external network overhead (e.g., Redis).
 * 2. Multi-Instance Scaling Limitation & Mitigation:
 *    If deployed across multiple load-balanced Node.js instances or serverless containers,
 *    counters are process-isolated. For horizontal scaling, `store` can be backed by Redis
 *    without altering the `checkRateLimit` function signature.
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

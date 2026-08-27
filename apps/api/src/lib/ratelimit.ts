/**
 * In-memory per-user rate limit (03 Unit 1: community posting 10/min member).
 *
 * Deliberately in-process: this round has no Redis, and one Vercel instance is
 * the whole surface locally. It is a floor, not a guarantee — a horizontally
 * scaled deployment needs the Redis counter named in 00 §3. Documented as a
 * known gap.
 */
import { ApiError } from './errors';

type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();

export function rateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
  messagePlain: string;
}): void {
  const now = Date.now();
  const b = buckets.get(opts.key) ?? { hits: [] };
  b.hits = b.hits.filter((t) => now - t < opts.windowMs);
  if (b.hits.length >= opts.limit) {
    buckets.set(opts.key, b);
    const retryMs = opts.windowMs - (now - b.hits[0]);
    throw new ApiError('RATE_LIMITED', opts.messagePlain, {
      detail: { retry_after_s: Math.max(1, Math.ceil(retryMs / 1000)) },
    });
  }
  b.hits.push(now);
  buckets.set(opts.key, b);
}

/** Test seam. */
export function resetRateLimits(): void {
  buckets.clear();
}

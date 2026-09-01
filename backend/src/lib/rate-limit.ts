import type { RequestHandler } from "express";

/**
 * Minimal in-memory fixed-window IP rate limiter.
 *
 * Deliberately dependency-free and process-local — it's for a single public
 * endpoint on a pre-launch landing page (POST /waitlist/signup), not a
 * distributed API surface. Same "small self-contained utility" spirit as
 * `lib/market.ts`'s cache. If the API ever scales to multiple instances or
 * needs shared state, swap this for a Redis-backed limiter behind the same
 * `RequestHandler` shape.
 *
 * Fixed window (not sliding): each IP gets `max` requests per `windowMs`; the
 * counter resets wholesale when the window elapses. Good enough to blunt a
 * naive script; not trying to be a precise token bucket.
 */
export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  /** Response body message on a 429. */
  message?: string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export function createRateLimiter(opts: RateLimiterOptions): RequestHandler {
  const { windowMs, max, message = "Too many requests — please try again in a minute." } = opts;
  const buckets = new Map<string, Bucket>();

  // Opportunistic sweep so an idle process doesn't grow the map forever.
  let lastSweep = Date.now();
  function sweep(now: number) {
    if (now - lastSweep < windowMs) return;
    lastSweep = now;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  return (req, res, next) => {
    const now = Date.now();
    sweep(now);

    // `req.ip` respects the app's `trust proxy` setting (see index.ts), so on
    // Railway it's the real client IP, not the proxy hop. Fall back to a shared
    // bucket if it's somehow absent rather than letting everyone through.
    const key = req.ip || "unknown";

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({ error: message });
    }

    next();
  };
}

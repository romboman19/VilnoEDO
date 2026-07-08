import type { Context, Next } from 'hono';

import { config } from './config';

/// Require the shared `x-api-key` when one is configured. When no key is set
/// the check is skipped (dev) — server.ts refuses to start without a key in
/// production, so this cannot silently run open in prod.
export const apiKeyAuth = async (c: Context, next: Next) => {
  if (config.apiKey.length === 0) {
    return next();
  }

  const provided = c.req.header('x-api-key');

  if (provided !== config.apiKey) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  return next();
};

/// Minimal fixed-window in-memory rate limiter keyed by client IP. Sufficient
/// for a single-instance internal verifier; swap for a shared store if scaled.
const buckets = new Map<string, { count: number; resetAt: number }>();

export const rateLimit = ({ windowMs, max }: { windowMs: number; max: number }) => {
  return async (c: Context, next: Next) => {
    const key = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'local';
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= max) {
      return c.json({ error: 'Too many requests' }, 429);
    }

    bucket.count += 1;
    return next();
  };
};

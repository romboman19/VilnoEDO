import { serve } from '@hono/node-server';
import { Hono } from 'hono';

import { config, isProduction } from './config';
import { ZVerifyRequest } from './contract';
import { getActiveEngine } from './engines/index';
import { apiKeyAuth, rateLimit } from './security';
import { loadTrustSnapshot } from './trust-list/index';
import { runVerification } from './verify-handler';

export const app = new Hono();

app.get('/api/health', (c) => {
  const engine = getActiveEngine();

  return c.json({
    ok: true,
    service: 'ua-kep-verify-service',
    engine: engine.id,
    engineReady: engine.isReady(),
    failClosed: config.failClosed,
    trustListProfile: config.trustListProfile,
  });
});

app.post('/api/verify', rateLimit({ windowMs: 60_000, max: 60 }), apiKeyAuth, async (c) => {
  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = ZVerifyRequest.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
  }

  const result = await runVerification(parsed.data);

  return c.json(result, 200);
});

/// Start the server. Refuse to boot open in production, warm the trust list.
export const start = () => {
  if (isProduction() && config.apiKey.length === 0) {
    throw new Error('UA_KEP_API_KEY must be set in production — refusing to start an open verifier');
  }

  // Warm the Trusted List snapshot in the background; verification lazily loads
  // it too, so a slow/failed first fetch does not block startup.
  void loadTrustSnapshot().catch((error) => {
    console.warn(`[trust-list] initial load failed: ${error instanceof Error ? error.message : String(error)}`);
  });

  serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
    console.log(
      `ua-kep-verify-service listening on ${config.host}:${info.port} (engine=${config.engine}, failClosed=${config.failClosed})`,
    );
  });
};

// Boot when run directly (tsx src/server.ts), not when imported by tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  start();
}

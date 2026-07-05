import { prisma } from '@documenso/prisma';
import { Hono } from 'hono';

import { ingestSignServiceCallback } from '../server/sign-service-callback';

export const signServiceRoute = new Hono().post('/callback', async (c) => {
  // The raw body must be read verbatim for HMAC verification.
  const rawBody = await c.req.text();
  const signatureHeader = c.req.header('X-VilnoCheck-Signature');

  const result = await ingestSignServiceCallback({
    prisma,
    rawBody,
    signatureHeader,
  });

  return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 410 | 422);
});

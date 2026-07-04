import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { prisma } from '@documenso/prisma';
import { Hono } from 'hono';
import { z } from 'zod';

import { ingestSignServiceCallback } from '../server/sign-service-callback';
import { startSignServiceSigning } from '../server/sign-service-session';
import { ZUaKepSigningMethodSchema } from '../types/signing-methods';

const ZStartRequestSchema = z.object({
  recipientId: z.number().int().positive(),
  envelopeId: z.string().min(1),
  recipientToken: z.string().min(1),
  signingMethod: ZUaKepSigningMethodSchema,
});

export const signServiceRoute = new Hono()
  .post('/start', async (c) => {
    const body = await c.req.json();
    const input = ZStartRequestSchema.safeParse(body);

    if (!input.success) {
      return c.json({ ok: false, error: 'Invalid request' }, 400);
    }

    try {
      const result = await startSignServiceSigning({
        prisma,
        recipientId: input.data.recipientId,
        envelopeId: input.data.envelopeId,
        recipientToken: input.data.recipientToken,
        signingMethod: input.data.signingMethod,
        webappUrl: NEXT_PUBLIC_WEBAPP_URL(),
      });

      return c.json({ ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start sign service flow';

      return c.json({ ok: false, error: message }, 422);
    }
  })
  .post('/callback', async (c) => {
    // The raw body must be read verbatim for HMAC verification — do not re-parse
    // and re-serialise before checking the signature.
    const rawBody = await c.req.text();
    const signatureHeader = c.req.header('X-VilnoCheck-Signature');

    const result = await ingestSignServiceCallback({
      prisma,
      rawBody,
      signatureHeader,
    });

    return c.json(result.body, result.status as 200 | 400 | 401 | 404 | 410 | 422);
  });

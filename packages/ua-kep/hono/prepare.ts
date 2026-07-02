import { prisma } from '@documenso/prisma';
import { Hono } from 'hono';
import { z } from 'zod';

import { prepareUaKepSigning } from '../server/prepare-signing';
import { ZUaKepSigningMethodSchema } from '../types/signing-methods';

const ZPrepareRequestSchema = z.object({
  recipientId: z.number().int().positive(),
  envelopeId: z.string().min(1),
  signingMethod: ZUaKepSigningMethodSchema,
});

export const prepareRoute = new Hono().post('/', async (c) => {
  const body = await c.req.json();
  const input = ZPrepareRequestSchema.parse(body);

  const prepared = await prepareUaKepSigning({
    prisma,
    recipientId: input.recipientId,
    envelopeId: input.envelopeId,
    signingMethod: input.signingMethod,
  });

  return c.json({ ok: true, ...prepared });
});

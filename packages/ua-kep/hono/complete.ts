import { prisma } from '@documenso/prisma';
import { Hono } from 'hono';
import { z } from 'zod';

import { completeUaKepSigning } from '../server/embed-signature';

const ZCompleteRequestSchema = z.object({
  recipientId: z.number().int().positive(),
  recipientToken: z.string().min(1),
  envelopeId: z.string().min(1),
  sessionToken: z.string().min(1),
  callbackNonce: z.string().min(1),
  signerInfo: z
    .object({
      subjCN: z.string().optional(),
      issuerCN: z.string().optional(),
      edrpou: z.string().optional(),
      serial: z.string().optional(),
    })
    .nullish(),
  signatures: z
    .array(
      z.object({
        envelopeItemId: z.string().min(1),
        signatureB64: z.string().min(1),
        padesB64: z.string().min(1).optional(),
      }),
    )
    .min(1),
  completeDocument: z.boolean().optional().default(true),
  padesLevel: z.enum(['B_LT', 'B_T']).nullish(),
});

export const completeRoute = new Hono().post('/', async (c) => {
  const body = await c.req.json();
  const input = ZCompleteRequestSchema.safeParse(body);

  if (!input.success) {
    return c.json({ ok: false, error: 'Invalid request' }, 400);
  }

  try {
    const result = await completeUaKepSigning({
      prisma,
      recipientId: input.data.recipientId,
      recipientToken: input.data.recipientToken,
      envelopeId: input.data.envelopeId,
      sessionToken: input.data.sessionToken,
      callbackNonce: input.data.callbackNonce,
      signerInfo: input.data.signerInfo,
      signatures: input.data.signatures,
      completeDocument: input.data.completeDocument,
      padesLevel: input.data.padesLevel ?? null,
    });

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UA KEP signing completion failed';

    // Session, binding and validation rejections are client-addressable
    // failures — surface the reason instead of a bare 500.
    return c.json({ ok: false, error: message }, 422);
  }
});

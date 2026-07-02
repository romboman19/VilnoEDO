import { prisma } from '@documenso/prisma';
import { Hono } from 'hono';
import { z } from 'zod';

import { completeUaKepSigning } from '../server/embed-signature';

const ZCompleteRequestSchema = z.object({
  recipientId: z.number().int().positive(),
  recipientToken: z.string().min(1),
  envelopeId: z.string().min(1),
  signerInfo: z
    .object({
      subjCN: z.string().optional(),
      issuerCN: z.string().optional(),
      edrpou: z.string().optional(),
      serial: z.string().optional(),
    })
    .nullish(),
  signatures: z.array(
    z.object({
      envelopeItemId: z.string().min(1),
      signatureB64: z.string().min(1),
    }),
  ),
});

export const completeRoute = new Hono().post('/', async (c) => {
  const body = await c.req.json();
  const input = ZCompleteRequestSchema.parse(body);

  const result = await completeUaKepSigning({
    prisma,
    recipientId: input.recipientId,
    recipientToken: input.recipientToken,
    envelopeId: input.envelopeId,
    signerInfo: input.signerInfo,
    signatures: input.signatures,
  });

  return c.json(result);
});

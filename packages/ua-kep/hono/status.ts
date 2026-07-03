import { prisma } from '@documenso/prisma';
import { Hono } from 'hono';
import { z } from 'zod';

import { getUaKepSigningStatus } from '../server/status';

const ZStatusQuerySchema = z.object({
  recipientId: z.coerce.number().int().positive(),
  recipientToken: z.string().min(1),
  envelopeId: z.string().min(1),
});

export const statusRoute = new Hono().get('/', async (c) => {
  const query = ZStatusQuerySchema.safeParse(c.req.query());

  if (!query.success) {
    return c.json({ error: 'Invalid request' }, 400);
  }

  const status = await getUaKepSigningStatus({
    prisma,
    input: query.data,
  });

  if (!status) {
    return c.json({ error: 'Not found' }, 404);
  }

  c.header('Cache-Control', 'private, no-store');

  return c.json(status);
});

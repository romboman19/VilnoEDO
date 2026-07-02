import { z } from 'zod';

import { ZUaKepSigningMethodSchema } from './signing-methods';

export const ZUaKepSessionItemSchema = z.object({
  envelopeItemId: z.string(),
  documentDataId: z.string(),
  hashB64: z.string(),
  ordinal: z.number().int().nonnegative(),
});

export const ZUaKepSessionItemsSchema = z.array(ZUaKepSessionItemSchema);

export const ZUaKepSignerInfoSchema = z.object({
  subjCN: z.string().optional(),
  issuerCN: z.string().optional(),
  edrpou: z.string().optional(),
  serial: z.string().optional(),
});

export const ZUaKepSessionStatusSchema = z.enum(['prepared', 'signed', 'failed']);

export const ZUaKepSessionSchema = z.object({
  id: z.string(),
  envelopeId: z.string(),
  signingMethod: ZUaKepSigningMethodSchema,
  signingTime: z.date(),
  itemsJson: ZUaKepSessionItemsSchema,
  signerInfo: ZUaKepSignerInfoSchema.nullish(),
  status: ZUaKepSessionStatusSchema,
  recipientId: z.number().int(),
});

export type TUaKepSessionItems = z.infer<typeof ZUaKepSessionItemsSchema>;

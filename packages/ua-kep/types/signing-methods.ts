import { z } from 'zod';

export const ZUaKepSigningMethodSchema = z.enum([
  'file-key',
  'iit-token',
  'privatbank-smartid',
  'diia-signature',
]);

export const UaKepSigningMethod = ZUaKepSigningMethodSchema.enum;

export type TUaKepSigningMethod = z.infer<typeof ZUaKepSigningMethodSchema>;

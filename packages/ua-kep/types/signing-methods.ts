import { z } from 'zod';

export const ZUaKepSigningMethodSchema = z.enum(['privatbank-jks', 'iit-token', 'smartid']);

export const UaKepSigningMethod = ZUaKepSigningMethodSchema.enum;

export type TUaKepSigningMethod = z.infer<typeof ZUaKepSigningMethodSchema>;

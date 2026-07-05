import { z } from 'zod';

export const UaKepCloudSigningMethods = [
  'privatbank-smartid',
  'diia-signature',
  'depositsign',
  'vchasno',
  'vchasnoQR',
  'cloudkey',
  'esign',
  'smartsigntax',
  'pumb',
  'ugb',
  'alliance',
] as const;

export const UaKepSigningMethods = ['file-key', 'iit-token', ...UaKepCloudSigningMethods] as const;

export const ZUaKepSigningMethodSchema = z.enum(UaKepSigningMethods);

export const UaKepSigningMethod = ZUaKepSigningMethodSchema.enum;

export type TUaKepSigningMethod = z.infer<typeof ZUaKepSigningMethodSchema>;
export type TUaKepCloudSigningMethod = (typeof UaKepCloudSigningMethods)[number];

import { VILNOEDO_UNLOCKED_CLAIM_FLAGS } from '@documenso/lib/types/subscription';
import type { SubscriptionClaim } from '@prisma/client';

export const generateDefaultSubscriptionClaim = (): Omit<
  SubscriptionClaim,
  'id' | 'organisation' | 'createdAt' | 'updatedAt' | 'originalSubscriptionClaimId'
> => {
  return {
    name: '',
    teamCount: 0,
    memberCount: 0,
    envelopeItemCount: 0,
    recipientCount: 0,
    locked: false,
    flags: VILNOEDO_UNLOCKED_CLAIM_FLAGS,

    documentRateLimits: [],
    documentQuota: null,
    emailRateLimits: [],
    emailQuota: null,
    apiRateLimits: [],
    apiQuota: null,
    emailTransportId: null,
  };
};

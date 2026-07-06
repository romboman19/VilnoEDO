-- VilnoEDO: make the default self-hosted claim truly unlimited.
--
-- Count fields use 0 as the local "unlimited" sentinel. This migration is
-- intentionally additive to avoid rewriting historical migrations that may
-- already be applied on deployed instances.

UPDATE "SubscriptionClaim"
SET
  "teamCount" = 0,
  "memberCount" = 0,
  "envelopeItemCount" = 0,
  "recipientCount" = 0,
  "documentRateLimits" = '[]'::jsonb,
  "documentQuota" = NULL,
  "emailRateLimits" = '[]'::jsonb,
  "emailQuota" = NULL,
  "apiRateLimits" = '[]'::jsonb,
  "apiQuota" = NULL,
  "flags" = "flags" || '{
    "unlimitedDocuments": true,
    "allowCustomBranding": true,
    "hidePoweredBy": true,
    "emailDomains": true,
    "embedAuthoring": true,
    "embedAuthoringWhiteLabel": true,
    "embedSigning": true,
    "embedSigningWhiteLabel": true,
    "cfr21": true,
    "hipaa": true,
    "authenticationPortal": true,
    "allowLegacyEnvelopes": true,
    "signingReminders": true,
    "cscQesSigning": true
  }'::jsonb,
  "updatedAt" = NOW()
WHERE "id" = 'free';

UPDATE "OrganisationClaim"
SET
  "teamCount" = 0,
  "memberCount" = 0,
  "envelopeItemCount" = 0,
  "recipientCount" = 0,
  "documentRateLimits" = '[]'::jsonb,
  "documentQuota" = NULL,
  "emailRateLimits" = '[]'::jsonb,
  "emailQuota" = NULL,
  "apiRateLimits" = '[]'::jsonb,
  "apiQuota" = NULL,
  "flags" = "flags" || '{
    "unlimitedDocuments": true,
    "allowCustomBranding": true,
    "hidePoweredBy": true,
    "emailDomains": true,
    "embedAuthoring": true,
    "embedAuthoringWhiteLabel": true,
    "embedSigning": true,
    "embedSigningWhiteLabel": true,
    "cfr21": true,
    "hipaa": true,
    "authenticationPortal": true,
    "allowLegacyEnvelopes": true,
    "signingReminders": true,
    "cscQesSigning": true
  }'::jsonb,
  "updatedAt" = NOW()
WHERE "originalSubscriptionClaimId" = 'free';

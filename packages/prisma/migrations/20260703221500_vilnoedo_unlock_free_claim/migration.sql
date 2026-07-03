-- VilnoEDO fork cleanup (spec section 6): a self-hosted instance must expose
-- all core features without a paid plan or licence key. The upstream 'free'
-- claim is the default for every organisation created while billing is
-- disabled, so unlock it:
--   * teamCount / memberCount 0 = unlimited
--   * envelopeItemCount raised to the top-tier value
--   * all non-enterprise feature flags enabled
--
-- Enterprise flags (cfr21, hipaa, emailDomains, embedAuthoring*,
-- authenticationPortal, cscQesSigning) stay off: they depend on external
-- infrastructure and are watched by the upstream licence client. The
-- operational flag disableEmails also stays off.

UPDATE "SubscriptionClaim"
SET
  "teamCount" = 0,
  "memberCount" = 0,
  "envelopeItemCount" = 10,
  "flags" = "flags" || '{
    "unlimitedDocuments": true,
    "allowCustomBranding": true,
    "hidePoweredBy": true,
    "embedSigning": true,
    "embedSigningWhiteLabel": true,
    "signingReminders": true,
    "allowLegacyEnvelopes": true
  }'::jsonb,
  "updatedAt" = NOW()
WHERE "id" = 'free';

-- Backport the same unlock to organisations that already copied the old
-- restricted free claim.
UPDATE "OrganisationClaim"
SET
  "teamCount" = 0,
  "memberCount" = 0,
  "envelopeItemCount" = 10,
  "flags" = "flags" || '{
    "unlimitedDocuments": true,
    "allowCustomBranding": true,
    "hidePoweredBy": true,
    "embedSigning": true,
    "embedSigningWhiteLabel": true,
    "signingReminders": true,
    "allowLegacyEnvelopes": true
  }'::jsonb,
  "updatedAt" = NOW()
WHERE "originalSubscriptionClaimId" = 'free';

-- VilnoEDO: keep the self-hosted free claim unlimited, but do not enable
-- Enterprise-origin capabilities by default.
--
-- Code defaults only affect newly-created claims. This migration removes the
-- already-backported capability flags from existing subscription and
-- organisation claims, and clears custom-domain sender selections now that
-- Email Domains are no longer exposed in the UI.

UPDATE "SubscriptionClaim"
SET
  "flags" = "flags"
    - 'emailDomains'
    - 'authenticationPortal'
    - 'cfr21'
    - 'hipaa'
    - 'embedAuthoring'
    - 'embedAuthoringWhiteLabel'
    - 'cscQesSigning',
  "updatedAt" = NOW()
WHERE "flags" ?| ARRAY[
  'emailDomains',
  'authenticationPortal',
  'cfr21',
  'hipaa',
  'embedAuthoring',
  'embedAuthoringWhiteLabel',
  'cscQesSigning'
];

UPDATE "OrganisationClaim"
SET
  "flags" = "flags"
    - 'emailDomains'
    - 'authenticationPortal'
    - 'cfr21'
    - 'hipaa'
    - 'embedAuthoring'
    - 'embedAuthoringWhiteLabel'
    - 'cscQesSigning',
  "updatedAt" = NOW()
WHERE "flags" ?| ARRAY[
  'emailDomains',
  'authenticationPortal',
  'cfr21',
  'hipaa',
  'embedAuthoring',
  'embedAuthoringWhiteLabel',
  'cscQesSigning'
];

UPDATE "OrganisationGlobalSettings"
SET "emailId" = NULL
WHERE "emailId" IS NOT NULL;

UPDATE "TeamGlobalSettings"
SET "emailId" = NULL
WHERE "emailId" IS NOT NULL;

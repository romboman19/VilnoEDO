-- VilnoEDO signs through the Ukrainian KEP/UEP flow by default.
-- Disable legacy drawn/typed/uploaded signature methods at every persisted
-- settings level so hidden legacy values do not remain selected in the UI.

ALTER TABLE "DocumentMeta" ALTER COLUMN "typedSignatureEnabled" SET DEFAULT false;
ALTER TABLE "DocumentMeta" ALTER COLUMN "uploadSignatureEnabled" SET DEFAULT false;
ALTER TABLE "DocumentMeta" ALTER COLUMN "drawSignatureEnabled" SET DEFAULT false;

ALTER TABLE "OrganisationGlobalSettings" ALTER COLUMN "typedSignatureEnabled" SET DEFAULT false;
ALTER TABLE "OrganisationGlobalSettings" ALTER COLUMN "uploadSignatureEnabled" SET DEFAULT false;
ALTER TABLE "OrganisationGlobalSettings" ALTER COLUMN "drawSignatureEnabled" SET DEFAULT false;

UPDATE "DocumentMeta"
SET
  "typedSignatureEnabled" = false,
  "uploadSignatureEnabled" = false,
  "drawSignatureEnabled" = false,
  "uaKepSignatureEnabled" = true;

UPDATE "OrganisationGlobalSettings"
SET
  "typedSignatureEnabled" = false,
  "uploadSignatureEnabled" = false,
  "drawSignatureEnabled" = false,
  "uaKepSignatureEnabled" = true;

UPDATE "TeamGlobalSettings"
SET
  "typedSignatureEnabled" = false,
  "uploadSignatureEnabled" = false,
  "drawSignatureEnabled" = false,
  "uaKepSignatureEnabled" = true
WHERE
  "typedSignatureEnabled" IS NOT NULL
  OR "uploadSignatureEnabled" IS NOT NULL
  OR "drawSignatureEnabled" IS NOT NULL
  OR "uaKepSignatureEnabled" IS NOT NULL;

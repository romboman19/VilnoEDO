ALTER TABLE "OrganisationGlobalSettings" ADD COLUMN "uaKepSignatureEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TeamGlobalSettings" ADD COLUMN "uaKepSignatureEnabled" BOOLEAN;

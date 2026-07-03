-- Structured validation/evidence scaffold for accepted UA KEP detached CAdES artifacts.
CREATE TABLE "UaKepTrustMaterialSnapshot" (
    "id" TEXT NOT NULL,
    "uaKepSessionId" TEXT,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'declared',
    "caRegistryUrl" TEXT,
    "caBundleUrl" TEXT,
    "caRegistrySha256" TEXT,
    "caBundleSha256" TEXT,
    "rawSnapshot" JSONB,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UaKepTrustMaterialSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UaKepValidationReport" (
    "id" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "trustMaterialSnapshotId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "validator" TEXT NOT NULL,
    "validationKind" TEXT NOT NULL DEFAULT 'CADES_DETACHED',
    "checkedAt" TIMESTAMP(3),
    "signerInfo" JSONB,
    "certificateStatus" TEXT,
    "validationErrors" JSONB,
    "validationWarnings" JSONB,
    "rawReport" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UaKepValidationReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UaKepValidationReport_artifactId_key"
ON "UaKepValidationReport"("artifactId");

CREATE INDEX "UaKepTrustMaterialSnapshot_uaKepSessionId_idx"
ON "UaKepTrustMaterialSnapshot"("uaKepSessionId");

CREATE INDEX "UaKepTrustMaterialSnapshot_capturedAt_idx"
ON "UaKepTrustMaterialSnapshot"("capturedAt");

CREATE INDEX "UaKepTrustMaterialSnapshot_status_idx"
ON "UaKepTrustMaterialSnapshot"("status");

CREATE INDEX "UaKepValidationReport_trustMaterialSnapshotId_idx"
ON "UaKepValidationReport"("trustMaterialSnapshotId");

CREATE INDEX "UaKepValidationReport_status_idx"
ON "UaKepValidationReport"("status");

CREATE INDEX "UaKepValidationReport_createdAt_idx"
ON "UaKepValidationReport"("createdAt");

ALTER TABLE "UaKepTrustMaterialSnapshot"
ADD CONSTRAINT "UaKepTrustMaterialSnapshot_uaKepSessionId_fkey"
FOREIGN KEY ("uaKepSessionId") REFERENCES "UaKepSession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UaKepValidationReport"
ADD CONSTRAINT "UaKepValidationReport_artifactId_fkey"
FOREIGN KEY ("artifactId") REFERENCES "UaKepSignatureArtifact"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UaKepValidationReport"
ADD CONSTRAINT "UaKepValidationReport_trustMaterialSnapshotId_fkey"
FOREIGN KEY ("trustMaterialSnapshotId") REFERENCES "UaKepTrustMaterialSnapshot"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

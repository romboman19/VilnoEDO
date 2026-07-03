-- Persist a stable evidence manifest for each completed UA KEP signing session.
CREATE TABLE "UaKepEvidencePackage" (
    "id" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "recipientId" INTEGER NOT NULL,
    "uaKepSessionId" TEXT NOT NULL,
    "trustMaterialSnapshotId" TEXT,
    "packageType" TEXT NOT NULL DEFAULT 'UA_KEP_EVIDENCE',
    "packageVersion" INTEGER NOT NULL DEFAULT 1,
    "packageSha256" TEXT NOT NULL,
    "manifestJson" JSONB NOT NULL,
    "artifactCount" INTEGER NOT NULL,
    "validationReportCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UaKepEvidencePackage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UaKepEvidencePackage_uaKepSessionId_key"
ON "UaKepEvidencePackage"("uaKepSessionId");

CREATE INDEX "UaKepEvidencePackage_envelopeId_idx"
ON "UaKepEvidencePackage"("envelopeId");

CREATE INDEX "UaKepEvidencePackage_recipientId_idx"
ON "UaKepEvidencePackage"("recipientId");

CREATE INDEX "UaKepEvidencePackage_trustMaterialSnapshotId_idx"
ON "UaKepEvidencePackage"("trustMaterialSnapshotId");

CREATE INDEX "UaKepEvidencePackage_packageSha256_idx"
ON "UaKepEvidencePackage"("packageSha256");

CREATE INDEX "UaKepEvidencePackage_createdAt_idx"
ON "UaKepEvidencePackage"("createdAt");

ALTER TABLE "UaKepEvidencePackage"
ADD CONSTRAINT "UaKepEvidencePackage_envelopeId_fkey"
FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UaKepEvidencePackage"
ADD CONSTRAINT "UaKepEvidencePackage_recipientId_fkey"
FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UaKepEvidencePackage"
ADD CONSTRAINT "UaKepEvidencePackage_uaKepSessionId_fkey"
FOREIGN KEY ("uaKepSessionId") REFERENCES "UaKepSession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UaKepEvidencePackage"
ADD CONSTRAINT "UaKepEvidencePackage_trustMaterialSnapshotId_fkey"
FOREIGN KEY ("trustMaterialSnapshotId") REFERENCES "UaKepTrustMaterialSnapshot"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

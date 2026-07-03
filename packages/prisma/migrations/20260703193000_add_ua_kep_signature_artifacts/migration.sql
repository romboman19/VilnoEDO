-- Persist detached CAdES artifacts accepted by the UA KEP browser-signing flow.
CREATE TABLE "UaKepSignatureArtifact" (
    "id" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "recipientId" INTEGER NOT NULL,
    "uaKepSessionId" TEXT NOT NULL,
    "envelopeItemId" TEXT NOT NULL,
    "documentDataId" TEXT NOT NULL,
    "signingMethod" TEXT NOT NULL,
    "artifactType" TEXT NOT NULL DEFAULT 'CADES_DETACHED',
    "signatureBase64" TEXT NOT NULL,
    "signatureSha256" TEXT NOT NULL,
    "documentHashB64" TEXT NOT NULL,
    "signerInfo" JSONB,
    "verificationStatus" TEXT NOT NULL DEFAULT 'pending',
    "validationReport" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UaKepSignatureArtifact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UaKepSignatureArtifact_uaKepSessionId_envelopeItemId_key"
ON "UaKepSignatureArtifact"("uaKepSessionId", "envelopeItemId");

CREATE INDEX "UaKepSignatureArtifact_envelopeId_idx"
ON "UaKepSignatureArtifact"("envelopeId");

CREATE INDEX "UaKepSignatureArtifact_recipientId_idx"
ON "UaKepSignatureArtifact"("recipientId");

CREATE INDEX "UaKepSignatureArtifact_envelopeItemId_idx"
ON "UaKepSignatureArtifact"("envelopeItemId");

CREATE INDEX "UaKepSignatureArtifact_verificationStatus_idx"
ON "UaKepSignatureArtifact"("verificationStatus");

ALTER TABLE "UaKepSignatureArtifact"
ADD CONSTRAINT "UaKepSignatureArtifact_envelopeId_fkey"
FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UaKepSignatureArtifact"
ADD CONSTRAINT "UaKepSignatureArtifact_recipientId_fkey"
FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UaKepSignatureArtifact"
ADD CONSTRAINT "UaKepSignatureArtifact_uaKepSessionId_fkey"
FOREIGN KEY ("uaKepSessionId") REFERENCES "UaKepSession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UaKepSignatureArtifact"
ADD CONSTRAINT "UaKepSignatureArtifact_envelopeItemId_fkey"
FOREIGN KEY ("envelopeItemId") REFERENCES "EnvelopeItem"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

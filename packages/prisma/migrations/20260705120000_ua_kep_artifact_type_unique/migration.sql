-- Allow one artifact per (session, envelope item, artifact type) so a single
-- signing session can persist both a detached CAdES and a PAdES artifact for
-- the same document.
DROP INDEX "UaKepSignatureArtifact_uaKepSessionId_envelopeItemId_key";

CREATE UNIQUE INDEX "UaKepSignatureArtifact_session_item_type_key"
  ON "UaKepSignatureArtifact"("uaKepSessionId", "envelopeItemId", "artifactType");

-- Create the UA KEP transient session table. The model already exists in the
-- Prisma schema; this migration makes the database schema explicit and adds
-- the short-lived browser session binding material required by the MVP flow.
CREATE TABLE IF NOT EXISTS "UaKepSession" (
    "id" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "signingMethod" TEXT NOT NULL,
    "signingTime" TIMESTAMP(3) NOT NULL,
    "sessionTokenHash" TEXT,
    "callbackNonce" TEXT,
    "expiresAt" TIMESTAMP(3),
    "itemsJson" JSONB NOT NULL,
    "signerInfo" JSONB,
    "status" TEXT NOT NULL DEFAULT 'prepared',
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "recipientId" INTEGER NOT NULL,

    CONSTRAINT "UaKepSession_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "UaKepSession" ADD COLUMN IF NOT EXISTS "sessionTokenHash" TEXT;
ALTER TABLE "UaKepSession" ADD COLUMN IF NOT EXISTS "callbackNonce" TEXT;
ALTER TABLE "UaKepSession" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "UaKepSession" ADD COLUMN IF NOT EXISTS "signedAt" TIMESTAMP(3);

-- Legacy/in-flight rows cannot be completed securely because the browser never
-- received a token/nonce. Give them deterministic invalid values and a short
-- historical expiry so future prepare calls can safely rotate the row.
UPDATE "UaKepSession"
SET "sessionTokenHash" = CONCAT('legacy-invalid-', "id")
WHERE "sessionTokenHash" IS NULL;

UPDATE "UaKepSession"
SET "callbackNonce" = CONCAT('legacy-invalid-', "id")
WHERE "callbackNonce" IS NULL;

UPDATE "UaKepSession"
SET "expiresAt" = "createdAt" + INTERVAL '15 minutes'
WHERE "expiresAt" IS NULL;

ALTER TABLE "UaKepSession" ALTER COLUMN "sessionTokenHash" SET NOT NULL;
ALTER TABLE "UaKepSession" ALTER COLUMN "callbackNonce" SET NOT NULL;
ALTER TABLE "UaKepSession" ALTER COLUMN "expiresAt" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "UaKepSession_recipientId_key" ON "UaKepSession"("recipientId");
CREATE INDEX IF NOT EXISTS "UaKepSession_expiresAt_idx" ON "UaKepSession"("expiresAt");
CREATE INDEX IF NOT EXISTS "UaKepSession_status_idx" ON "UaKepSession"("status");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'UaKepSession_recipientId_fkey'
    ) THEN
        ALTER TABLE "UaKepSession"
        ADD CONSTRAINT "UaKepSession_recipientId_fkey"
        FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

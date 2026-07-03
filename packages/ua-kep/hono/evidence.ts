import { prisma } from '@documenso/prisma';
import { Hono } from 'hono';
import { z } from 'zod';

import { getUaKepEvidencePackageManifest } from '../server/evidence-package';

const ZEvidenceParamsSchema = z.object({
  evidencePackageId: z.string().min(1),
});

const ZEvidenceQuerySchema = z.object({
  recipientId: z.coerce.number().int().positive(),
  recipientToken: z.string().min(1),
  envelopeId: z.string().min(1),
});

const getSafeJsonFilename = (evidencePackageId: string) => {
  const safeId = evidencePackageId.replace(/[^A-Za-z0-9_-]/g, '_');

  return `ua-kep-evidence-${safeId}.json`;
};

export const evidenceRoute = new Hono().get('/:evidencePackageId/manifest.json', async (c) => {
  const params = ZEvidenceParamsSchema.safeParse(c.req.param());
  const query = ZEvidenceQuerySchema.safeParse(c.req.query());

  if (!params.success || !query.success) {
    return c.json({ error: 'Invalid request' }, 400);
  }

  const evidencePackage = await getUaKepEvidencePackageManifest({
    prisma,
    input: {
      evidencePackageId: params.data.evidencePackageId,
      envelopeId: query.data.envelopeId,
      recipientId: query.data.recipientId,
      recipientToken: query.data.recipientToken,
    },
  });

  if (!evidencePackage) {
    return c.json({ error: 'Not found' }, 404);
  }

  c.header('Cache-Control', 'private, no-store');
  c.header('Content-Disposition', `attachment; filename="${getSafeJsonFilename(evidencePackage.id)}"`);
  c.header('X-Content-Type-Options', 'nosniff');

  return c.json({
    id: evidencePackage.id,
    envelopeId: evidencePackage.envelopeId,
    recipientId: evidencePackage.recipientId,
    uaKepSessionId: evidencePackage.uaKepSessionId,
    trustMaterialSnapshotId: evidencePackage.trustMaterialSnapshotId,
    packageType: evidencePackage.packageType,
    packageVersion: evidencePackage.packageVersion,
    packageSha256: evidencePackage.packageSha256,
    artifactCount: evidencePackage.artifactCount,
    validationReportCount: evidencePackage.validationReportCount,
    createdAt: evidencePackage.createdAt,
    updatedAt: evidencePackage.updatedAt,
    manifest: evidencePackage.manifestJson,
  });
});

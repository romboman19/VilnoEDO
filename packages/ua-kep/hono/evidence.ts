import { prisma } from '@documenso/prisma';
import { Hono } from 'hono';
import { z } from 'zod';

import { buildUaKepEvidenceArchive } from '../server/evidence-archive';
import { getUaKepEvidencePackageManifest } from '../server/evidence-package';

const ZEvidenceParamsSchema = z.object({
  evidencePackageId: z.string().min(1),
});

const ZEvidenceQuerySchema = z.object({
  recipientId: z.coerce.number().int().positive(),
  recipientToken: z.string().min(1),
  envelopeId: z.string().min(1),
});

const getSafeFilename = (evidencePackageId: string, extension: string) => {
  const safeId = evidencePackageId.replace(/[^A-Za-z0-9_-]/g, '_');

  return `ua-kep-evidence-${safeId}.${extension}`;
};

export const evidenceRoute = new Hono()
  .get('/:evidencePackageId/manifest.json', async (c) => {
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
    c.header('Content-Disposition', `attachment; filename="${getSafeFilename(evidencePackage.id, 'json')}"`);
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
  })
  .get('/:evidencePackageId/pades.pdf', async (c) => {
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

    const envelopeItemId = c.req.query('envelopeItemId');

    const padesArtifact = await prisma.uaKepSignatureArtifact.findFirst({
      where: {
        uaKepSessionId: evidencePackage.uaKepSessionId,
        artifactType: { startsWith: 'PADES' },
        ...(envelopeItemId ? { envelopeItemId } : {}),
      },
      select: {
        signatureBase64: true,
        envelopeItem: {
          select: {
            title: true,
          },
        },
      },
      orderBy: {
        envelopeItemId: 'asc',
      },
    });

    if (!padesArtifact) {
      return c.json({ error: 'No PAdES artifact for this evidence package' }, 404);
    }

    const pdfBytes = Buffer.from(padesArtifact.signatureBase64.replace(/\s/g, ''), 'base64');
    const downloadName = `${padesArtifact.envelopeItem.title.replace(/[^A-Za-z0-9Ѐ-ӿ _.()-]+/g, '_').slice(0, 100) || 'document'}-pades.pdf`;

    c.header('Cache-Control', 'private, no-store');
    c.header('Content-Type', 'application/pdf');
    c.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
    c.header('X-Content-Type-Options', 'nosniff');

    return c.body(new Uint8Array(pdfBytes).buffer as ArrayBuffer);
  })
  .get('/:evidencePackageId/archive.zip', async (c) => {
    const params = ZEvidenceParamsSchema.safeParse(c.req.param());
    const query = ZEvidenceQuerySchema.safeParse(c.req.query());

    if (!params.success || !query.success) {
      return c.json({ error: 'Invalid request' }, 400);
    }

    const archive = await buildUaKepEvidenceArchive({
      prisma,
      input: {
        evidencePackageId: params.data.evidencePackageId,
        envelopeId: query.data.envelopeId,
        recipientId: query.data.recipientId,
        recipientToken: query.data.recipientToken,
      },
    });

    if (!archive) {
      return c.json({ error: 'Not found' }, 404);
    }

    c.header('Cache-Control', 'private, no-store');
    c.header('Content-Type', 'application/zip');
    c.header('Content-Disposition', `attachment; filename="${getSafeFilename(archive.evidencePackageId, 'zip')}"`);
    c.header('X-Content-Type-Options', 'nosniff');

    const zipBytes = archive.zipBytes;

    const zipBuffer =
      zipBytes.byteOffset === 0 && zipBytes.byteLength === zipBytes.buffer.byteLength
        ? zipBytes.buffer
        : zipBytes.slice().buffer;

    return c.body(zipBuffer as ArrayBuffer);
  });

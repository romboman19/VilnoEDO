import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@documenso/lib/universal/upload/get-file.server', () => ({
  getFileServerSide: vi.fn(({ data }: { data: string }) => {
    return Promise.resolve(new Uint8Array(Buffer.from(data, 'base64')));
  }),
}));

vi.mock('@documenso/lib/server-only/ua-kep/signing-instruction', () => ({
  generateUaKepSigningInstructionPdf: vi.fn(async () => new Uint8Array(Buffer.from('instruction pdf'))),
}));

import { buildUaKepEvidenceArchive } from './evidence-archive';

type TArchivePrisma = Parameters<typeof buildUaKepEvidenceArchive>[0]['prisma'];

const unwrap = <T>(value: T | null): T => {
  if (value === null) {
    throw new Error('Expected value to be present');
  }

  return value;
};

const FIXED_DATE = new Date('2026-07-03T12:00:00.000Z');

const documentBytes = Buffer.from('original document bytes');
const signatureBytes = Buffer.from('detached cades signature');

const buildPrismaMock = ({ recipientFound = true } = {}) => {
  return {
    recipient: {
      findFirst: vi.fn(async () => (recipientFound ? { id: 7, envelopeId: 'env_1' } : null)),
    },
    uaKepEvidencePackage: {
      findFirst: vi.fn(async () => ({
        id: 'evp_1',
        envelopeId: 'env_1',
        recipientId: 7,
        uaKepSessionId: 'session_1',
        trustMaterialSnapshotId: 'tms_1',
        packageType: 'UA_KEP_EVIDENCE',
        packageVersion: 1,
        packageSha256: 'deadbeef',
        manifestJson: { schema: 'vilnoedo.ua-kep.evidence-package' },
        artifactCount: 2,
        validationReportCount: 2,
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
      })),
    },
    uaKepSignatureArtifact: {
      findMany: vi.fn(async () => [
        {
          id: 'art_1',
          envelopeItemId: 'item_1',
          documentDataId: 'docdata_1',
          signingMethod: 'file-key',
          artifactType: 'CADES_DETACHED',
          signatureBase64: signatureBytes.toString('base64'),
          signatureSha256: 'sig1sha',
          documentHashB64: 'hash1',
          verificationStatus: 'pending',
          envelopeItem: {
            title: 'Договір 1/2026 (оренда).pdf',
            order: 1,
            documentData: {
              type: 'BYTES_64',
              data: documentBytes.toString('base64'),
            },
          },
        },
        {
          id: 'art_2',
          envelopeItemId: 'item_2',
          documentDataId: 'docdata_2',
          signingMethod: 'file-key',
          artifactType: 'CADES_DETACHED',
          signatureBase64: signatureBytes.toString('base64'),
          signatureSha256: 'sig2sha',
          documentHashB64: 'hash2',
          verificationStatus: 'pending',
          envelopeItem: {
            title: 'Додаток.pdf',
            order: 2,
            documentData: {
              type: 'BYTES_64',
              data: documentBytes.toString('base64'),
            },
          },
        },
      ]),
    },
    uaKepValidationReport: {
      findMany: vi.fn(async () => [
        {
          id: 'vr_1',
          artifactId: 'art_1',
          trustMaterialSnapshotId: 'tms_1',
          status: 'pending',
          validator: 'vilnocheck',
          validationKind: 'CADES_DETACHED',
          checkedAt: null,
          signerInfo: null,
          certificateStatus: null,
          validationErrors: null,
          validationWarnings: null,
          rawReport: null,
          createdAt: FIXED_DATE,
          updatedAt: FIXED_DATE,
        },
      ]),
    },
    uaKepTrustMaterialSnapshot: {
      findUnique: vi.fn(async () => ({
        id: 'tms_1',
        source: 'CZO',
        status: 'declared',
        caRegistryUrl: null,
        caBundleUrl: null,
        caRegistrySha256: null,
        caBundleSha256: null,
        rawSnapshot: null,
        capturedAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
      })),
    },
    documentAuditLog: {
      findMany: vi.fn(async () => [
        {
          id: 'log_1',
          type: 'ENVELOPE_CREATED',
          createdAt: FIXED_DATE,
          name: 'Owner',
          email: 'owner@example.com',
          userId: 1,
          userAgent: 'test-agent',
          ipAddress: '127.0.0.1',
          data: {},
        },
      ]),
    },
    envelopeItem: {
      findFirst: vi.fn(async () => null),
    },
  };
};

const baseInput = {
  evidencePackageId: 'evp_1',
  envelopeId: 'env_1',
  recipientId: 7,
  recipientToken: 'token_1',
};

describe('buildUaKepEvidenceArchive', () => {
  it('returns null when the recipient binding does not match', async () => {
    const prisma = buildPrismaMock({ recipientFound: false });

    const result = await buildUaKepEvidenceArchive({
      prisma: prisma as unknown as TArchivePrisma,
      input: baseInput,
    });

    expect(result).toBeNull();
  });

  it('builds a zip with the documented layout', async () => {
    const prisma = buildPrismaMock();

    const result = await buildUaKepEvidenceArchive({
      prisma: prisma as unknown as TArchivePrisma,
      input: baseInput,
    });

    expect(result).not.toBeNull();
    expect(result?.evidencePackageId).toBe('evp_1');

    const entries = unzipSync(unwrap(result).zipBytes);
    const entryNames = Object.keys(entries).sort();

    expect(entryNames).toEqual(
      [
        '01-Договір 1_2026 (оренда).pdf',
        '01-Договір 1_2026 (оренда).pdf.p7s',
        '02-Додаток.pdf',
        '02-Додаток.pdf.p7s',
        'audit/audit-log.json',
        'Інструкція з перевірки підпису.pdf',
        'manifest.json',
        'original/01-Договір 1_2026 (оренда).pdf',
        'original/02-Додаток.pdf',
        'package-info.json',
        'signatures/cades-detached/01-Договір 1_2026 (оренда).pdf.p7s',
        'signatures/cades-detached/02-Додаток.pdf.p7s',
        'trust/trust-material.json',
        'validation/report.json',
      ].sort(),
    );
  });

  it('stores exact original bytes and decoded signature bytes', async () => {
    const prisma = buildPrismaMock();

    const result = await buildUaKepEvidenceArchive({
      prisma: prisma as unknown as TArchivePrisma,
      input: baseInput,
    });

    const entries = unzipSync(unwrap(result).zipBytes);

    expect(Buffer.from(entries['original/02-Додаток.pdf'])).toEqual(documentBytes);
    expect(Buffer.from(entries['signatures/cades-detached/02-Додаток.pdf.p7s'])).toEqual(signatureBytes);
  });

  it('embeds canonical json payloads', async () => {
    const prisma = buildPrismaMock();

    const result = await buildUaKepEvidenceArchive({
      prisma: prisma as unknown as TArchivePrisma,
      input: baseInput,
    });

    const entries = unzipSync(unwrap(result).zipBytes);

    const manifest = JSON.parse(strFromU8(entries['manifest.json']));
    expect(manifest).toEqual({ schema: 'vilnoedo.ua-kep.evidence-package' });

    const packageInfo = JSON.parse(strFromU8(entries['package-info.json']));
    expect(packageInfo.evidencePackageId).toBe('evp_1');
    expect(packageInfo.packageSha256).toBe('deadbeef');

    const auditLog = JSON.parse(strFromU8(entries['audit/audit-log.json']));
    expect(auditLog.events).toHaveLength(1);
    expect(auditLog.events[0].type).toBe('ENVELOPE_CREATED');

    const validation = JSON.parse(strFromU8(entries['validation/report.json']));
    expect(validation.reports).toHaveLength(1);

    const trust = JSON.parse(strFromU8(entries['trust/trust-material.json']));
    expect(trust.snapshot.id).toBe('tms_1');
  });
});

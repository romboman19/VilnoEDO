import { describe, expect, it, vi } from 'vitest';

import { getUaKepSigningStatus } from './status';

type TStatusPrisma = Parameters<typeof getUaKepSigningStatus>[0]['prisma'];

const FIXED_DATE = new Date('2026-07-03T12:00:00.000Z');

const buildPrismaMock = ({
  recipientFound = true,
  sessionFound = true,
}: {
  recipientFound?: boolean;
  sessionFound?: boolean;
} = {}) => {
  return {
    recipient: {
      findFirst: vi.fn(() => Promise.resolve(recipientFound ? { id: 7, envelopeId: 'env_1' } : null)),
    },
    uaKepSession: {
      findUnique: vi.fn(() =>
        Promise.resolve(
          sessionFound
            ? {
                id: 'session_1',
                status: 'signed',
                signingMethod: 'file-key',
                signingTime: FIXED_DATE,
                signedAt: FIXED_DATE,
                signerInfo: { subjCN: 'Тестовий Підписувач' },
              }
            : null,
        ),
      ),
    },
    uaKepSignatureArtifact: {
      findMany: vi.fn(() =>
        Promise.resolve([
          {
            envelopeItemId: 'item_1',
            artifactType: 'CADES_DETACHED',
            verificationStatus: 'passed_structural',
            signatureSha256: 'abc123',
            structuredValidationReport: {
              status: 'passed',
              validator: 'vilnoedo-ua-kep-structural-v1',
              validationKind: 'CADES_DETACHED_STRUCTURAL',
              checkedAt: FIXED_DATE,
              certificateStatus: 'within_validity_window',
              signerInfo: null,
              validationErrors: [],
              validationWarnings: [{ code: 'CRYPTOGRAPHIC_VALIDATION_DELEGATED', message: '…' }],
            },
          },
        ]),
      ),
    },
    uaKepEvidencePackage: {
      findUnique: vi.fn(() =>
        Promise.resolve({
          id: 'evp_1',
          packageSha256: 'deadbeef',
          artifactCount: 1,
          validationReportCount: 1,
          createdAt: FIXED_DATE,
        }),
      ),
    },
  };
};

const baseInput = {
  recipientId: 7,
  recipientToken: 'token_1',
  envelopeId: 'env_1',
};

describe('getUaKepSigningStatus', () => {
  it('returns null when the recipient binding does not match', async () => {
    const prisma = buildPrismaMock({ recipientFound: false });

    const result = await getUaKepSigningStatus({
      prisma: prisma as unknown as TStatusPrisma,
      input: baseInput,
    });

    expect(result).toBeNull();
  });

  it('returns an empty status when no session exists', async () => {
    const prisma = buildPrismaMock({ sessionFound: false });

    const result = await getUaKepSigningStatus({
      prisma: prisma as unknown as TStatusPrisma,
      input: baseInput,
    });

    expect(result?.sessionStatus).toBe('none');
    expect(result?.items).toEqual([]);
    expect(result?.evidencePackage).toBeNull();
  });

  it('returns verdict-level facts without signature bytes or tokens', async () => {
    const prisma = buildPrismaMock();

    const result = await getUaKepSigningStatus({
      prisma: prisma as unknown as TStatusPrisma,
      input: baseInput,
    });

    expect(result?.sessionStatus).toBe('signed');
    expect(result?.items).toHaveLength(1);
    expect(result?.items[0].verificationStatus).toBe('passed_structural');
    expect(result?.items[0].validationReport?.status).toBe('passed');
    expect(result?.evidencePackage?.id).toBe('evp_1');

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('signatureBase64');
    expect(serialized).not.toContain('sessionTokenHash');
    expect(serialized).not.toContain('callbackNonce');
  });
});

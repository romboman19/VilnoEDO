import crypto from 'node:crypto';

import type { PrismaClient } from '@documenso/prisma/client';
import type { Prisma } from '@prisma/client';

type TEvidencePackagePrismaClient = Pick<
  PrismaClient,
  'uaKepEvidencePackage' | 'uaKepSignatureArtifact' | 'uaKepTrustMaterialSnapshot' | 'uaKepValidationReport'
>;

type TEvidencePackageReadPrismaClient = Pick<PrismaClient, 'recipient' | 'uaKepEvidencePackage'>;

type TCreateEvidencePackageInput = {
  session: {
    id: string;
    envelopeId: string;
    recipientId: number;
    signingMethod: string;
    signingTime: Date;
    signedAt: Date | null;
  };
  trustMaterialSnapshotId?: string | null;
};

type TGetEvidencePackageManifestInput = {
  evidencePackageId: string;
  envelopeId: string;
  recipientId: number;
  recipientToken: string;
};

type TCanonicalJson =
  | null
  | boolean
  | number
  | string
  | TCanonicalJson[]
  | {
      [key: string]: TCanonicalJson;
    };

const UA_KEP_EVIDENCE_PACKAGE_TYPE = 'UA_KEP_EVIDENCE';
const UA_KEP_EVIDENCE_PACKAGE_VERSION = 1;

const toCanonicalJson = (value: unknown): TCanonicalJson => {
  if (value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(toCanonicalJson);
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([leftKey], [rightKey]) => {
        if (leftKey < rightKey) {
          return -1;
        }

        if (leftKey > rightKey) {
          return 1;
        }

        return 0;
      });

    return entries.reduce<Record<string, TCanonicalJson>>((acc, [key, entryValue]) => {
      acc[key] = toCanonicalJson(entryValue);
      return acc;
    }, {});
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  return null;
};

const canonicalStringify = (value: unknown) => {
  return JSON.stringify(toCanonicalJson(value));
};

const hashCanonicalJson = (value: unknown) => {
  return crypto.createHash('sha256').update(canonicalStringify(value), 'utf8').digest('hex');
};

export const createUaKepEvidencePackage = async ({
  prisma,
  input,
}: {
  prisma: TEvidencePackagePrismaClient;
  input: TCreateEvidencePackageInput;
}) => {
  const artifacts = await prisma.uaKepSignatureArtifact.findMany({
    where: {
      uaKepSessionId: input.session.id,
    },
    select: {
      id: true,
      envelopeItemId: true,
      documentDataId: true,
      signingMethod: true,
      artifactType: true,
      signatureSha256: true,
      documentHashB64: true,
      signerInfo: true,
      verificationStatus: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      envelopeItemId: 'asc',
    },
  });

  if (artifacts.length === 0) {
    throw new Error('Cannot create UA KEP evidence package without signature artifacts');
  }

  const artifactIds = artifacts.map((artifact) => artifact.id);

  const validationReports = await prisma.uaKepValidationReport.findMany({
    where: {
      artifactId: {
        in: artifactIds,
      },
    },
    select: {
      id: true,
      artifactId: true,
      trustMaterialSnapshotId: true,
      status: true,
      validator: true,
      validationKind: true,
      checkedAt: true,
      signerInfo: true,
      certificateStatus: true,
      validationErrors: true,
      validationWarnings: true,
      rawReport: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      artifactId: 'asc',
    },
  });

  const trustMaterialSnapshot = input.trustMaterialSnapshotId
    ? await prisma.uaKepTrustMaterialSnapshot.findUnique({
        where: {
          id: input.trustMaterialSnapshotId,
        },
        select: {
          id: true,
          source: true,
          status: true,
          caRegistryUrl: true,
          caBundleUrl: true,
          caRegistrySha256: true,
          caBundleSha256: true,
          rawSnapshot: true,
          capturedAt: true,
          updatedAt: true,
        },
      })
    : null;

  const manifestJson = toCanonicalJson({
    schema: 'vilnoedo.ua-kep.evidence-package',
    packageType: UA_KEP_EVIDENCE_PACKAGE_TYPE,
    packageVersion: UA_KEP_EVIDENCE_PACKAGE_VERSION,
    envelopeId: input.session.envelopeId,
    recipientId: input.session.recipientId,
    uaKepSessionId: input.session.id,
    signingMethod: input.session.signingMethod,
    signingTime: input.session.signingTime,
    signedAt: input.session.signedAt,
    summary: {
      artifactCount: artifacts.length,
      validationReportCount: validationReports.length,
      trustMaterialSnapshotId: trustMaterialSnapshot?.id ?? null,
    },
    artifacts: artifacts.map((artifact) => ({
      id: artifact.id,
      envelopeItemId: artifact.envelopeItemId,
      documentDataId: artifact.documentDataId,
      signingMethod: artifact.signingMethod,
      artifactType: artifact.artifactType,
      signatureSha256: artifact.signatureSha256,
      documentHashB64: artifact.documentHashB64,
      signerInfo: artifact.signerInfo,
      verificationStatus: artifact.verificationStatus,
      createdAt: artifact.createdAt,
      updatedAt: artifact.updatedAt,
    })),
    validationReports: validationReports.map((report) => ({
      id: report.id,
      artifactId: report.artifactId,
      trustMaterialSnapshotId: report.trustMaterialSnapshotId,
      status: report.status,
      validator: report.validator,
      validationKind: report.validationKind,
      checkedAt: report.checkedAt,
      signerInfo: report.signerInfo,
      certificateStatus: report.certificateStatus,
      validationErrors: report.validationErrors,
      validationWarnings: report.validationWarnings,
      rawReport: report.rawReport,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    })),
    trustMaterialSnapshot,
  }) as Prisma.InputJsonObject;

  const packageSha256 = hashCanonicalJson(manifestJson);

  const evidencePackage = await prisma.uaKepEvidencePackage.upsert({
    where: {
      uaKepSessionId: input.session.id,
    },
    create: {
      envelopeId: input.session.envelopeId,
      recipientId: input.session.recipientId,
      uaKepSessionId: input.session.id,
      trustMaterialSnapshotId: trustMaterialSnapshot?.id ?? null,
      packageType: UA_KEP_EVIDENCE_PACKAGE_TYPE,
      packageVersion: UA_KEP_EVIDENCE_PACKAGE_VERSION,
      packageSha256,
      manifestJson,
      artifactCount: artifacts.length,
      validationReportCount: validationReports.length,
    },
    update: {
      trustMaterialSnapshotId: trustMaterialSnapshot?.id ?? null,
      packageType: UA_KEP_EVIDENCE_PACKAGE_TYPE,
      packageVersion: UA_KEP_EVIDENCE_PACKAGE_VERSION,
      packageSha256,
      manifestJson,
      artifactCount: artifacts.length,
      validationReportCount: validationReports.length,
    },
    select: {
      id: true,
      packageSha256: true,
      artifactCount: true,
      validationReportCount: true,
      trustMaterialSnapshotId: true,
    },
  });

  return {
    evidencePackage,
  };
};

export const getUaKepEvidencePackageManifest = async ({
  prisma,
  input,
}: {
  prisma: TEvidencePackageReadPrismaClient;
  input: TGetEvidencePackageManifestInput;
}) => {
  const recipient = await prisma.recipient.findFirst({
    where: {
      id: input.recipientId,
      token: input.recipientToken,
      envelopeId: input.envelopeId,
    },
    select: {
      id: true,
      envelopeId: true,
    },
  });

  if (!recipient) {
    return null;
  }

  return prisma.uaKepEvidencePackage.findFirst({
    where: {
      id: input.evidencePackageId,
      envelopeId: recipient.envelopeId,
      recipientId: recipient.id,
    },
    select: {
      id: true,
      envelopeId: true,
      recipientId: true,
      uaKepSessionId: true,
      trustMaterialSnapshotId: true,
      packageType: true,
      packageVersion: true,
      packageSha256: true,
      manifestJson: true,
      artifactCount: true,
      validationReportCount: true,
      createdAt: true,
      updatedAt: true,
    },
  });
};

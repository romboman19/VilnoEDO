import { getFileServerSide } from '@documenso/lib/universal/upload/get-file.server';
import type { PrismaClient } from '@documenso/prisma/client';
import { zipSync } from 'fflate';

import { canonicalStringify } from './evidence-package';

type TEvidenceArchivePrismaClient = Pick<
  PrismaClient,
  | 'recipient'
  | 'uaKepEvidencePackage'
  | 'uaKepSignatureArtifact'
  | 'uaKepValidationReport'
  | 'uaKepTrustMaterialSnapshot'
  | 'documentAuditLog'
  | 'envelopeItem'
>;

type TBuildEvidenceArchiveInput = {
  evidencePackageId: string;
  envelopeId: string;
  recipientId: number;
  recipientToken: string;
};

const textEncoder = new TextEncoder();

/// Keep archive entry names portable: allow letters, digits, spaces and a few
/// safe punctuation characters, replace everything else, cap length.
const sanitizeEntryName = (name: string) => {
  const sanitized = name
    .replace(/[^\p{L}\p{N} ._()-]+/gu, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  return sanitized.length > 0 && sanitized !== '.' ? sanitized : 'document';
};

const decodeSignatureBase64 = (signatureBase64: string) => {
  return new Uint8Array(Buffer.from(signatureBase64.replace(/\s/g, ''), 'base64'));
};

export const buildUaKepEvidenceArchive = async ({
  prisma,
  input,
}: {
  prisma: TEvidenceArchivePrismaClient;
  input: TBuildEvidenceArchiveInput;
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

  const evidencePackage = await prisma.uaKepEvidencePackage.findFirst({
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

  if (!evidencePackage) {
    return null;
  }

  const artifacts = await prisma.uaKepSignatureArtifact.findMany({
    where: {
      uaKepSessionId: evidencePackage.uaKepSessionId,
    },
    select: {
      id: true,
      envelopeItemId: true,
      documentDataId: true,
      signingMethod: true,
      artifactType: true,
      signatureBase64: true,
      signatureSha256: true,
      documentHashB64: true,
      verificationStatus: true,
      envelopeItem: {
        select: {
          title: true,
          order: true,
          documentData: {
            select: {
              type: true,
              data: true,
            },
          },
        },
      },
    },
    orderBy: {
      envelopeItemId: 'asc',
    },
  });

  if (artifacts.length === 0) {
    return null;
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

  const trustMaterialSnapshot = evidencePackage.trustMaterialSnapshotId
    ? await prisma.uaKepTrustMaterialSnapshot.findUnique({
        where: {
          id: evidencePackage.trustMaterialSnapshotId,
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

  const auditLogs = await prisma.documentAuditLog.findMany({
    where: {
      envelopeId: recipient.envelopeId,
    },
    select: {
      id: true,
      type: true,
      createdAt: true,
      name: true,
      email: true,
      userId: true,
      userAgent: true,
      ipAddress: true,
      data: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  const entries: Record<string, [Uint8Array, { level: 0 | 6; mtime: Date }]> = {};

  // Pin entry mtimes to package updatedAt so re-exports stay byte-stable.
  const mtime = evidencePackage.updatedAt;

  const addJsonEntry = (path: string, value: unknown) => {
    entries[path] = [textEncoder.encode(canonicalStringify(value)), { level: 6, mtime }];
  };

  const addBinaryEntry = (path: string, bytes: Uint8Array) => {
    entries[path] = [bytes, { level: 0, mtime }];
  };

  const usedNames = new Set<string>();

  // One signing session can produce several artifact types (detached CAdES,
  // PAdES PDF) for the same envelope item — group them so `original/` holds
  // one copy of each document.
  const artifactsByEnvelopeItemId = new Map<string, typeof artifacts>();

  for (const artifact of artifacts) {
    const group = artifactsByEnvelopeItemId.get(artifact.envelopeItemId) ?? [];
    group.push(artifact);
    artifactsByEnvelopeItemId.set(artifact.envelopeItemId, group);
  }

  let ordinalIndex = 0;

  for (const group of artifactsByEnvelopeItemId.values()) {
    ordinalIndex += 1;

    const [firstArtifact] = group;
    const ordinal = String(ordinalIndex).padStart(2, '0');
    let baseName = `${ordinal}-${sanitizeEntryName(firstArtifact.envelopeItem.title)}`;

    while (usedNames.has(baseName)) {
      baseName = `${baseName}_`;
    }

    usedNames.add(baseName);

    const documentBytes = await getFileServerSide({
      type: firstArtifact.envelopeItem.documentData.type,
      data: firstArtifact.envelopeItem.documentData.data,
    });

    addBinaryEntry(`original/${baseName}`, documentBytes);

    for (const artifact of group) {
      if (artifact.artifactType.startsWith('PADES')) {
        addBinaryEntry(`signatures/pades/${baseName}.pdf`, decodeSignatureBase64(artifact.signatureBase64));
      } else {
        addBinaryEntry(`signatures/cades-detached/${baseName}.p7s`, decodeSignatureBase64(artifact.signatureBase64));
      }
    }
  }

  addJsonEntry('manifest.json', evidencePackage.manifestJson);

  addJsonEntry('package-info.json', {
    schema: 'vilnoedo.ua-kep.evidence-archive',
    evidencePackageId: evidencePackage.id,
    envelopeId: evidencePackage.envelopeId,
    recipientId: evidencePackage.recipientId,
    uaKepSessionId: evidencePackage.uaKepSessionId,
    packageType: evidencePackage.packageType,
    packageVersion: evidencePackage.packageVersion,
    packageSha256: evidencePackage.packageSha256,
    artifactCount: evidencePackage.artifactCount,
    validationReportCount: evidencePackage.validationReportCount,
    createdAt: evidencePackage.createdAt,
    updatedAt: evidencePackage.updatedAt,
    layout: {
      'original/': 'Exact document bytes covered by the detached signatures',
      'signatures/cades-detached/': 'Detached CAdES signatures (.p7s)',
      'signatures/pades/': 'PDF documents with embedded PAdES signature',
      'validation/report.json': 'Structured validation reports',
      'audit/audit-log.json': 'Envelope audit log events',
      'trust/trust-material.json': 'Trust material snapshot used for validation',
      'manifest.json': 'Canonical evidence manifest (SHA-256 = packageSha256)',
    },
  });

  addJsonEntry('validation/report.json', {
    schema: 'vilnoedo.ua-kep.validation-reports',
    evidencePackageId: evidencePackage.id,
    reports: validationReports,
  });

  addJsonEntry('audit/audit-log.json', {
    schema: 'vilnoedo.ua-kep.audit-log',
    envelopeId: evidencePackage.envelopeId,
    events: auditLogs,
  });

  addJsonEntry('trust/trust-material.json', {
    schema: 'vilnoedo.ua-kep.trust-material',
    evidencePackageId: evidencePackage.id,
    snapshot: trustMaterialSnapshot,
  });

  const zipBytes = zipSync(entries);

  return {
    evidencePackageId: evidencePackage.id,
    zipBytes,
  };
};

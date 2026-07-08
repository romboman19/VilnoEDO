import type { PrismaClient } from '@documenso/prisma/client';
import type { Prisma } from '@prisma/client';

import type { TUaKepPersistedArtifact } from './artifacts';
import type { TStructuralVerdict } from './structural-validation';
import { UA_KEP_STRUCTURAL_VALIDATOR_ID } from './structural-validation';

type TValidationPrismaClient = Pick<PrismaClient, 'uaKepTrustMaterialSnapshot' | 'uaKepValidationReport'>;

type TCreateReportsInput = {
  session: {
    id: string;
  };
  artifacts: TUaKepPersistedArtifact[];
  verdicts: TStructuralVerdict[];
  validationTime: Date;
};

const UA_KEP_CA_REGISTRY_URL = '/ua-kep/data/CAs.json';
const UA_KEP_CA_BUNDLE_URL = '/ua-kep/data/CACertificates.p7b';

const toJsonObject = (value: unknown): Prisma.InputJsonObject | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Prisma.InputJsonObject;
};

const toJsonArray = (value: unknown[]): Prisma.InputJsonArray => {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonArray;
};

export const createUaKepValidationReports = async ({
  prisma,
  input,
}: {
  prisma: TValidationPrismaClient;
  input: TCreateReportsInput;
}) => {
  if (input.artifacts.length === 0) {
    return {
      trustMaterialSnapshotId: null,
      count: 0,
    };
  }

  const verdictsByEnvelopeItemId = new Map(input.verdicts.map((verdict) => [verdict.envelopeItemId, verdict]));

  const trustMaterialSnapshot = await prisma.uaKepTrustMaterialSnapshot.create({
    data: {
      uaKepSessionId: input.session.id,
      source: 'vilnoedo-ua-kep-static-assets',
      status: 'declared',
      caRegistryUrl: UA_KEP_CA_REGISTRY_URL,
      caBundleUrl: UA_KEP_CA_BUNDLE_URL,
      rawSnapshot: {
        caRegistryUrl: UA_KEP_CA_REGISTRY_URL,
        caBundleUrl: UA_KEP_CA_BUNDLE_URL,
        note: 'Issuer CNs from the bundled registry were used for structural validation; full cryptographic verification (DSTU-4145 signature math, certificate chain, revocation) is out of scope for this instance and will be added once the validation approach is decided.',
      },
    },
  });

  const result = await prisma.uaKepValidationReport.createMany({
    data: input.artifacts.map((artifact) => {
      const verdict = verdictsByEnvelopeItemId.get(artifact.envelopeItemId);
      const parsed = verdict?.parsed ?? null;

      const enrichedSignerInfo = {
        ...(toJsonObject(artifact.signerInfo) ?? {}),
        ...(parsed?.signerCertificate
          ? {
              certSubjectCn: parsed.signerCertificate.subjectCommonName,
              certIssuerCn: parsed.signerCertificate.issuerCommonName,
              certSerialHex: parsed.signerCertificate.serialNumberHex,
              certNotBefore: parsed.signerCertificate.notBefore.toISOString(),
              certNotAfter: parsed.signerCertificate.notAfter.toISOString(),
            }
          : {}),
      };

      return {
        artifactId: artifact.id,
        trustMaterialSnapshotId: trustMaterialSnapshot.id,
        status: verdict?.status ?? 'pending',
        validator: UA_KEP_STRUCTURAL_VALIDATOR_ID,
        validationKind: 'CADES_DETACHED_STRUCTURAL',
        checkedAt: input.validationTime,
        certificateStatus: verdict?.certificateStatus ?? null,
        signerInfo: toJsonObject(enrichedSignerInfo),
        validationErrors: verdict ? toJsonArray(verdict.errors) : undefined,
        validationWarnings: toJsonArray(verdict?.warnings ?? []),
        rawReport: {
          envelopeId: artifact.envelopeId,
          recipientId: artifact.recipientId,
          uaKepSessionId: artifact.uaKepSessionId,
          envelopeItemId: artifact.envelopeItemId,
          documentDataId: artifact.documentDataId,
          signingMethod: artifact.signingMethod,
          signatureSha256: artifact.signatureSha256,
          documentHashB64: artifact.documentHashB64,
          structural: parsed
            ? {
                isDetached: parsed.isDetached,
                digestAlgorithmOid: parsed.digestAlgorithmOid,
                signatureAlgorithmOid: parsed.signatureAlgorithmOid,
                contentTypeOid: parsed.contentTypeOid,
                messageDigestB64: parsed.messageDigestB64,
                signingTime: parsed.signingTime?.toISOString() ?? null,
                certificateCount: parsed.certificateCount,
              }
            : null,
        },
      };
    }),
  });

  return {
    trustMaterialSnapshotId: trustMaterialSnapshot.id,
    count: result.count,
  };
};

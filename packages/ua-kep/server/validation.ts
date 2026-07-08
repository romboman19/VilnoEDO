import type { PrismaClient } from '@documenso/prisma/client';
import type { Prisma } from '@prisma/client';

import type { TUaKepPersistedArtifact } from './artifacts';
import type { TStructuralVerdict } from './structural-validation';
import { UA_KEP_STRUCTURAL_VALIDATOR_ID } from './structural-validation';
import type { TFullVerificationResult } from './verification';

type TValidationPrismaClient = Pick<PrismaClient, 'uaKepTrustMaterialSnapshot' | 'uaKepValidationReport'>;

const UA_KEP_CRYPTO_VALIDATOR_ID = 'external-verification-service';

type TCreateReportsInput = {
  session: {
    id: string;
  };
  artifacts: TUaKepPersistedArtifact[];
  verdicts: TStructuralVerdict[];
  cryptoResults?: Map<string, TFullVerificationResult>;
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
        note: 'Issuer CNs from the bundled registry were used for structural validation; chain and revocation checks are performed by the external verification service when configured.',
      },
    },
  });

  const result = await prisma.uaKepValidationReport.createMany({
    data: input.artifacts.map((artifact) => {
      const verdict = verdictsByEnvelopeItemId.get(artifact.envelopeItemId);
      const parsed = verdict?.parsed ?? null;
      const crypto = input.cryptoResults?.get(artifact.envelopeItemId) ?? null;

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
        ...(crypto
          ? {
              legalClass: crypto.legalClass,
              cryptoSignerCn: crypto.signerCN,
              cryptoIssuerCn: crypto.issuer,
              cryptoCertSerial: crypto.certSerial,
            }
          : {}),
      };

      // The delegation warning only applies while crypto verification has not
      // actually run for this artifact.
      const warnings = (verdict?.warnings ?? []).filter(
        (warning) => !(crypto && warning.code === 'CRYPTOGRAPHIC_VALIDATION_DELEGATED'),
      );

      const status = crypto ? (crypto.valid ? 'passed' : 'failed') : (verdict?.status ?? 'pending');

      return {
        artifactId: artifact.id,
        trustMaterialSnapshotId: trustMaterialSnapshot.id,
        status,
        validator: crypto ? UA_KEP_CRYPTO_VALIDATOR_ID : UA_KEP_STRUCTURAL_VALIDATOR_ID,
        validationKind: crypto ? 'CADES_DETACHED_CRYPTO' : 'CADES_DETACHED_STRUCTURAL',
        checkedAt: input.validationTime,
        certificateStatus: verdict?.certificateStatus ?? null,
        signerInfo: toJsonObject(enrichedSignerInfo),
        validationErrors: verdict ? toJsonArray(verdict.errors) : undefined,
        validationWarnings: toJsonArray(warnings),
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
          crypto: crypto
            ? JSON.parse(
                JSON.stringify({
                  valid: crypto.valid,
                  unavailable: crypto.unavailable,
                  legalClass: crypto.legalClass,
                  signerCN: crypto.signerCN,
                  signingTime: crypto.signingTime,
                  certSerial: crypto.certSerial,
                  issuer: crypto.issuer,
                  validationReport: crypto.validationReport,
                }),
              )
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

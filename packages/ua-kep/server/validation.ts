import type { PrismaClient } from '@documenso/prisma/client';
import type { Prisma } from '@prisma/client';

import type { TUaKepPersistedArtifact } from './artifacts';

type TValidationPrismaClient = Pick<PrismaClient, 'uaKepTrustMaterialSnapshot' | 'uaKepValidationReport'>;

type TCreatePendingReportsInput = {
  session: {
    id: string;
  };
  artifacts: TUaKepPersistedArtifact[];
};

const UA_KEP_CA_REGISTRY_URL = '/ua-kep/data/CAs.json';
const UA_KEP_CA_BUNDLE_URL = '/ua-kep/data/CACertificates.p7b';
const UA_KEP_MVP_VALIDATOR_ID = 'vilnoedo-ua-kep-mvp';

const toJsonObject = (value: unknown): Prisma.InputJsonObject | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Prisma.InputJsonObject;
};

export const createPendingUaKepValidationReports = async ({
  prisma,
  input,
}: {
  prisma: TValidationPrismaClient;
  input: TCreatePendingReportsInput;
}) => {
  if (input.artifacts.length === 0) {
    return {
      trustMaterialSnapshotId: null,
      count: 0,
    };
  }

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
        note: 'Trust material inputs declared at completion time; cryptographic validation is pending validator integration.',
      },
    },
  });

  const result = await prisma.uaKepValidationReport.createMany({
    data: input.artifacts.map((artifact) => ({
      artifactId: artifact.id,
      trustMaterialSnapshotId: trustMaterialSnapshot.id,
      status: 'pending',
      validator: UA_KEP_MVP_VALIDATOR_ID,
      validationKind: 'CADES_DETACHED',
      signerInfo: toJsonObject(artifact.signerInfo),
      validationWarnings: [
        {
          code: 'CRYPTOGRAPHIC_VALIDATION_PENDING',
          message: 'Detached CAdES artifact was accepted by the workflow; full cryptographic validation has not run yet.',
        },
      ],
      rawReport: {
        envelopeId: artifact.envelopeId,
        recipientId: artifact.recipientId,
        uaKepSessionId: artifact.uaKepSessionId,
        envelopeItemId: artifact.envelopeItemId,
        documentDataId: artifact.documentDataId,
        signingMethod: artifact.signingMethod,
        signatureSha256: artifact.signatureSha256,
        documentHashB64: artifact.documentHashB64,
      },
    })),
  });

  return {
    trustMaterialSnapshotId: trustMaterialSnapshot.id,
    count: result.count,
  };
};

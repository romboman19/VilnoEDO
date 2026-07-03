import type { PrismaClient } from '@documenso/prisma/client';

type TStatusPrismaClient = Pick<
  PrismaClient,
  'recipient' | 'uaKepSession' | 'uaKepSignatureArtifact' | 'uaKepEvidencePackage'
>;

type TGetSigningStatusInput = {
  recipientId: number;
  recipientToken: string;
  envelopeId: string;
};

/// Token-bound read model for the recipient-facing signing UI. Never exposes
/// signature bytes, session tokens or nonces — only verdict-level facts.
export const getUaKepSigningStatus = async ({
  prisma,
  input,
}: {
  prisma: TStatusPrismaClient;
  input: TGetSigningStatusInput;
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

  const session = await prisma.uaKepSession.findUnique({
    where: {
      recipientId: recipient.id,
    },
    select: {
      id: true,
      status: true,
      signingMethod: true,
      signingTime: true,
      signedAt: true,
      signerInfo: true,
    },
  });

  if (!session) {
    return {
      sessionStatus: 'none' as const,
      signingMethod: null,
      signedAt: null,
      signerInfo: null,
      items: [],
      evidencePackage: null,
    };
  }

  const artifacts = await prisma.uaKepSignatureArtifact.findMany({
    where: {
      uaKepSessionId: session.id,
    },
    select: {
      envelopeItemId: true,
      artifactType: true,
      verificationStatus: true,
      signatureSha256: true,
      structuredValidationReport: {
        select: {
          status: true,
          validator: true,
          validationKind: true,
          checkedAt: true,
          certificateStatus: true,
          signerInfo: true,
          validationErrors: true,
          validationWarnings: true,
        },
      },
    },
    orderBy: {
      envelopeItemId: 'asc',
    },
  });

  const evidencePackage = await prisma.uaKepEvidencePackage.findUnique({
    where: {
      uaKepSessionId: session.id,
    },
    select: {
      id: true,
      packageSha256: true,
      artifactCount: true,
      validationReportCount: true,
      createdAt: true,
    },
  });

  return {
    sessionStatus: session.status,
    signingMethod: session.signingMethod,
    signedAt: session.signedAt,
    signerInfo: session.signerInfo,
    items: artifacts.map((artifact) => ({
      envelopeItemId: artifact.envelopeItemId,
      artifactType: artifact.artifactType,
      verificationStatus: artifact.verificationStatus,
      signatureSha256: artifact.signatureSha256,
      validationReport: artifact.structuredValidationReport,
    })),
    evidencePackage,
  };
};

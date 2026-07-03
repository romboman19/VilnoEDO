import { completeDocumentWithToken } from '@documenso/lib/server-only/document/complete-document-with-token';
import type { PrismaClient } from '@documenso/prisma/client';

import { ZUaKepSessionItemsSchema } from '../types/session';
import { persistUaKepSignatureArtifacts } from './artifacts';
import { createPendingUaKepValidationReports } from './validation';
import { markUaKepSessionSigned, verifyUaKepPreparedSession } from './session';

export const completeUaKepSigning = async ({
  prisma,
  recipientId,
  recipientToken,
  envelopeId,
  sessionToken,
  callbackNonce,
  signerInfo,
  signatures,
}: {
  prisma: PrismaClient;
  recipientId: number;
  recipientToken: string;
  envelopeId: string;
  sessionToken: string;
  callbackNonce: string;
  signerInfo?: {
    subjCN?: string;
    issuerCN?: string;
    edrpou?: string;
    serial?: string;
  } | null;
  signatures: Array<{
    envelopeItemId: string;
    signatureB64: string;
  }>;
}) => {
  const session = await prisma.uaKepSession.findUnique({
    where: { recipientId },
    include: {
      recipient: {
        select: {
          token: true,
          envelopeId: true,
          expiresAt: true,
        },
      },
    },
  });

  if (!session) {
    throw new Error('UA KEP session not found');
  }

  if (session.recipient.token !== recipientToken || session.recipient.envelopeId !== envelopeId) {
    throw new Error('Recipient mismatch');
  }

  const now = new Date();

  if (session.recipient.expiresAt && session.recipient.expiresAt <= now) {
    throw new Error('Recipient signing link expired');
  }

  verifyUaKepPreparedSession({
    session,
    envelopeId,
    sessionToken,
    callbackNonce,
    now,
  });

  const preparedItems = ZUaKepSessionItemsSchema.parse(session.itemsJson);
  const preparedEnvelopeItemIds = new Set(preparedItems.map((item) => item.envelopeItemId));
  const signedEnvelopeItemIds = new Set<string>();

  for (const signature of signatures) {
    if (!preparedEnvelopeItemIds.has(signature.envelopeItemId)) {
      throw new Error('UA KEP signature item mismatch');
    }

    if (signedEnvelopeItemIds.has(signature.envelopeItemId)) {
      throw new Error('Duplicate UA KEP signature item');
    }

    signedEnvelopeItemIds.add(signature.envelopeItemId);
  }

  if (signedEnvelopeItemIds.size !== preparedEnvelopeItemIds.size) {
    throw new Error('Missing UA KEP signature items');
  }

  const persistenceResult = await prisma.$transaction(async (tx) => {
    await markUaKepSessionSigned({
      prisma: tx,
      recipientId,
      signerInfo,
    });

    const persistedArtifacts = await persistUaKepSignatureArtifacts({
      prisma: tx,
      input: {
        session,
        preparedItems,
        signatures,
        signerInfo,
      },
    });

    const validationReports = await createPendingUaKepValidationReports({
      prisma: tx,
      input: {
        session,
        artifacts: persistedArtifacts.artifacts,
      },
    });

    return {
      persistedArtifacts,
      validationReports,
    };
  });

  const completionResult = await completeDocumentWithToken({
    token: recipientToken,
    id: envelopeId as unknown as Parameters<typeof completeDocumentWithToken>[0]['id'],
  });

  return {
    ok: true,
    sessionId: session.id,
    signaturesAccepted: signatures.length,
    signatureArtifactsStored: persistenceResult.persistedArtifacts.count,
    validationReportsCreated: persistenceResult.validationReports.count,
    trustMaterialSnapshotId: persistenceResult.validationReports.trustMaterialSnapshotId,
    status: 'signed',
    completionResult,
  };
};

import { completeDocumentWithToken } from '@documenso/lib/server-only/document/complete-document-with-token';
import type { PrismaClient } from '@documenso/prisma/client';

import { markUaKepSessionSigned } from './session';

export const completeUaKepSigning = async ({
  prisma,
  recipientId,
  recipientToken,
  envelopeId,
  signerInfo,
  signatures,
}: {
  prisma: PrismaClient;
  recipientId: number;
  recipientToken: string;
  envelopeId: string;
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
  const session = await prisma.uaKepSession.findUnique({ where: { recipientId } });

  if (!session) {
    throw new Error('UA KEP session not found');
  }

  if (session.envelopeId !== envelopeId) {
    throw new Error('Envelope mismatch');
  }

  await markUaKepSessionSigned({
    prisma,
    recipientId,
    signerInfo,
  });

  const completionResult = await completeDocumentWithToken({
    token: recipientToken,
    id: envelopeId as unknown as Parameters<typeof completeDocumentWithToken>[0]['id'],
  });

  return {
    ok: true,
    sessionId: session.id,
    signaturesAccepted: signatures.length,
    status: 'signed',
    completionResult,
  };
};

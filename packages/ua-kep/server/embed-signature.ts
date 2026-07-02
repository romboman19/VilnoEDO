import type { PrismaClient } from '@documenso/prisma/client';

import { markUaKepSessionSigned } from './session';

export const completeUaKepSigning = async ({
  prisma,
  recipientId,
  envelopeId,
  signerInfo,
  signatures,
}: {
  prisma: PrismaClient;
  recipientId: number;
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

  return {
    ok: true,
    sessionId: session.id,
    signaturesAccepted: signatures.length,
    status: 'signed',
  };
};

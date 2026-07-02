import crypto from 'node:crypto';

import type { PrismaClient } from '@documenso/prisma/client';
import type { TUaKepSigningMethod } from '../types/signing-methods';
import { upsertUaKepPreparedSession } from './session';

export const prepareUaKepSigning = async ({
  prisma,
  recipientId,
  envelopeId,
  recipientToken,
  signingMethod,
}: {
  prisma: PrismaClient;
  recipientId: number;
  envelopeId: string;
  recipientToken: string;
  signingMethod: TUaKepSigningMethod;
}) => {
  const envelope = await prisma.envelope.findUnique({
    where: { id: envelopeId },
    select: { id: true },
  });

  if (!envelope) {
    throw new Error('Envelope not found');
  }

  const envelopeItems = await prisma.envelopeItem.findMany({
    where: { envelopeId },
    include: {
      documentData: true,
    },
    orderBy: {
      id: 'asc',
    },
  });

  const itemsJson = envelopeItems
    .filter((item: any) => item.documentData)
    .map((item: any, index: number) => {
      const hashB64 = crypto.createHash('sha256').update(item.documentData.data).digest('base64');

      return {
        envelopeItemId: item.id,
        documentDataId: item.documentDataId,
        hashB64,
        ordinal: index,
      };
    });

  const session = await upsertUaKepPreparedSession({
    prisma,
    input: {
      recipientId,
      envelopeId,
      signingMethod,
      itemsJson,
      signingTime: new Date(),
    },
  });

  return {
    sessionId: session.id,
    signingTime: session.signingTime,
    recipientToken,
    items: itemsJson,
  };
};

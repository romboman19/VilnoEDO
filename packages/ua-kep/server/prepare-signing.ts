import crypto from 'node:crypto';

import type { PrismaClient } from '@documenso/prisma/client';

import { upsertUaKepPreparedSession } from './session';
import type { TUaKepSigningMethod } from '../types/signing-methods';

export const prepareUaKepSigning = async ({
  prisma,
  recipientId,
  envelopeId,
  signingMethod,
}: {
  prisma: PrismaClient;
  recipientId: number;
  envelopeId: string;
  signingMethod: TUaKepSigningMethod;
}) => {
  const envelope = await prisma.envelope.findUnique({
    where: { id: envelopeId },
    include: {
      envelopeItems: {
        include: {
          documentData: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
    },
  });

  if (!envelope) {
    throw new Error('Envelope not found');
  }

  const itemsJson = envelope.envelopeItems
    .filter((item) => item.documentData)
    .map((item, index) => {
      const hashB64 = crypto
        .createHash('sha256')
        .update(item.documentData.data)
        .digest('base64');

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
    items: itemsJson,
  };
};

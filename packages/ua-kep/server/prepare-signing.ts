import crypto from 'node:crypto';

import { getFileServerSide } from '@documenso/lib/universal/upload/get-file.server';
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
  const now = new Date();

  const envelope = await prisma.envelope.findUnique({
    where: { id: envelopeId },
    select: { id: true },
  });

  if (!envelope) {
    throw new Error('Envelope not found');
  }

  const recipient = await prisma.recipient.findFirst({
    where: {
      id: recipientId,
      envelopeId,
      token: recipientToken,
    },
    select: {
      id: true,
      expiresAt: true,
    },
  });

  if (!recipient) {
    throw new Error('Recipient not found for UA KEP signing');
  }

  if (recipient.expiresAt && recipient.expiresAt <= now) {
    throw new Error('Recipient signing link expired');
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

  const itemsWithData = envelopeItems.filter((item) => item.documentData);

  // Hash the exact document bytes the recipient signs, not the raw storage
  // column (which may hold base64 text or an S3 key).
  const itemsJson = await Promise.all(
    itemsWithData.map(async (item, index) => {
      const documentBytes = await getFileServerSide({
        type: item.documentData.type,
        data: item.documentData.data,
      });

      const hashB64 = crypto.createHash('sha256').update(documentBytes).digest('base64');

      return {
        envelopeItemId: item.id,
        documentDataId: item.documentDataId,
        hashB64,
        ordinal: index,
      };
    }),
  );

  const { session, sessionToken, callbackNonce } = await upsertUaKepPreparedSession({
    prisma,
    input: {
      recipientId,
      envelopeId,
      signingMethod,
      itemsJson,
      signingTime: now,
      now,
    },
  });

  return {
    sessionId: session.id,
    sessionToken,
    callbackNonce,
    expiresAt: session.expiresAt,
    signingTime: session.signingTime,
    recipientToken,
    items: itemsJson,
  };
};

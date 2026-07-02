import type { PrismaClient } from '@documenso/prisma/client';

import type { TUaKepSessionItems } from '../types/session';
import type { TUaKepSigningMethod } from '../types/signing-methods';

type TSignerInfo = {
  subjCN?: string;
  issuerCN?: string;
  edrpou?: string;
  serial?: string;
};

type TPrepareSessionInput = {
  recipientId: number;
  envelopeId: string;
  signingMethod: TUaKepSigningMethod;
  itemsJson: TUaKepSessionItems;
  signingTime?: Date;
};

export const upsertUaKepPreparedSession = async ({
  prisma,
  input,
}: {
  prisma: PrismaClient;
  input: TPrepareSessionInput;
}) => {
  return prisma.uaKepSession.upsert({
    where: { recipientId: input.recipientId },
    create: {
      recipientId: input.recipientId,
      envelopeId: input.envelopeId,
      signingMethod: input.signingMethod,
      signingTime: input.signingTime ?? new Date(),
      itemsJson: input.itemsJson,
      status: 'prepared',
    },
    update: {
      envelopeId: input.envelopeId,
      signingMethod: input.signingMethod,
      signingTime: input.signingTime ?? new Date(),
      itemsJson: input.itemsJson,
      status: 'prepared',
      signerInfo: null,
    },
  });
};

export const markUaKepSessionSigned = async ({
  prisma,
  recipientId,
  signerInfo,
}: {
  prisma: PrismaClient;
  recipientId: number;
  signerInfo?: TSignerInfo | null;
}) => {
  return prisma.uaKepSession.update({
    where: { recipientId },
    data: {
      status: 'signed',
      ...(signerInfo !== undefined ? { signerInfo } : {}),
    },
  });
};

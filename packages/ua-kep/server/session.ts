import crypto from 'node:crypto';

import type { PrismaClient } from '@documenso/prisma/client';

import type { TUaKepSessionItems } from '../types/session';
import type { TUaKepSigningMethod } from '../types/signing-methods';

export const UA_KEP_SESSION_TTL_MS = 15 * 60 * 1000;

type TUaKepSessionPrismaClient = Pick<PrismaClient, 'uaKepSession'>;

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
  now?: Date;
};

type TVerifyPreparedSessionInput = {
  session: {
    envelopeId: string;
    sessionTokenHash: string;
    callbackNonce: string;
    expiresAt: Date;
    status: string;
  };
  envelopeId: string;
  sessionToken: string;
  callbackNonce: string;
  now?: Date;
};

export const createUaKepSessionSecret = () => {
  return crypto.randomBytes(32).toString('base64url');
};

export const hashUaKepSessionToken = (sessionToken: string) => {
  return crypto.createHash('sha256').update(sessionToken, 'utf8').digest('hex');
};

const timingSafeStringEqual = (left: string, right: string) => {
  const leftDigest = crypto.createHash('sha256').update(left, 'utf8').digest();
  const rightDigest = crypto.createHash('sha256').update(right, 'utf8').digest();

  return crypto.timingSafeEqual(leftDigest, rightDigest);
};

export const verifyUaKepPreparedSession = ({
  session,
  envelopeId,
  sessionToken,
  callbackNonce,
  now = new Date(),
}: TVerifyPreparedSessionInput) => {
  if (session.envelopeId !== envelopeId) {
    throw new Error('Envelope mismatch');
  }

  if (session.status !== 'prepared') {
    throw new Error('UA KEP session is not prepared');
  }

  if (session.expiresAt <= now) {
    throw new Error('UA KEP session expired');
  }

  const sessionTokenHash = hashUaKepSessionToken(sessionToken);

  if (!timingSafeStringEqual(sessionTokenHash, session.sessionTokenHash)) {
    throw new Error('UA KEP session token mismatch');
  }

  if (!timingSafeStringEqual(callbackNonce, session.callbackNonce)) {
    throw new Error('UA KEP callback nonce mismatch');
  }
};

export const upsertUaKepPreparedSession = async ({
  prisma,
  input,
}: {
  prisma: PrismaClient;
  input: TPrepareSessionInput;
}) => {
  const sessionToken = createUaKepSessionSecret();
  const callbackNonce = createUaKepSessionSecret();
  const now = input.now ?? new Date();
  const signingTime = input.signingTime ?? now;
  const expiresAt = new Date(now.getTime() + UA_KEP_SESSION_TTL_MS);

  const session = await prisma.uaKepSession.upsert({
    where: { recipientId: input.recipientId },
    create: {
      recipientId: input.recipientId,
      envelopeId: input.envelopeId,
      signingMethod: input.signingMethod,
      signingTime,
      sessionTokenHash: hashUaKepSessionToken(sessionToken),
      callbackNonce,
      expiresAt,
      itemsJson: input.itemsJson,
      status: 'prepared',
    },
    update: {
      envelopeId: input.envelopeId,
      signingMethod: input.signingMethod,
      signingTime,
      sessionTokenHash: hashUaKepSessionToken(sessionToken),
      callbackNonce,
      expiresAt,
      itemsJson: input.itemsJson,
      status: 'prepared',
      signerInfo: null,
      signedAt: null,
      signatureArtifacts: {
        deleteMany: {},
      },
    },
  });

  return {
    session,
    sessionToken,
    callbackNonce,
  };
};

export const markUaKepSessionSigned = async ({
  prisma,
  recipientId,
  signerInfo,
}: {
  prisma: TUaKepSessionPrismaClient;
  recipientId: number;
  signerInfo?: TSignerInfo | null;
}) => {
  const result = await prisma.uaKepSession.updateMany({
    where: { recipientId, status: 'prepared' },
    data: {
      status: 'signed',
      signedAt: new Date(),
      ...(signerInfo !== undefined ? { signerInfo } : {}),
    },
  });

  if (result.count !== 1) {
    throw new Error('UA KEP session was already consumed');
  }

  return prisma.uaKepSession.findUniqueOrThrow({
    where: { recipientId },
  });
};

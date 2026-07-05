import crypto from 'node:crypto';

import type { PrismaClient } from '@documenso/prisma/client';

import type { TUaKepSessionItems } from '../types/session';

type TArtifactPrismaClient = Pick<PrismaClient, 'uaKepSignatureArtifact'>;

export type TUaKepPersistedArtifact = {
  id: string;
  envelopeId: string;
  recipientId: number;
  uaKepSessionId: string;
  envelopeItemId: string;
  documentDataId: string;
  signingMethod: string;
  artifactType: string;
  signatureSha256: string;
  documentHashB64: string;
  signerInfo: unknown;
};

type TSignerInfo = {
  subjCN?: string;
  issuerCN?: string;
  edrpou?: string;
  serial?: string;
};

type TSignatureInput = {
  envelopeItemId: string;
  signatureB64: string;
  padesB64?: string;
};

type TPersistArtifactsInput = {
  session: {
    id: string;
    envelopeId: string;
    recipientId: number;
    signingMethod: string;
  };
  preparedItems: TUaKepSessionItems;
  signatures: TSignatureInput[];
  signerInfo?: TSignerInfo | null;
  verificationStatusByEnvelopeItemId?: Map<string, string>;
  padesLevel?: 'B_LT' | 'B_T' | null;
};

const hashSignatureBytes = (signatureBase64: string) => {
  const compactSignature = signatureBase64.replace(/\s/g, '');
  const signatureBytes = Buffer.from(compactSignature, 'base64');

  if (signatureBytes.length === 0) {
    throw new Error('Empty UA KEP signature artifact');
  }

  return crypto.createHash('sha256').update(signatureBytes).digest('hex');
};

const sanitizeSignerInfo = (signerInfo?: TSignerInfo | null) => {
  if (!signerInfo) {
    return undefined;
  }

  const entries = Object.entries(signerInfo).filter((entry): entry is [string, string] => {
    return typeof entry[1] === 'string' && entry[1].length > 0;
  });

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

export const persistUaKepSignatureArtifacts = async ({
  prisma,
  input,
}: {
  prisma: TArtifactPrismaClient;
  input: TPersistArtifactsInput;
}) => {
  const signerInfo = sanitizeSignerInfo(input.signerInfo);
  const signaturesByEnvelopeItemId = new Map(
    input.signatures.map((signature) => [signature.envelopeItemId, signature]),
  );

  const data = input.preparedItems.flatMap((item) => {
    const signature = signaturesByEnvelopeItemId.get(item.envelopeItemId);

    if (!signature) {
      throw new Error('Missing UA KEP signature item');
    }

    const baseArtifact = {
      envelopeId: input.session.envelopeId,
      recipientId: input.session.recipientId,
      uaKepSessionId: input.session.id,
      envelopeItemId: item.envelopeItemId,
      documentDataId: item.documentDataId,
      signingMethod: input.session.signingMethod,
      documentHashB64: item.hashB64,
      ...(signerInfo ? { signerInfo } : {}),
    };

    const artifacts = [
      {
        ...baseArtifact,
        artifactType: 'CADES_DETACHED',
        signatureBase64: signature.signatureB64,
        signatureSha256: hashSignatureBytes(signature.signatureB64),
        verificationStatus: input.verificationStatusByEnvelopeItemId?.get(item.envelopeItemId) ?? 'pending',
      },
    ];

    if (signature.padesB64) {
      artifacts.push({
        ...baseArtifact,
        artifactType: input.padesLevel ? `PADES_${input.padesLevel}` : 'PADES',
        signatureBase64: signature.padesB64,
        signatureSha256: hashSignatureBytes(signature.padesB64),
        // The PAdES PDF is companion evidence produced by the same key in the
        // same session; the validated artifact is the detached CAdES.
        verificationStatus: 'stored_companion',
      });
    }

    return artifacts;
  });

  await prisma.uaKepSignatureArtifact.deleteMany({
    where: {
      uaKepSessionId: input.session.id,
    },
  });

  const result = await prisma.uaKepSignatureArtifact.createMany({
    data,
  });

  const artifacts = await prisma.uaKepSignatureArtifact.findMany({
    where: {
      uaKepSessionId: input.session.id,
    },
    select: {
      id: true,
      envelopeId: true,
      recipientId: true,
      uaKepSessionId: true,
      envelopeItemId: true,
      documentDataId: true,
      signingMethod: true,
      artifactType: true,
      signatureSha256: true,
      documentHashB64: true,
      signerInfo: true,
    },
    orderBy: [{ envelopeItemId: 'asc' }, { artifactType: 'asc' }],
  });

  return {
    count: result.count,
    artifacts,
  };
};

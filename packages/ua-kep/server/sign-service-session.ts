import { getFileServerSide } from '@documenso/lib/universal/upload/get-file.server';
import { env } from '@documenso/lib/utils/env';
import type { PrismaClient } from '@documenso/prisma/client';

import type { TUaKepSigningMethod } from '../types/signing-methods';
import { prepareUaKepSigning } from './prepare-signing';
import { getSignServiceUrl } from './sign-service-client';

type TStartInput = {
  prisma: PrismaClient;
  recipientId: number;
  envelopeId: string;
  recipientToken: string;
  signingMethod: TUaKepSigningMethod;
  webappUrl: string;
};

/// Prepare a UA KEP session and hand the document to VilnoCheck-SignService for
/// the browser redirect signing flow. Returns the signing URL to redirect the
/// user to. The recipient token never leaves VilnoEDO — the callback is bound by
/// externalRef + nonce and authenticated by HMAC.
export const startSignServiceSigning = async ({
  prisma,
  recipientId,
  envelopeId,
  recipientToken,
  signingMethod,
  webappUrl,
}: TStartInput) => {
  const signServiceUrl = getSignServiceUrl();

  if (!signServiceUrl) {
    throw new Error('Sign service is not configured');
  }

  const apiKey = env('NEXT_PRIVATE_SIGN_SERVICE_SECRET');

  const prepared = await prepareUaKepSigning({
    prisma,
    recipientId,
    envelopeId,
    recipientToken,
    signingMethod,
  });

  const firstItem = prepared.items[0];

  if (!firstItem) {
    throw new Error('Envelope has no document to sign');
  }

  const envelopeItem = await prisma.envelopeItem.findUnique({
    where: { id: firstItem.envelopeItemId },
    include: { documentData: true },
  });

  if (!envelopeItem?.documentData) {
    throw new Error('Document data not found for UA KEP signing');
  }

  const documentBytes = await getFileServerSide({
    type: envelopeItem.documentData.type,
    data: envelopeItem.documentData.data,
  });

  const baseUrl = webappUrl.replace(/\/+$/, '');

  const formData = new FormData();
  formData.append(
    'document',
    new Blob([documentBytes as BlobPart], { type: 'application/octet-stream' }),
    envelopeItem.title || 'document.bin',
  );
  formData.append('callbackUrl', `${baseUrl}/api/ua-kep/sign-service/callback`);
  formData.append('returnUrl', `${baseUrl}/sign/${recipientToken}`);
  formData.append('externalRef', `${envelopeId}:${recipientId}`);
  formData.append('nonce', prepared.callbackNonce);

  const response = await fetch(`${signServiceUrl}/api/documents`, {
    method: 'POST',
    headers: apiKey ? { 'x-api-key': apiKey } : {},
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Sign service rejected the document (HTTP ${response.status})`);
  }

  const created = await response.json();

  if (!created?.documentId) {
    throw new Error('Sign service did not return a document id');
  }

  return {
    sessionId: prepared.sessionId,
    signServiceDocumentId: created.documentId,
    signingUrl: `${signServiceUrl}/?documentId=${encodeURIComponent(created.documentId)}`,
  };
};

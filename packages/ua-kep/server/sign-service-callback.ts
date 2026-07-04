import crypto from 'node:crypto';

import { completeDocumentWithToken } from '@documenso/lib/server-only/document/complete-document-with-token';
import { env } from '@documenso/lib/utils/env';
import type { PrismaClient } from '@documenso/prisma/client';

import { ZUaKepSessionItemsSchema } from '../types/session';
import { persistUaKepSignatureArtifacts } from './artifacts';
import { getCaRegistry } from './ca-registry';
import { createUaKepEvidencePackage } from './evidence-package';
import { markUaKepSessionSigned } from './session';
import { toLegalClass } from './sign-service-client';
import { collectRegistryIssuerCns, runUaKepStructuralValidation } from './structural-validation';
import { createUaKepValidationReports } from './validation';

export type TSignServiceCallbackBody = {
  externalRef: string | null;
  nonce: string | null;
  documentId: string;
  document: {
    originalName: string;
    sha256: string;
    mimeType: string;
  };
  verification: {
    valid: boolean;
    skipped: boolean;
    signatureClass: string;
    signerCN: string | null;
    signingTime: string | null;
    certSerial: string | null;
    issuer: string | null;
  };
  signatures: {
    cadesDetached: {
      fileName: string;
      sha256: string;
      size: number;
      base64: string | null;
    };
  } | null;
  signedAt: string;
};

type TCallbackResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; status: number; body: { ok: false; error: string } };

const getCallbackSecret = () => {
  const secret = env('NEXT_PRIVATE_SIGN_SERVICE_SECRET');

  return secret && secret.length > 0 ? secret : null;
};

/// Constant-time compare of the `sha256=<hex>` HMAC header against the secret.
export const verifySignServiceCallbackSignature = ({
  rawBody,
  signatureHeader,
}: {
  rawBody: string;
  signatureHeader: string | null | undefined;
}): boolean => {
  const secret = getCallbackSecret();

  if (!secret || !signatureHeader) {
    return false;
  }

  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(signatureHeader);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
};

const timingSafeEqualStrings = (left: string, right: string) => {
  const leftDigest = crypto.createHash('sha256').update(left, 'utf8').digest();
  const rightDigest = crypto.createHash('sha256').update(right, 'utf8').digest();

  return crypto.timingSafeEqual(leftDigest, rightDigest);
};

const hexToBase64 = (hex: string) => {
  return Buffer.from(hex, 'hex').toString('base64');
};

const parseExternalRef = (externalRef: string | null) => {
  if (!externalRef) {
    return null;
  }

  const [envelopeId, recipientIdRaw] = externalRef.split(':');
  const recipientId = Number(recipientIdRaw);

  if (!envelopeId || !Number.isInteger(recipientId) || recipientId <= 0) {
    return null;
  }

  return { envelopeId, recipientId };
};

/// Ingest an authenticated SignService callback: verify the HMAC and the
/// session/document binding, run structural validation on the returned
/// signature, and persist artifacts, validation report and evidence. Fail
/// closed: any binding or validation failure rejects without persisting.
export const ingestSignServiceCallback = async ({
  prisma,
  rawBody,
  signatureHeader,
}: {
  prisma: PrismaClient;
  rawBody: string;
  signatureHeader: string | null | undefined;
}): Promise<TCallbackResult> => {
  if (!verifySignServiceCallbackSignature({ rawBody, signatureHeader })) {
    return { ok: false, status: 401, body: { ok: false, error: 'Invalid callback signature' } };
  }

  let body: TSignServiceCallbackBody;

  try {
    body = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, body: { ok: false, error: 'Invalid JSON body' } };
  }

  const ref = parseExternalRef(body.externalRef);

  if (!ref) {
    return { ok: false, status: 400, body: { ok: false, error: 'Invalid externalRef' } };
  }

  if (!body.signatures?.cadesDetached?.base64) {
    return { ok: false, status: 400, body: { ok: false, error: 'Callback is missing the signature' } };
  }

  const session = await prisma.uaKepSession.findUnique({
    where: { recipientId: ref.recipientId },
    include: {
      recipient: {
        select: { token: true, envelopeId: true, expiresAt: true },
      },
    },
  });

  if (!session) {
    return { ok: false, status: 404, body: { ok: false, error: 'UA KEP session not found' } };
  }

  if (session.recipient.envelopeId !== ref.envelopeId || session.envelopeId !== ref.envelopeId) {
    return { ok: false, status: 400, body: { ok: false, error: 'Envelope binding mismatch' } };
  }

  if (!body.nonce || !timingSafeEqualStrings(body.nonce, session.callbackNonce)) {
    return { ok: false, status: 400, body: { ok: false, error: 'Callback nonce mismatch' } };
  }

  const now = new Date();

  if (session.expiresAt <= now) {
    return { ok: false, status: 410, body: { ok: false, error: 'UA KEP session expired' } };
  }

  const preparedItems = ZUaKepSessionItemsSchema.parse(session.itemsJson);

  // Single-document redirect flow: bind the callback to the first prepared item
  // and confirm the document hash the service signed matches what we prepared.
  const preparedItem = preparedItems[0];

  if (!preparedItem) {
    return { ok: false, status: 400, body: { ok: false, error: 'Session has no prepared items' } };
  }

  const documentHashB64 = hexToBase64(body.document.sha256);

  if (documentHashB64 !== preparedItem.hashB64) {
    return {
      ok: false,
      status: 400,
      body: { ok: false, error: 'Signed document hash does not match the prepared document' },
    };
  }

  const signatures = [
    {
      envelopeItemId: preparedItem.envelopeItemId,
      signatureB64: body.signatures.cadesDetached.base64,
    },
  ];

  const validationTime = new Date();
  const caRegistry = await getCaRegistry();
  const registryIssuerCns = collectRegistryIssuerCns(caRegistry);

  const verdicts = runUaKepStructuralValidation({
    preparedItems: [preparedItem],
    signatures,
    registryIssuerCns,
    validationTime,
  });

  const failed = verdicts.filter((verdict) => verdict.status === 'failed');

  if (failed.length > 0) {
    const codes = failed.flatMap((verdict) => verdict.errors.map((error) => error.code)).join(', ');

    return {
      ok: false,
      status: 422,
      body: { ok: false, error: `Signature rejected by structural validation: ${codes}` },
    };
  }

  const signerInfo = {
    ...(body.verification.signerCN ? { subjCN: body.verification.signerCN } : {}),
    ...(body.verification.issuer ? { issuerCN: body.verification.issuer } : {}),
    ...(body.verification.certSerial ? { serial: body.verification.certSerial } : {}),
  };

  const cryptoResults = new Map([
    [
      preparedItem.envelopeItemId,
      {
        valid: true,
        skipped: body.verification.skipped,
        error: null,
        signatureClass: body.verification.signatureClass,
        signerCN: body.verification.signerCN,
        signingTime: body.verification.signingTime,
        certSerial: body.verification.certSerial,
        issuer: body.verification.issuer,
        validationReport: {
          source: 'vilnocheck-sign-service',
          legalClass: toLegalClass(body.verification.signatureClass),
          signServiceDocumentId: body.documentId,
        },
      },
    ],
  ]);

  const verificationStatusByEnvelopeItemId = new Map([[preparedItem.envelopeItemId, 'passed_sign_service']]);

  const persistenceResult = await prisma.$transaction(async (tx) => {
    const signedSession = await markUaKepSessionSigned({
      prisma: tx,
      recipientId: ref.recipientId,
      signerInfo,
    });

    const persistedArtifacts = await persistUaKepSignatureArtifacts({
      prisma: tx,
      input: {
        session: signedSession,
        preparedItems: [preparedItem],
        signatures,
        signerInfo,
        verificationStatusByEnvelopeItemId,
      },
    });

    const validationReports = await createUaKepValidationReports({
      prisma: tx,
      input: {
        session: signedSession,
        artifacts: persistedArtifacts.artifacts,
        verdicts,
        cryptoResults,
        validationTime,
      },
    });

    const { evidencePackage } = await createUaKepEvidencePackage({
      prisma: tx,
      input: {
        session: signedSession,
        trustMaterialSnapshotId: validationReports.trustMaterialSnapshotId,
      },
    });

    return { persistedArtifacts, validationReports, evidencePackage };
  });

  await completeDocumentWithToken({
    token: session.recipient.token,
    id: ref.envelopeId as unknown as Parameters<typeof completeDocumentWithToken>[0]['id'],
  });

  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      sessionId: session.id,
      evidencePackageId: persistenceResult.evidencePackage.id,
      evidencePackageSha256: persistenceResult.evidencePackage.packageSha256,
    },
  };
};

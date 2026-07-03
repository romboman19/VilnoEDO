import { completeDocumentWithToken } from '@documenso/lib/server-only/document/complete-document-with-token';
import type { PrismaClient } from '@documenso/prisma/client';

import { ZUaKepSessionItemsSchema } from '../types/session';
import { persistUaKepSignatureArtifacts } from './artifacts';
import { getCaRegistry } from './ca-registry';
import { createUaKepEvidencePackage } from './evidence-package';
import { markUaKepSessionSigned, verifyUaKepPreparedSession } from './session';
import { collectRegistryIssuerCns, runUaKepStructuralValidation } from './structural-validation';
import { createUaKepValidationReports } from './validation';

export const completeUaKepSigning = async ({
  prisma,
  recipientId,
  recipientToken,
  envelopeId,
  sessionToken,
  callbackNonce,
  signerInfo,
  signatures,
}: {
  prisma: PrismaClient;
  recipientId: number;
  recipientToken: string;
  envelopeId: string;
  sessionToken: string;
  callbackNonce: string;
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
  const session = await prisma.uaKepSession.findUnique({
    where: { recipientId },
    include: {
      recipient: {
        select: {
          token: true,
          envelopeId: true,
          expiresAt: true,
        },
      },
    },
  });

  if (!session) {
    throw new Error('UA KEP session not found');
  }

  if (session.recipient.token !== recipientToken || session.recipient.envelopeId !== envelopeId) {
    throw new Error('Recipient mismatch');
  }

  const now = new Date();

  if (session.recipient.expiresAt && session.recipient.expiresAt <= now) {
    throw new Error('Recipient signing link expired');
  }

  verifyUaKepPreparedSession({
    session,
    envelopeId,
    sessionToken,
    callbackNonce,
    now,
  });

  const preparedItems = ZUaKepSessionItemsSchema.parse(session.itemsJson);
  const preparedEnvelopeItemIds = new Set(preparedItems.map((item) => item.envelopeItemId));
  const signedEnvelopeItemIds = new Set<string>();

  for (const signature of signatures) {
    if (!preparedEnvelopeItemIds.has(signature.envelopeItemId)) {
      throw new Error('UA KEP signature item mismatch');
    }

    if (signedEnvelopeItemIds.has(signature.envelopeItemId)) {
      throw new Error('Duplicate UA KEP signature item');
    }

    signedEnvelopeItemIds.add(signature.envelopeItemId);
  }

  if (signedEnvelopeItemIds.size !== preparedEnvelopeItemIds.size) {
    throw new Error('Missing UA KEP signature items');
  }

  // Fail closed: structural validation must pass before anything is persisted
  // or the recipient is marked signed. Registry read failures also reject.
  const validationTime = new Date();
  const caRegistry = await getCaRegistry();
  const registryIssuerCns = collectRegistryIssuerCns(caRegistry);

  const verdicts = runUaKepStructuralValidation({
    preparedItems,
    signatures,
    registryIssuerCns,
    validationTime,
  });

  const failedVerdicts = verdicts.filter((verdict) => verdict.status === 'failed');

  if (failedVerdicts.length > 0) {
    const failureCodes = failedVerdicts.flatMap((verdict) => verdict.errors.map((error) => error.code)).join(', ');

    throw new Error(`UA KEP signature rejected by structural validation: ${failureCodes}`);
  }

  const verificationStatusByEnvelopeItemId = new Map(
    verdicts.map((verdict) => [verdict.envelopeItemId, 'passed_structural']),
  );

  const persistenceResult = await prisma.$transaction(async (tx) => {
    const signedSession = await markUaKepSessionSigned({
      prisma: tx,
      recipientId,
      signerInfo,
    });

    const persistedArtifacts = await persistUaKepSignatureArtifacts({
      prisma: tx,
      input: {
        session: signedSession,
        preparedItems,
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

    return {
      persistedArtifacts,
      validationReports,
      evidencePackage,
    };
  });

  const completionResult = await completeDocumentWithToken({
    token: recipientToken,
    id: envelopeId as unknown as Parameters<typeof completeDocumentWithToken>[0]['id'],
  });

  return {
    ok: true,
    sessionId: session.id,
    signaturesAccepted: signatures.length,
    signatureArtifactsStored: persistenceResult.persistedArtifacts.count,
    validationReportsCreated: persistenceResult.validationReports.count,
    trustMaterialSnapshotId: persistenceResult.validationReports.trustMaterialSnapshotId,
    evidencePackageId: persistenceResult.evidencePackage.id,
    evidencePackageSha256: persistenceResult.evidencePackage.packageSha256,
    status: 'signed',
    completionResult,
  };
};

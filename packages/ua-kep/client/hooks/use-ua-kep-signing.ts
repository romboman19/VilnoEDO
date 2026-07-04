import { useCallback, useState } from 'react';

import type { TUaKepSigningMethod } from '../../types/signing-methods';

type TUseUaKepSigningOptions = {
  recipientId: number;
  envelopeId: string;
  recipientToken: string;
  signingMethod: TUaKepSigningMethod;
};

export type TUaKepValidationIssue = {
  code: string;
  message: string;
};

export type TUaKepStatusItem = {
  envelopeItemId: string;
  artifactType: string;
  verificationStatus: string;
  signatureSha256: string;
  validationReport: {
    status: string;
    validator: string;
    validationKind: string;
    checkedAt: string | null;
    certificateStatus: string | null;
    signerInfo: Record<string, unknown> | null;
    validationErrors: TUaKepValidationIssue[] | null;
    validationWarnings: TUaKepValidationIssue[] | null;
  } | null;
};

export type TUaKepSigningStatus = {
  sessionStatus: string;
  signingMethod: string | null;
  signedAt: string | null;
  signerInfo: Record<string, unknown> | null;
  items: TUaKepStatusItem[];
  evidencePackage: {
    id: string;
    packageSha256: string;
    artifactCount: number;
    validationReportCount: number;
    createdAt: string;
  } | null;
};

const readErrorMessage = async (response: Response, fallback: string) => {
  try {
    const data = await response.json();

    if (data && typeof data.error === 'string' && data.error.length > 0) {
      return data.error;
    }
  } catch {
    // Response body was not JSON; fall through to the generic message.
  }

  return fallback;
};

export const useUaKepSigning = ({
  recipientId,
  envelopeId,
  recipientToken,
  signingMethod,
}: TUseUaKepSigningOptions) => {
  const [isPreparing, setIsPreparing] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [lastPreparedSessionId, setLastPreparedSessionId] = useState<string | null>(null);
  const [lastPreparedSessionToken, setLastPreparedSessionToken] = useState<string | null>(null);
  const [lastPreparedCallbackNonce, setLastPreparedCallbackNonce] = useState<string | null>(null);

  const prepare = async () => {
    setIsPreparing(true);

    try {
      const response = await fetch('/api/ua-kep/prepare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipientId, envelopeId, recipientToken, signingMethod }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to prepare UA KEP signing'));
      }

      const data = await response.json();
      setLastPreparedSessionId(data.sessionId ?? null);
      setLastPreparedSessionToken(data.sessionToken ?? null);
      setLastPreparedCallbackNonce(data.callbackNonce ?? null);
      return data;
    } finally {
      setIsPreparing(false);
    }
  };

  const complete = async (payload: {
    signerInfo?: {
      subjCN?: string;
      issuerCN?: string;
      edrpou?: string;
      serial?: string;
    } | null;
    signatures: Array<{ envelopeItemId: string; signatureB64: string }>;
    sessionToken?: string;
    callbackNonce?: string;
  }) => {
    setIsCompleting(true);

    try {
      const sessionToken = payload.sessionToken ?? lastPreparedSessionToken;
      const callbackNonce = payload.callbackNonce ?? lastPreparedCallbackNonce;

      if (!sessionToken || !callbackNonce) {
        throw new Error('UA KEP session was not prepared');
      }

      const response = await fetch('/api/ua-kep/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipientId,
          recipientToken,
          envelopeId,
          sessionToken,
          callbackNonce,
          signerInfo: payload.signerInfo,
          signatures: payload.signatures,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to complete UA KEP signing'));
      }

      return response.json();
    } finally {
      setIsCompleting(false);
    }
  };

  const fetchStatus = useCallback(async (): Promise<TUaKepSigningStatus> => {
    const query = new URLSearchParams({
      recipientId: String(recipientId),
      recipientToken,
      envelopeId,
    });

    const response = await fetch(`/api/ua-kep/status?${query.toString()}`);

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, 'Failed to load UA KEP signing status'));
    }

    return response.json();
  }, [recipientId, recipientToken, envelopeId]);

  const getEvidenceUrl = useCallback(
    (evidencePackageId: string, kind: 'manifest' | 'archive') => {
      const query = new URLSearchParams({
        recipientId: String(recipientId),
        recipientToken,
        envelopeId,
      });

      const file = kind === 'manifest' ? 'manifest.json' : 'archive.zip';

      return `/api/ua-kep/evidence/${encodeURIComponent(evidencePackageId)}/${file}?${query.toString()}`;
    },
    [recipientId, recipientToken, envelopeId],
  );

  const [isStartingSignService, setIsStartingSignService] = useState(false);

  // Hand the document to VilnoCheck-SignService and redirect the user to sign
  // there. The signed result returns via the authenticated HMAC callback.
  const startSignServiceRedirect = async () => {
    setIsStartingSignService(true);

    try {
      const response = await fetch('/api/ua-kep/sign-service/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId, envelopeId, recipientToken, signingMethod }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Не вдалося почати підписання в SignService'));
      }

      const data = await response.json();

      if (!data.signingUrl) {
        throw new Error('SignService не повернув посилання для підпису');
      }

      window.location.href = data.signingUrl;
    } finally {
      setIsStartingSignService(false);
    }
  };

  return {
    isPreparing,
    isCompleting,
    isStartingSignService,
    lastPreparedSessionId,
    lastPreparedSessionToken,
    lastPreparedCallbackNonce,
    prepare,
    complete,
    fetchStatus,
    getEvidenceUrl,
    startSignServiceRedirect,
  };
};

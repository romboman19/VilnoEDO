import { useCallback, useRef, useState } from 'react';

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

type TPreparedSessionCredentials = {
  sessionToken: string | null;
  callbackNonce: string | null;
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
  const lastPreparedCredentialsRef = useRef<TPreparedSessionCredentials>({
    sessionToken: null,
    callbackNonce: null,
  });

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
      const sessionToken = typeof data.sessionToken === 'string' ? data.sessionToken : null;
      const callbackNonce = typeof data.callbackNonce === 'string' ? data.callbackNonce : null;

      lastPreparedCredentialsRef.current = {
        sessionToken,
        callbackNonce,
      };
      setLastPreparedSessionId(typeof data.sessionId === 'string' ? data.sessionId : null);
      setLastPreparedSessionToken(sessionToken);
      setLastPreparedCallbackNonce(callbackNonce);
      return data;
    } finally {
      setIsPreparing(false);
    }
  };

  const complete = async (payload: {
    completeDocument?: boolean;
    signerInfo?: {
      subjCN?: string;
      issuerCN?: string;
      edrpou?: string;
      serial?: string;
    } | null;
    signatures: Array<{ envelopeItemId: string; signatureB64: string; padesB64?: string }>;
    padesLevel?: 'B_LT' | 'B_T' | null;
    sessionToken?: string;
    callbackNonce?: string;
  }) => {
    setIsCompleting(true);

    try {
      const sessionToken =
        payload.sessionToken ?? lastPreparedCredentialsRef.current.sessionToken ?? lastPreparedSessionToken;
      const callbackNonce =
        payload.callbackNonce ?? lastPreparedCredentialsRef.current.callbackNonce ?? lastPreparedCallbackNonce;

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
          completeDocument: payload.completeDocument,
          padesLevel: payload.padesLevel,
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
    (evidencePackageId: string, kind: 'manifest' | 'archive' | 'pades') => {
      const query = new URLSearchParams({
        recipientId: String(recipientId),
        recipientToken,
        envelopeId,
      });

      const file = kind === 'manifest' ? 'manifest.json' : kind === 'pades' ? 'pades.pdf' : 'archive.zip';

      return `/api/ua-kep/evidence/${encodeURIComponent(evidencePackageId)}/${file}?${query.toString()}`;
    },
    [recipientId, recipientToken, envelopeId],
  );

  return {
    isPreparing,
    isCompleting,
    lastPreparedSessionId,
    lastPreparedSessionToken,
    lastPreparedCallbackNonce,
    prepare,
    complete,
    fetchStatus,
    getEvidenceUrl,
  };
};

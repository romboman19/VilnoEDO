import { useState } from 'react';

import type { TUaKepSigningMethod } from '../../types/signing-methods';

type TUseUaKepSigningOptions = {
  recipientId: number;
  envelopeId: string;
  recipientToken: string;
  signingMethod: TUaKepSigningMethod;
};

export const useUaKepSigning = ({ recipientId, envelopeId, recipientToken, signingMethod }: TUseUaKepSigningOptions) => {
  const [isPreparing, setIsPreparing] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [lastPreparedSessionId, setLastPreparedSessionId] = useState<string | null>(null);

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
        throw new Error('Failed to prepare UA KEP signing');
      }

      const data = await response.json();
      setLastPreparedSessionId(data.sessionId ?? null);
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
  }) => {
    setIsCompleting(true);

    try {
      const response = await fetch('/api/ua-kep/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipientId,
          envelopeId,
          signerInfo: payload.signerInfo,
          signatures: payload.signatures,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to complete UA KEP signing');
      }

      return response.json();
    } finally {
      setIsCompleting(false);
    }
  };

  return {
    isPreparing,
    isCompleting,
    lastPreparedSessionId,
    prepare,
    complete,
  };
};

import { env } from '@documenso/lib/utils/env';

/// Server-to-server client for VilnoCheck-SignService. The service runs the
/// full cryptographic verification (DSTU-4145 signature math, certificate
/// chain, trust material) that Node cannot do natively.
export type TRemoteVerificationResult = {
  valid: boolean;
  skipped: boolean;
  error: string | null;
  signatureClass: string;
  signerCN: string | null;
  signingTime: string | null;
  certSerial: string | null;
  issuer: string | null;
  validationReport: unknown;
};

const REMOTE_VERIFY_TIMEOUT_MS = 15_000;

export const getSignServiceUrl = () => {
  const url = env('NEXT_PRIVATE_SIGN_SERVICE_URL');

  return url && url.trim().length > 0 ? url.trim().replace(/\/+$/, '') : null;
};

export const isSignServiceConfigured = () => {
  return getSignServiceUrl() !== null;
};

/// Fail-closed contract: every failure mode (network error, timeout, non-200,
/// malformed body) resolves to valid: false with a reason — the caller never
/// has to distinguish transport failures from verification failures.
export const verifyDetachedSignatureRemote = async ({
  documentBytes,
  signatureBase64,
}: {
  documentBytes: Uint8Array;
  signatureBase64: string;
}): Promise<TRemoteVerificationResult> => {
  const failed = (error: string): TRemoteVerificationResult => ({
    valid: false,
    skipped: false,
    error,
    signatureClass: 'unknown',
    signerCN: null,
    signingTime: null,
    certSerial: null,
    issuer: null,
    validationReport: null,
  });

  const baseUrl = getSignServiceUrl();

  if (!baseUrl) {
    return failed('Sign service is not configured');
  }

  const apiKey = env('NEXT_PRIVATE_SIGN_SERVICE_SECRET');

  try {
    const response = await fetch(`${baseUrl}/api/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
      },
      body: JSON.stringify({
        document: Buffer.from(documentBytes).toString('base64'),
        signature: signatureBase64,
      }),
      signal: AbortSignal.timeout(REMOTE_VERIFY_TIMEOUT_MS),
    });

    if (!response.ok) {
      return failed(`Sign service verification returned HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data || data.ok !== true || !data.verification) {
      return failed('Sign service returned a malformed verification response');
    }

    const verification = data.verification;

    return {
      valid: verification.valid === true,
      skipped: verification.skipped === true,
      error: typeof verification.error === 'string' ? verification.error : null,
      signatureClass: typeof verification.signatureClass === 'string' ? verification.signatureClass : 'unknown',
      signerCN: typeof verification.signerCN === 'string' ? verification.signerCN : null,
      signingTime: typeof verification.signingTime === 'string' ? verification.signingTime : null,
      certSerial: typeof verification.certSerial === 'string' ? verification.certSerial : null,
      issuer: typeof verification.issuer === 'string' ? verification.issuer : null,
      validationReport: data.validationReport ?? null,
    };
  } catch (error) {
    return failed(error instanceof Error ? `Sign service unreachable: ${error.message}` : 'Sign service unreachable');
  }
};

/// Map the sign service signature class onto the legal classes from the
/// technical specification (section 11.1.8).
export const toLegalClass = (signatureClass: string) => {
  switch (signatureClass) {
    case 'QES':
      return 'KEP';
    case 'AdES_QC':
      return 'UEP_QC';
    case 'AdES':
      return 'ADES';
    default:
      return 'UNKNOWN';
  }
};

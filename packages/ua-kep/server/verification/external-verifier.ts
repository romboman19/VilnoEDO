import { env } from '@documenso/lib/utils/env';

import type { TDetachedSignatureVerifier, TFullVerificationResult, TVerifyDetachedInput } from './types';

/// Provider-agnostic external verification engine. Delegates the full
/// cryptographic check (DSTU-4145 signature math, certificate chain, trust
/// material) to an external authoritative validation service that Node cannot
/// perform natively, and returns a reproducible validation report.
///
/// The service contract: `POST {baseUrl}/api/verify` with a JSON body
/// `{ document: base64, signature: base64 }`, responding
/// `{ ok: true, verification: { valid, skipped, signatureClass, signerCN,
/// signingTime, certSerial, issuer, error }, validationReport }`.

const VERIFY_TIMEOUT_MS = 15_000;

export const EXTERNAL_VERIFIER_ID = 'external-verification-service';

export const getExternalVerifierUrl = () => {
  const url = env('NEXT_PRIVATE_UA_KEP_VERIFY_SERVICE_URL');

  return url && url.trim().length > 0 ? url.trim().replace(/\/+$/, '') : null;
};

export const isExternalVerificationConfigured = () => {
  return getExternalVerifierUrl() !== null;
};

/// Fail-closed: every failure mode (network error, timeout, non-200, malformed
/// body) resolves to `valid: false` with a reason. `unavailable: true` marks a
/// genuine engine outage so the caller can distinguish "could not verify" from
/// "signature is invalid".
const verify = async ({ documentBytes, signatureBase64 }: TVerifyDetachedInput): Promise<TFullVerificationResult> => {
  const failed = (error: string): TFullVerificationResult => ({
    engineId: EXTERNAL_VERIFIER_ID,
    valid: false,
    skipped: false,
    error,
    unavailable: true,
    signatureClass: 'unknown',
    signerCN: null,
    signingTime: null,
    certSerial: null,
    issuer: null,
    validationReport: null,
  });

  const baseUrl = getExternalVerifierUrl();

  if (!baseUrl) {
    return failed('External verification service is not configured');
  }

  const apiKey = env('NEXT_PRIVATE_UA_KEP_VERIFY_SERVICE_SECRET');

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
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });

    if (!response.ok) {
      return failed(`External verification returned HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data || data.ok !== true || !data.verification) {
      return failed('External verification returned a malformed response');
    }

    const verification = data.verification;

    // The service answered but reports it could not run verification at all
    // (e.g. its crypto engine failed to initialise). That is an outage, not a
    // signature verdict — flag it as unavailable so `optional` mode can degrade
    // to structural validation instead of rejecting a signature that was never
    // actually examined.
    const errorText = typeof verification.error === 'string' ? verification.error : null;
    const serviceUnavailable =
      verification.valid !== true &&
      verification.signatureClass !== 'QES' &&
      verification.signatureClass !== 'AdES' &&
      verification.signatureClass !== 'AdES_QC' &&
      typeof errorText === 'string' &&
      /unavailable|not initiali[sz]ed|initiali[sz]ation failed|internal error|failed to (start|load)/i.test(errorText);

    return {
      engineId: EXTERNAL_VERIFIER_ID,
      valid: verification.valid === true,
      skipped: verification.skipped === true,
      error: errorText,
      unavailable: serviceUnavailable,
      signatureClass: typeof verification.signatureClass === 'string' ? verification.signatureClass : 'unknown',
      signerCN: typeof verification.signerCN === 'string' ? verification.signerCN : null,
      signingTime: typeof verification.signingTime === 'string' ? verification.signingTime : null,
      certSerial: typeof verification.certSerial === 'string' ? verification.certSerial : null,
      issuer: typeof verification.issuer === 'string' ? verification.issuer : null,
      validationReport: data.validationReport ?? null,
    };
  } catch (error) {
    return failed(
      error instanceof Error
        ? `External verification unreachable: ${error.message}`
        : 'External verification unreachable',
    );
  }
};

export const externalVerifier: TDetachedSignatureVerifier = {
  id: EXTERNAL_VERIFIER_ID,
  isConfigured: isExternalVerificationConfigured,
  verify,
};

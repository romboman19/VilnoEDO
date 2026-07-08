import { createHash } from 'node:crypto';

import { env } from '@documenso/lib/utils/env';

import {
  asLegalClass,
  type TDetachedSignatureVerifier,
  type TFullVerificationResult,
  type TVerifyDetachedInput,
} from './types';

/// Provider-agnostic client for the external UA KEP verification service
/// (`ua-kep-verify-service`). Delegates the full cryptographic check (DSTU-4145
/// signature math, certificate chain, trust material) to that adapter, which
/// fronts a real server-side engine (IIT native library, or a qualified
/// provider API), and returns a reproducible validation report.
///
/// Request:  POST {baseUrl}/api/verify
///   { documentBase64, signatureBase64, signatureFormat, policy, expectedDocumentSha256 }
/// Response: the normalized verdict { valid, unavailable, legalClass, signer,
///   certificate, signature, ... } — persisted verbatim as `validationReport`.

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
    error,
    unavailable: true,
    legalClass: 'UNKNOWN',
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
        documentBase64: Buffer.from(documentBytes).toString('base64'),
        signatureBase64,
        signatureFormat: 'CADES_DETACHED',
        policy: 'UA_KEP_STRICT',
        expectedDocumentSha256: createHash('sha256').update(documentBytes).digest('hex'),
      }),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });

    if (!response.ok) {
      return failed(`External verification returned HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data || typeof data !== 'object' || typeof data.valid !== 'boolean') {
      return failed('External verification returned a malformed response');
    }

    const signer = (data.signer ?? {}) as Record<string, unknown>;
    const certificate = (data.certificate ?? {}) as Record<string, unknown>;
    const signature = (data.signature ?? {}) as Record<string, unknown>;

    return {
      engineId: typeof data.verifier?.engine === 'string' ? data.verifier.engine : EXTERNAL_VERIFIER_ID,
      // The service is the source of truth for both the verdict and whether it
      // could run at all — never re-derive "unavailable" from error strings.
      valid: data.valid === true,
      unavailable: data.unavailable === true,
      error: typeof data.error === 'string' ? data.error : null,
      legalClass: asLegalClass(data.legalClass),
      signerCN: typeof signer.commonName === 'string' ? signer.commonName : null,
      signingTime: typeof signature.signingTime === 'string' ? signature.signingTime : null,
      certSerial: typeof certificate.serial === 'string' ? certificate.serial : null,
      issuer: typeof certificate.issuerCn === 'string' ? certificate.issuerCn : null,
      validationReport: data,
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

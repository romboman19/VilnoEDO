import { createHash } from 'node:crypto';

import { config } from './config';
import type { TVerifyRequest, TVerifyResponse } from './contract';
import { getActiveEngine } from './engines/index';
import { getCachedTrustSnapshot, loadTrustSnapshot } from './trust-list/index';

const sha256Hex = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/// Core verification flow: decode inputs, cross-check the caller's expected
/// hash, run the active engine against the current trust snapshot, and stamp
/// the trust profile/hash onto the result. Fail-closed: an unavailable engine
/// yields valid:false; the caller decides how to treat `unavailable`.
export const runVerification = async (request: TVerifyRequest): Promise<TVerifyResponse> => {
  const documentBytes = Buffer.from(request.documentBase64, 'base64');
  const signatureBytes = Buffer.from(request.signatureBase64, 'base64');
  const documentSha256 = sha256Hex(documentBytes);

  const engine = getActiveEngine();
  const trust = getCachedTrustSnapshot() ?? (await loadTrustSnapshot());

  const result = await engine.verify({
    documentBytes,
    signatureBytes,
    expectedDocumentSha256: request.expectedDocumentSha256,
    trust,
  });

  // Stamp the document hash and, when the engine did not, the trust-list
  // provenance so every response carries reproducible trust material.
  result.signature.documentSha256 = result.signature.documentSha256 ?? documentSha256;

  if (trust) {
    result.trust.trustedListProfile = result.trust.trustedListProfile ?? trust.profile;
    result.trust.trustedListSha256 = result.trust.trustedListSha256 ?? trust.sha256;
  }

  // If the caller supplied an expected hash and it disagrees with the bytes we
  // received, that is a hard integrity failure regardless of the engine.
  if (request.expectedDocumentSha256 && request.expectedDocumentSha256.toLowerCase() !== documentSha256) {
    return {
      ...result,
      valid: false,
      unavailable: false,
      error: 'expectedDocumentSha256 does not match the provided document bytes',
    };
  }

  // Belt-and-braces: fail-closed policy must never let a non-valid verdict
  // through as valid.
  if (config.failClosed && !result.valid) {
    result.valid = false;
  }

  return result;
};

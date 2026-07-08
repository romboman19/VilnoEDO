import { externalVerifier } from './external-verifier';
import type { TDetachedSignatureVerifier } from './types';

export {
  EXTERNAL_VERIFIER_ID,
  externalVerifier,
  getExternalVerifierUrl,
  isExternalVerificationConfigured,
} from './external-verifier';
export type {
  TDetachedSignatureVerifier,
  TFullVerificationResult,
  TUaKepLegalClass,
  TVerifyDetachedInput,
} from './types';
export { asLegalClass } from './types';

/// Resolve the configured "full" verification engine, or `null` when none is
/// configured (the seam is dormant and structural validation alone gates
/// acceptance). Additional engines can be registered here in priority order
/// without touching the call site.
export const resolveFullVerifier = (): TDetachedSignatureVerifier | null => {
  if (externalVerifier.isConfigured()) {
    return externalVerifier;
  }

  return null;
};

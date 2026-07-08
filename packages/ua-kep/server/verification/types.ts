/// Pluggable backend verification seam for UA KEP detached signatures.
///
/// Layer model: structural fail-closed validation (see `structural-validation.ts`)
/// is the always-on acceptance floor. The "full" cryptographic verdict
/// (DSTU-4145 signature math, certificate chain, OCSP/TSP evidence) is produced
/// by a pluggable engine implementing `TDetachedSignatureVerifier`. Today the
/// only engine is an external authoritative validation service; it is dormant
/// until configured, in which case structural validation alone gates acceptance.

export type TFullVerificationResult = {
  /// Id of the engine that produced this verdict (for audit/report provenance).
  engineId: string;
  valid: boolean;
  skipped: boolean;
  error: string | null;
  /// True when the engine could not run at all (service unreachable/uninitialised)
  /// — the signature was never cryptographically examined. Callers must not
  /// report an unavailable engine as a forged signature.
  unavailable: boolean;
  signatureClass: string;
  signerCN: string | null;
  signingTime: string | null;
  certSerial: string | null;
  issuer: string | null;
  validationReport: unknown;
};

export type TVerifyDetachedInput = {
  documentBytes: Uint8Array;
  signatureBase64: string;
};

/// A backend "full verification" engine. Implementations must uphold a
/// fail-closed contract: every failure mode resolves to `valid: false` with a
/// reason; genuine engine outages set `unavailable: true` so the caller's
/// strictness policy can decide whether to degrade to structural validation.
export type TDetachedSignatureVerifier = {
  id: string;
  isConfigured: () => boolean;
  verify: (input: TVerifyDetachedInput) => Promise<TFullVerificationResult>;
};

/// Map an engine signature class onto the legal classes from the technical
/// specification (section 11.1.8).
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

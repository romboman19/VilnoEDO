/// Pluggable backend verification seam for UA KEP detached signatures.
///
/// Layer model: structural fail-closed validation (see `structural-validation.ts`)
/// is the always-on acceptance floor. The "full" cryptographic verdict
/// (DSTU-4145 signature math, certificate chain, OCSP/TSP evidence) is produced
/// by a pluggable engine implementing `TDetachedSignatureVerifier`. Today the
/// only engine is an external authoritative validation service; it is dormant
/// until configured, in which case structural validation alone gates acceptance.

/// Legal class from the technical specification (section 11.1.8), as returned
/// by the external verification service.
export type TUaKepLegalClass = 'KEP' | 'UEP_QC' | 'ADES' | 'UNKNOWN';

export type TFullVerificationResult = {
  /// Id of the engine/service that produced this verdict (for audit provenance).
  engineId: string;
  valid: boolean;
  error: string | null;
  /// True when the engine could not run at all (service unreachable/uninitialised)
  /// — the signature was never cryptographically examined. Callers must not
  /// report an unavailable engine as a forged signature.
  unavailable: boolean;
  legalClass: TUaKepLegalClass;
  signerCN: string | null;
  signingTime: string | null;
  certSerial: string | null;
  issuer: string | null;
  /// The full normalized service response, persisted verbatim as evidence.
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

const LEGAL_CLASSES: readonly TUaKepLegalClass[] = ['KEP', 'UEP_QC', 'ADES', 'UNKNOWN'];

/// Coerce an arbitrary value from the service response into a known legal class.
export const asLegalClass = (value: unknown): TUaKepLegalClass => {
  return typeof value === 'string' && (LEGAL_CLASSES as readonly string[]).includes(value)
    ? (value as TUaKepLegalClass)
    : 'UNKNOWN';
};

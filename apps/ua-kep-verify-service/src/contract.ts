import { z } from 'zod';

/// Stable public contract for POST /api/verify. Kept deliberately narrow and
/// versionable so callers (VilnoEDO) integrate against one shape regardless of
/// which engine produces the verdict.

export const ZVerifyRequest = z.object({
  documentBase64: z.string().min(1),
  signatureBase64: z.string().min(1),
  signatureFormat: z.enum(['CADES_DETACHED']).default('CADES_DETACHED'),
  policy: z.enum(['UA_KEP_STRICT']).default('UA_KEP_STRICT'),
  /// Optional caller-computed SHA-256 (hex) of the exact document bytes. When
  /// present the engine must confirm it matches the bytes it verified.
  expectedDocumentSha256: z.string().optional(),
  evidenceRequestId: z.string().optional(),
});

export type TVerifyRequest = z.infer<typeof ZVerifyRequest>;

export type TLegalClass = 'KEP' | 'UEP_QC' | 'ADES' | 'UNKNOWN';

export type TVerifyResponse = {
  valid: boolean;
  /// True only when the engine could not run at all (library not provisioned,
  /// provider unreachable). Never conflate with a cryptographically invalid
  /// signature.
  unavailable: boolean;
  legalClass: TLegalClass;
  format: string;
  error: string | null;
  signer: {
    commonName: string | null;
    drfo: string | null;
    edrpou: string | null;
    organization: string | null;
  };
  certificate: {
    serial: string | null;
    issuerCn: string | null;
    notBefore: string | null;
    notAfter: string | null;
    qualified: boolean | null;
    qscd: boolean | null;
    policyOids: string[];
  };
  signature: {
    signingTime: string | null;
    documentSha256: string | null;
    messageDigestMatches: boolean | null;
  };
  trust: {
    trustedListProfile: string | null;
    trustedListSha256: string | null;
    providerTrusted: boolean | null;
    chainValid: boolean | null;
  };
  revocation: {
    checked: boolean;
    source: string | null;
    status: string | null;
    checkedAt: string | null;
  };
  timestamp: {
    present: boolean;
    valid: boolean | null;
    time: string | null;
  };
  verifier: {
    engine: string;
    engineVersion: string | null;
    authoritativeProvider: boolean;
    providerName?: string | null;
    providerReportSignature: string | null;
  };
  rawReport: unknown;
};

/// Build a normalized response for an engine that could not run. `valid` is
/// always false; `unavailable` marks the outage so the caller can apply its
/// fail-closed / degrade policy.
export const buildUnavailableResponse = ({
  engine,
  error,
  format = 'CADES_DETACHED',
}: {
  engine: string;
  error: string;
  format?: string;
}): TVerifyResponse => ({
  valid: false,
  unavailable: true,
  legalClass: 'UNKNOWN',
  format,
  error,
  signer: { commonName: null, drfo: null, edrpou: null, organization: null },
  certificate: {
    serial: null,
    issuerCn: null,
    notBefore: null,
    notAfter: null,
    qualified: null,
    qscd: null,
    policyOids: [],
  },
  signature: { signingTime: null, documentSha256: null, messageDigestMatches: null },
  trust: { trustedListProfile: null, trustedListSha256: null, providerTrusted: null, chainValid: null },
  revocation: { checked: false, source: null, status: null, checkedAt: null },
  timestamp: { present: false, valid: null, time: null },
  verifier: { engine, engineVersion: null, authoritativeProvider: false, providerReportSignature: null },
  rawReport: null,
});

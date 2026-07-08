import type { TVerifyResponse } from '../contract';
import type { TTrustSnapshot } from '../trust-list/index';

export type TVerifyEngineInput = {
  documentBytes: Uint8Array;
  signatureBytes: Uint8Array;
  /// Optional caller-computed document SHA-256 (hex) to cross-check.
  expectedDocumentSha256?: string;
  /// Current Trusted List snapshot (issuer allow-list, CA chain, profile/hash).
  trust: TTrustSnapshot | null;
};

/// A pluggable verification engine. Implementations MUST be fail-closed: every
/// path resolves to a normalized `TVerifyResponse`; an engine that cannot run
/// returns `unavailable: true` (never `valid: true`).
export type TVerifyEngine = {
  id: string;
  version: string | null;
  /// Whether the engine has everything it needs to attempt verification
  /// (library provisioned / provider configured). When false, `verify` returns
  /// an unavailable response.
  isReady: () => boolean;
  verify: (input: TVerifyEngineInput) => Promise<TVerifyResponse>;
};

/// Runtime configuration for the UA KEP verification adapter service.
/// All values come from the environment so the same image can run with the
/// IIT native engine, a qualified-provider engine, or in a dormant fail-closed
/// state (no engine provisioned yet).

export type TVerifyEngineId = 'iit-native' | 'qtsp-provider';

const TRUST_LIST_PROFILES = ['TL-UA-DSTU', 'TL-UA'] as const;
export type TTrustListProfile = (typeof TRUST_LIST_PROFILES)[number];

const asBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }

  return /^(1|true|yes|on)$/i.test(value.trim());
};

const asEngine = (value: string | undefined): TVerifyEngineId => {
  return value === 'qtsp-provider' ? 'qtsp-provider' : 'iit-native';
};

const asTrustListProfile = (value: string | undefined): TTrustListProfile => {
  return value && (TRUST_LIST_PROFILES as readonly string[]).includes(value)
    ? (value as TTrustListProfile)
    : 'TL-UA-DSTU';
};

export const config = {
  port: Number(process.env.PORT ?? 3017),
  host: process.env.HOST ?? '0.0.0.0',
  /// Shared secret required in the `x-api-key` header. When unset the service
  /// refuses to start in production (see server.ts) to avoid an open verifier.
  apiKey: process.env.UA_KEP_API_KEY ?? '',
  /// Active verification engine.
  engine: asEngine(process.env.UA_KEP_VERIFY_ENGINE),
  /// Fail-closed (default true): any inability to verify resolves to
  /// valid:false. Only a genuine engine outage is flagged separately so the
  /// caller can distinguish "could not verify" from "signature is invalid".
  failClosed: asBool(process.env.UA_KEP_VERIFY_FAIL_CLOSED, true),
  /// Trusted List profile used as the trust anchor source.
  trustListProfile: asTrustListProfile(process.env.UA_KEP_TRUST_LIST_PROFILE),
  /// Filesystem path where the IIT native/Java library is mounted. Empty until
  /// the licensed library is provisioned into the image/volume.
  iitLibPath: process.env.IIT_LIB_PATH ?? '',
  /// How the IIT library is bound: 'ffi' (native .so via koffi) or 'java'.
  iitLibMode: process.env.IIT_LIB_MODE ?? 'ffi',
  /// Base URL of the qualified-provider (КНЕДП) validation API, when engine is
  /// qtsp-provider.
  qtspProviderUrl: process.env.UA_KEP_QTSP_PROVIDER_URL ?? '',
  qtspProviderKey: process.env.UA_KEP_QTSP_PROVIDER_KEY ?? '',
  /// Directory where downloaded Trusted List snapshots are cached.
  trustCacheDir: process.env.UA_KEP_TRUST_CACHE_DIR ?? '/data/trust-list',
  nodeEnv: process.env.NODE_ENV ?? 'development',
} as const;

export const isProduction = () => config.nodeEnv === 'production';

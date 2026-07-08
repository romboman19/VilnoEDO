import { existsSync } from 'node:fs';

import { config } from '../config';
import { buildUnavailableResponse } from '../contract';
import type { TVerifyEngine, TVerifyEngineInput } from './types';

/// Server-side verification engine backed by the IIT "Користувач ЦСК" signature
/// library (EU Sign). This is the correct server-side crypto engine for UA
/// DSTU-4145 — the Linux native `.so` (C interface) or the Java library — NOT
/// the browser `@it-enterprise/digital-signature` SDK.
///
/// PROVISIONING (Phase 2): mount the licensed IIT library into the image and
/// point `IIT_LIB_PATH` at it. See ../../PROVISIONING.md for the exact files,
/// download links and binding steps. Until then this engine reports
/// `unavailable` and, combined with the service's fail-closed policy, the
/// caller degrades to structural validation or rejects — it never reports a
/// signature as valid without real cryptographic verification.
///
/// The binding point below is intentionally isolated so wiring the native
/// library (via koffi FFI) or a JVM sidecar is a single-file change that does
/// not touch the HTTP contract or the dispatcher.

const ENGINE_ID = 'iit-native';

let bindingChecked = false;
let bindingError: string | null = null;

/// Lazily determine whether the IIT library is present and loadable. The real
/// FFI/JVM load happens here in Phase 2; for now we only assert the configured
/// path exists so `isReady()` is honest.
const ensureBinding = (): boolean => {
  if (bindingChecked) {
    return bindingError === null;
  }

  bindingChecked = true;

  if (!config.iitLibPath) {
    bindingError = 'IIT_LIB_PATH is not set — IIT signature library is not provisioned';
    return false;
  }

  if (!existsSync(config.iitLibPath)) {
    bindingError = `IIT library not found at IIT_LIB_PATH=${config.iitLibPath}`;
    return false;
  }

  // Phase 2: load the native .so via koffi (config.iitLibMode === 'ffi') or the
  // Java library (config.iitLibMode === 'java'), initialise EU Sign with the CA
  // bundle / OCSP / TSP settings, and keep the context as a process singleton.
  bindingError = 'IIT native binding is not implemented yet (skeleton) — provisioning pending';
  return false;
};

const iitNativeEngine: TVerifyEngine = {
  id: ENGINE_ID,
  version: null,

  isReady: () => ensureBinding(),

  // eslint-disable-next-line @typescript-eslint/require-await
  verify: async (_input: TVerifyEngineInput) => {
    if (!ensureBinding()) {
      return buildUnavailableResponse({
        engine: ENGINE_ID,
        error: bindingError ?? 'IIT engine unavailable',
      });
    }

    // Phase 2: call EU Sign VerifyData(documentBytes, signatureBytes), map the
    // certificate/QSCD/QC/chain/OCSP/TSP result onto TVerifyResponse and
    // classify legalClass (KEP/UEP_QC/ADES).
    return buildUnavailableResponse({
      engine: ENGINE_ID,
      error: 'IIT native verification not implemented yet (skeleton)',
    });
  },
};

export default iitNativeEngine;

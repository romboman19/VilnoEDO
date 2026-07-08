import { config } from '../config';
import { buildUnavailableResponse } from '../contract';
import type { TVerifyEngine, TVerifyEngineInput } from './types';

/// Authoritative verification engine backed by a qualified trust service
/// provider (КНЕДП) validation API. Per the Law on Electronic Trust Services,
/// a qualified provider that offers a validation/confirmation service must be
/// able to return the result automatically, sealed/signed with at least the
/// provider's advanced signature or seal.
///
/// Phase 3: implement the provider's request/response, verify the provider's
/// seal on the returned report, and set `authoritativeProvider: true` with
/// `providerReportSignature`. Until a provider is contracted and configured
/// this engine reports `unavailable`.

const ENGINE_ID = 'qtsp-provider';

const qtspProviderEngine: TVerifyEngine = {
  id: ENGINE_ID,
  version: null,

  isReady: () => config.qtspProviderUrl.trim().length > 0,

  // eslint-disable-next-line @typescript-eslint/require-await
  verify: async (_input: TVerifyEngineInput) => {
    if (config.qtspProviderUrl.trim().length === 0) {
      return buildUnavailableResponse({
        engine: ENGINE_ID,
        error: 'UA_KEP_QTSP_PROVIDER_URL is not set — no qualified provider configured',
      });
    }

    // Phase 3: POST to the provider, verify the sealed validation report, map
    // it onto TVerifyResponse with authoritativeProvider: true.
    return buildUnavailableResponse({
      engine: ENGINE_ID,
      error: 'Qualified-provider verification not implemented yet (skeleton)',
    });
  },
};

export default qtspProviderEngine;

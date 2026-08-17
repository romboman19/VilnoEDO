import { extractPostHogConfig } from '@documenso/lib/constants/feature-flags';
import { APP_I18N_OPTIONS } from '@documenso/lib/constants/i18n';
import { dynamicActivate } from '@documenso/lib/utils/i18n';
import { i18n } from '@lingui/core';
import { detect, fromHtmlTag } from '@lingui/detect-locale';
import { I18nProvider } from '@lingui/react';
import { StrictMode, startTransition, useEffect } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';

import './utils/polyfills/promise-with-resolvers';

function PosthogInit() {
  const postHogConfig = extractPostHogConfig();

  useEffect(() => {
    if (postHogConfig) {
      void import('posthog-js').then(({ default: posthog }) => {
        posthog.init(postHogConfig.key, {
          api_host: postHogConfig.host,
          capture_exceptions: true,
        });
      });
    }
  }, []);

  return null;
}

/**
 * Surfaces hydration recoveries (React 19 discards the server HTML and
 * re-renders on the client instead of dying) so we can track how often
 * extensions/early clicks interfere with hydration in the wild.
 */
function onRecoverableError(error: unknown, errorInfo: { componentStack?: string }) {
  console.error('[hydration] recovered from error', error, errorInfo.componentStack);

  if (extractPostHogConfig()) {
    void import('posthog-js').then(({ default: posthog }) => {
      if (posthog.__loaded) {
        posthog.capture('$hydration_recoverable_error', {
          message: error instanceof Error ? error.message : String(error),
          componentStack: errorInfo.componentStack,
        });
      }
    });
  }
}

async function main() {
  const locale = detect(fromHtmlTag('lang')) || APP_I18N_OPTIONS.fallbackLang;

  await dynamicActivate(locale);

  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <I18nProvider i18n={i18n}>
          <HydratedRouter />
        </I18nProvider>

        <PosthogInit />
      </StrictMode>,
      { onRecoverableError },
    );
  });
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();

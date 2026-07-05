import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

import { SUPPORTED_LANGUAGE_CODES, type SupportedLanguageCodes } from './locales';

export * from './locales';

export type I18nLocaleData = {
  /**
   * The supported language extracted from the locale.
   */
  lang: SupportedLanguageCodes;

  /**
   * The preferred locales.
   */
  locales: string[];
};

type SupportedLanguage = {
  short: string;
  full: MessageDescriptor;
};

export const SUPPORTED_LANGUAGES: Record<string, SupportedLanguage> = {
  en: {
    short: 'en',
    full: msg`English`,
  },
  uk: {
    short: 'uk',
    full: msg`Ukrainian`,
  },
} satisfies Record<SupportedLanguageCodes, SupportedLanguage>;

export const isValidLanguageCode = (code: unknown): code is SupportedLanguageCodes =>
  SUPPORTED_LANGUAGE_CODES.includes(code as SupportedLanguageCodes);

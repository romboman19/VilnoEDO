import { z } from 'zod';

export const SUPPORTED_LANGUAGE_CODES = ['en', 'uk'] as const;

export type SupportedLanguageCodes = (typeof SUPPORTED_LANGUAGE_CODES)[number];

export const APP_I18N_OPTIONS = {
  supportedLangs: SUPPORTED_LANGUAGE_CODES,
  sourceLang: 'en',
  fallbackLang: 'uk',
  defaultLocale: 'uk-UA',
} as const;

export const ZSupportedLanguageCodeSchema = z.enum(SUPPORTED_LANGUAGE_CODES).catch('uk');

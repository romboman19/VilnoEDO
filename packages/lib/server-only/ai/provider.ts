import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { env } from '../../utils/env';
import { vertex } from './google';

export type TAiProvider = 'google' | 'ollama' | 'openai';

const AI_PROVIDERS = ['google', 'ollama', 'openai'] satisfies TAiProvider[];

const getEnvValue = (name: string) => env(name)?.trim() || undefined;

export const getAiProvider = (): TAiProvider => {
  const configuredProvider = getEnvValue('AI_PROVIDER')?.toLowerCase();

  if (configuredProvider) {
    if (AI_PROVIDERS.includes(configuredProvider as TAiProvider)) {
      return configuredProvider as TAiProvider;
    }

    throw new AppError(AppErrorCode.NOT_SETUP, {
      message: `AI_PROVIDER must be one of: ${AI_PROVIDERS.join(', ')}`,
    });
  }

  if (getEnvValue('OPENAI_API_KEY')) {
    return 'openai';
  }

  if (getEnvValue('OLLAMA_MODEL')) {
    return 'ollama';
  }

  return 'google';
};

export const isAiProviderConfigured = () => {
  const provider = getAiProvider();

  switch (provider) {
    case 'google':
      return Boolean(getEnvValue('GOOGLE_VERTEX_PROJECT_ID') && getEnvValue('GOOGLE_VERTEX_API_KEY'));
    case 'openai':
      return Boolean(getEnvValue('OPENAI_API_KEY'));
    case 'ollama':
      return Boolean(getEnvValue('OLLAMA_MODEL'));
  }
};

const assertAiProviderConfigured = (provider: TAiProvider) => {
  if (isAiProviderConfigured()) {
    return;
  }

  throw new AppError(AppErrorCode.NOT_SETUP, {
    message: `AI provider "${provider}" is not configured.`,
  });
};

export const getAiModel = (): LanguageModel => {
  const provider = getAiProvider();

  assertAiProviderConfigured(provider);

  switch (provider) {
    case 'google':
      return vertex(getEnvValue('GOOGLE_VERTEX_MODEL') || 'gemini-3-flash-preview');
    case 'openai': {
      const openai = createOpenAI({
        apiKey: getEnvValue('OPENAI_API_KEY'),
        baseURL: getEnvValue('OPENAI_BASE_URL'),
        organization: getEnvValue('OPENAI_ORGANIZATION'),
        project: getEnvValue('OPENAI_PROJECT'),
      });

      return openai.chat(getEnvValue('OPENAI_MODEL') || 'gpt-4.1-mini');
    }
    case 'ollama': {
      const ollama = createOpenAI({
        apiKey: getEnvValue('OLLAMA_API_KEY') || 'ollama',
        baseURL: getEnvValue('OLLAMA_BASE_URL') || 'http://localhost:11434/v1',
        name: 'ollama',
      });

      return ollama.chat(getEnvValue('OLLAMA_MODEL') || 'llama3.2-vision');
    }
  }
};

export const getAiProviderOptions = () => {
  if (getAiProvider() !== 'google') {
    return undefined;
  }

  return {
    google: {
      thinkingConfig: {
        thinkingLevel: 'low',
      },
    },
  } as const;
};

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
        // Ollama.com cloud models need two request adjustments:
        // 1. The AI SDK emits the system prompt as the OpenAI "developer"
        //    role, which the cloud proxy rejects on multimodal requests
        //    with a 500. Rewrite it back to "system".
        // 2. The cloud proxy ignores `response_format: json_schema`, so the
        //    model answers in prose. Inject the schema requirement into the
        //    system prompt so structured generation still works.
        fetch: async (input, init) => {
          if (init?.body && typeof init.body === 'string') {
            try {
              const parsed: unknown = JSON.parse(init.body);

              if (
                parsed &&
                typeof parsed === 'object' &&
                'messages' in parsed &&
                Array.isArray(parsed.messages)
              ) {
                let messages: Array<Record<string, unknown>> = parsed.messages.map(
                  (message: Record<string, unknown>) =>
                    message?.role === 'developer' ? { ...message, role: 'system' } : message,
                );

                const responseFormat =
                  'response_format' in parsed
                    ? (parsed.response_format as {
                        type?: string;
                        json_schema?: { schema?: unknown };
                      })
                    : undefined;

                const schema = responseFormat?.json_schema?.schema;

                if (responseFormat?.type === 'json_schema' && schema) {
                  const instruction = `\n\nIMPORTANT: Respond ONLY with a single raw JSON value that validates against the following JSON schema. Do not wrap it in markdown code fences and do not add any other text.\n${JSON.stringify(schema)}`;

                  const systemIndex = messages.findIndex(
                    (message) => message?.role === 'system',
                  );

                  const system = systemIndex !== -1 ? messages[systemIndex] : undefined;

                  if (system && typeof system.content === 'string') {
                    messages = [
                      ...messages.slice(0, systemIndex),
                      { ...system, content: system.content + instruction },
                      ...messages.slice(systemIndex + 1),
                    ];
                  } else if (!system) {
                    messages = [{ role: 'system', content: instruction.trim() }, ...messages];
                  }
                }

                parsed.messages = messages;

                init = { ...init, body: JSON.stringify(parsed) };
              }
            } catch {
              // Not JSON, pass the request through untouched.
            }
          }

          return await fetch(input, init);
        },
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

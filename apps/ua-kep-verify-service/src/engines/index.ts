import { config } from '../config';
import iitNativeEngine from './iit-native';
import qtspProviderEngine from './qtsp-provider';
import type { TVerifyEngine } from './types';

const ENGINES: Record<string, TVerifyEngine> = {
  [iitNativeEngine.id]: iitNativeEngine,
  [qtspProviderEngine.id]: qtspProviderEngine,
};

/// The engine selected by UA_KEP_VERIFY_ENGINE. Always resolvable — the config
/// normalizes unknown values to `iit-native`.
export const getActiveEngine = (): TVerifyEngine => {
  return ENGINES[config.engine] ?? iitNativeEngine;
};

export type { TVerifyEngine, TVerifyEngineInput } from './types';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  externalVerifier,
  getExternalVerifierUrl,
  isExternalVerificationConfigured,
  resolveFullVerifier,
} from './index';

const DOC = new Uint8Array([1, 2, 3]);
const SIG = Buffer.from('signature').toString('base64');

const mockFetch = (impl: () => Promise<Response> | Response) => {
  vi.stubGlobal('fetch', vi.fn(impl));
};

const jsonResponse = (body: unknown, ok = true, status = 200) =>
  ({
    ok,
    status,
    json: async () => body,
  }) as Response;

beforeEach(() => {
  vi.stubEnv('NEXT_PRIVATE_UA_KEP_VERIFY_SERVICE_URL', '');
  vi.stubEnv('NEXT_PRIVATE_UA_KEP_VERIFY_SERVICE_SECRET', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('external verifier configuration', () => {
  it('is not configured when the URL is unset', () => {
    expect(isExternalVerificationConfigured()).toBe(false);
    expect(getExternalVerifierUrl()).toBeNull();
    expect(resolveFullVerifier()).toBeNull();
  });

  it('is configured and trims a trailing slash when the URL is set', () => {
    vi.stubEnv('NEXT_PRIVATE_UA_KEP_VERIFY_SERVICE_URL', 'https://verify.example.test/');

    expect(isExternalVerificationConfigured()).toBe(true);
    expect(getExternalVerifierUrl()).toBe('https://verify.example.test');
    expect(resolveFullVerifier()).toBe(externalVerifier);
  });
});

describe('external verifier verify()', () => {
  it('fails as unavailable when not configured', async () => {
    const result = await externalVerifier.verify({ documentBytes: DOC, signatureBase64: SIG });

    expect(result.valid).toBe(false);
    expect(result.unavailable).toBe(true);
    expect(result.engineId).toBe('external-verification-service');
  });

  it('returns a valid verdict with mapped fields on success', async () => {
    vi.stubEnv('NEXT_PRIVATE_UA_KEP_VERIFY_SERVICE_URL', 'https://verify.example.test');
    mockFetch(() =>
      jsonResponse({
        ok: true,
        verification: {
          valid: true,
          signatureClass: 'QES',
          signerCN: 'ТЕСТ Тест Тестович',
          signingTime: '2026-07-08T10:00:00Z',
          certSerial: 'ABCD',
          issuer: 'КНЕДП ДПС',
        },
        validationReport: { some: 'report' },
      }),
    );

    const result = await externalVerifier.verify({ documentBytes: DOC, signatureBase64: SIG });

    expect(result.valid).toBe(true);
    expect(result.unavailable).toBe(false);
    expect(result.signatureClass).toBe('QES');
    expect(result.signerCN).toBe('ТЕСТ Тест Тестович');
    expect(result.validationReport).toEqual({ some: 'report' });
  });

  it('marks an HTTP error as unavailable', async () => {
    vi.stubEnv('NEXT_PRIVATE_UA_KEP_VERIFY_SERVICE_URL', 'https://verify.example.test');
    mockFetch(() => jsonResponse({}, false, 500));

    const result = await externalVerifier.verify({ documentBytes: DOC, signatureBase64: SIG });

    expect(result.valid).toBe(false);
    expect(result.unavailable).toBe(true);
    expect(result.error).toContain('HTTP 500');
  });

  it('treats a service-uninitialised error as unavailable, not a forged signature', async () => {
    vi.stubEnv('NEXT_PRIVATE_UA_KEP_VERIFY_SERVICE_URL', 'https://verify.example.test');
    mockFetch(() =>
      jsonResponse({
        ok: true,
        verification: { valid: false, signatureClass: 'unknown', error: 'crypto engine initialization failed' },
      }),
    );

    const result = await externalVerifier.verify({ documentBytes: DOC, signatureBase64: SIG });

    expect(result.valid).toBe(false);
    expect(result.unavailable).toBe(true);
  });

  it('treats a cryptographic rejection as invalid, not unavailable', async () => {
    vi.stubEnv('NEXT_PRIVATE_UA_KEP_VERIFY_SERVICE_URL', 'https://verify.example.test');
    mockFetch(() =>
      jsonResponse({
        ok: true,
        verification: { valid: false, signatureClass: 'unknown', error: 'signature does not match document' },
      }),
    );

    const result = await externalVerifier.verify({ documentBytes: DOC, signatureBase64: SIG });

    expect(result.valid).toBe(false);
    expect(result.unavailable).toBe(false);
  });
});

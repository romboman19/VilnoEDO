import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isSignServiceConfigured, toLegalClass, verifyDetachedSignatureRemote } from './sign-service-client';

const documentBytes = new Uint8Array(Buffer.from('document'));
const signatureBase64 = Buffer.from('signature').toString('base64');

const okResponse = {
  ok: true,
  verification: {
    valid: true,
    skipped: false,
    error: null,
    signatureClass: 'QES',
    signerCN: 'Тестовий Підписувач',
    signingTime: '2026-07-03T10:00:00Z',
    certSerial: 'abc123',
    issuer: 'КНЕДП ДПС',
  },
  validationReport: { trustMaterialVersion: 'v1' },
};

describe('sign-service-client', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PRIVATE_SIGN_SERVICE_URL', 'https://sign.example.test/');
    vi.stubEnv('NEXT_PRIVATE_SIGN_SERVICE_SECRET', 'shared-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is not configured when the url env is empty', () => {
    vi.stubEnv('NEXT_PRIVATE_SIGN_SERVICE_URL', '');

    expect(isSignServiceConfigured()).toBe(false);
  });

  it('posts document and signature with the api key and parses the verdict', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(okResponse), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await verifyDetachedSignatureRemote({ documentBytes, signatureBase64 });

    expect(result.valid).toBe(true);
    expect(result.signatureClass).toBe('QES');
    expect(result.signerCN).toBe('Тестовий Підписувач');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://sign.example.test/api/verify');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('shared-secret');

    const body = JSON.parse(String(init.body));
    expect(body.signature).toBe(signatureBase64);
    expect(Buffer.from(body.document, 'base64').toString()).toBe('document');
  });

  it('fails closed on http errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('nope', { status: 500 }))),
    );

    const result = await verifyDetachedSignatureRemote({ documentBytes, signatureBase64 });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('HTTP 500');
  });

  it('fails closed on network errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );

    const result = await verifyDetachedSignatureRemote({ documentBytes, signatureBase64 });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('fails closed on malformed responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))),
    );

    const result = await verifyDetachedSignatureRemote({ documentBytes, signatureBase64 });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('malformed');
  });

  it('treats a skipped verification as its own state and honours valid=false', async () => {
    const skippedResponse = {
      ...okResponse,
      verification: {
        ...okResponse.verification,
        valid: false,
        skipped: true,
        error: 'DEV MODE',
      },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(skippedResponse), { status: 200 }))),
    );

    const result = await verifyDetachedSignatureRemote({ documentBytes, signatureBase64 });

    expect(result.valid).toBe(false);
    expect(result.skipped).toBe(true);
  });

  it('maps signature classes onto spec legal classes', () => {
    expect(toLegalClass('QES')).toBe('KEP');
    expect(toLegalClass('AdES_QC')).toBe('UEP_QC');
    expect(toLegalClass('AdES')).toBe('ADES');
    expect(toLegalClass('unknown')).toBe('UNKNOWN');
    expect(toLegalClass('whatever')).toBe('UNKNOWN');
  });
});

import crypto from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { verifySignServiceCallbackSignature } from './sign-service-callback';

const SECRET = 'shared-callback-secret';

const sign = (rawBody: string, secret = SECRET) =>
  `sha256=${crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;

describe('verifySignServiceCallbackSignature', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PRIVATE_SIGN_SERVICE_SECRET', SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts a correctly signed body', () => {
    const rawBody = JSON.stringify({ externalRef: 'env_1:7', nonce: 'n1' });

    expect(verifySignServiceCallbackSignature({ rawBody, signatureHeader: sign(rawBody) })).toBe(true);
  });

  it('rejects a tampered body', () => {
    const rawBody = JSON.stringify({ externalRef: 'env_1:7', nonce: 'n1' });
    const header = sign(rawBody);
    const tampered = JSON.stringify({ externalRef: 'env_1:8', nonce: 'n1' });

    expect(verifySignServiceCallbackSignature({ rawBody: tampered, signatureHeader: header })).toBe(false);
  });

  it('rejects a signature made with the wrong secret', () => {
    const rawBody = JSON.stringify({ externalRef: 'env_1:7' });

    expect(
      verifySignServiceCallbackSignature({
        rawBody,
        signatureHeader: sign(rawBody, 'attacker-secret'),
      }),
    ).toBe(false);
  });

  it('rejects a missing header', () => {
    const rawBody = JSON.stringify({ externalRef: 'env_1:7' });

    expect(verifySignServiceCallbackSignature({ rawBody, signatureHeader: null })).toBe(false);
  });

  it('rejects when no secret is configured', () => {
    vi.stubEnv('NEXT_PRIVATE_SIGN_SERVICE_SECRET', '');
    const rawBody = JSON.stringify({ externalRef: 'env_1:7' });

    expect(verifySignServiceCallbackSignature({ rawBody, signatureHeader: sign(rawBody) })).toBe(false);
  });
});

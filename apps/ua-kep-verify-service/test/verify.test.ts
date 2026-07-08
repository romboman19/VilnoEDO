import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { ZVerifyRequest } from '../src/contract';
import { runVerification } from '../src/verify-handler';

const DOC = Buffer.from('vilnoedo verify-service test document');
const DOC_B64 = DOC.toString('base64');
const SIG_B64 = Buffer.from('not-a-real-signature').toString('base64');
const DOC_SHA = createHash('sha256').update(DOC).digest('hex');

describe('request contract', () => {
  it('applies defaults for signatureFormat and policy', () => {
    const parsed = ZVerifyRequest.parse({ documentBase64: DOC_B64, signatureBase64: SIG_B64 });

    expect(parsed.signatureFormat).toBe('CADES_DETACHED');
    expect(parsed.policy).toBe('UA_KEP_STRICT');
  });

  it('rejects an empty document', () => {
    expect(ZVerifyRequest.safeParse({ documentBase64: '', signatureBase64: SIG_B64 }).success).toBe(false);
  });
});

describe('runVerification (default iit-native engine, unprovisioned)', () => {
  it('is fail-closed unavailable when the IIT library is not provisioned', async () => {
    const result = await runVerification(ZVerifyRequest.parse({ documentBase64: DOC_B64, signatureBase64: SIG_B64 }));

    expect(result.valid).toBe(false);
    expect(result.unavailable).toBe(true);
    expect(result.verifier.engine).toBe('iit-native');
    expect(result.legalClass).toBe('UNKNOWN');
    // The service always stamps the document hash it verified against.
    expect(result.signature.documentSha256).toBe(DOC_SHA);
  });

  it('rejects when expectedDocumentSha256 does not match the bytes', async () => {
    const result = await runVerification(
      ZVerifyRequest.parse({
        documentBase64: DOC_B64,
        signatureBase64: SIG_B64,
        expectedDocumentSha256: 'deadbeef',
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.unavailable).toBe(false);
    expect(result.error).toContain('expectedDocumentSha256');
  });
});

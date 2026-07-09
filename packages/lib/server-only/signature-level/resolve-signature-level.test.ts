import { describe, expect, it } from 'vitest';

import { SignatureLevel } from '../../types/signature-level';
import { resolveSignatureLevel } from './resolve-signature-level';

describe('resolveSignatureLevel (UA-only)', () => {
  it('defaults to UA_KEP when no level is requested', () => {
    expect(resolveSignatureLevel()).toBe(SignatureLevel.UA_KEP);
  });

  it('passes UA_KEP through', () => {
    expect(resolveSignatureLevel({ requested: SignatureLevel.UA_KEP, strict: true })).toBe(SignatureLevel.UA_KEP);
  });

  it('rejects a non-UA level in strict mode (public API guard)', () => {
    expect(() => resolveSignatureLevel({ requested: SignatureLevel.SES, strict: true })).toThrow();
    expect(() => resolveSignatureLevel({ requested: SignatureLevel.AES, strict: true })).toThrow();
    expect(() => resolveSignatureLevel({ requested: SignatureLevel.QES, strict: true })).toThrow();
  });

  it('coerces a non-UA level to UA_KEP in non-strict mode (internal callers)', () => {
    expect(resolveSignatureLevel({ requested: SignatureLevel.SES })).toBe(SignatureLevel.UA_KEP);
  });
});

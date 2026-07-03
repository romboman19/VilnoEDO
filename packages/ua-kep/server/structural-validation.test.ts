import crypto from 'node:crypto';

import * as asn1js from 'asn1js';
import {
  Attribute,
  AttributeTypeAndValue,
  Certificate,
  ContentInfo,
  CryptoEngine,
  EncapsulatedContentInfo,
  IssuerAndSerialNumber,
  SignedAndUnsignedAttributes,
  SignedData,
  SignerInfo,
  setEngine,
} from 'pkijs';
import { beforeAll, describe, expect, it } from 'vitest';

import { collectRegistryIssuerCns, runUaKepStructuralValidation } from './structural-validation';

const OID_DATA = '1.2.840.113549.1.7.1';
const OID_SIGNED_DATA = '1.2.840.113549.1.7.2';
const OID_CONTENT_TYPE_ATTR = '1.2.840.113549.1.9.3';
const OID_MESSAGE_DIGEST_ATTR = '1.2.840.113549.1.9.4';
const OID_SIGNING_TIME_ATTR = '1.2.840.113549.1.9.5';
const OID_COMMON_NAME = '2.5.4.3';

const DOCUMENT_BYTES = Buffer.from('vilnoedo test document bytes');

const sha256B64 = (bytes: Buffer) => {
  return crypto.createHash('sha256').update(bytes).digest('base64');
};

type TFixtureOptions = {
  issuerCn?: string;
  signingTime?: Date;
  certNotBefore?: Date;
  certNotAfter?: Date;
  omitSigningTime?: boolean;
};

const buildDetachedCadesFixture = async ({
  issuerCn = 'КНЕДП ДПС',
  signingTime = new Date('2026-07-03T10:00:00Z'),
  certNotBefore = new Date('2026-01-01T00:00:00Z'),
  certNotAfter = new Date('2027-01-01T00:00:00Z'),
  omitSigningTime = false,
}: TFixtureOptions = {}) => {
  const webcrypto = crypto.webcrypto as unknown as Crypto;

  const keyPair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);

  const certificate = new Certificate();
  certificate.version = 2;
  certificate.serialNumber = new asn1js.Integer({ value: 4242 });

  certificate.issuer.typesAndValues.push(
    new AttributeTypeAndValue({
      type: OID_COMMON_NAME,
      value: new asn1js.Utf8String({ value: issuerCn }),
    }),
  );

  certificate.subject.typesAndValues.push(
    new AttributeTypeAndValue({
      type: OID_COMMON_NAME,
      value: new asn1js.Utf8String({ value: 'Тестовий Підписувач' }),
    }),
  );

  certificate.notBefore.value = certNotBefore;
  certificate.notAfter.value = certNotAfter;

  await certificate.subjectPublicKeyInfo.importKey(keyPair.publicKey);
  await certificate.sign(keyPair.privateKey, 'SHA-256');

  const signedData = new SignedData({
    version: 1,
    encapContentInfo: new EncapsulatedContentInfo({
      eContentType: OID_DATA,
    }),
    signerInfos: [
      new SignerInfo({
        version: 1,
        sid: new IssuerAndSerialNumber({
          issuer: certificate.issuer,
          serialNumber: certificate.serialNumber,
        }),
      }),
    ],
    certificates: [certificate],
  });

  const documentDigest = crypto.createHash('sha256').update(DOCUMENT_BYTES).digest();

  const attributes = [
    new Attribute({
      type: OID_CONTENT_TYPE_ATTR,
      values: [new asn1js.ObjectIdentifier({ value: OID_DATA })],
    }),
    new Attribute({
      type: OID_MESSAGE_DIGEST_ATTR,
      values: [new asn1js.OctetString({ valueHex: new Uint8Array(documentDigest).buffer })],
    }),
  ];

  if (!omitSigningTime) {
    attributes.push(
      new Attribute({
        type: OID_SIGNING_TIME_ATTR,
        values: [new asn1js.UTCTime({ valueDate: signingTime })],
      }),
    );
  }

  signedData.signerInfos[0].signedAttrs = new SignedAndUnsignedAttributes({
    type: 0,
    attributes,
  });

  await signedData.sign(keyPair.privateKey, 0, 'SHA-256', new Uint8Array(DOCUMENT_BYTES).buffer);

  const contentInfo = new ContentInfo({
    contentType: OID_SIGNED_DATA,
    content: signedData.toSchema(true),
  });

  return Buffer.from(contentInfo.toSchema().toBER(false)).toString('base64');
};

const REGISTRY = [{ issuerCNs: ['КНЕДП ДПС', 'QTSP State Tax Service of Ukraine'] }];

const registryIssuerCns = collectRegistryIssuerCns(REGISTRY);

const VALIDATION_TIME = new Date('2026-07-03T12:00:00Z');

const runValidation = (signatureB64: string, hashB64 = sha256B64(DOCUMENT_BYTES)) => {
  return runUaKepStructuralValidation({
    preparedItems: [
      {
        envelopeItemId: 'item_1',
        documentDataId: 'docdata_1',
        hashB64,
        ordinal: 0,
      },
    ],
    signatures: [
      {
        envelopeItemId: 'item_1',
        signatureB64,
      },
    ],
    registryIssuerCns,
    validationTime: VALIDATION_TIME,
  });
};

beforeAll(() => {
  setEngine(
    'node-webcrypto',
    new CryptoEngine({
      name: 'node-webcrypto',
      crypto: crypto.webcrypto as unknown as Crypto,
    }),
  );
});

describe('runUaKepStructuralValidation', () => {
  it('passes a well-formed detached signature over the prepared hash', async () => {
    const signatureB64 = await buildDetachedCadesFixture();

    const [verdict] = runValidation(signatureB64);

    expect(verdict.status).toBe('passed');
    expect(verdict.errors).toEqual([]);
    expect(verdict.certificateStatus).toBe('within_validity_window');
    expect(verdict.parsed?.isDetached).toBe(true);
    expect(verdict.parsed?.signerCertificate?.issuerCommonName).toBe('КНЕДП ДПС');
    expect(verdict.warnings.map((warning) => warning.code)).toEqual(['CRYPTOGRAPHIC_VALIDATION_DELEGATED']);
  });

  it('fails when the prepared hash does not match messageDigest', async () => {
    const signatureB64 = await buildDetachedCadesFixture();

    const otherHash = sha256B64(Buffer.from('a completely different document'));
    const [verdict] = runValidation(signatureB64, otherHash);

    expect(verdict.status).toBe('failed');
    expect(verdict.errors.map((error) => error.code)).toContain('MESSAGE_DIGEST_MISMATCH');
  });

  it('fails when the signature is not parseable CMS', () => {
    const [verdict] = runValidation(Buffer.from('garbage bytes').toString('base64'));

    expect(verdict.status).toBe('failed');
    expect(verdict.errors.map((error) => error.code)).toContain('STRUCTURE_INVALID');
  });

  it('fails when the certificate window does not cover the signing time', async () => {
    const signatureB64 = await buildDetachedCadesFixture({
      certNotBefore: new Date('2020-01-01T00:00:00Z'),
      certNotAfter: new Date('2021-01-01T00:00:00Z'),
      signingTime: new Date('2026-07-03T10:00:00Z'),
    });

    const [verdict] = runValidation(signatureB64);

    expect(verdict.status).toBe('failed');
    expect(verdict.errors.map((error) => error.code)).toContain('CERTIFICATE_NOT_VALID_AT_SIGNING_TIME');
    expect(verdict.certificateStatus).toBe('outside_validity_window');
  });

  it('warns when the issuer is not in the KNEDP registry', async () => {
    const signatureB64 = await buildDetachedCadesFixture({ issuerCn: 'Unknown Test CA' });

    const [verdict] = runValidation(signatureB64);

    expect(verdict.status).toBe('passed');
    expect(verdict.warnings.map((warning) => warning.code)).toContain('ISSUER_NOT_IN_REGISTRY');
  });

  it('warns when signingTime is absent and falls back to validation time', async () => {
    const signatureB64 = await buildDetachedCadesFixture({ omitSigningTime: true });

    const [verdict] = runValidation(signatureB64);

    expect(verdict.status).toBe('passed');
    expect(verdict.warnings.map((warning) => warning.code)).toContain('SIGNING_TIME_MISSING');
  });

  it('fails for a signature over an unprepared envelope item', async () => {
    const signatureB64 = await buildDetachedCadesFixture();

    const verdicts = runUaKepStructuralValidation({
      preparedItems: [],
      signatures: [{ envelopeItemId: 'item_x', signatureB64 }],
      registryIssuerCns,
      validationTime: VALIDATION_TIME,
    });

    expect(verdicts[0].status).toBe('failed');
    expect(verdicts[0].errors.map((error) => error.code)).toContain('UNKNOWN_ENVELOPE_ITEM');
  });
});

import * as asn1js from 'asn1js';
import { Certificate, ContentInfo, SignedData } from 'pkijs';

/// Structural facts extracted from one detached CAdES (CMS SignedData)
/// artifact. Extraction is algorithm-agnostic: DSTU-4145 signatures parse the
/// same way as RSA/ECDSA ones, we only read the ASN.1 structure and never
/// attempt cryptographic verification here.
export type TParsedCadesSignature = {
  isDetached: boolean;
  digestAlgorithmOid: string;
  signatureAlgorithmOid: string;
  contentTypeOid: string | null;
  messageDigestB64: string | null;
  signingTime: Date | null;
  signerCertificate: TParsedSignerCertificate | null;
  certificateCount: number;
};

export type TParsedSignerCertificate = {
  subjectCommonName: string | null;
  issuerCommonName: string | null;
  serialNumberHex: string;
  notBefore: Date;
  notAfter: Date;
};

const OID_SIGNED_DATA = '1.2.840.113549.1.7.2';
const OID_CONTENT_TYPE_ATTR = '1.2.840.113549.1.9.3';
const OID_MESSAGE_DIGEST_ATTR = '1.2.840.113549.1.9.4';
const OID_SIGNING_TIME_ATTR = '1.2.840.113549.1.9.5';
const OID_COMMON_NAME = '2.5.4.3';

const getCommonName = (rdnSequence: Certificate['subject']) => {
  for (const typeAndValue of rdnSequence.typesAndValues) {
    if (typeAndValue.type === OID_COMMON_NAME) {
      return String(typeAndValue.value.valueBlock.value);
    }
  }

  return null;
};

const toHex = (bytes: ArrayBuffer) => {
  return Buffer.from(bytes).toString('hex');
};

const matchesSignerId = (certificate: Certificate, signedData: SignedData) => {
  const signerInfo = signedData.signerInfos[0];

  if (!signerInfo) {
    return false;
  }

  // sid CHOICE: issuerAndSerialNumber is the only variant IIT stacks emit.
  const sid = signerInfo.sid;

  if (!(sid instanceof Object) || !('issuer' in sid) || !('serialNumber' in sid)) {
    return false;
  }

  const issuerAndSerial = sid as unknown as {
    issuer: Certificate['issuer'];
    serialNumber: asn1js.Integer;
  };

  const serialMatches =
    toHex(certificate.serialNumber.valueBlock.valueHexView.slice().buffer) ===
    toHex(issuerAndSerial.serialNumber.valueBlock.valueHexView.slice().buffer);

  return serialMatches;
};

export const parseCadesDetachedSignature = (signatureBase64: string): TParsedCadesSignature => {
  const signatureBytes = Buffer.from(signatureBase64.replace(/\s/g, ''), 'base64');

  if (signatureBytes.length === 0) {
    throw new Error('UA KEP signature is empty');
  }

  const asn1 = asn1js.fromBER(new Uint8Array(signatureBytes).buffer);

  if (asn1.offset === -1) {
    throw new Error('UA KEP signature is not valid DER');
  }

  const contentInfo = new ContentInfo({ schema: asn1.result });

  if (contentInfo.contentType !== OID_SIGNED_DATA) {
    throw new Error('UA KEP signature is not a CMS SignedData structure');
  }

  const signedData = new SignedData({ schema: contentInfo.content });

  const signerInfo = signedData.signerInfos[0];

  if (!signerInfo) {
    throw new Error('UA KEP signature has no SignerInfo');
  }

  const isDetached =
    !signedData.encapContentInfo.eContent ||
    signedData.encapContentInfo.eContent.valueBlock.valueHexView.byteLength === 0;

  let contentTypeOid: string | null = null;
  let messageDigestB64: string | null = null;
  let signingTime: Date | null = null;

  if (signerInfo.signedAttrs) {
    for (const attribute of signerInfo.signedAttrs.attributes) {
      const firstValue = attribute.values[0];

      if (!firstValue) {
        continue;
      }

      if (attribute.type === OID_CONTENT_TYPE_ATTR) {
        contentTypeOid = String(firstValue.valueBlock.toString());
      }

      if (attribute.type === OID_MESSAGE_DIGEST_ATTR) {
        messageDigestB64 = Buffer.from(firstValue.valueBlock.valueHexView).toString('base64');
      }

      if (attribute.type === OID_SIGNING_TIME_ATTR && 'toDate' in firstValue) {
        signingTime = (firstValue as asn1js.UTCTime).toDate();
      }
    }
  }

  const certificates = (signedData.certificates ?? []).filter(
    (certificate): certificate is Certificate => certificate instanceof Certificate,
  );

  const signerCertificateSource =
    certificates.find((certificate) => matchesSignerId(certificate, signedData)) ?? certificates[0] ?? null;

  const signerCertificate: TParsedSignerCertificate | null = signerCertificateSource
    ? {
        subjectCommonName: getCommonName(signerCertificateSource.subject),
        issuerCommonName: getCommonName(signerCertificateSource.issuer),
        serialNumberHex: toHex(signerCertificateSource.serialNumber.valueBlock.valueHexView.slice().buffer),
        notBefore: signerCertificateSource.notBefore.value,
        notAfter: signerCertificateSource.notAfter.value,
      }
    : null;

  return {
    isDetached,
    digestAlgorithmOid: signerInfo.digestAlgorithm.algorithmId,
    signatureAlgorithmOid: signerInfo.signatureAlgorithm.algorithmId,
    contentTypeOid,
    messageDigestB64,
    signingTime,
    signerCertificate,
    certificateCount: certificates.length,
  };
};

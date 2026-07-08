import type { TUaKepSessionItems } from '../types/session';
import { parseCadesDetachedSignature, type TParsedCadesSignature } from './cades';

export type TValidationIssue = {
  code: string;
  message: string;
};

export type TStructuralVerdict = {
  envelopeItemId: string;
  status: 'passed' | 'failed';
  certificateStatus: string | null;
  errors: TValidationIssue[];
  warnings: TValidationIssue[];
  parsed: TParsedCadesSignature | null;
};

type TSignatureInput = {
  envelopeItemId: string;
  signatureB64: string;
};

type TRunStructuralValidationInput = {
  preparedItems: TUaKepSessionItems;
  signatures: TSignatureInput[];
  /// Lower-cased issuer common names from the KNEDP registry (CAs.json).
  registryIssuerCns: Set<string>;
  validationTime: Date;
};

export const UA_KEP_STRUCTURAL_VALIDATOR_ID = 'vilnoedo-ua-kep-structural-v1';

/// SHA-256 signed-attribute digest OID. `prepare` computes the prepared hash
/// with SHA-256, so a byte-for-byte messageDigest comparison is only valid
/// when the signature also used SHA-256. Ukrainian КЕП almost always hashes
/// with DSTU GOST 34.311 / DSTU 7564, which Node cannot compute — for those
/// the digest match cannot be recomputed here and is left to full
/// cryptographic verification (out of scope for this instance), not failed here.
const OID_DIGEST_SHA256 = '2.16.840.1.101.3.4.2.1';

const CRYPTO_NOT_PERFORMED_WARNING: TValidationIssue = {
  code: 'CRYPTOGRAPHIC_VALIDATION_NOT_PERFORMED',
  message:
    'Structural checks passed; full cryptographic verification (DSTU-4145 signature math, certificate chain, OCSP/TSP evidence) is not performed by this instance.',
};

export const collectRegistryIssuerCns = (caRegistry: Array<Record<string, unknown>>) => {
  const issuerCns = new Set<string>();

  for (const ca of caRegistry) {
    const cns = ca.issuerCNs;

    if (!Array.isArray(cns)) {
      continue;
    }

    for (const cn of cns) {
      if (typeof cn === 'string' && cn.trim().length > 0) {
        issuerCns.add(cn.trim().toLowerCase());
      }
    }
  }

  return issuerCns;
};

const validateOneSignature = ({
  preparedHashB64,
  signatureB64,
  envelopeItemId,
  registryIssuerCns,
  validationTime,
}: {
  preparedHashB64: string;
  signatureB64: string;
  envelopeItemId: string;
  registryIssuerCns: Set<string>;
  validationTime: Date;
}): TStructuralVerdict => {
  const errors: TValidationIssue[] = [];
  const warnings: TValidationIssue[] = [];

  let parsed: TParsedCadesSignature | null = null;

  try {
    parsed = parseCadesDetachedSignature(signatureB64);
  } catch (error) {
    return {
      envelopeItemId,
      status: 'failed',
      certificateStatus: null,
      errors: [
        {
          code: 'STRUCTURE_INVALID',
          message: error instanceof Error ? error.message : 'Signature failed to parse as CMS',
        },
      ],
      warnings: [],
      parsed: null,
    };
  }

  if (!parsed.isDetached) {
    errors.push({
      code: 'NOT_DETACHED',
      message: 'Signature embeds content; the UA KEP flow requires detached CAdES.',
    });
  }

  if (!parsed.messageDigestB64) {
    errors.push({
      code: 'MESSAGE_DIGEST_MISSING',
      message: 'Signed attributes do not contain a messageDigest attribute.',
    });
  } else if (parsed.digestAlgorithmOid === OID_DIGEST_SHA256) {
    // Same algorithm as the prepared hash — a real byte comparison is possible.
    if (parsed.messageDigestB64 !== preparedHashB64) {
      errors.push({
        code: 'MESSAGE_DIGEST_MISMATCH',
        message: 'messageDigest in the signature does not match the prepared document hash.',
      });
    }
  } else {
    // DSTU (or another non-SHA-256) digest — Node cannot recompute it, so the
    // document-binding check is delegated to the cryptographic signing service.
    warnings.push({
      code: 'MESSAGE_DIGEST_ALGORITHM_DELEGATED',
      message: `messageDigest uses digest algorithm ${parsed.digestAlgorithmOid}; structural SHA-256 comparison is not applicable, document binding is left to full cryptographic verification.`,
    });
  }

  let certificateStatus: string | null = null;

  if (!parsed.signerCertificate) {
    errors.push({
      code: 'SIGNER_CERTIFICATE_MISSING',
      message: 'Signature does not embed the signer certificate.',
    });
  } else {
    const certificate = parsed.signerCertificate;
    const referenceTime = parsed.signingTime ?? validationTime;

    if (!parsed.signingTime) {
      warnings.push({
        code: 'SIGNING_TIME_MISSING',
        message:
          'Signed attributes do not contain signingTime; certificate validity was checked against the validation time instead.',
      });
    }

    if (referenceTime < certificate.notBefore || referenceTime > certificate.notAfter) {
      certificateStatus = 'outside_validity_window';
      errors.push({
        code: 'CERTIFICATE_NOT_VALID_AT_SIGNING_TIME',
        message: 'Signer certificate validity window does not cover the signing time.',
      });
    } else {
      certificateStatus = 'within_validity_window';
    }

    const issuerCn = certificate.issuerCommonName?.trim().toLowerCase();

    if (!issuerCn || !registryIssuerCns.has(issuerCn)) {
      warnings.push({
        code: 'ISSUER_NOT_IN_REGISTRY',
        message:
          'Signer certificate issuer CN was not found in the bundled KNEDP registry; chain validation must confirm trust.',
      });
    }
  }

  if (errors.length === 0) {
    warnings.push(CRYPTO_NOT_PERFORMED_WARNING);
  }

  return {
    envelopeItemId,
    status: errors.length === 0 ? 'passed' : 'failed',
    certificateStatus,
    errors,
    warnings,
    parsed,
  };
};

export const runUaKepStructuralValidation = ({
  preparedItems,
  signatures,
  registryIssuerCns,
  validationTime,
}: TRunStructuralValidationInput): TStructuralVerdict[] => {
  const preparedByEnvelopeItemId = new Map(preparedItems.map((item) => [item.envelopeItemId, item]));

  return signatures.map((signature) => {
    const preparedItem = preparedByEnvelopeItemId.get(signature.envelopeItemId);

    if (!preparedItem) {
      return {
        envelopeItemId: signature.envelopeItemId,
        status: 'failed' as const,
        certificateStatus: null,
        errors: [
          {
            code: 'UNKNOWN_ENVELOPE_ITEM',
            message: 'Signature refers to an envelope item that was not prepared in this session.',
          },
        ],
        warnings: [],
        parsed: null,
      };
    }

    return validateOneSignature({
      preparedHashB64: preparedItem.hashB64,
      signatureB64: signature.signatureB64,
      envelopeItemId: signature.envelopeItemId,
      registryIssuerCns,
      validationTime,
    });
  });
};

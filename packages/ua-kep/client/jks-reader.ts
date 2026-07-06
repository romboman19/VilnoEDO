/// <reference path="../types/iit-sdk.d.ts" />

import type { DigitalSignature, TIitCertificate } from '@it-enterprise/digital-signature';

export type TJksKeyEntry = {
  index: number;
  alias: string;
  subjectCN: string | null;
  issuerCN: string | null;
  isStamp: boolean;
};

export type TJksReadResult = {
  fileName: string;
  entries: TJksKeyEntry[];
};

export type TJksUnlockedKey = {
  alias: string;
  ownerInfo: {
    subjCN: string | null;
    issuerCN: string | null;
    EDRPOUCode: string | null;
    serial: string | null;
  };
};

export const isJksFile = (file: File): boolean => file.name.endsWith('.jks');

const getOptionalString = (value: string | null | undefined) => {
  const trimmedValue = value?.trim() ?? '';

  return trimmedValue.length > 0 ? trimmedValue : null;
};

const getFirstOptionalString = (...values: Array<string | null | undefined>) =>
  values.map((value) => getOptionalString(value)).find((value): value is string => value !== null) ?? null;

export const readJksContainer = async (sdk: DigitalSignature, file: File): Promise<TJksReadResult> => {
  if (!isJksFile(file)) {
    throw new Error('File must have .jks extension');
  }

  const jksKeys = await sdk.getJKSPrivateKeys(file);

  return {
    fileName: file.name,
    entries: jksKeys.map((key, index) => ({
      index,
      alias: key.alias,
      subjectCN: key.certificates?.[0]?.infoEx?.subjCN ?? null,
      issuerCN: key.certificates?.[0]?.infoEx?.issuerCN ?? null,
      isStamp: key.digitalStamp,
    })),
  };
};

export const unlockJksKey = async (
  sdk: DigitalSignature,
  file: File,
  keyIndex: number,
  password: string,
): Promise<TJksUnlockedKey> => {
  const jksKeys = await sdk.getJKSPrivateKeys(file);
  const selected = jksKeys[keyIndex];

  if (!selected) {
    throw new Error(`Key index ${keyIndex} not found in JKS container`);
  }

  await sdk.setCA(null);

  const certDataArrays = selected.certificates
    .map((cert) => cert.data)
    .filter((certData): certData is Uint8Array => certData instanceof Uint8Array);

  const keyInfo = await sdk.readFileKey(
    selected.privateKey,
    password,
    certDataArrays.length > 0 ? certDataArrays : undefined,
  );

  const ownerInfo = keyInfo.ownerInfo ?? {};
  const certificateInfo: NonNullable<TIitCertificate['infoEx']> | undefined =
    keyInfo.certificates?.[0]?.infoEx ?? selected.certificates[0]?.infoEx;

  return {
    alias: selected.alias,
    ownerInfo: {
      subjCN: getOptionalString(ownerInfo.subjCN) ?? getOptionalString(certificateInfo?.subjCN),
      issuerCN: getOptionalString(ownerInfo.issuerCN) ?? getOptionalString(certificateInfo?.issuerCN),
      EDRPOUCode: getFirstOptionalString(
        ownerInfo.EDRPOUCode,
        ownerInfo.DRFOCode,
        ownerInfo.subjEDRPOUCode,
        ownerInfo.subjDRFOCode,
        certificateInfo?.EDRPOUCode,
        certificateInfo?.DRFOCode,
        certificateInfo?.subjEDRPOUCode,
        certificateInfo?.subjDRFOCode,
        certificateInfo?.subjUserCode,
      ),
      serial: getOptionalString(certificateInfo?.serial) ?? getOptionalString(ownerInfo.serial),
    },
  };
};

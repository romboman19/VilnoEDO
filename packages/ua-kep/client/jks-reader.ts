import type { DigitalSignature } from '@it-enterprise/digital-signature';

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

  const certDataArrays = selected.certificates.map((cert) => cert.data).filter(Boolean);

  const keyInfo = await sdk.readFileKey(
    selected.privateKey,
    password,
    certDataArrays.length > 0 ? certDataArrays : undefined,
  );

  const ownerInfo = keyInfo.ownerInfo ?? {};

  return {
    alias: selected.alias,
    ownerInfo: {
      subjCN: ownerInfo.subjCN ?? null,
      issuerCN: ownerInfo.issuerCN ?? null,
      EDRPOUCode: ownerInfo.EDRPOUCode ?? ownerInfo.DRFOCode ?? null,
      serial: keyInfo.certificates?.[0]?.infoEx?.serial ?? ownerInfo.serial ?? null,
    },
  };
};

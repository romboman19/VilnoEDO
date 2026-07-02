import type { DigitalSignature } from '@it-enterprise/digital-signature';

import type { TUaKepSessionItems } from '../types/session';

export type TSignedItem = {
  envelopeItemId: string;
  signatureB64: string;
};

export type TSignHashesResult = {
  items: TSignedItem[];
  signerInfo: {
    subjCN: string | null;
    issuerCN: string | null;
    edrpou: string | null;
    serial: string | null;
  };
};

export const signPreparedHashes = async (
  sdk: DigitalSignature,
  items: TUaKepSessionItems,
): Promise<TSignHashesResult> => {
  if (items.length === 0) {
    throw new Error('No hash items to sign');
  }

  const namedHashes = items.map((item) => ({
    name: item.envelopeItemId,
    val: item.hashB64,
  }));

  const rawResult = await sdk.signHashEx(namedHashes.length === 1 ? namedHashes[0] : namedHashes);
  const results = Array.isArray(rawResult) ? rawResult : [rawResult];

  const firstInfo = results[0]?.SignatureInfo?.OwnerInfo;
  const signerInfo = {
    subjCN: firstInfo?.subjCN ?? null,
    issuerCN: firstInfo?.issuerCN ?? null,
    edrpou: firstInfo?.EDRPOUCode ?? firstInfo?.DRFOCode ?? null,
    serial: firstInfo?.serial ?? null,
  };

  const signedItems: TSignedItem[] = items.map((item, index) => ({
    envelopeItemId: item.envelopeItemId,
    signatureB64: results[index]?.Sign ?? '',
  }));

  return {
    items: signedItems,
    signerInfo,
  };
};

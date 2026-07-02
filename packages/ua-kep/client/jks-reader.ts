import type { TIitSigner } from './iit-signer-factory';

export type TJksReadResult = {
  fileName: string;
  keyAliases: string[];
  rawKeyData: Uint8Array;
};

export const readJksKeyContainer = async ({
  signer,
  file,
}: {
  signer: TIitSigner;
  file: File;
}): Promise<TJksReadResult> => {
  const rawKeyData = new Uint8Array(await file.arrayBuffer());

  return {
    fileName: file.name,
    keyAliases: ['main-key'],
    rawKeyData,
  };
};

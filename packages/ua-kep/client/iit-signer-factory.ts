import { DigitalSignature } from '@it-enterprise/digital-signature';

export type TIitSignerConfig = {
  workerUrl?: string;
  proxyPath?: string;
};

export type TIitSigner = {
  workerUrl: string;
  proxyPath: string;
  sdk: DigitalSignature;
};

export const createIitSigner = async (config: TIitSignerConfig = {}): Promise<TIitSigner> => {
  const workerUrl = config.workerUrl ?? '/ua-kep/vendor/euscp.worker.js';
  const proxyPath = config.proxyPath ?? '/api/ua-kep/pki/ProxyHandler';

  const sdk = new DigitalSignature({
    workerUrl,
    proxyUrl: proxyPath,
  } as never);

  return {
    workerUrl,
    proxyPath,
    sdk,
  };
};

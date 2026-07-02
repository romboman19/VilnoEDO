export type TIitSignerConfig = {
  workerUrl?: string;
  proxyPath?: string;
};

export type TIitSigner = {
  workerUrl: string;
  proxyPath: string;
};

export const createIitSigner = (config: TIitSignerConfig = {}): TIitSigner => {
  return {
    workerUrl: config.workerUrl ?? '/ua-kep/vendor/euscp.worker.js',
    proxyPath: config.proxyPath ?? '/api/ua-kep/pki/ProxyHandler',
  };
};

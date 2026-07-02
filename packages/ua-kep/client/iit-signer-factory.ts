import { DigitalSignature, Models } from '@it-enterprise/digital-signature';

const { DigitalSignatureSettings, DefaultCertificatesProvider } = Models;

export type TIitSignerConfig = {
  workerUrl?: string;
  proxyPath?: string;
  casJsonUrl?: string;
  caCertsUrl?: string;
};

export type TIitSigner = {
  sdk: DigitalSignature;
};

export const createIitSigner = (config: TIitSignerConfig = {}): TIitSigner => {
  const workerUrl = config.workerUrl ?? '/ua-kep/vendor/euscp.worker.js';
  const proxyPath = config.proxyPath ?? '/api/ua-kep/pki/ProxyHandler';
  const casJsonUrl = config.casJsonUrl ?? '/ua-kep/data/CAs.json';
  const caCertsUrl = config.caCertsUrl ?? '/ua-kep/data/CACertificates.p7b';

  const sdk = new DigitalSignature({
    language: 'uk',
    userId: 'vilno-edo',
    getGlSign() {
      return {
        AllowTestKeys: false,
        PreferHarware: false,
        DirectAccess: false,
        ApplyProxySettings: false,
        UseProxy: false,
        WebClientFileSize: 50,
        KSPs: [],
      };
    },
    getSettings() {
      return new DigitalSignatureSettings(
        'uk',
        'vilno-edo',
        proxyPath,
        new DefaultCertificatesProvider(casJsonUrl, caCertsUrl),
        workerUrl,
      );
    },
  });

  return { sdk };
};

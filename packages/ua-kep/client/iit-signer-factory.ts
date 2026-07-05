/// <reference path="../types/iit-sdk.d.ts" />

import { DigitalSignature, Models } from '@it-enterprise/digital-signature';

const { DigitalSignatureSettings, DefaultCertificatesProvider } = Models;

export type TIitSignerConfig = {
  workerUrl?: string;
  proxyPath?: string;
  casJsonUrl?: string;
  caCertsUrl?: string;
  kspProviders?: unknown[];
  preferHardware?: boolean;
};

export type TIitSigner = {
  sdk: DigitalSignature;
};

const WORKER_CACHE_VERSION = 'vilnoedo-ua-kep-20260705-2';

const withWorkerCacheVersion = (path: string) => {
  const separator = path.includes('?') ? '&' : '?';

  return `${path}${separator}uaKepWorkerVersion=${WORKER_CACHE_VERSION}`;
};

const toAbsoluteBrowserUrl = (path: string) => {
  if (typeof window === 'undefined') {
    return path;
  }

  return new URL(path, window.location.href).toString();
};

export const createIitSigner = (config: TIitSignerConfig = {}): TIitSigner => {
  const workerUrl = withWorkerCacheVersion(config.workerUrl ?? '/ua-kep/vendor/euscp.worker.js');
  const proxyPath = config.proxyPath ?? '/api/ua-kep/pki/ProxyHandler';
  const casJsonUrl = config.casJsonUrl ?? '/ua-kep/data/CAs.json';
  const caCertsUrl = config.caCertsUrl ?? '/ua-kep/data/CACertificates.p7b';
  const kspProviders =
    config.kspProviders ??
    (typeof Models.getDefaultKSPs === 'function' ? (Models.getDefaultKSPs(false) as unknown[]) : []);

  const sdk = new DigitalSignature({
    language: 'uk',
    userId: 'vilno-edo',
    getGlSign() {
      return {
        AllowTestKeys: false,
        PreferHarware: config.preferHardware ?? true,
        // DirectAccess=false routes all PKI traffic (CMP/TSP/OCSP) through our
        // /api/ua-kep/pki/ProxyHandler. UseProxy/ApplyProxySettings configure a
        // classic HTTP proxy inside the crypto library instead — enabling them
        // without an address makes every network operation fail with
        // EU_ERROR_TRANSMIT_REQUEST, so they must stay off.
        DirectAccess: false,
        ApplyProxySettings: false,
        UseProxy: false,
        WebClientFileSize: 50,
        KSPs: kspProviders,
      };
    },
    getSettings() {
      return new DigitalSignatureSettings(
        'uk',
        'vilno-edo',
        toAbsoluteBrowserUrl(proxyPath),
        new DefaultCertificatesProvider(casJsonUrl, caCertsUrl),
        workerUrl,
      );
    },
  });

  return { sdk };
};

import fs from 'node:fs/promises';
import path from 'node:path';

/// The dev server runs with cwd = apps/remix (turbo), production may run from
/// the repo root — probe both layouts instead of assuming one.
const CA_FILE_CANDIDATES = [
  path.join(process.cwd(), 'public', 'ua-kep', 'data', 'CAs.json'),
  path.join(process.cwd(), 'apps', 'remix', 'public', 'ua-kep', 'data', 'CAs.json'),
];

const resolveCaFilePath = async () => {
  for (const candidate of CA_FILE_CANDIDATES) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next layout.
    }
  }

  throw new Error(`UA KEP CA registry not found. Tried: ${CA_FILE_CANDIDATES.join(', ')}`);
};

const EXTRA_PROXY_ALLOWED_HOSTS = new Set([
  'acsk.privatbank.ua',
  'apiext.pumb.ua',
  'cabinet.e-life.com.ua',
  'cihsm-api.bankalliance.ua',
  'cs.vchasno.ua',
  'depositsign.com',
  'diia-sign.it.ua',
  'sid.uakey.com.ua',
  'smart-sign.tax.gov.ua',
  'vtms-api-qca.ukrgasbank.com',
  'zc.bank.gov.ua',
]);

let caRegistryPromise: Promise<Array<Record<string, unknown>>> | null = null;
let proxyAllowedHostsPromise: Promise<Set<string>> | null = null;

const normalizeProxyTarget = (rawAddress: unknown) => {
  const trimmed = String(rawAddress || '').trim();

  if (!trimmed) {
    throw new Error('PKI proxy target is missing.');
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const url = new URL(withProtocol);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Unsupported PKI proxy protocol: ${url.protocol}`);
  }

  return url;
};

const addHostToAllowList = (target: unknown, hosts: Set<string>) => {
  if (!target) {
    return;
  }

  try {
    const url = normalizeProxyTarget(target);

    if (url.hostname) {
      hosts.add(url.hostname.toLowerCase());
    }
  } catch {
    // Ignore malformed CA endpoints.
  }
};

export const getCaRegistry = async () => {
  if (!caRegistryPromise) {
    caRegistryPromise = resolveCaFilePath()
      .then(async (caFilePath) => {
        const raw = await fs.readFile(caFilePath, 'utf8');
        return JSON.parse(raw) as Array<Record<string, unknown>>;
      })
      .catch((error) => {
        caRegistryPromise = null;
        throw error;
      });
  }

  return await caRegistryPromise;
};

export const getProxyAllowedHosts = async () => {
  if (!proxyAllowedHostsPromise) {
    proxyAllowedHostsPromise = getCaRegistry()
      .then((caRegistry) => {
        const hosts = new Set<string>();

        for (const ca of caRegistry) {
          addHostToAllowList(ca.address, hosts);
          addHostToAllowList(ca.ocspAccessPointAddress, hosts);
          addHostToAllowList(ca.cmpAddress, hosts);
          addHostToAllowList(ca.tspAddress, hosts);
          addHostToAllowList(ca.ldapAddress, hosts);
        }

        for (const host of EXTRA_PROXY_ALLOWED_HOSTS) {
          hosts.add(host);
        }

        return hosts;
      })
      .catch((error) => {
        proxyAllowedHostsPromise = null;
        throw error;
      });
  }

  return await proxyAllowedHostsPromise;
};

export { normalizeProxyTarget };

import fs from 'node:fs/promises';
import path from 'node:path';

const appRoot = process.cwd();
const caFilePath = path.join(appRoot, 'apps', 'remix', 'public', 'ua-kep', 'data', 'CAs.json');

const EXTRA_PROXY_ALLOWED_HOSTS = new Set(['zc.bank.gov.ua']);

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
  if (!target) return;

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
    caRegistryPromise = fs
      .readFile(caFilePath, 'utf8')
      .then((raw) => JSON.parse(raw) as Array<Record<string, unknown>>)
      .catch((error) => {
        caRegistryPromise = null;
        throw error;
      });
  }

  return caRegistryPromise;
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

  return proxyAllowedHostsPromise;
};

export { normalizeProxyTarget };

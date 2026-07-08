import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { XMLParser } from 'fast-xml-parser';

import { config, type TTrustListProfile } from '../config';

/// A verified snapshot of a CZO Trusted List used as the trust anchor source
/// for verification. CZO publishes machine-readable lists (TL-UA-DSTU for
/// DSTU 4145-2002, TL-UA for ETSI) alongside a .sha2 hash file.

export type TTrustSnapshot = {
  profile: TTrustListProfile;
  /// SHA-256 (hex) of the exact Trusted List bytes we ingested.
  sha256: string;
  /// Whether `sha256` matched the published .sha2 hash file.
  hashVerified: boolean;
  /// Lower-cased issuer common names / TSP names extracted from the list —
  /// the issuer allow-list an engine checks a signer certificate against.
  issuerCns: string[];
  sequenceNumber: string | null;
  fetchedAt: string;
};

const TRUST_LIST_BASE = 'https://czo.gov.ua/download/tl';

const PROFILE_FILE: Record<TTrustListProfile, string> = {
  'TL-UA-DSTU': 'TL-UA-DSTU.xml',
  'TL-UA': 'TL-UA.xml',
};

const sha256Hex = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/// Extract the published hash from a CZO `.sha2` file. The files contain the
/// hex digest, sometimes with a filename suffix — take the first hex run.
const parsePublishedHash = (text: string): string | null => {
  const match = text.match(/[0-9a-fA-F]{64}/);

  return match ? match[0].toLowerCase() : null;
};

/// Best-effort issuer/TSP name extraction. The ETSI TSL schema is deep and
/// namespaced; rather than bind to an exact path we collect every X509 subject
/// CN and TSP name we can see. Refined against real lists in Phase 2.
const extractIssuerCns = (xml: string): string[] => {
  const cns = new Set<string>();

  // TSP / scheme operator names appear as <Name xml:lang="uk">...</Name>.
  for (const match of xml.matchAll(/<[^>]*Name[^>]*>([^<]+)<\/[^>]*Name>/g)) {
    const value = match[1]?.trim();

    if (value && value.length > 1) {
      cns.add(value.toLowerCase());
    }
  }

  // CN=... inside X509 subject strings.
  for (const match of xml.matchAll(/CN=([^,<]+)/g)) {
    const value = match[1]?.trim();

    if (value) {
      cns.add(value.toLowerCase());
    }
  }

  return [...cns];
};

const extractSequenceNumber = (xml: string): string | null => {
  try {
    const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true });
    const parsed = parser.parse(xml) as Record<string, unknown>;
    const tsl = (parsed.TrustServiceStatusList ?? {}) as Record<string, unknown>;
    const info = (tsl.SchemeInformation ?? {}) as Record<string, unknown>;
    const seq = info.TSLSequenceNumber;

    return seq === undefined || seq === null ? null : String(seq);
  } catch {
    return null;
  }
};

const cachePath = (profile: TTrustListProfile) => path.join(config.trustCacheDir, `${profile}.xml`);

type TFetcher = (url: string) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

const defaultFetcher: TFetcher = (url) => fetch(url);

/// Build a snapshot from raw list + hash bytes. Pure and unit-testable.
export const buildTrustSnapshot = ({
  profile,
  xml,
  publishedHashFile,
}: {
  profile: TTrustListProfile;
  xml: string;
  publishedHashFile: string | null;
}): TTrustSnapshot => {
  const sha256 = sha256Hex(Buffer.from(xml, 'utf8'));
  const publishedHash = publishedHashFile ? parsePublishedHash(publishedHashFile) : null;

  return {
    profile,
    sha256,
    hashVerified: publishedHash !== null && publishedHash === sha256,
    issuerCns: extractIssuerCns(xml),
    sequenceNumber: extractSequenceNumber(xml),
    fetchedAt: new Date().toISOString(),
  };
};

let cached: TTrustSnapshot | null = null;

/// Load the configured Trusted List: fetch from CZO, verify its hash, cache the
/// raw XML to disk, and return a snapshot. Fail-soft: on any error returns the
/// last good in-memory snapshot or a disk-cached copy, else null — the caller
/// treats a null/unverified snapshot conservatively (chainValid stays null).
export const loadTrustSnapshot = async (fetcher: TFetcher = defaultFetcher): Promise<TTrustSnapshot | null> => {
  const profile = config.trustListProfile;
  const file = PROFILE_FILE[profile];

  try {
    const [xmlRes, hashRes] = await Promise.all([
      fetcher(`${TRUST_LIST_BASE}/${file}`),
      fetcher(`${TRUST_LIST_BASE}/${file.replace(/\.xml$/, '.sha2')}`),
    ]);

    if (!xmlRes.ok) {
      throw new Error(`Trusted List fetch failed: HTTP ${xmlRes.status}`);
    }

    const xml = await xmlRes.text();
    const publishedHashFile = hashRes.ok ? await hashRes.text() : null;

    const snapshot = buildTrustSnapshot({ profile, xml, publishedHashFile });

    await mkdir(config.trustCacheDir, { recursive: true });
    await writeFile(cachePath(profile), xml, 'utf8');

    cached = snapshot;
    return snapshot;
  } catch (error) {
    if (cached) {
      return cached;
    }

    try {
      const xml = await readFile(cachePath(profile), 'utf8');
      cached = buildTrustSnapshot({ profile, xml, publishedHashFile: null });
      return cached;
    } catch {
      void error;
      return null;
    }
  }
};

export const getCachedTrustSnapshot = (): TTrustSnapshot | null => cached;

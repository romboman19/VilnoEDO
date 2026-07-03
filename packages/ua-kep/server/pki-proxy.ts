import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

import type { Context } from 'hono';

import { getProxyAllowedHosts, normalizeProxyTarget } from './ca-registry';

const PKI_PROXY_TIMEOUT_MS = 10_000;
const PKI_PROXY_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type VettedProxyAddress = {
  address: string;
  family: 4 | 6;
};

type UpstreamProxyResponse = {
  cleanup: () => void;
  response: IncomingMessage;
};

const ipv4ToNumber = (ip: string) =>
  ip.split('.').reduce((value, octet) => (value << 8) + Number.parseInt(octet, 10), 0) >>> 0;

const PRIVATE_IPV4_RANGES: Array<[number, number]> = [
  ['0.0.0.0', '0.255.255.255'],
  ['10.0.0.0', '10.255.255.255'],
  ['100.64.0.0', '100.127.255.255'],
  ['127.0.0.0', '127.255.255.255'],
  ['169.254.0.0', '169.254.255.255'],
  ['172.16.0.0', '172.31.255.255'],
  ['192.0.0.0', '192.0.0.255'],
  ['192.0.2.0', '192.0.2.255'],
  ['192.168.0.0', '192.168.255.255'],
  ['198.18.0.0', '198.19.255.255'],
  ['198.51.100.0', '198.51.100.255'],
  ['203.0.113.0', '203.0.113.255'],
  ['224.0.0.0', '255.255.255.255'],
].map(([start, end]) => [ipv4ToNumber(start), ipv4ToNumber(end)]);

const isPrivateIpv4 = (address: string) => {
  const value = ipv4ToNumber(address);
  return PRIVATE_IPV4_RANGES.some(([start, end]) => value >= start && value <= end);
};

const isPrivateIpv6 = (address: string) => {
  const normalized = address.toLowerCase();

  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('ff')
  );
};

const parseIpv4MappedIpv6 = (address: string) => {
  const normalized = address.toLowerCase();
  const dottedMatch = /^(?:::ffff:|0:0:0:0:0:ffff:)(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);

  if (dottedMatch && isIP(dottedMatch[1]) === 4) {
    return dottedMatch[1];
  }

  const hexMatch = /^(?:::ffff:|0:0:0:0:0:ffff:)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(
    normalized,
  );

  if (!hexMatch) {
    return null;
  }

  const high = Number.parseInt(hexMatch[1], 16);
  const low = Number.parseInt(hexMatch[2], 16);

  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
};

const isPrivateIpAddress = (address: string) => {
  const family = isIP(address);

  if (family === 4) {
    return isPrivateIpv4(address);
  }

  if (family === 6) {
    const ipv4MappedAddress = parseIpv4MappedIpv6(address);

    if (ipv4MappedAddress) {
      return isPrivateIpv4(ipv4MappedAddress);
    }

    return isPrivateIpv6(address);
  }

  return true;
};

const assertPublicProxyTarget = async (url: URL): Promise<VettedProxyAddress> => {
  const hostname = url.hostname.toLowerCase();
  const literalAddressFamily = isIP(hostname);
  const addresses: VettedProxyAddress[] = literalAddressFamily
    ? [{ address: hostname, family: literalAddressFamily as 4 | 6 }]
    : (await lookup(hostname, { all: true, verbatim: true })).map(({ address, family }) => ({
        address,
        family: family as 4 | 6,
      }));

  if (addresses.length === 0) {
    throw new Error('PKI proxy target did not resolve.');
  }

  for (const { address } of addresses) {
    if (isPrivateIpAddress(address)) {
      throw new Error('PKI proxy target resolves to a private or reserved address.');
    }
  }

  return addresses[0];
};

const readLimitedResponse = async (response: IncomingMessage, signal: AbortSignal) => {
  const contentLength = response.headers['content-length'];
  const contentLengthValue = Array.isArray(contentLength) ? contentLength[0] : contentLength;

  if (contentLengthValue && Number.parseInt(contentLengthValue, 10) > PKI_PROXY_MAX_RESPONSE_BYTES) {
    response.destroy(new Error('PKI upstream response is too large.'));
    throw new Error('PKI upstream response is too large.');
  }

  const abortResponse = () => response.destroy(new Error('PKI upstream response timed out.'));
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  signal.addEventListener('abort', abortResponse, { once: true });

  try {
    for await (const chunk of response) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.byteLength;

      if (totalBytes > PKI_PROXY_MAX_RESPONSE_BYTES) {
        response.destroy(new Error('PKI upstream response exceeded the size limit.'));
        throw new Error('PKI upstream response exceeded the size limit.');
      }

      chunks.push(buffer);
    }
  } finally {
    signal.removeEventListener('abort', abortResponse);
  }

  return Buffer.concat(chunks, totalBytes);
};

const createPinnedLookup = (vettedAddress: VettedProxyAddress): NonNullable<RequestOptions['lookup']> =>
  ((_: string, options: unknown, callback?: unknown) => {
    const lookupOptions =
      typeof options === 'function' || options === null ? undefined : (options as { all?: boolean });
    const resolvedCallback = (typeof options === 'function' ? options : callback) as
      | ((error: Error | null, address: string, family: number) => void)
      | ((error: Error | null, addresses: VettedProxyAddress[]) => void);

    if (lookupOptions?.all) {
      (resolvedCallback as (error: Error | null, addresses: VettedProxyAddress[]) => void)(null, [
        vettedAddress,
      ]);
      return;
    }

    (resolvedCallback as (error: Error | null, address: string, family: number) => void)(
      null,
      vettedAddress.address,
      vettedAddress.family,
    );
  }) as NonNullable<RequestOptions['lookup']>;

const requestUpstreamResponse = ({
  body,
  headers,
  method,
  signal,
  url,
  vettedAddress,
}: {
  body?: Buffer;
  headers: Record<string, string>;
  method: string;
  signal: AbortSignal;
  url: URL;
  vettedAddress: VettedProxyAddress;
}) => {
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('PKI proxy target protocol is not supported.');
  }

  return new Promise<UpstreamProxyResponse>((resolve, reject) => {
    let settled = false;
    const requestOptions: RequestOptions = {
      headers,
      lookup: createPinnedLookup(vettedAddress),
      method,
    };

    const request: ClientRequest =
      url.protocol === 'https:' ? httpsRequest(url, requestOptions) : httpRequest(url, requestOptions);
    const abortRequest = () => {
      request.destroy(new Error('PKI upstream request timed out.'));
    };
    const cleanup = () => signal.removeEventListener('abort', abortRequest);
    const rejectOnce = (error: Error) => {
      cleanup();

      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    request.once('response', (response) => {
      if (!settled) {
        settled = true;
        resolve({ cleanup, response });
      }
    });

    request.once('error', rejectOnce);

    if (signal.aborted) {
      abortRequest();
    } else {
      signal.addEventListener('abort', abortRequest, { once: true });
    }

    request.end(body);
  });
};

export const handleUaKepPkiProxy = async (c: Context) => {
  try {
    const upstreamUrl = normalizeProxyTarget(c.req.query('address'));
    const allowedHosts = await getProxyAllowedHosts();

    if (!allowedHosts.has(upstreamUrl.hostname.toLowerCase())) {
      return c.text('PKI proxy host is not allowed.', 403);
    }

    const vettedAddress = await assertPublicProxyTarget(upstreamUrl);

    const requestContentType = c.req.query('contentType')?.trim() || 'application/octet-stream';

    const requestHeaders: Record<string, string> = {
      Accept: '*/*',
      'User-Agent': 'VilnoEDO-UA-KEP-Proxy',
    };

    let requestBody: Buffer | undefined;

    if (!['GET', 'HEAD'].includes(c.req.method)) {
      const incomingBody = (await c.req.text()).trim();
      requestBody = incomingBody ? Buffer.from(incomingBody, 'base64') : Buffer.alloc(0);
      requestHeaders['Content-Type'] = requestContentType;
      requestHeaders['Content-Length'] = String(requestBody.length);
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), PKI_PROXY_TIMEOUT_MS);
    let cleanupUpstreamResponse: (() => void) | undefined;

    try {
      const { cleanup, response: upstreamResponse } = await requestUpstreamResponse({
        body: requestBody,
        headers: requestHeaders,
        method: c.req.method,
        signal: abortController.signal,
        url: upstreamUrl,
        vettedAddress,
      });

      cleanupUpstreamResponse = cleanup;

      const upstreamStatusCode = upstreamResponse.statusCode ?? 0;

      if (REDIRECT_STATUSES.has(upstreamStatusCode)) {
        upstreamResponse.destroy();
        return c.text('PKI upstream redirects are not allowed.', 502);
      }

      if (upstreamStatusCode < 200 || upstreamStatusCode >= 300) {
        upstreamResponse.destroy();
        return c.text(`PKI upstream error: ${upstreamStatusCode}`, 502);
      }

      const responseBuffer = await readLimitedResponse(upstreamResponse, abortController.signal);

      c.header('Cache-Control', 'no-store');
      return c.text(responseBuffer.toString('base64'));
    } finally {
      cleanupUpstreamResponse?.();
      clearTimeout(timeout);
    }
  } catch (error) {
    return c.text('PKI proxy request failed.', 502);
  }
};
